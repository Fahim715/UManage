import type { NextFunction, Request, Response } from "express";
import { TokenExpiredError, JsonWebTokenError } from "jsonwebtoken";
import { verifyToken } from "../utils/jwt";
import { ApiError } from "../utils/api-error";

export function authMiddleware(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;

  const match = header?.match(/^Bearer\s+(\S+)$/i);
  if (!match) {
    return next(ApiError.unauthorized("Missing or malformed Authorization header"));
  }

  try {
    const payload = verifyToken(match[1]);
    req.user = { id: payload.sub, role: payload.role, departmentId: payload.departmentId };
    next();
  } catch (err) {
    if (err instanceof TokenExpiredError) {
      return next(ApiError.unauthorized("Token expired"));
    }
    if (err instanceof JsonWebTokenError) {
      return next(ApiError.unauthorized("Invalid token"));
    }
    next(err);
  }
}
