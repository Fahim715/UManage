import { ApiError } from "./api-error";
import type { AuthUser, Role } from "../types/auth";

/**
 * Resource-level authorization helpers.
 *
 * These are called from services with identities derived from the JWT
 * (req.user) — never from client-supplied user_id / department_id /
 * created_by / reviewed_by / role fields.
 */

/** 401 when there is no authenticated context at all. */
export function requireAuth(user: AuthUser | undefined): asserts user is AuthUser {
  if (!user) {
    throw ApiError.unauthorized("Not authenticated");
  }
}

export function isAdmin(user: AuthUser): boolean {
  return user.role === "ADMIN";
}

/** True when the resource belongs to the user's own department. */
export function isSameDepartment(user: AuthUser, departmentId: number | null | undefined): boolean {
  return (
    user.departmentId !== null &&
    departmentId !== null &&
    departmentId !== undefined &&
    user.departmentId === departmentId
  );
}

/** True when the resource is owned by the user. */
export function isOwner(user: AuthUser, ownerId: number | null | undefined): boolean {
  return ownerId !== null && ownerId !== undefined && user.id === ownerId;
}

/** ADMIN: everything. MANAGER: own department only. EMPLOYEE: never department-level. */
export function assertDepartmentAccess(user: AuthUser, departmentId: number) {
  requireAuth(user);
  if (isAdmin(user)) return;
  if (user.role === "MANAGER" && isSameDepartment(user, departmentId)) return;
  throw ApiError.forbidden("You cannot access resources outside your department");
}

/**
 * MANAGER/ADMIN scoped access to a department resource (e.g. reviewing leave,
 * managing tasks). EMPLOYEEs are never allowed here.
 */
export function assertManagerDepartmentAccess(user: AuthUser, departmentId: number) {
  requireAuth(user);
  if (user.role === "ADMIN") return;
  if (user.role === "MANAGER" && isSameDepartment(user, departmentId)) return;
  throw ApiError.forbidden("You cannot manage resources outside your department");
}

/** EMPLOYEE owner or ADMIN. MANAGER access must always be department-scoped. */
export function assertOwnerOrAdmin(user: AuthUser, ownerId: number | null) {
  requireAuth(user);
  if (isAdmin(user) || (user.role === "EMPLOYEE" && isOwner(user, ownerId))) return;
  throw ApiError.forbidden("You do not have access to this resource");
}

/**
 * Read access commonly used for own-resource checks with a manager override:
 * ADMIN passes anywhere; EMPLOYEE passes only as owner; MANAGER passes only
 * when the resource belongs to their department, even if they own/created it.
 */
export function assertOwnerOrManagerOfDepartmentOrAdmin(
  user: AuthUser,
  ownerId: number | null,
  departmentId: number | null
) {
  requireAuth(user);
  if (isAdmin(user)) return;
  if (user.role === "EMPLOYEE" && isOwner(user, ownerId)) return;
  if (user.role === "MANAGER" && isSameDepartment(user, departmentId)) return;
  throw ApiError.forbidden("You cannot access this resource");
}

/** Throws 403 unless the user has one of the given roles (after auth check). */
export function assertRole(user: AuthUser | undefined, ...roles: Role[]) {
  requireAuth(user);
  if (!roles.includes(user.role)) {
    throw ApiError.forbidden("Insufficient permissions");
  }
}
