import jwt, { JsonWebTokenError, type SignOptions } from "jsonwebtoken";
import { env } from "../config/env";
import { z } from "zod";
import type { JwtPayload, Role } from "../types/auth";

const roleSchema = z.enum(["ADMIN", "MANAGER", "EMPLOYEE"] satisfies [Role, ...Role[]]);
const payloadSchema = z.object({
  sub: z.number().int().positive(),
  role: roleSchema,
  departmentId: z.number().int().positive().nullable(),
});

export function signToken(payload: JwtPayload): string {
  const options: SignOptions = { expiresIn: env.JWT_EXPIRES_IN as SignOptions["expiresIn"] };
  return jwt.sign(payload, env.JWT_SECRET, options);
}

export function verifyToken(token: string): JwtPayload {
  const decoded = jwt.verify(token, env.JWT_SECRET);
  if (typeof decoded !== "object" || decoded === null) {
    throw new JsonWebTokenError("Malformed token payload");
  }
  const parsed = payloadSchema.safeParse(decoded);
  if (!parsed.success) {
    throw new JsonWebTokenError("Malformed token payload");
  }
  return parsed.data;
}
