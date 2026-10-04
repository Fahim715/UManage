import { Router } from "express";
import { pool } from "../config/db";
import { authRouter } from "../modules/auth/auth.routes";
import { usersRouter } from "../modules/users/users.routes";
import { departmentsRouter } from "../modules/departments/departments.routes";

import { tasksRouter } from "../modules/tasks/task.routes";
import { leaveRequestsRouter } from "../modules/leave-requests/leave-request.routes";

export const router = Router();

/**
 * Database-aware health check.
 * Returns 200 when the database answers, 503 otherwise.
 */
router.get("/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok", db: "up" });
  } catch {
    res.status(503).json({ status: "degraded", db: "down" });
  }
});

router.use("/auth", authRouter);
router.use("/users", usersRouter);
router.use("/departments", departmentsRouter);
router.use("/tasks", tasksRouter);
router.use("/leave-requests", leaveRequestsRouter);
// router.use("/tasks", tasksRouter);
// router.use("/leave-requests", leaveRequestsRouter);
