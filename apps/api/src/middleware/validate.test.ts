import type { NextFunction, Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { AppError } from "../errors/app-error.js";
import { validate } from "./validate.js";

function makeRes() {
  return {} as Response;
}

describe("validate", () => {
  const schema = z.object({ email: z.string().email() });

  it("parses a valid body and attaches the parsed value, then calls next with no error", () => {
    const req = { body: { email: "ada@example.com" } } as unknown as Request;
    const next = vi.fn() as NextFunction;

    validate(schema, "body")(req, makeRes(), next);

    expect(req.body).toEqual({ email: "ada@example.com" });
    expect(next).toHaveBeenCalledWith();
  });

  it("calls next with a 422 AppError when the body fails validation", () => {
    const req = { body: { email: "not-an-email" } } as unknown as Request;
    const next = vi.fn() as NextFunction;

    validate(schema, "body")(req, makeRes(), next);

    expect(next).toHaveBeenCalledTimes(1);
    const error = (next as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).status).toBe(422);
    expect((error as AppError).code).toBe("VALIDATION_FAILED");
  });

  it("validates the query target when requested", () => {
    const req = { query: { email: "ada@example.com" } } as unknown as Request;
    const next = vi.fn() as NextFunction;

    validate(schema, "query")(req, makeRes(), next);

    expect(next).toHaveBeenCalledWith();
  });

  it("overwrites a getter-only req.query without throwing, like Express 5's real request object", () => {
    const req = {} as Request;
    Object.defineProperty(req, "query", {
      configurable: true,
      enumerable: true,
      get: () => ({ email: "ada@example.com" }),
    });
    const next = vi.fn() as NextFunction;

    expect(() => validate(schema, "query")(req, makeRes(), next)).not.toThrow();

    expect(req.query).toEqual({ email: "ada@example.com" });
    expect(next).toHaveBeenCalledWith();
  });
});
