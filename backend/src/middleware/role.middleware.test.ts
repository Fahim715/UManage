import { describe, it, expect, vi } from "vitest";
import type { NextFunction, Request, Response } from "express";
import { requireRole, requireAdmin, requireManagerOrAdmin } from "./role.middleware";
import { ApiError } from "../utils/api-error";
import type { AuthUser } from "../types/auth";

function run(mw: ReturnType<typeof requireRole>, user?: AuthUser) {
  const req = { user } as Request;
  const res = {} as Response;
  const next = vi.fn() as unknown as NextFunction & ReturnType<typeof vi.fn>;
  mw(req, res, next);
  return next;
}

const admin: AuthUser = { id: 1, role: "ADMIN", departmentId: null };
const manager: AuthUser = { id: 2, role: "MANAGER", departmentId: 10 };
const employee: AuthUser = { id: 3, role: "EMPLOYEE", departmentId: 10 };

describe("requireRole", () => {
  it("calls next() when role matches", () => {
    const next = run(requireRole("ADMIN", "MANAGER"), manager);
    expect(next).toHaveBeenCalledWith();
  });

  it("401 when unauthenticated", () => {
    const next = run(requireRole("ADMIN"), undefined);
    const err = (next as ReturnType<typeof vi.fn>).mock.calls[0][0] as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.statusCode).toBe(401);
  });

  it("403 when role not included", () => {
    const next = run(requireRole("ADMIN"), employee);
    const err = (next as ReturnType<typeof vi.fn>).mock.calls[0][0] as ApiError;
    expect(err.statusCode).toBe(403);
  });
});

describe("requireAdmin / requireManagerOrAdmin", () => {
  it("requireAdmin allows admin only", () => {
    expect((run(requireAdmin, admin) as unknown as ReturnType<typeof vi.fn>).mock.calls[0]).toEqual([]);
    const err = (run(requireAdmin, manager) as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0] as ApiError;
    expect(err.statusCode).toBe(403);
  });

  it("requireManagerOrAdmin allows manager and admin, blocks employee", () => {
    expect((run(requireManagerOrAdmin, manager) as unknown as ReturnType<typeof vi.fn>).mock.calls[0]).toEqual([]);
    expect((run(requireManagerOrAdmin, admin) as unknown as ReturnType<typeof vi.fn>).mock.calls[0]).toEqual([]);
    const err = (run(requireManagerOrAdmin, employee) as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0] as ApiError;
    expect(err.statusCode).toBe(403);
  });
});
