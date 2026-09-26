import type { NextFunction, Request, Response } from "express";
import type { ErrorResponse } from "@note-taking-app/shared";

export function notFoundHandler(_req: Request, res: Response, _next: NextFunction) {
  const body: ErrorResponse = { code: "NOT_FOUND", message: "Route not found" };
  res.status(404).json(body);
}
