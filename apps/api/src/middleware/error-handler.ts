import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import type { ErrorResponse } from "@note-taking-app/shared";
import { AppError } from "../errors/app-error.js";

interface ErrorWithStatus {
  status?: number;
  statusCode?: number;
}

function hasStatus(error: unknown): error is ErrorWithStatus {
  return (
    typeof error === "object" && error !== null && ("status" in error || "statusCode" in error)
  );
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    const body: ErrorResponse = { code: err.code, message: err.message, details: err.details };
    res.status(err.status).json(body);
    return;
  }

  if (err instanceof ZodError) {
    const body: ErrorResponse = {
      code: "VALIDATION_FAILED",
      message: "Request validation failed",
      details: err.issues,
    };
    res.status(400).json(body);
    return;
  }

  if (hasStatus(err) && (err.status ?? err.statusCode)) {
    const status = (err.status ?? err.statusCode) as number;
    const body: ErrorResponse = {
      code: "REQUEST_ERROR",
      message: err instanceof Error ? err.message : "Request error",
    };
    res.status(status).json(body);
    return;
  }

  req.log?.error({ err }, "unhandled error");
  const body: ErrorResponse = { code: "INTERNAL_SERVER_ERROR", message: "Internal server error" };
  res.status(500).json(body);
}
