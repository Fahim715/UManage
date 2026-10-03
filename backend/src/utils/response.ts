import type { Response } from "express";

export interface ApiSuccess<T> {
  success: true;
  data: T;
  meta?: unknown;
}

export function sendSuccess<T>(res: Response, data: T, meta?: unknown, status = 200) {
  const body: ApiSuccess<T> = { success: true, data };
  if (meta !== undefined) body.meta = meta;
  return res.status(status).json(body);
}

export function sendCreated<T>(res: Response, data: T) {
  return sendSuccess(res, data, undefined, 201);
}
