import type { NextFunction, Request, Response } from "express";
import { z, type ZodSchema } from "zod";

interface Schemas {
  body?: ZodSchema;
  query?: ZodSchema;
  params?: ZodSchema;
}

/**
 * Validates request parts with zod. Parsed (and possibly coerced) values
 * replace the originals so downstream handlers can rely on them.
 */
export function validate(schemas: Schemas) {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (schemas.body) {
        req.body = schemas.body.parse(req.body);
      }
      if (schemas.query) {
        const parsed = schemas.query.parse(req.query);
        Object.defineProperty(req, "query", { value: parsed, writable: true });
      }
      if (schemas.params) {
        const parsed = schemas.params.parse(req.params);
        Object.defineProperty(req, "params", { value: parsed, writable: true });
      }
      next();
    } catch (err) {
      if (err instanceof z.ZodError) {
        // Let the central error middleware format it.
        return next(err);
      }
      next(err);
    }
  };
}
