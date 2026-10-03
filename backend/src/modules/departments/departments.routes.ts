import { Router } from "express";
import { authMiddleware } from "../../middleware/auth.middleware";
import { requireAdmin } from "../../middleware/role.middleware";
import { validate } from "../../middleware/validate.middleware";
import { asyncHandler } from "../../utils/async-handler";
import {
  createDepartmentSchema,
  updateDepartmentSchema,
  idParamSchema,
  listQuerySchema,
} from "./departments.schemas";
import {
  listHandler,
  getHandler,
  createHandler,
  updateHandler,
  deleteHandler,
  membersHandler,
} from "./departments.controller";

export const departmentsRouter = Router();

departmentsRouter.use(authMiddleware);

departmentsRouter.get("/", validate({ query: listQuerySchema }), asyncHandler(listHandler));
departmentsRouter.get("/:id", validate({ params: idParamSchema }), asyncHandler(getHandler));
departmentsRouter.get("/:id/members", validate({ params: idParamSchema }), asyncHandler(membersHandler));

departmentsRouter.post(
  "/",
  requireAdmin,
  validate({ body: createDepartmentSchema }),
  asyncHandler(createHandler)
);
departmentsRouter.patch(
  "/:id",
  requireAdmin,
  validate({ params: idParamSchema, body: updateDepartmentSchema }),
  asyncHandler(updateHandler)
);
departmentsRouter.delete(
  "/:id",
  requireAdmin,
  validate({ params: idParamSchema }),
  asyncHandler(deleteHandler)
);
