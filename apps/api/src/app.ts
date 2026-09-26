import express, { type Express } from "express";
import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { pinoHttp } from "pino-http";
import type { Logger } from "pino";
import type { Env } from "./config/env.js";
import { createLogger } from "./logger.js";
import { errorHandler } from "./middleware/error-handler.js";
import { notFoundHandler } from "./middleware/not-found.js";
import { healthRouter } from "./routes/health.js";
import { createDocsRouter } from "./docs/docs-router.js";

export interface CreateAppOptions {
  logger?: Logger;
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
    }),
  );
  app.use(pinoHttp({ logger }));
  app.use(express.json({ limit: "1mb" }));
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

  options.extraRoutes?.(app);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
