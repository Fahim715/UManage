import type { Request, Response } from "express";
import { sendSuccess, sendCreated } from "../../utils/response";
import { ApiError } from "../../utils/api-error";
import * as usersService from "./users.service";

function requireUser(req: Request) {
  if (!req.user) throw ApiError.unauthorized();
  return req.user;
}

export async function listHandler(req: Request, res: Response) {
  const result = await usersService.listUsers(requireUser(req), req.query);
  sendSuccess(res, { users: result.users }, result.meta);
}

export async function getHandler(req: Request, res: Response) {
  const user = await usersService.getUser(requireUser(req), Number(req.params.id));
  sendSuccess(res, { user });
}

export async function createHandler(req: Request, res: Response) {
  const user = await usersService.createUser(requireUser(req), req.body);
  sendCreated(res, { user });
}

export async function updateHandler(req: Request, res: Response) {
  const user = await usersService.updateUser(requireUser(req), Number(req.params.id), req.body);
  sendSuccess(res, { user });
}

export async function deleteHandler(req: Request, res: Response) {
  await usersService.deleteUser(requireUser(req), Number(req.params.id));
  sendSuccess(res, { message: "User deleted" });
}

export async function changeRoleHandler(req: Request, res: Response) {
  const user = await usersService.changeRole(requireUser(req), Number(req.params.id), req.body.role);
  sendSuccess(res, { user });
}

export async function changeDepartmentHandler(req: Request, res: Response) {
  const user = await usersService.changeDepartment(requireUser(req), Number(req.params.id), req.body.department_id);
  sendSuccess(res, { user });
}
