import { Router } from "express";
import { authMiddleware } from "../../middleware/auth.middleware";
import { requireRole } from "../../middleware/role.middleware";
import { validate } from "../../middleware/validate.middleware";
import { asyncHandler } from "../../utils/async-handler";
import { createLeaveRequestSchema, idParamSchema } from "./leave-request.schemas";
import {
  listHandler,
  getHandler,
  createHandler,
  approveHandler,
  rejectHandler,
} from "./leave-request.controller";

export const leaveRequestsRouter = Router();

leaveRequestsRouter.use(authMiddleware);

leaveRequestsRouter.get("/", asyncHandler(listHandler));
leaveRequestsRouter.get("/:id", validate({ params: idParamSchema }), asyncHandler(getHandler));
leaveRequestsRouter.post(
  "/",
  validate({ body: createLeaveRequestSchema }),
  asyncHandler(createHandler)
);
leaveRequestsRouter.patch(
  "/:id/approve",
  requireRole("ADMIN", "MANAGER"),
  validate({ params: idParamSchema }),
  asyncHandler(approveHandler)
);
leaveRequestsRouter.patch(
  "/:id/reject",
  requireRole("ADMIN", "MANAGER"),
  validate({ params: idParamSchema }),
  asyncHandler(rejectHandler)
);
