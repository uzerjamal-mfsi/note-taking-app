import express, { type Express } from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import { pinoHttp } from "pino-http";
import type { Logger } from "pino";
import { prisma as defaultPrisma, type PrismaClient } from "@note-taking-app/db";
import type { Env } from "./config/env.js";
import { createLogger } from "./logger.js";
import { errorHandler } from "./middleware/error-handler.js";
import { notFoundHandler } from "./middleware/not-found.js";
import { healthRouter } from "./routes/health.js";
import { createDocsRouter } from "./docs/docs-router.js";
import { createAuthRouter } from "./routes/auth-router.js";
import { createNotesRouter } from "./notes/notes-router.js";
import { createTagsRouter } from "./tags/tags-router.js";
import { createSharingOwnerRouter } from "./sharing/sharing-owner-router.js";
import { createSharingPublicRouter } from "./sharing/sharing-public-router.js";

export interface CreateAppOptions {
  logger?: Logger;
  prisma?: PrismaClient;
  /** Test-only hook for mounting extra routes before the error-handling middleware. */
  extraRoutes?: (app: Express) => void;
}

export function createApp(env: Env, options: CreateAppOptions = {}) {
  const app = express();
  const logger =
    options.logger ??
    createLogger(undefined, { level: env.NODE_ENV === "test" ? "silent" : "info" });

  app.use(helmet());
  app.use(
    cors({
      origin: env.CORS_ALLOWED_ORIGINS,
      credentials: true,
    }),
  );
  app.use(pinoHttp({ logger }));
  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser());
  app.use(
    rateLimit({
      windowMs: env.RATE_LIMIT_WINDOW_MS,
      limit: env.RATE_LIMIT_MAX,
      standardHeaders: true,
      legacyHeaders: false,
    }),
  );

  app.get("/", (_req, res) => {
    res.json({ name: "note-taking-app-api" });
  });
  app.use(healthRouter);
  app.use(createDocsRouter(env));
  app.use(createAuthRouter(options.prisma ?? defaultPrisma, env));
  app.use(createNotesRouter(options.prisma ?? defaultPrisma, env));
  app.use(createTagsRouter(options.prisma ?? defaultPrisma, env));
  app.use(createSharingOwnerRouter(options.prisma ?? defaultPrisma, env));
  app.use(createSharingPublicRouter(options.prisma ?? defaultPrisma, env));

  options.extraRoutes?.(app);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
