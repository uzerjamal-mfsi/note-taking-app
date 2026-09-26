import { Router, type Response } from "express";
import type { PrismaClient } from "@note-taking-app/db";
import {
  loginRequestSchema,
  registerRequestSchema,
  type AuthResponseDto,
  type LoginRequest,
  type RegisterRequest,
} from "@note-taking-app/shared";
import type { Env } from "../config/env.js";
import { AppError } from "../errors/app-error.js";
import { asyncHandler } from "../middleware/async-handler.js";
import { validate } from "../middleware/validate.js";
import { AuthService } from "../auth/auth-service.js";
import { RefreshTokenRepository } from "../auth/refresh-token-repository.js";
import { SessionService } from "../auth/session-service.js";

const REFRESH_COOKIE_NAME = "refresh_token";
const REFRESH_COOKIE_PATH = "/auth";
const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function refreshCookieOptions(env: Env) {
  return {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: REFRESH_COOKIE_PATH,
  };
}

function setRefreshCookie(res: Response, token: string, env: Env) {
  res.cookie(REFRESH_COOKIE_NAME, token, {
    ...refreshCookieOptions(env),
    maxAge: REFRESH_TOKEN_TTL_MS,
  });
}

function clearRefreshCookie(res: Response, env: Env) {
  res.clearCookie(REFRESH_COOKIE_NAME, refreshCookieOptions(env));
}

export function createAuthRouter(prisma: PrismaClient, env: Env): Router {
  const router = Router();
  const authService = new AuthService(prisma);
  const sessionService = new SessionService(new RefreshTokenRepository(prisma), {
    accessTokenSecret: env.JWT_ACCESS_SECRET,
    refreshTokenSecret: env.JWT_REFRESH_SECRET,
    refreshTokenTtlMs: REFRESH_TOKEN_TTL_MS,
  });

  router.post(
    "/auth/register",
    validate(registerRequestSchema, "body"),
    asyncHandler(async (req, res) => {
      const { name, email, password } = req.body as RegisterRequest;

      const user = await authService.registerUser({ name, email, password });
      const session = await sessionService.startSession(user.id);
      setRefreshCookie(res, session.refreshToken, env);

      const body: AuthResponseDto = { user, accessToken: session.accessToken };
      res.status(201).json(body);
    }),
  );

  router.post(
    "/auth/login",
    validate(loginRequestSchema, "body"),
    asyncHandler(async (req, res) => {
      const { email, password } = req.body as LoginRequest;

      const user = await authService.verifyCredentials(email, password);
      const session = await sessionService.startSession(user.id);
      setRefreshCookie(res, session.refreshToken, env);

      const body: AuthResponseDto = { user, accessToken: session.accessToken };
      res.status(200).json(body);
    }),
  );

  router.post(
    "/auth/refresh",
    asyncHandler(async (req, res) => {
      const rawToken = req.cookies?.[REFRESH_COOKIE_NAME] as string | undefined;
      if (!rawToken) {
        throw new AppError("UNAUTHENTICATED", 401, "Authentication required");
      }

      const session = await sessionService.refreshSession(rawToken);
      if (!session) {
        clearRefreshCookie(res, env);
        throw new AppError("UNAUTHENTICATED", 401, "Authentication required");
      }

      setRefreshCookie(res, session.refreshToken, env);
      res.status(200).json({ accessToken: session.accessToken });
    }),
  );

  router.post(
    "/auth/logout",
    asyncHandler(async (req, res) => {
      const rawToken = req.cookies?.[REFRESH_COOKIE_NAME] as string | undefined;
      if (!rawToken) {
        throw new AppError("UNAUTHENTICATED", 401, "Authentication required");
      }

      await sessionService.endSession(rawToken);
      clearRefreshCookie(res, env);
      res.status(204).send();
    }),
  );

  return router;
}
