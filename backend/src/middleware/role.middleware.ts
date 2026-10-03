import type { NextFunction, Request, Response } from "express";
import { ApiError } from "../utils/api-error";
import type { Role } from "../types/auth";

/**
 * Role-only gate. Use it to protect whole routes/feature areas.
 * Resource ownership/department scoping must still be enforced in services.
 *
 * 401 when unauthenticated, 403 when authenticated but not allowed.
 */
export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(ApiError.unauthorized("Not authenticated"));
    }
    if (!roles.includes(req.user.role)) {
      return next(ApiError.forbidden("Insufficient permissions"));
    }
    next();
  };
}

export const requireAdmin = requireRole("ADMIN");
export const requireManagerOrAdmin = requireRole("MANAGER", "ADMIN");
