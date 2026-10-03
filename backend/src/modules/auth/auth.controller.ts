import type { Request, Response } from "express";
import { sendSuccess } from "../../utils/response";
import { ApiError } from "../../utils/api-error";
import * as authService from "./auth.service";

export async function loginHandler(req: Request, res: Response) {
  const { email, password } = req.body;
  const result = await authService.login(email, password);
  sendSuccess(res, result);
}

export async function meHandler(req: Request, res: Response) {
  if (!req.user) throw ApiError.unauthorized();
  const user = await authService.getCurrentUser(req.user.id);
  sendSuccess(res, { user });
}

export async function changePasswordHandler(req: Request, res: Response) {
  if (!req.user) throw ApiError.unauthorized();
  const { currentPassword, newPassword } = req.body;
  await authService.changePassword(req.user.id, currentPassword, newPassword);
  sendSuccess(res, { message: "Password updated successfully" });
}
