import { pool } from "../../config/db";
import { ApiError } from "../../utils/api-error";
import {
  assertRole,
  isAdmin,
  isSameDepartment,
  requireAuth,
} from "../../utils/authorization";
import { getPagination, paginationMeta } from "../../utils/pagination";
import type { AuthUser } from "../../types/auth";
import type { CreateTaskInput, ListTasksQuery, UpdateTaskInput } from "./task.schemas";

const TASK_COLUMNS = `id, title, description, status, priority, due_date,
  assigned_to, created_by, department_id, created_at, updated_at`;

const SORTABLE: Record<string, string> = {
  created_at: "created_at",
  due_date: "due_date",
  priority: "priority",
  status: "status",
  title: "title",
};

export async function listTasks(user: AuthUser, query: ListTasksQuery) {
  requireAuth(user);

  const conditions: string[] = [];
  const params: unknown[] = [];
  const addParam = (value: unknown) => {
    params.push(value);
    return `$${params.length}`;
  };

  // Role-based base restrictions are applied BEFORE client filters.
  if (isAdmin(user)) {
    // no base restriction
  } else if (user.role === "MANAGER") {
    if (user.departmentId === null) {
      return { tasks: [], meta: paginationMeta(0, { page: 1, limit: 20, offset: 0 }) };
    }
    if (query.department_id !== undefined && query.department_id !== user.departmentId) {
      throw ApiError.forbidden("You cannot filter tasks from another department");
    }
    conditions.push(`department_id = ${addParam(user.departmentId)}`);
  } else {
    // EMPLOYEE: only own tasks; explicit foreign assigned_to yields only own data.
    conditions.push(`assigned_to = ${addParam(user.id)}`);
  }

  if (query.status) conditions.push(`status = ${addParam(query.status)}`);
  if (query.priority) conditions.push(`priority = ${addParam(query.priority)}`);
  if (query.assigned_to !== undefined && user.role !== "EMPLOYEE") {
    conditions.push(`assigned_to = ${addParam(query.assigned_to)}`);
  }
  if (query.department_id !== undefined && user.role === "ADMIN") {
    conditions.push(`department_id = ${addParam(query.department_id)}`);
  }
  if (query.due_date_from) conditions.push(`due_date >= ${addParam(query.due_date_from)}`);
  if (query.due_date_to) conditions.push(`due_date <= ${addParam(query.due_date_to)}`);

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const { page, limit, offset } = getPagination(query);
  const sortColumn = SORTABLE[query.sort ?? "created_at"] ?? "created_at";
  const order = query.order === "asc" ? "ASC" : "DESC";

  const [rows, count] = await Promise.all([
    pool.query(
      `SELECT ${TASK_COLUMNS} FROM tasks ${where} ORDER BY ${sortColumn} ${order}, id ASC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    ),
    pool.query(`SELECT COUNT(*)::int AS total FROM tasks ${where}`, params),
  ]);

  return { tasks: rows.rows, meta: paginationMeta(count.rows[0].total, { page, limit, offset }) };
}

async function findTaskOr404(id: number) {
  const result = await pool.query(`SELECT ${TASK_COLUMNS} FROM tasks WHERE id = $1`, [id]);
  const task = result.rows[0];
  if (!task) throw ApiError.notFound("Task not found");
  return task;
}

/** View access: ADMIN any; MANAGER same department; EMPLOYEE only assigned to them. */
function assertCanView(user: AuthUser, task: any) {
  if (isAdmin(user)) return;
  if (user.role === "MANAGER" && isSameDepartment(user, task.department_id)) return;
  if (user.role === "EMPLOYEE" && task.assigned_to === user.id) return;
  throw ApiError.forbidden("You cannot access this task");
}

export async function getTask(user: AuthUser, id: number) {
  requireAuth(user);
  const task = await findTaskOr404(id);
  assertCanView(user, task);
  return task;
}

async function assertDepartmentExists(departmentId: number) {
  const result = await pool.query(`SELECT 1 FROM departments WHERE id = $1`, [departmentId]);
  if (result.rows.length === 0) throw ApiError.badRequest("Department does not exist");
}

/** assigned user must exist and belong to the given department. */
async function assertValidAssignee(
  assignedTo: number | null | undefined,
  departmentId: number,
  managerAssignment = false
) {
  if (assignedTo === null || assignedTo === undefined) return;
  const result = await pool.query(
    `SELECT department_id, role FROM users WHERE id = $1`,
    [assignedTo]
  );
  const assignee = result.rows[0];
  if (!assignee) throw ApiError.badRequest("Assigned user does not exist");
  if (managerAssignment && assignee.role !== "EMPLOYEE") {
    throw ApiError.forbidden("Managers can only assign tasks to employees");
  }
  if (assignee.department_id !== departmentId) {
    if (managerAssignment) {
      throw ApiError.forbidden("Managers can only assign tasks to employees in their own department");
    }
    throw ApiError.badRequest("Assigned user must belong to the task's department");
  }
}

async function assertValidCreator(createdBy: number | null) {
  if (createdBy === null) return;
  const result = await pool.query(`SELECT 1 FROM users WHERE id = $1`, [createdBy]);
  if (result.rowCount === 0) throw ApiError.badRequest("Task creator does not exist");
}

export async function createTask(user: AuthUser, input: CreateTaskInput) {
  assertRole(user, "ADMIN", "MANAGER");

  // MANAGER can only create within their own department.
  if (!isAdmin(user) && !isSameDepartment(user, input.department_id)) {
    throw ApiError.forbidden("Managers can only create tasks for their own department");
  }
  await assertDepartmentExists(input.department_id);
  await assertValidAssignee(input.assigned_to, input.department_id, user.role === "MANAGER");

  const result = await pool.query(
    `INSERT INTO tasks (title, description, status, priority, due_date, assigned_to, created_by, department_id)
     VALUES ($1, $2, COALESCE($3::task_status, 'TODO'), COALESCE($4::task_priority, 'MEDIUM'), $5, $6, $7, $8)
     RETURNING ${TASK_COLUMNS}`,
    [
      input.title,
      input.description ?? null,
      input.status ?? null,
      input.priority ?? null,
      input.due_date ?? null,
      input.assigned_to ?? null,
      user.id, // derived from auth context, never from the client
      input.department_id,
    ]
  );
  return result.rows[0];
}

export async function updateTask(user: AuthUser, id: number, input: UpdateTaskInput) {
  assertRole(user, "ADMIN", "MANAGER");
  const task = await findTaskOr404(id);

  if (!isAdmin(user) && !isSameDepartment(user, task.department_id)) {
    throw ApiError.forbidden("You cannot modify tasks from another department");
  }

  // Managers cannot move a task to another department.
  if (!isAdmin(user) && input.department_id !== undefined && input.department_id !== task.department_id) {
    throw ApiError.forbidden("Managers cannot move tasks to another department");
  }
  if (!isAdmin(user) && input.created_by !== undefined) {
    throw ApiError.forbidden("Managers cannot change task creator information");
  }

  const newDepartmentId = isAdmin(user) && input.department_id !== undefined ? input.department_id : task.department_id;
  if (input.department_id !== undefined) await assertDepartmentExists(newDepartmentId);
  const newAssignee = input.assigned_to !== undefined ? input.assigned_to : task.assigned_to;
  await assertValidAssignee(newAssignee, newDepartmentId, user.role === "MANAGER");
  if (isAdmin(user) && input.created_by !== undefined) await assertValidCreator(input.created_by);

  const result = await pool.query(
    `UPDATE tasks SET
       title = COALESCE($1, title),
       description = CASE WHEN $2::boolean THEN $3 ELSE description END,
       status = COALESCE($4::task_status, status),
       priority = COALESCE($5::task_priority, priority),
       due_date = CASE WHEN $6::boolean THEN $7 ELSE due_date END,
       assigned_to = CASE WHEN $8::boolean THEN $9 ELSE assigned_to END,
       department_id = COALESCE($10, department_id),
       created_by = CASE WHEN $11::boolean THEN $12 ELSE created_by END
     WHERE id = $13 RETURNING ${TASK_COLUMNS}`,
    [
      input.title ?? null,
      input.description !== undefined,
      input.description ?? null,
      input.status ?? null,
      input.priority ?? null,
      input.due_date !== undefined,
      input.due_date ?? null,
      input.assigned_to !== undefined,
      input.assigned_to ?? null,
      isAdmin(user) ? input.department_id ?? null : null,
      isAdmin(user) && input.created_by !== undefined,
      isAdmin(user) ? input.created_by ?? null : null,
      id,
    ]
  );
  return result.rows[0];
}

export async function updateTaskStatus(user: AuthUser, id: number, status: UpdateTaskInput["status"]) {
  requireAuth(user);
  const task = await findTaskOr404(id);

  if (isAdmin(user)) {
    // allow
  } else if (user.role === "MANAGER") {
    if (!isSameDepartment(user, task.department_id)) {
      throw ApiError.forbidden("You cannot modify tasks from another department");
    }
  } else {
    // EMPLOYEE: only status, and only on their own tasks.
    if (task.assigned_to !== user.id) {
      throw ApiError.forbidden("You can only update the status of your own tasks");
    }
  }

  const result = await pool.query(
    `UPDATE tasks SET status = $1::task_status WHERE id = $2 RETURNING ${TASK_COLUMNS}`,
    [status, id]
  );
  return result.rows[0];
}

export async function deleteTask(user: AuthUser, id: number) {
  assertRole(user, "ADMIN", "MANAGER");
  const task = await findTaskOr404(id);
  if (!isAdmin(user) && !isSameDepartment(user, task.department_id)) {
    throw ApiError.forbidden("You cannot delete tasks from another department");
  }
  await pool.query(`DELETE FROM tasks WHERE id = $1`, [id]);
}
