import { pool } from "../../config/db";
import { ApiError } from "../../utils/api-error";
import { assertManagerDepartmentAccess, assertRole, isAdmin, isSameDepartment } from "../../utils/authorization";
import { getPagination, paginationMeta } from "../../utils/pagination";
import type { AuthUser } from "../../types/auth";

const DEPARTMENT_COLUMNS = "id, name, description, created_at, updated_at";

export async function listDepartments(user: AuthUser, query: { page?: unknown; limit?: unknown }) {
  if (isAdmin(user)) {
    const { page, limit, offset } = getPagination(query);
    const [rows, count] = await Promise.all([
      pool.query(
        `SELECT ${DEPARTMENT_COLUMNS} FROM departments ORDER BY id LIMIT $1 OFFSET $2`,
        [limit, offset]
      ),
      pool.query(`SELECT COUNT(*)::int AS total FROM departments`),
    ]);
    return { departments: rows.rows, meta: paginationMeta(count.rows[0].total, { page, limit, offset }) };
  }

  // MANAGER / EMPLOYEE: only their own department.
  if (user.departmentId === null) {
    return { departments: [], meta: paginationMeta(0, { page: 1, limit: 20, offset: 0 }) };
  }
  const result = await pool.query(
    `SELECT ${DEPARTMENT_COLUMNS} FROM departments WHERE id = $1`,
    [user.departmentId]
  );
  return { departments: result.rows, meta: paginationMeta(result.rows.length, { page: 1, limit: 20, offset: 0 }) };
}

async function findDepartmentOr404(id: number) {
  const result = await pool.query(
    `SELECT ${DEPARTMENT_COLUMNS} FROM departments WHERE id = $1`,
    [id]
  );
  const department = result.rows[0];
  if (!department) throw ApiError.notFound("Department not found");
  return department;
}

export async function getDepartment(user: AuthUser, id: number) {
  const department = await findDepartmentOr404(id);
  // ADMIN: any. MANAGER/EMPLOYEE: own department only.
  if (!isAdmin(user) && !isSameDepartment(user, department.id)) {
    throw ApiError.forbidden("You cannot access another department");
  }
  return department;
}

export async function createDepartment(user: AuthUser, input: { name: string; description: string }) {
  assertRole(user, "ADMIN");
  try {
    const result = await pool.query(
      `INSERT INTO departments (name, description) VALUES ($1, $2) RETURNING ${DEPARTMENT_COLUMNS}`,
      [input.name, input.description]
    );
    return result.rows[0];
  } catch (err: any) {
    if (err?.code === "23505") throw ApiError.conflict("Department name already exists");
    throw err;
  }
}

export async function updateDepartment(
  user: AuthUser,
  id: number,
  input: { name?: string; description?: string }
) {
  assertRole(user, "ADMIN");
  await findDepartmentOr404(id);
  try {
    const result = await pool.query(
      `UPDATE departments
       SET name = COALESCE($1, name), description = COALESCE($2, description)
       WHERE id = $3 RETURNING ${DEPARTMENT_COLUMNS}`,
      [input.name ?? null, input.description ?? null, id]
    );
    return result.rows[0];
  } catch (err: any) {
    if (err?.code === "23505") throw ApiError.conflict("Department name already exists");
    throw err;
  }
}

export async function deleteDepartment(user: AuthUser, id: number) {
  assertRole(user, "ADMIN");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const department = await client.query(`SELECT id FROM departments WHERE id = $1 FOR UPDATE`, [id]);
    if (department.rowCount === 0) throw ApiError.notFound("Department not found");

    // Lock the department row before checking references so concurrent inserts
    // cannot slip in between the check and delete.
    const users = await client.query(`SELECT COUNT(*)::int AS c FROM users WHERE department_id = $1`, [id]);
    const tasks = await client.query(`SELECT COUNT(*)::int AS c FROM tasks WHERE department_id = $1`, [id]);
    const leaves = await client.query(`SELECT COUNT(*)::int AS c FROM leave_requests WHERE department_id = $1`, [id]);
    const counts = {
      users: users.rows[0].c,
      tasks: tasks.rows[0].c,
      leaveRequests: leaves.rows[0].c,
    };
    if (counts.users > 0 || counts.tasks > 0 || counts.leaveRequests > 0) {
      throw new ApiError(
        409,
        `Department has active records (${counts.users} users, ${counts.tasks} tasks, ${counts.leaveRequests} leave requests) and cannot be deleted`,
        counts
      );
    }
    await client.query(`DELETE FROM departments WHERE id = $1`, [id]);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function listDepartmentMembers(user: AuthUser, id: number) {
  const department = await findDepartmentOr404(id);
  // Only admins and same-department managers may enumerate members.
  assertManagerDepartmentAccess(user, department.id);
  const result = await pool.query(
    `SELECT id, name, email, role, department_id, created_at
     FROM users WHERE department_id = $1 ORDER BY id`,
    [id]
  );
  return result.rows;
}
