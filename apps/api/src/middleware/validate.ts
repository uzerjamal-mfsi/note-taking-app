import type { NextFunction, Request, Response } from "express";
import type { ZodSchema } from "zod";
import { AppError } from "../errors/app-error.js";

type ValidationTarget = "body" | "params" | "query";

export function validate(schema: ZodSchema, target: ValidationTarget) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req[target]);

    if (!result.success) {
      next(
        new AppError("VALIDATION_FAILED", 422, "Request validation failed", result.error.issues),
      );
      return;
    }

    if (target === "query") {
      // Express 5 defines req.query as a getter-only accessor, so it can't
      // be reassigned directly; redefine the property instead.
      Object.defineProperty(req, "query", {
        value: result.data,
        writable: true,
        enumerable: true,
        configurable: true,
      });
    } else {
      req[target] = result.data;
    }
    next();
  };
}
