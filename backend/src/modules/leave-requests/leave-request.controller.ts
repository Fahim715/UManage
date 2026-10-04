import type { Request, Response } from "express";
import { sendSuccess, sendCreated } from "../../utils/response";
import { ApiError } from "../../utils/api-error";
import * as leaveService from "./leave-request.service";
import { listLeaveQuerySchema } from "./leave-request.schemas";

function requireUser(req: Request) {
  if (!req.user) throw ApiError.unauthorized();
  return req.user;
}

export async function listHandler(req: Request, res: Response) {
  const query = listLeaveQuerySchema.parse(req.query);
  const result = await leaveService.listLeaveRequests(requireUser(req), query);
  sendSuccess(res, { leaveRequests: result.leaveRequests }, result.meta);
}

export async function getHandler(req: Request, res: Response) {
  const leave = await leaveService.getLeaveRequest(requireUser(req), Number(req.params.id));
  sendSuccess(res, { leaveRequest: leave });
}

export async function createHandler(req: Request, res: Response) {
  const leave = await leaveService.createLeaveRequest(requireUser(req), req.body);
  sendCreated(res, { leaveRequest: leave });
}

export async function approveHandler(req: Request, res: Response) {
  const leave = await leaveService.approveLeaveRequest(requireUser(req), Number(req.params.id));
  sendSuccess(res, { leaveRequest: leave });
}

export async function rejectHandler(req: Request, res: Response) {
  const leave = await leaveService.rejectLeaveRequest(requireUser(req), Number(req.params.id));
  sendSuccess(res, { leaveRequest: leave });
}
