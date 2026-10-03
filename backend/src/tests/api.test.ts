import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Server } from "http";
import { createApp } from "../app";

let server: Server;
let base: string;
let admin: string, manager: string, employee1: string, employee2: string;
let engDeptId: number, hrDeptId: number, emp2Id: number, emp1Id: number;

async function api(path: string, token?: string, init?: RequestInit) {
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

async function login(email: string, password: string) {
  const res = await api("/api/auth/login", undefined, {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  if (!res.body?.data?.token) throw new Error(`login failed for ${email}: ${JSON.stringify(res.body)}`);
  return res.body.data.token as string;
}

beforeAll(async () => {
  const app = createApp();
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  const address = server.address();
  if (typeof address === "object" && address) base = `http://127.0.0.1:${address.port}`;

  admin = await login("admin@company.com", process.env.SEED_ADMIN_PASSWORD ?? "Admin123!");
  manager = await login("manager@company.com", process.env.SEED_MANAGER_PASSWORD ?? "Manager123!");
  employee1 = await login("employee1@company.com", process.env.SEED_EMPLOYEE1_PASSWORD ?? "Employee123!");
  employee2 = await login("employee2@company.com", process.env.SEED_EMPLOYEE2_PASSWORD ?? "Employee123!");

  const users = await api("/api/users", admin);
  emp2Id = users.body.data.users.find((u: any) => u.email === "employee2@company.com").id;
  emp1Id = users.body.data.users.find((u: any) => u.email === "employee1@company.com").id;
  engDeptId = users.body.data.users.find((u: any) => u.email === "employee1@company.com").department_id;
  hrDeptId = users.body.data.users.find((u: any) => u.email === "employee2@company.com").department_id;
});

afterAll(async () => {
  await new Promise((r) => server.close(r));
});

describe("users", () => {
  it("admin can list all users, no password_hash in response", async () => {
    const res = await api("/api/users", admin);
    expect(res.status).toBe(200);
    expect(res.body.data.users.length).toBeGreaterThanOrEqual(4);
    expect(JSON.stringify(res.body)).not.toContain("password_hash");
  });

  it("manager list is scoped to own department", async () => {
    const res = await api("/api/users", manager);
    expect(res.status).toBe(200);
    for (const u of res.body.data.users) expect(u.department_id).toBe(engDeptId);
  });

  it("manager cross-department detail is 403", async () => {
    const res = await api(`/api/users/${emp2Id}`, manager);
    expect(res.status).toBe(403);
  });

  it("employee can view own profile", async () => {
    const res = await api(`/api/users/${emp1Id}`, employee1);
    expect(res.status).toBe(200);
    expect(res.body.data.user.email).toBe("employee1@company.com");
    expect(JSON.stringify(res.body)).not.toContain("password_hash");
  });

  it("admin can view any user detail without password_hash", async () => {
    const res = await api(`/api/users/${emp2Id}`, admin);
    expect(res.status).toBe(200);
    expect(res.body.data.user.id).toBe(emp2Id);
    expect(JSON.stringify(res.body)).not.toContain("password_hash");
  });

  it("admin-created user receives a working password without exposing its hash", async () => {
    const email = `api-user-${Date.now()}@example.invalid`;
    const created = await api("/api/users", admin, {
      method: "POST",
      body: JSON.stringify({
        name: "API Test User",
        email,
        password: "TestPassword123",
        role: "EMPLOYEE",
        department_id: engDeptId,
      }),
    });
    expect(created.status).toBe(201);
    expect(JSON.stringify(created.body)).not.toContain("password_hash");

    try {
      const signedIn = await api("/api/auth/login", undefined, {
        method: "POST",
        body: JSON.stringify({ email, password: "TestPassword123" }),
      });
      expect(signedIn.status).toBe(200);
    } finally {
      await api(`/api/users/${created.body.data.user.id}`, admin, { method: "DELETE" });
    }
  });

  it("employee accessing another user's data is 403", async () => {
    expect((await api(`/api/users/${emp2Id}`, employee1)).status).toBe(403);
    expect((await api("/api/users", employee1)).status).toBe(403);
    expect((await api(`/api/users/${emp1Id}/role`, employee1, { method: "PATCH", body: JSON.stringify({ role: "ADMIN" }) })).status).toBe(403);
  });

  it("manager cannot change roles or departments", async () => {
    expect((await api(`/api/users/${emp1Id}/role`, manager, { method: "PATCH", body: JSON.stringify({ role: "ADMIN" }) })).status).toBe(403);
    expect((await api(`/api/users/${emp1Id}/department`, manager, { method: "PATCH", body: JSON.stringify({ department_id: hrDeptId }) })).status).toBe(403);
    expect((await api(`/api/users/${emp1Id}`, manager, { method: "PATCH", body: JSON.stringify({ department_id: hrDeptId }) })).status).toBe(403);
    expect((await api(`/api/users/${emp2Id}`, manager, { method: "PATCH", body: JSON.stringify({ name: "Outside Edit" }) })).status).toBe(403);
  });

  it("manager can create employees only in own department", async () => {
    const elevated = await api("/api/users", manager, {
      method: "POST",
      body: JSON.stringify({ name: "No Admin", email: `no-admin-${Date.now()}@example.invalid`, password: "SafePassword123", role: "ADMIN" }),
    });
    expect(elevated.status).toBe(403);

    const moved = await api("/api/users", manager, {
      method: "POST",
      body: JSON.stringify({ name: "Wrong Dept", email: `wrong-dept-${Date.now()}@example.invalid`, password: "SafePassword123", role: "EMPLOYEE", department_id: hrDeptId }),
    });
    expect(moved.status).toBe(403);

    const email = `manager-created-${Date.now()}@example.invalid`;
    const created = await api("/api/users", manager, {
      method: "POST",
      body: JSON.stringify({ name: "Department Employee", email, password: "SafePassword123" }),
    });
    expect(created.status).toBe(201);
    const createdUser = created.body.data.user;
    try {
      expect(createdUser.role).toBe("EMPLOYEE");
      expect(createdUser.department_id).toBe(engDeptId);
      expect(JSON.stringify(created.body)).not.toContain("password_hash");
      expect((await api(`/api/users/${createdUser.id}`, manager)).status).toBe(200);
      const changed = await api(`/api/users/${createdUser.id}`, manager, {
        method: "PATCH",
        body: JSON.stringify({ name: "Department Employee Updated" }),
      });
      expect(changed.status).toBe(200);
      expect(changed.body.data.user.name).toBe("Department Employee Updated");
    } finally {
      if (createdUser?.id) await api(`/api/users/${createdUser.id}`, admin, { method: "DELETE" });
    }
  });

  it("admin duplicate email rejected with 409", async () => {
    const res = await api("/api/users", admin, {
      method: "POST",
      body: JSON.stringify({ name: "Dup", email: "admin@company.com", password: "Password1", role: "EMPLOYEE" }),
    });
    expect(res.status).toBe(409);
  });

  it("create user validates input", async () => {
    const res = await api("/api/users", admin, {
      method: "POST",
      body: JSON.stringify({ name: "X", email: "not-an-email", password: "short", role: "SUPERUSER" }),
    });
    expect(res.status).toBe(400);
  });
});

describe("departments", () => {
  let tempId: number;

  it("admin can create/update/delete a department", async () => {
    const created = await api("/api/departments", admin, {
      method: "POST",
      body: JSON.stringify({ name: "Temp Dept", description: "temp" }),
    });
    expect(created.status).toBe(201);
    tempId = created.body.data.department.id;

    const updated = await api(`/api/departments/${tempId}`, admin, {
      method: "PATCH",
      body: JSON.stringify({ description: "updated" }),
    });
    expect(updated.status).toBe(200);
    expect(updated.body.data.department.description).toBe("updated");

    const del = await api(`/api/departments/${tempId}`, admin, { method: "DELETE" });
    expect(del.status).toBe(200);
  });

  it("manager cannot create/update/delete departments", async () => {
    expect((await api("/api/departments", manager, { method: "POST", body: JSON.stringify({ name: "Nope" }) })).status).toBe(403);
    expect((await api(`/api/departments/${engDeptId}`, manager, { method: "PATCH", body: JSON.stringify({ name: "Nope" }) })).status).toBe(403);
    expect((await api(`/api/departments/${engDeptId}`, manager, { method: "DELETE" })).status).toBe(403);
  });

  it("manager sees only own department; employee sees only own department", async () => {
    const m = await api("/api/departments", manager);
    expect(m.body.data.departments.length).toBe(1);
    expect(m.body.data.departments[0].id).toBe(engDeptId);
    const e = await api("/api/departments", employee2);
    expect(e.body.data.departments.length).toBe(1);
    expect(e.body.data.departments[0].id).toBe(hrDeptId);
  });

  it("manager cross-department detail/members denied", async () => {
    expect((await api(`/api/departments/${hrDeptId}`, manager)).status).toBe(403);
    expect((await api(`/api/departments/${hrDeptId}/members`, manager)).status).toBe(403);
  });

  it("manager can view own department members", async () => {
    const res = await api(`/api/departments/${engDeptId}/members`, manager);
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toContain("password_hash");
  });

  it("employee cannot list department members", async () => {
    expect((await api(`/api/departments/${hrDeptId}/members`, employee2)).status).toBe(403);
  });

  it("deleting a department with users is blocked (409)", async () => {
    const res = await api(`/api/departments/${engDeptId}`, admin, { method: "DELETE" });
    expect(res.status).toBe(409);
  });
});
