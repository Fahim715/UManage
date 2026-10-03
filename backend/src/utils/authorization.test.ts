import { describe, it, expect } from "vitest";
import {
  requireAuth,
  isAdmin,
  isSameDepartment,
  isOwner,
  assertDepartmentAccess,
  assertManagerDepartmentAccess,
  assertOwnerOrAdmin,
  assertOwnerOrManagerOfDepartmentOrAdmin,
  assertRole,
} from "./authorization";
import { ApiError } from "./api-error";
import type { AuthUser } from "../types/auth";

const admin: AuthUser = { id: 1, role: "ADMIN", departmentId: null };
const managerEng: AuthUser = { id: 2, role: "MANAGER", departmentId: 10 };
const managerHr: AuthUser = { id: 3, role: "MANAGER", departmentId: 20 };
const employee: AuthUser = { id: 4, role: "EMPLOYEE", departmentId: 10 };

function expectStatus(fn: () => void, statusCode: number) {
  try {
    fn();
    expect.unreachable("expected to throw");
  } catch (err) {
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).statusCode).toBe(statusCode);
  }
}

describe("requireAuth", () => {
  it("throws 401 when no user", () => expectStatus(() => requireAuth(undefined), 401));
  it("passes with a user", () => expect(() => requireAuth(admin)).not.toThrow());
});

describe("isAdmin / isSameDepartment / isOwner", () => {
  it("detects admin", () => {
    expect(isAdmin(admin)).toBe(true);
    expect(isAdmin(employee)).toBe(false);
  });
  it("matches department ids strictly", () => {
    expect(isSameDepartment(managerEng, 10)).toBe(true);
    expect(isSameDepartment(managerEng, 20)).toBe(false);
    expect(isSameDepartment(admin, 10)).toBe(false); // admin has null department
    expect(isSameDepartment(employee, null)).toBe(false);
  });
  it("matches ownership", () => {
    expect(isOwner(employee, 4)).toBe(true);
    expect(isOwner(employee, 5)).toBe(false);
    expect(isOwner(employee, null)).toBe(false);
  });
});

describe("assertDepartmentAccess", () => {
  it("allows ADMIN anywhere", () => expect(() => assertDepartmentAccess(admin, 20)).not.toThrow());
  it("allows MANAGER in own department", () => expect(() => assertDepartmentAccess(managerEng, 10)).not.toThrow());
  it("forbids MANAGER in another department", () => expectStatus(() => assertDepartmentAccess(managerEng, 20), 403));
  it("forbids EMPLOYEE entirely", () => expectStatus(() => assertDepartmentAccess(employee, 10), 403));
});

describe("assertManagerDepartmentAccess", () => {
  it("allows ADMIN", () => expect(() => assertManagerDepartmentAccess(admin, 10)).not.toThrow());
  it("allows same-department MANAGER", () => expect(() => assertManagerDepartmentAccess(managerHr, 20)).not.toThrow());
  it("forbids cross-department MANAGER", () => expectStatus(() => assertManagerDepartmentAccess(managerHr, 10), 403));
  it("forbids EMPLOYEE even in own department", () => expectStatus(() => assertManagerDepartmentAccess(employee, 10), 403));
});

describe("assertOwnerOrAdmin", () => {
  it("allows owner", () => expect(() => assertOwnerOrAdmin(employee, 4)).not.toThrow());
  it("allows admin", () => expect(() => assertOwnerOrAdmin(admin, 4)).not.toThrow());
  it("forbids other employees", () => expectStatus(() => assertOwnerOrAdmin(employee, 5), 403));
  it("forbids managers even when they own the resource", () => expectStatus(() => assertOwnerOrAdmin(managerEng, managerEng.id), 403));
});

describe("assertOwnerOrManagerOfDepartmentOrAdmin", () => {
  it("allows owner employee", () => expect(() => assertOwnerOrManagerOfDepartmentOrAdmin(employee, 4, 10)).not.toThrow());
  it("allows same-department manager", () => expect(() => assertOwnerOrManagerOfDepartmentOrAdmin(managerEng, 4, 10)).not.toThrow());
  it("forbids cross-department manager", () => expectStatus(() => assertOwnerOrManagerOfDepartmentOrAdmin(managerHr, 4, 10), 403));
  it("forbids a manager who owns a resource outside their department", () => expectStatus(() => assertOwnerOrManagerOfDepartmentOrAdmin(managerEng, managerEng.id, 20), 403));
  it("forbids unrelated employee", () => expectStatus(() => assertOwnerOrManagerOfDepartmentOrAdmin(employee, 5, 10), 403));
});

describe("assertRole", () => {
  it("allows listed role", () => expect(() => assertRole(admin, "ADMIN")).not.toThrow());
  it("forbids other role", () => expectStatus(() => assertRole(employee, "ADMIN", "MANAGER"), 403));
  it("401 without user", () => expectStatus(() => assertRole(undefined, "ADMIN"), 401));
});
