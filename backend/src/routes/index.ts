import { Router } from "express";
import { pool } from "../config/db";
import { authRouter } from "../modules/auth/auth.routes";

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

// Feature module routers will be mounted here in later steps:
// router.use("/users", usersRouter);
// router.use("/departments", departmentsRouter);
// router.use("/tasks", tasksRouter);
// router.use("/leave-requests", leaveRequestsRouter);
