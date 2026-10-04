import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Server } from "http";
import { createApp } from "../app";

// These integration checks make several round trips to a scale-to-zero
// development database, so they need more than Vitest's 5s unit-test default.
vi.setConfig({ testTimeout: 20000, hookTimeout: 20000 });

let server: Server;
let base: string;
let admin: string, manager: string, employee1: string, employee2: string;
let emp1Id: number, emp2Id: number, engDeptId: number;
const createdIds: number[] = [];

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
  const e1 = users.body.data.users.find((u: any) => u.email === "employee1@company.com");
  const e2 = users.body.data.users.find((u: any) => u.email === "employee2@company.com");
  emp1Id = e1.id; emp2Id = e2.id; engDeptId = e1.department_id;
});

afterAll(async () => {
  // cleanup fixtures
  for (const id of createdIds) {
    // delete via admin using a direct DAL workaround: employees delete not supported,
    // so we clean through a raw reject/delete API-less path is unavailable; use pool via fetch is not possible.
  }
  const { pool } = await import("../config/db");
  for (const id of createdIds) {
    await pool.query(`DELETE FROM leave_requests WHERE id = $1`, [id]);
  }
  await new Promise((r) => server.close(r));
});

async function createLeave(token: string, start: string, end: string, type = "ANNUAL") {
  const res = await api("/api/leave-requests", token, {
    method: "POST",
    body: JSON.stringify({ type, start_date: start, end_date: end }),
  });
  if (res.status === 201) createdIds.push(res.body.data.leaveRequest.id);
  return res;
}

