import { Router } from "express";
import rateLimit from "express-rate-limit";
import type { PrismaClient } from "@note-taking-app/db";
import { shareTokenParamSchema } from "@note-taking-app/shared";
import type { Env } from "../config/env.js";
import { asyncHandler } from "../middleware/async-handler.js";
import { validate } from "../middleware/validate.js";
import { NotesRepository } from "../notes/notes-repository.js";
import { SharingController } from "./sharing-controller.js";
import { SharingRepository } from "./sharing-repository.js";
import { SharingService } from "./sharing-service.js";

export function createSharingPublicRouter(prisma: PrismaClient, env: Env): Router {
  const router = Router();
  const controller = new SharingController(
    new SharingService(new SharingRepository(prisma), new NotesRepository(prisma)),
  );

  router.get(
    "/shared/:token",
    rateLimit({
      windowMs: env.SHARE_RATE_LIMIT_WINDOW_MS,
      limit: env.SHARE_RATE_LIMIT_MAX,
      standardHeaders: true,
      legacyHeaders: false,
    }),
    validate(shareTokenParamSchema, "params"),
    asyncHandler(controller.readPublic),
  );

  return router;
}
