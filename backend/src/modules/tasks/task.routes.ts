import { Router } from "express";
import { authMiddleware } from "../../middleware/auth.middleware";
import { requireRole } from "../../middleware/role.middleware";
import { validate } from "../../middleware/validate.middleware";
import { asyncHandler } from "../../utils/async-handler";
import {
  idParamSchema,
  createTaskSchema,
  updateTaskSchema,
  updateStatusSchema,
} from "./task.schemas";
import {
  listHandler,
  getHandler,
  createHandler,
  updateHandler,
  updateStatusHandler,
  deleteHandler,
} from "./task.controller";

export const tasksRouter = Router();

tasksRouter.use(authMiddleware);

// GET /api/tasks: service enforces role scope before filters.
tasksRouter.get("/", asyncHandler(listHandler));
tasksRouter.get("/:id", validate({ params: idParamSchema }), asyncHandler(getHandler));

tasksRouter.post(
  "/",
  requireRole("ADMIN", "MANAGER"),
  validate({ body: createTaskSchema }),
  asyncHandler(createHandler)
);

// Full update: ADMIN/MANAGER only; employees must use the status endpoint.
tasksRouter.patch(
  "/:id",
  requireRole("ADMIN", "MANAGER"),
  validate({ params: idParamSchema, body: updateTaskSchema }),
  asyncHandler(updateHandler)
);

tasksRouter.patch(
  "/:id/status",
  validate({ params: idParamSchema, body: updateStatusSchema }),
  asyncHandler(updateStatusHandler)
);

tasksRouter.delete(
  "/:id",
  requireRole("ADMIN", "MANAGER"),
  validate({ params: idParamSchema }),
  asyncHandler(deleteHandler)
);
