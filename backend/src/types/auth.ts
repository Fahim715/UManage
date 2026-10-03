export type Role = "ADMIN" | "MANAGER" | "EMPLOYEE";

/** Claims embedded in the JWT. Keep minimal — no secrets, no password data. */
export interface JwtPayload {
  sub: number;
  role: Role;
  departmentId: number | null;
}

/** Authenticated user context attached to the request by auth middleware. */
export interface AuthUser {
  id: number;
  role: Role;
  departmentId: number | null;
}
