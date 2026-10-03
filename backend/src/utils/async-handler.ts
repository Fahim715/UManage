import type { NextFunction, Request, RequestHandler, Response } from "express";

/** Wraps async handlers so rejections reach the central error middleware. */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}
