import { Router } from "express";
import type { PrismaClient } from "@note-taking-app/db";
import { generateShareLinkRequestSchema, noteIdParamSchema } from "@note-taking-app/shared";
import type { Env } from "../config/env.js";
import { asyncHandler } from "../middleware/async-handler.js";
import { requireAuth } from "../middleware/require-auth.js";
import { validate } from "../middleware/validate.js";
import { NotesRepository } from "../notes/notes-repository.js";
import { SharingController } from "./sharing-controller.js";
import { SharingRepository } from "./sharing-repository.js";
import { SharingService } from "./sharing-service.js";

export function createSharingOwnerRouter(prisma: PrismaClient, env: Env): Router {
  const router = Router();
  const auth = requireAuth(env.JWT_ACCESS_SECRET);
  const controller = new SharingController(
    new SharingService(new SharingRepository(prisma), new NotesRepository(prisma)),
  );

  router.post(
    "/notes/:id/share",
    auth,
    validate(noteIdParamSchema, "params"),
    validate(generateShareLinkRequestSchema, "body"),
    asyncHandler(controller.generate),
  );
  router.get(
    "/notes/:id/share",
    auth,
    validate(noteIdParamSchema, "params"),
    asyncHandler(controller.get),
  );
  router.delete(
    "/notes/:id/share",
    auth,
    validate(noteIdParamSchema, "params"),
    asyncHandler(controller.revoke),
  );

  return router;
}
