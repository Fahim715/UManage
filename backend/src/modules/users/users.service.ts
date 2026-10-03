import { pool } from "../../config/db";
import { ApiError } from "../../utils/api-error";
import { hashPassword } from "../../utils/password";
import {
  assertManagerDepartmentAccess,
  assertRole,
  isAdmin,
  isSameDepartment,
} from "../../utils/authorization";
import { getPagination, paginationMeta } from "../../utils/pagination";
import type { AuthUser } from "../../types/auth";
import type { Role } from "../../types/auth";

// Explicit column list — password_hash is never selected.
const USER_COLUMNS = "id, name, email, role, department_id, created_at, updated_at";

export async function listUsers(user: AuthUser, query: { page?: unknown; limit?: unknown }) {
  if (isAdmin(user)) {
    const { page, limit, offset } = getPagination(query);
    const [rows, count] = await Promise.all([
      pool.query(`SELECT ${USER_COLUMNS} FROM users ORDER BY id LIMIT $1 OFFSET $2`, [limit, offset]),
      pool.query(`SELECT COUNT(*)::int AS total FROM users`),
    ]);
    return { users: rows.rows, meta: paginationMeta(count.rows[0].total, { page, limit, offset }) };
  }

  if (user.role === "MANAGER") {
    if (user.departmentId === null) {
      return { users: [], meta: paginationMeta(0, { page: 1, limit: 20, offset: 0 }) };
    }
    const { page, limit, offset } = getPagination(query);
    const [rows, count] = await Promise.all([
      pool.query(
        `SELECT ${USER_COLUMNS} FROM users WHERE department_id = $1 ORDER BY id LIMIT $2 OFFSET $3`,
        [user.departmentId, limit, offset]
      ),
      pool.query(`SELECT COUNT(*)::int AS total FROM users WHERE department_id = $1`, [user.departmentId]),
    ]);
    return { users: rows.rows, meta: paginationMeta(count.rows[0].total, { page, limit, offset }) };
  }

  // EMPLOYEE: no access to the user list.
  throw ApiError.forbidden("Employees cannot list users");
}

async function findUserOr404(id: number) {
  const result = await pool.query(`SELECT ${USER_COLUMNS} FROM users WHERE id = $1`, [id]);
  const row = result.rows[0];
  if (!row) throw ApiError.notFound("User not found");
  return row;
}

export async function getUser(user: AuthUser, id: number) {
  const target = await findUserOr404(id);
  if (isAdmin(user)) return target;
  if (user.role === "MANAGER" && isSameDepartment(user, target.department_id)) return target;
  if (user.role === "EMPLOYEE" && user.id === target.id) return target;
  throw ApiError.forbidden("You cannot access this user");
}

async function assertDepartmentExists(departmentId: number | null | undefined) {
  if (departmentId === null || departmentId === undefined) return;
  const result = await pool.query(`SELECT 1 FROM departments WHERE id = $1`, [departmentId]);
  if (result.rows.length === 0) throw ApiError.badRequest("Department does not exist");
}

export async function createUser(user: AuthUser, input: {
  name: string;
  email: string;
  password: string;
  role: Role;
  department_id?: number | null;
}) {
  assertRole(user, "ADMIN", "MANAGER");

  let role = input.role;
  let departmentId = input.department_id ?? null;
  if (user.role === "MANAGER") {
    if (user.departmentId === null) {
      throw ApiError.forbidden("Managers must belong to a department to create users");
    }
    if (role !== "EMPLOYEE") {
      throw ApiError.forbidden("Managers may only create employee accounts");
    }
    if (input.department_id !== undefined && input.department_id !== user.departmentId) {
      throw ApiError.forbidden("Managers may only create users in their own department");
    }
    // Derive both role and department from the manager policy, not client input.
    role = "EMPLOYEE";
    departmentId = user.departmentId;
  }

  await assertDepartmentExists(departmentId);
  const passwordHash = await hashPassword(input.password);
  try {
    const result = await pool.query(
      `INSERT INTO users (name, email, password_hash, role, department_id)
       VALUES ($1, $2, $3, $4, $5) RETURNING ${USER_COLUMNS}`,
      [input.name, input.email, passwordHash, role, departmentId]
    );
    return result.rows[0];
  } catch (err: any) {
    if (err?.code === "23505") throw ApiError.conflict("Email is already in use");
    throw err;
  }
}

export async function updateUser(user: AuthUser, id: number, input: {
  name?: string;
  email?: string;
  department_id?: number | null;
}) {
  assertRole(user, "ADMIN", "MANAGER");
  const target = await findUserOr404(id);
  if (user.role === "MANAGER") {
    assertManagerDepartmentAccess(user, target.department_id ?? -1);
    if (input.department_id !== undefined) {
      throw ApiError.forbidden("Managers cannot move users between departments");
    }
  }
  if (input.department_id !== undefined) await assertDepartmentExists(input.department_id);
  try {
    const result = await pool.query(
      `UPDATE users
       SET name = COALESCE($1, name),
           email = COALESCE($2, email),
           department_id = CASE WHEN $3::boolean THEN $4 ELSE department_id END
       WHERE id = $5 RETURNING ${USER_COLUMNS}`,
      [input.name ?? null, input.email ?? null, input.department_id !== undefined, input.department_id ?? null, id]
    );
    return result.rows[0];
  } catch (err: any) {
    if (err?.code === "23505") throw ApiError.conflict("Email is already in use");
    throw err;
  }
}

export async function deleteUser(user: AuthUser, id: number) {
  assertRole(user, "ADMIN");
  const target = await findUserOr404(id);
  if (target.id === user.id) {
    throw ApiError.conflict("You cannot delete your own account");
  }
  await pool.query(`DELETE FROM users WHERE id = $1`, [id]);
}

export async function changeRole(user: AuthUser, id: number, role: Role) {
  assertRole(user, "ADMIN"); // only ADMIN can assign any role — no escalation path
  await findUserOr404(id);
  const result = await pool.query(
    `UPDATE users SET role = $1 WHERE id = $2 RETURNING ${USER_COLUMNS}`,
    [role, id]
  );
  return result.rows[0];
}

export async function changeDepartment(user: AuthUser, id: number, departmentId: number | null) {
  assertRole(user, "ADMIN");
  await findUserOr404(id);
  if (departmentId !== null) await assertDepartmentExists(departmentId);
  const result = await pool.query(
    `UPDATE users SET department_id = $1 WHERE id = $2 RETURNING ${USER_COLUMNS}`,
    [departmentId, id]
  );
  return result.rows[0];
}
