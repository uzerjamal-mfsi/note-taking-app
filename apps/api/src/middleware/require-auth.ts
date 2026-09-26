import type { NextFunction, Request, RequestHandler, Response } from "express";
import { verifyAccessToken } from "../auth/access-token.js";
import { AppError } from "../errors/app-error.js";

const BEARER_PREFIX = "Bearer ";

export function requireAuth(accessTokenSecret: string): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    const header = req.headers.authorization;

    if (!header || !header.startsWith(BEARER_PREFIX)) {
      next(new AppError("UNAUTHENTICATED", 401, "Authentication required"));
      return;
    }

    const token = header.slice(BEARER_PREFIX.length);

    try {
      const claims = verifyAccessToken(token, accessTokenSecret);
      req.user = { id: claims.sub };
      next();
    } catch (error) {
      req.log?.warn(
        { errName: error instanceof Error ? error.name : "UnknownError" },
        "access token verification failed",
      );
      next(new AppError("UNAUTHENTICATED", 401, "Authentication required"));
    }
  };
}
