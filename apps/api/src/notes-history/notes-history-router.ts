import { Router } from "express";
import type { PrismaClient } from "@note-taking-app/db";
import { noteIdParamSchema, noteVersionParamSchema } from "@note-taking-app/shared";
import type { Env } from "../config/env.js";
import { asyncHandler } from "../middleware/async-handler.js";
import { requireAuth } from "../middleware/require-auth.js";
import { validate } from "../middleware/validate.js";
import { NotesRepository } from "../notes/notes-repository.js";
import { createNotesService } from "../notes/notes-service.js";
import { NotesHistoryController } from "./notes-history-controller.js";
import { NotesHistoryRepository } from "./notes-history-repository.js";
import { NotesHistoryService } from "./notes-history-service.js";

export function createNotesHistoryRouter(prisma: PrismaClient, env: Env): Router {
  const router = Router();
  const auth = requireAuth(env.JWT_ACCESS_SECRET);
  const notesRepository = new NotesRepository(prisma);
  const historyRepository = new NotesHistoryRepository(prisma);
  const notesService = createNotesService(prisma, historyRepository);
  const controller = new NotesHistoryController(
    new NotesHistoryService(historyRepository, notesRepository, notesService),
  );

  router.get(
    "/notes/:id/versions",
    auth,
    validate(noteIdParamSchema, "params"),
    asyncHandler(controller.list),
  );
  router.get(
    "/notes/:id/versions/:versionId",
    auth,
    validate(noteVersionParamSchema, "params"),
    asyncHandler(controller.get),
  );
  router.post(
    "/notes/:id/versions/:versionId/restore",
    auth,
    validate(noteVersionParamSchema, "params"),
    asyncHandler(controller.restore),
  );

  return router;
}
