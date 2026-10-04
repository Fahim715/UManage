import type { Request, Response } from "express";
import { sendSuccess, sendCreated } from "../../utils/response";
import { ApiError } from "../../utils/api-error";
import * as taskService from "./task.service";
import { listTasksQuerySchema } from "./task.schemas";

function requireUser(req: Request) {
  if (!req.user) throw ApiError.unauthorized();
  return req.user;
}

export async function listHandler(req: Request, res: Response) {
  const query = listTasksQuerySchema.parse(req.query);
  const result = await taskService.listTasks(requireUser(req), query);
  sendSuccess(res, { tasks: result.tasks }, result.meta);
}

export async function getHandler(req: Request, res: Response) {
  const task = await taskService.getTask(requireUser(req), Number(req.params.id));
  sendSuccess(res, { task });
}

export async function createHandler(req: Request, res: Response) {
  const task = await taskService.createTask(requireUser(req), req.body);
  sendCreated(res, { task });
}

export async function updateHandler(req: Request, res: Response) {
  const task = await taskService.updateTask(requireUser(req), Number(req.params.id), req.body);
  sendSuccess(res, { task });
}

export async function updateStatusHandler(req: Request, res: Response) {
  const task = await taskService.updateTaskStatus(requireUser(req), Number(req.params.id), req.body.status);
  sendSuccess(res, { task });
}

export async function deleteHandler(req: Request, res: Response) {
  await taskService.deleteTask(requireUser(req), Number(req.params.id));
  sendSuccess(res, { message: "Task deleted" });
}
