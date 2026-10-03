import type { Request, Response } from "express";
import { sendSuccess, sendCreated } from "../../utils/response";
import { ApiError } from "../../utils/api-error";
import * as departmentsService from "./departments.service";

function requireUser(req: Request) {
  if (!req.user) throw ApiError.unauthorized();
  return req.user;
}

export async function listHandler(req: Request, res: Response) {
  const result = await departmentsService.listDepartments(requireUser(req), req.query);
  sendSuccess(res, { departments: result.departments }, result.meta);
}

export async function getHandler(req: Request, res: Response) {
  const department = await departmentsService.getDepartment(requireUser(req), Number(req.params.id));
  sendSuccess(res, { department });
}

export async function createHandler(req: Request, res: Response) {
  const department = await departmentsService.createDepartment(requireUser(req), req.body);
  sendCreated(res, { department });
}

export async function updateHandler(req: Request, res: Response) {
  const department = await departmentsService.updateDepartment(requireUser(req), Number(req.params.id), req.body);
  sendSuccess(res, { department });
}

export async function deleteHandler(req: Request, res: Response) {
  await departmentsService.deleteDepartment(requireUser(req), Number(req.params.id));
  sendSuccess(res, { message: "Department deleted" });
}

export async function membersHandler(req: Request, res: Response) {
  const members = await departmentsService.listDepartmentMembers(requireUser(req), Number(req.params.id));
  sendSuccess(res, { members });
}
