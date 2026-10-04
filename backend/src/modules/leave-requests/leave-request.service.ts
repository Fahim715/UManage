import { pool } from "../../config/db";
import { ApiError } from "../../utils/api-error";
import { isAdmin, isSameDepartment, requireAuth } from "../../utils/authorization";
import { getPagination, paginationMeta } from "../../utils/pagination";
import type { AuthUser } from "../../types/auth";
import type { CreateLeaveRequestInput, ListLeaveQuery } from "./leave-request.schemas";

const LEAVE_REQUEST_LOCK_NAMESPACE = 1280265298;

const LEAVE_COLUMNS = `id, user_id, type, start_date, end_date, reason, status,
  reviewed_by, reviewed_at, department_id, created_at, updated_at`;

const SORTABLE: Record<string, string> = {
  created_at: "created_at",
  start_date: "start_date",
  end_date: "end_date",
  status: "status",
};

export async function listLeaveRequests(user: AuthUser, query: ListLeaveQuery) {
  requireAuth(user);
  const pagination = getPagination(query);
  const conditions: string[] = [];
  const params: unknown[] = [];
  const addParam = (v: unknown) => { params.push(v); return `$${params.length}`; };

  // Role scope first.
  if (isAdmin(user)) {
    // unrestricted
  } else if (user.role === "MANAGER") {
    if (user.departmentId === null) {
      return { leaveRequests: [], meta: paginationMeta(0, pagination) };
    }
    conditions.push(`department_id = ${addParam(user.departmentId)}`);
  } else {
    conditions.push(`user_id = ${addParam(user.id)}`);
  }

  if (query.status) conditions.push(`status = ${addParam(query.status)}`);
  if (query.type) conditions.push(`type = ${addParam(query.type)}`);
  if (query.user_id !== undefined && user.role !== "EMPLOYEE") {
    conditions.push(`user_id = ${addParam(query.user_id)}`);
  }
  if (query.start_date) conditions.push(`start_date >= ${addParam(query.start_date)}`);
  if (query.end_date) conditions.push(`end_date <= ${addParam(query.end_date)}`);

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const { page, limit, offset } = pagination;
  const sortColumn = SORTABLE[query.sort ?? "created_at"] ?? "created_at";
  const order = query.order === "asc" ? "ASC" : "DESC";

  const [rows, count] = await Promise.all([
    pool.query(
      `SELECT ${LEAVE_COLUMNS} FROM leave_requests ${where} ORDER BY ${sortColumn} ${order}, id ASC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    ),
    pool.query(`SELECT COUNT(*)::int AS total FROM leave_requests ${where}`, params),
  ]);
  return { leaveRequests: rows.rows, meta: paginationMeta(count.rows[0].total, { page, limit, offset }) };
}

async function findLeaveOr404(id: number) {
  const result = await pool.query(`SELECT ${LEAVE_COLUMNS} FROM leave_requests WHERE id = $1`, [id]);
  const row = result.rows[0];
  if (!row) throw ApiError.notFound("Leave request not found");
  return row;
}

function assertCanView(user: AuthUser, leave: any) {
  if (isAdmin(user)) return;
  if (user.role === "MANAGER" && isSameDepartment(user, leave.department_id)) return;
  if (user.role === "EMPLOYEE" && leave.user_id === user.id) return;
  throw ApiError.forbidden("You cannot access this leave request");
}

export async function getLeaveRequest(user: AuthUser, id: number) {
  requireAuth(user);
  const leave = await findLeaveOr404(id);
  assertCanView(user, leave);
  return leave;
}

export async function createLeaveRequest(user: AuthUser, input: CreateLeaveRequestInput) {
  requireAuth(user);
  const client = await pool.connect();
  let inTransaction = false;
  try {
    await client.query("BEGIN");
    inTransaction = true;
    await client.query("SELECT pg_advisory_xact_lock($1, $2)", [LEAVE_REQUEST_LOCK_NAMESPACE, user.id]);

    // Identity and department always come from the database record for the JWT user.
    const userResult = await client.query<{ department_id: number | null }>(
      `SELECT department_id FROM users WHERE id = $1 FOR SHARE`,
      [user.id]
    );
    if (!userResult.rows[0]) throw ApiError.unauthorized("Account no longer exists");
    const departmentId = userResult.rows[0].department_id;
    if (departmentId === null) {
      throw ApiError.badRequest("Your account is not assigned to a department");
    }

    // Pending and approved requests both reserve their dates. The per-user
    // transaction lock prevents concurrent requests from bypassing this check.
    const overlap = await client.query(
      `SELECT id FROM leave_requests
       WHERE user_id = $1 AND status IN ('PENDING', 'APPROVED')
         AND start_date <= $3::date AND end_date >= $2::date
       LIMIT 1`,
      [user.id, input.start_date, input.end_date]
    );
    if (overlap.rows.length > 0) {
      throw ApiError.conflict("You already have an overlapping pending or approved leave request for these dates");
    }

    const result = await client.query(
      `INSERT INTO leave_requests (user_id, department_id, type, start_date, end_date, reason, status)
       VALUES ($1, $2, $3::leave_type, $4, $5, $6, 'PENDING')
       RETURNING ${LEAVE_COLUMNS}`,
      [user.id, departmentId, input.type, input.start_date, input.end_date, input.reason ?? null]
    );
    await client.query("COMMIT");
    inTransaction = false;
    return result.rows[0];
  } catch (err) {
    if (inTransaction) await client.query("ROLLBACK").catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

async function review(user: AuthUser, id: number, decision: "APPROVED" | "REJECTED") {
  requireAuth(user);
  if (!isAdmin(user) && user.role !== "MANAGER") {
    throw ApiError.forbidden("Only managers and admins can review requests");
  }

  const client = await pool.connect();
  let inTransaction = false;
  try {
    await client.query("BEGIN");
    inTransaction = true;
    const ownerResult = await client.query<{ user_id: number }>(
      `SELECT user_id FROM leave_requests WHERE id = $1`,
      [id]
    );
    if (!ownerResult.rows[0]) throw ApiError.notFound("Leave request not found");

    // Serialize review and create operations for this requester so two
    // overlapping pending requests cannot both become APPROVED.
    await client.query("SELECT pg_advisory_xact_lock($1, $2)", [
      LEAVE_REQUEST_LOCK_NAMESPACE,
      ownerResult.rows[0].user_id,
    ]);
    const requestResult = await client.query(
      `SELECT ${LEAVE_COLUMNS} FROM leave_requests WHERE id = $1 FOR UPDATE`,
      [id]
    );
    const leave = requestResult.rows[0];
    if (!leave) throw ApiError.notFound("Leave request not found");

    if (user.role === "MANAGER") {
      if (leave.user_id === user.id) {
        throw ApiError.forbidden("Managers cannot review their own leave requests");
      }
      if (!isSameDepartment(user, leave.department_id)) {
        throw ApiError.forbidden("You cannot review requests from another department");
      }
    }
    if (leave.status !== "PENDING") {
      throw ApiError.conflict(`Request is already ${leave.status.toLowerCase()}`);
    }

    if (decision === "APPROVED") {
      const overlap = await client.query(
        `SELECT id FROM leave_requests
         WHERE user_id = $1 AND id <> $2 AND status = 'APPROVED'
           AND start_date <= $4::date AND end_date >= $3::date
         LIMIT 1`,
        [leave.user_id, id, leave.start_date, leave.end_date]
      );
      if (overlap.rows.length > 0) {
        throw ApiError.conflict("This request overlaps an already approved leave period");
      }
    }

    // Keep a conditional update as a final guard if any writer bypasses the lock.
    const result = await client.query(
      `UPDATE leave_requests
       SET status = $1::leave_status, reviewed_by = $2, reviewed_at = now()
       WHERE id = $3 AND status = 'PENDING'
       RETURNING ${LEAVE_COLUMNS}`,
      [decision, user.id, id]
    );
    if (result.rows.length === 0) {
      throw ApiError.conflict("Request was already reviewed by someone else");
    }
    await client.query("COMMIT");
    inTransaction = false;
    return result.rows[0];
  } catch (err) {
    if (inTransaction) await client.query("ROLLBACK").catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

export function approveLeaveRequest(user: AuthUser, id: number) {
  return review(user, id, "APPROVED");
}

export function rejectLeaveRequest(user: AuthUser, id: number) {
  return review(user, id, "REJECTED");
}
