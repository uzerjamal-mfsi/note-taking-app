import type { NextFunction, Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";
import jwt from "jsonwebtoken";
import { signAccessToken } from "../auth/access-token.js";
import { AppError } from "../errors/app-error.js";
import { requireAuth } from "./require-auth.js";

const SECRET = "test-access-secret";

function makeReq(headers: Record<string, string | undefined>): Request {
  return { headers } as unknown as Request;
}

describe("requireAuth", () => {
  const middleware = requireAuth(SECRET);

  it("calls next() with req.user.id set for a valid Bearer token", () => {
    const token = signAccessToken({ userId: "user-1" }, SECRET);
    const req = makeReq({ authorization: `Bearer ${token}` });
    const next = vi.fn() as NextFunction;

    middleware(req, {} as Response, next);

    expect(req.user).toEqual({ id: "user-1" });
    expect(next).toHaveBeenCalledWith();
  });

  it("rejects a missing Authorization header", () => {
    const req = makeReq({});
    const next = vi.fn() as NextFunction;

    middleware(req, {} as Response, next);

    expectUnauthenticated(next);
  });

  it("rejects a malformed Authorization header", () => {
    const req = makeReq({ authorization: "not-a-bearer-token" });
    const next = vi.fn() as NextFunction;

    middleware(req, {} as Response, next);

    expectUnauthenticated(next);
  });

  it("rejects a token signed with a different algorithm", () => {
    const token = jwt.sign({ sub: "user-1" }, SECRET, { algorithm: "HS384", expiresIn: "15m" });
    const req = makeReq({ authorization: `Bearer ${token}` });
    const next = vi.fn() as NextFunction;

    middleware(req, {} as Response, next);

    expectUnauthenticated(next);
  });

  it("rejects an expired token", () => {
    const token = jwt.sign({ sub: "user-1" }, SECRET, { algorithm: "HS256", expiresIn: -1 });
    const req = makeReq({ authorization: `Bearer ${token}` });
    const next = vi.fn() as NextFunction;

    middleware(req, {} as Response, next);

    expectUnauthenticated(next);
  });
});

function expectUnauthenticated(next: NextFunction) {
  expect(next).toHaveBeenCalledTimes(1);
  const error = (next as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
  expect(error).toBeInstanceOf(AppError);
  expect((error as AppError).status).toBe(401);
  expect((error as AppError).code).toBe("UNAUTHENTICATED");
}
