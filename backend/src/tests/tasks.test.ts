import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Server } from "http";
import { createApp } from "../app";

let server: Server;
let base: string;
let admin: string, manager: string, employee1: string, employee2: string;
let engDeptId: number, hrDeptId: number, managerId: number, emp1Id: number, emp2Id: number;
const createdTaskIds: number[] = [];

async function api(path: string, token?: string, init?: RequestInit) {
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

async function login(email: string, password: string) {
  const res = await api("/api/auth/login", undefined, {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  return res.body.data.token as string;
}

beforeAll(async () => {
  const app = createApp();
  await new Promise<void>((r) => { server = app.listen(0, () => r()); });
  const a = server.address();
  if (typeof a === "object" && a) base = `http://127.0.0.1:${a.port}`;

  admin = await login("admin@company.com", process.env.SEED_ADMIN_PASSWORD ?? "Admin123!");
  manager = await login("manager@company.com", process.env.SEED_MANAGER_PASSWORD ?? "Manager123!");
  employee1 = await login("employee1@company.com", process.env.SEED_EMPLOYEE1_PASSWORD ?? "Employee123!");
  employee2 = await login("employee2@company.com", process.env.SEED_EMPLOYEE2_PASSWORD ?? "Employee123!");

  const users = await api("/api/users", admin);
  const emp1 = users.body.data.users.find((u: any) => u.email === "employee1@company.com");
  const emp2 = users.body.data.users.find((u: any) => u.email === "employee2@company.com");
  const managerUser = users.body.data.users.find((u: any) => u.email === "manager@company.com");
  emp1Id = emp1.id;
  emp2Id = emp2.id;
  managerId = managerUser.id;
  engDeptId = emp1.department_id;
  hrDeptId = emp2.department_id;

  // Fixture data: one task per department.
  const t1 = await api("/api/tasks", admin, {
    method: "POST",
    body: JSON.stringify({ title: "Eng task", department_id: engDeptId, assigned_to: emp1Id, priority: "HIGH", due_date: "2026-10-10" }),
  });
  const t2 = await api("/api/tasks", admin, {
    method: "POST",
    body: JSON.stringify({ title: "HR task", department_id: hrDeptId, assigned_to: emp2Id, priority: "LOW", due_date: "2026-10-20" }),
  });
  for (const t of [t1, t2]) createdTaskIds.push(t.body.data.task.id);
});

afterAll(async () => {
  for (const id of createdTaskIds) await api(`/api/tasks/${id}`, admin, { method: "DELETE" });
  await new Promise((r) => server.close(r));
});

describe("tasks", () => {
  it("1. admin can access all tasks", async () => {
    const res = await api("/api/tasks", admin);
    expect(res.status).toBe(200);
    const titles = res.body.data.tasks.map((t: any) => t.title);
    expect(titles).toContain("Eng task");
    expect(titles).toContain("HR task");
  });

  it("2. manager only sees own department tasks", async () => {
    const res = await api("/api/tasks", manager);
    expect(res.status).toBe(200);
    expect(res.body.data.tasks.length).toBeGreaterThan(0);
    for (const t of res.body.data.tasks) expect(t.department_id).toBe(engDeptId);
  });

  it("manager requesting another department_id gets 403 and no foreign data", async () => {
    const res = await api(`/api/tasks?department_id=${hrDeptId}`, manager);
    expect(res.status).toBe(403);
  });

  it("3. manager cannot create a task for another department", async () => {
    const res = await api("/api/tasks", manager, {
      method: "POST",
      body: JSON.stringify({ title: "Bad", department_id: hrDeptId }),
    });
    expect(res.status).toBe(403);
  });

  it("4. manager cannot assign a task to a user outside their department", async () => {
    const res = await api("/api/tasks", manager, {
      method: "POST",
      body: JSON.stringify({ title: "Bad assign", department_id: engDeptId, assigned_to: emp2Id }),
    });
    expect(res.status).toBe(403);
  });

  it("manager may assign only to employees, not same-department managers", async () => {
    const res = await api("/api/tasks", manager, {
      method: "POST",
      body: JSON.stringify({ title: "Bad manager assignment", department_id: engDeptId, assigned_to: managerId }),
    });
    expect(res.status).toBe(403);
  });

  it("manager cannot reassign an own-department task to an outside user", async () => {
    const res = await api(`/api/tasks/${createdTaskIds[0]}`, manager, {
      method: "PATCH",
      body: JSON.stringify({ assigned_to: emp2Id }),
    });
    expect(res.status).toBe(403);
  });

  it("department changes validate the existing assignee against the new department", async () => {
    const res = await api(`/api/tasks/${createdTaskIds[0]}`, admin, {
      method: "PATCH",
      body: JSON.stringify({ department_id: hrDeptId }),
    });
    expect(res.status).toBe(400);
  });

  it("status endpoint validates task ids and dates reject impossible calendar days", async () => {
    const invalidId = await api("/api/tasks/not-an-id/status", employee1, {
      method: "PATCH",
      body: JSON.stringify({ status: "DONE" }),
    });
    expect(invalidId.status).toBe(400);

    const invalidDate = await api("/api/tasks", admin, {
      method: "POST",
      body: JSON.stringify({ title: "Impossible date", department_id: engDeptId, due_date: "2026-02-30" }),
    });
    expect(invalidDate.status).toBe(400);
  });

  it("5. employee sees only assigned tasks", async () => {
    const res = await api("/api/tasks", employee1);
    expect(res.status).toBe(200);
    for (const t of res.body.data.tasks) expect(t.assigned_to).toBe(emp1Id);
    // an explicit foreign assigned_to still yields only own tasks
    const filtered = await api(`/api/tasks?assigned_to=${emp2Id}`, employee1);
    expect(filtered.status).toBe(200);
    for (const t of filtered.body.data.tasks) expect(t.assigned_to).toBe(emp1Id);
  });

  it("6. employee can update status of own task", async () => {
    const res = await api(`/api/tasks/${createdTaskIds[0]}/status`, employee1, {
      method: "PATCH",
      body: JSON.stringify({ status: "IN_PROGRESS" }),
    });
    expect(res.status).toBe(200);
    expect(res.body.data.task.status).toBe("IN_PROGRESS");
  });

  it("7. employee cannot update title (full update blocked)", async () => {
    const res = await api(`/api/tasks/${createdTaskIds[0]}`, employee1, {
      method: "PATCH",
      body: JSON.stringify({ title: "Hacked" }),
    });
    expect(res.status).toBe(403);
  });

  it("8. employee cannot reassign a task", async () => {
    const res = await api(`/api/tasks/${createdTaskIds[0]}`, employee1, {
      method: "PATCH",
      body: JSON.stringify({ assigned_to: emp2Id }),
    });
    expect(res.status).toBe(403);
    // and cannot touch status endpoint of someone else's task
    const statusRes = await api(`/api/tasks/${createdTaskIds[1]}/status`, employee1, {
      method: "PATCH",
      body: JSON.stringify({ status: "DONE" }),
    });
    expect(statusRes.status).toBe(403);
  });

  it("9. employee cannot delete tasks", async () => {
    const res = await api(`/api/tasks/${createdTaskIds[0]}`, employee1, { method: "DELETE" });
    expect(res.status).toBe(403);
  });

  it("10. cross-department access returns 403", async () => {
    expect((await api(`/api/tasks/${createdTaskIds[1]}`, manager)).status).toBe(403); // manager->HR task
    expect((await api(`/api/tasks/${createdTaskIds[1]}`, employee1)).status).toBe(403); // emp1->HR task
    expect((await api(`/api/tasks/${createdTaskIds[1]}`, manager, { method: "DELETE" })).status).toBe(403);
  });

  it("manager CRUD within own department works", async () => {
    const created = await api("/api/tasks", manager, {
      method: "POST",
      body: JSON.stringify({ title: "Manager task", department_id: engDeptId, assigned_to: emp1Id }),
    });
    expect(created.status).toBe(201);
    const id = created.body.data.task.id;
    createdTaskIds.push(id);

    expect((await api(`/api/tasks/${id}`, manager, { method: "PATCH", body: JSON.stringify({ priority: "HIGH" }) })).status).toBe(200);
    // manager cannot move it to another department
    expect((await api(`/api/tasks/${id}`, manager, { method: "PATCH", body: JSON.stringify({ department_id: hrDeptId }) })).status).toBe(403);
    expect((await api(`/api/tasks/${id}`, manager, { method: "DELETE" })).status).toBe(200);
  });

  it("filters and pagination work", async () => {
    const res = await api(`/api/tasks?status=IN_PROGRESS&sort=due_date&order=asc&page=1&limit=5`, admin);
    expect(res.status).toBe(200);
    expect(res.body.meta.limit).toBe(5);
    for (const t of res.body.data.tasks) expect(t.status).toBe("IN_PROGRESS");

    const badRange = await api(`/api/tasks?due_date_from=2026-10-20&due_date_to=2026-10-01`, admin);
    expect(badRange.status).toBe(400);
  });
});
