import { Router } from "express";
import { validate } from "../../middleware/validate.middleware";
import { authMiddleware } from "../../middleware/auth.middleware";
import { asyncHandler } from "../../utils/async-handler";
import { loginSchema, changePasswordSchema } from "./auth.schemas";
import { loginHandler, meHandler, changePasswordHandler } from "./auth.controller";

export const authRouter = Router();

authRouter.post("/login", validate({ body: loginSchema }), asyncHandler(loginHandler));

authRouter.get("/me", authMiddleware, asyncHandler(meHandler));

authRouter.post(
  "/change-password",
  authMiddleware,
  validate({ body: changePasswordSchema }),
  asyncHandler(changePasswordHandler)
);
