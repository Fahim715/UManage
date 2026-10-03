import { Router } from "express";
import { authMiddleware } from "../../middleware/auth.middleware";
import { requireAdmin, requireRole } from "../../middleware/role.middleware";
import { validate } from "../../middleware/validate.middleware";
import { asyncHandler } from "../../utils/async-handler";
import {
  idParamSchema,
  createUserSchema,
  updateUserSchema,
  changeRoleSchema,
  changeDepartmentSchema,
  listQuerySchema,
} from "./users.schemas";
import {
  listHandler,
  getHandler,
  createHandler,
  updateHandler,
  deleteHandler,
  changeRoleHandler,
  changeDepartmentHandler,
} from "./users.controller";

export const usersRouter = Router();

usersRouter.use(authMiddleware);

// List: ADMIN (all) and MANAGER (own department) via service; EMPLOYEE blocked.
usersRouter.get("/", requireRole("ADMIN", "MANAGER"), validate({ query: listQuerySchema }), asyncHandler(listHandler));

// Detail: service scopes by role (admin any, manager same-dept, employee self).
usersRouter.get("/:id", validate({ params: idParamSchema }), asyncHandler(getHandler));

usersRouter.post("/", requireRole("ADMIN", "MANAGER"), validate({ body: createUserSchema }), asyncHandler(createHandler));
usersRouter.patch(
  "/:id",
  requireRole("ADMIN", "MANAGER"),
  validate({ params: idParamSchema, body: updateUserSchema }),
  asyncHandler(updateHandler)
);
usersRouter.delete("/:id", requireAdmin, validate({ params: idParamSchema }), asyncHandler(deleteHandler));
usersRouter.patch(
  "/:id/role",
  requireAdmin,
  validate({ params: idParamSchema, body: changeRoleSchema }),
  asyncHandler(changeRoleHandler)
);
usersRouter.patch(
  "/:id/department",
  requireAdmin,
  validate({ params: idParamSchema, body: changeDepartmentSchema }),
  asyncHandler(changeDepartmentHandler)
);
