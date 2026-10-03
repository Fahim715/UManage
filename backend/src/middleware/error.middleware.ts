import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { ApiError } from "../utils/api-error";
import { env } from "../config/env";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorMiddleware(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  if (err instanceof ApiError) {
    return res.status(err.statusCode).json({
      success: false,
      error: { message: err.message, details: err.details },
    });
  }

  if (err instanceof ZodError) {
    return res.status(400).json({
      success: false,
      error: { message: "Validation failed", details: err.issues },
    });
  }

  // PostgreSQL errors carry a string code like "23505" (unique violation).
  const pgCode = (err as { code?: string })?.code;
  if (typeof pgCode === "string" && /^[0-9A-Z]{5}$/.test(pgCode)) {
    const status = pgCode === "23505" ? 409 : pgCode.startsWith("23") ? 400 : 500;
    return res.status(status).json({
      success: false,
      error: { message: "Database error", code: pgCode },
    });
  }

  const message =
    env.NODE_ENV === "production"
      ? "Internal server error"
      : err instanceof Error
        ? err.message
        : "Internal server error";

  if (env.NODE_ENV !== "production" && err instanceof Error) {
    console.error(err);
  }

  return res.status(500).json({ success: false, error: { message } });
}