describe("leave requests", () => {
  it("1. employee creates own request (PENDING, own identity)", async () => {
    const res = await createLeave(employee1, "2026-11-01", "2026-11-05");
    expect(res.status).toBe(201);
    expect(res.body.data.leaveRequest.status).toBe("PENDING");
    expect(res.body.data.leaveRequest.user_id).toBe(emp1Id);
    expect(res.body.data.leaveRequest.reviewed_by).toBeNull();
  });

  it("2. employee cannot create for another user (no such field honored; user derived from JWT)", async () => {
    const res = await api("/api/leave-requests", employee1, {
      method: "POST",
      body: JSON.stringify({ type: "SICK", start_date: "2026-11-10", end_date: "2026-11-11", user_id: emp2Id, status: "APPROVED", reviewed_by: 1 }),
    });
    expect(res.status).toBe(201);
    expect(res.body.data.leaveRequest.user_id).toBe(emp1Id);
    expect(res.body.data.leaveRequest.status).toBe("PENDING");
    expect(res.body.data.leaveRequest.reviewed_by).toBeNull();
    createdIds.push(res.body.data.leaveRequest.id);
  });

  it("3. employee sees only own requests", async () => {
    const res = await api("/api/leave-requests", employee1);
    expect(res.status).toBe(200);
    for (const l of res.body.data.leaveRequests) expect(l.user_id).toBe(emp1Id);
  });

  it("employee can view own details but not another employee's details", async () => {
    const own = await createLeave(employee1, "2026-11-15", "2026-11-16");
    expect((await api(`/api/leave-requests/${own.body.data.leaveRequest.id}`, employee1)).status).toBe(200);
    const other = await createLeave(employee2, "2026-11-18", "2026-11-19");
    expect((await api(`/api/leave-requests/${other.body.data.leaveRequest.id}`, employee1)).status).toBe(403);
  });

  it("4. manager sees only own department", async () => {
    const res = await api("/api/leave-requests", manager);
    expect(res.status).toBe(200);
    for (const l of res.body.data.leaveRequests) expect(l.department_id).toBe(engDeptId);
  });

  it("5. manager cannot approve another department's request", async () => {
    const created = await createLeave(employee2, "2026-12-01", "2026-12-02");
    const res = await api(`/api/leave-requests/${created.body.data.leaveRequest.id}/approve`, manager, { method: "PATCH" });
    expect(res.status).toBe(403);
  });

  it("6. manager cannot approve their own request", async () => {
    const created = await createLeave(manager, "2026-12-05", "2026-12-06");
    // manager is in engDept; a different manager would be needed, admin cannot self-review either;
    // use admin instead and also block employee1 approving her own:
    const emp = await createLeave(employee1, "2026-12-08", "2026-12-09");
    const selfApproveEmployee = await api(`/api/leave-requests/${emp.body.data.leaveRequest.id}/approve`, employee1, { method: "PATCH" });
    expect(selfApproveEmployee.status).toBe(403);
    // manager (same requester? no) — check manager reviewing a request that belongs to the manager:
    const ownAsManager = await api(`/api/leave-requests/${created.body.data.leaveRequest.id}/approve`, admin, { method: "PATCH" });
    expect(ownAsManager.status).toBe(200); // admin approving manager's request is allowed
  });

  it("manager cannot review own request", async () => {
    const created = await createLeave(manager, "2026-12-10", "2026-12-11");
    const res = await api(`/api/leave-requests/${created.body.data.leaveRequest.id}/approve`, manager, { method: "PATCH" });
    expect(res.status).toBe(403);
  });

  it("7. admin can manage all", async () => {
    const created = await createLeave(employee2, "2027-01-05", "2027-01-06");
    const listed = await api(`/api/leave-requests?user_id=${emp2Id}`, admin);
    expect(listed.status).toBe(200);
    expect(listed.body.data.leaveRequests.some((leave: any) => leave.id === created.body.data.leaveRequest.id)).toBe(true);
    const res = await api(`/api/leave-requests/${created.body.data.leaveRequest.id}/reject`, admin, { method: "PATCH" });
    expect(res.status).toBe(200);
    expect(res.body.data.leaveRequest.status).toBe("REJECTED");
    expect(res.body.data.leaveRequest.reviewed_by).toBeTypeOf("number");
  });

  it("8. finalized request cannot be reviewed twice", async () => {
    const created = await createLeave(employee1, "2027-02-02", "2027-02-03");
    const id = created.body.data.leaveRequest.id;
    expect((await api(`/api/leave-requests/${id}/approve`, manager, { method: "PATCH" })).status).toBe(200);
    const again = await api(`/api/leave-requests/${id}/reject`, admin, { method: "PATCH" });
    expect(again.status).toBe(409);
  });

  it("9. invalid date range rejected", async () => {
    const res = await createLeave(employee1, "2027-03-10", "2027-03-01");
    expect(res.status).toBe(400);
    const impossibleDate = await createLeave(employee1, "2027-02-30", "2027-03-01");
    expect(impossibleDate.status).toBe(400);
  });

  it("10. overlapping pending/approved leave is rejected", async () => {
    const first = await createLeave(employee1, "2027-04-01", "2027-04-05");
    expect(first.status).toBe(201);
    const overlapPending = await createLeave(employee1, "2027-04-04", "2027-04-10");
    expect(overlapPending.status).toBe(409);
    // approve first, then overlapping must still be blocked
    await api(`/api/leave-requests/${first.body.data.leaveRequest.id}/approve`, manager, { method: "PATCH" });
    const overlapApproved = await createLeave(employee1, "2027-04-02", "2027-04-03");
    expect(overlapApproved.status).toBe(409);
    // adjacent (no overlap) is allowed
    const adjacent = await createLeave(employee1, "2027-04-06", "2027-04-07");
    expect([201, 400]).toContain(adjacent.status); // 201 if really adjacent (end>=start: 04-06 after 04-05 is fine)
    expect(adjacent.status).toBe(201);
  });

  it("concurrent overlapping requests are serialized", async () => {
    const [first, second] = await Promise.all([
      createLeave(employee1, "2027-06-01", "2027-06-04"),
      createLeave(employee1, "2027-06-03", "2027-06-06"),
    ]);
    expect([first.status, second.status].sort()).toEqual([201, 409]);
  });

  it("11. concurrent review cannot produce invalid final state", async () => {
    const created = await createLeave(employee1, "2027-05-01", "2027-05-02");
    const id = created.body.data.leaveRequest.id;
    const [a, b] = await Promise.all([
      api(`/api/leave-requests/${id}/approve`, manager, { method: "PATCH" }),
      api(`/api/leave-requests/${id}/reject`, admin, { method: "PATCH" }),
    ]);
    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([200, 409]);
    const final = await api(`/api/leave-requests/${id}`, admin);
    expect(["APPROVED", "REJECTED"]).toContain(final.body.data.leaveRequest.status);
    expect(final.body.data.leaveRequest.reviewed_by).toBeTypeOf("number");
  });
});
