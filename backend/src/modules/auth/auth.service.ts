import { randomBytes } from "crypto";
import { pool } from "../../config/db";
import { ApiError } from "../../utils/api-error";
import { comparePassword, hashPassword } from "../../utils/password";
import { signToken } from "../../utils/jwt";
import type { Role } from "../../types/auth";

interface UserRow {
  id: number;
  name: string;
  email: string;
  password_hash: string;
  role: Role;
  department_id: number | null;
  created_at: Date;
}

type PublicUserRow = Omit<UserRow, "password_hash">;

// Do a bcrypt comparison for unknown emails too, reducing email-existence
// timing differences without keeping or exposing a dummy credential.
const dummyPasswordHash = hashPassword(randomBytes(32).toString("base64"));

/** User shape returned to clients — never includes password_hash. */
export interface PublicUser {
  id: number;
  name: string;
  email: string;
  role: Role;
  department_id: number | null;
  created_at: Date;
}

function toPublicUser(row: PublicUserRow): PublicUser {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    department_id: row.department_id,
    created_at: row.created_at,
  };
}

export async function login(email: string, password: string) {
  const result = await pool.query<UserRow>(
    `SELECT id, name, email, password_hash, role, department_id, created_at
     FROM users WHERE email = $1`,
    [email]
  );

  const user = result.rows[0];
  // Same generic message whether the email or the password is wrong.
  if (!user) {
    await comparePassword(password, await dummyPasswordHash);
    throw ApiError.unauthorized("Invalid email or password");
  }

  const ok = await comparePassword(password, user.password_hash);
  if (!ok) {
    throw ApiError.unauthorized("Invalid email or password");
  }

  const token = signToken({ sub: user.id, role: user.role, departmentId: user.department_id });
  return { user: toPublicUser(user), token };
}

export async function getCurrentUser(userId: number) {
  const result = await pool.query<PublicUserRow>(
    `SELECT id, name, email, role, department_id, created_at
     FROM users WHERE id = $1`,
    [userId]
  );
  const user = result.rows[0];
  if (!user) {
    throw ApiError.unauthorized("Account no longer exists");
  }
  return toPublicUser(user);
}

export async function changePassword(userId: number, currentPassword: string, newPassword: string) {
  const result = await pool.query<{ password_hash: string }>(
    `SELECT password_hash FROM users WHERE id = $1`,
    [userId]
  );
  const row = result.rows[0];
  if (!row) {
    throw ApiError.unauthorized("Account no longer exists");
  }

  const ok = await comparePassword(currentPassword, row.password_hash);
  if (!ok) {
    throw ApiError.badRequest("Current password is incorrect");
  }

  const newHash = await hashPassword(newPassword);
  await pool.query(`UPDATE users SET password_hash = $1 WHERE id = $2`, [newHash, userId]);
}
