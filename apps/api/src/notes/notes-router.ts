import { Router } from "express";
import type { PrismaClient } from "@note-taking-app/db";
import {
  createNoteRequestSchema,
  listNotesQuerySchema,
  updateNoteRequestSchema,
} from "@note-taking-app/shared";
import type { Env } from "../config/env.js";
import { asyncHandler } from "../middleware/async-handler.js";
import { requireAuth } from "../middleware/require-auth.js";
import { validate } from "../middleware/validate.js";
import { NotesController } from "./notes-controller.js";
import { createNotesService } from "./notes-service.js";

export function createNotesRouter(prisma: PrismaClient, env: Env): Router {
  const router = Router();
  const auth = requireAuth(env.JWT_ACCESS_SECRET);
  const controller = new NotesController(createNotesService(prisma));

  router.post(
    "/notes",
    auth,
    validate(createNoteRequestSchema, "body"),
    asyncHandler(controller.create),
  );
  router.get(
    "/notes",
    auth,
    validate(listNotesQuerySchema, "query"),
    asyncHandler(controller.list),
  );
  router.get("/notes/:id", auth, asyncHandler(controller.get));
  router.patch(
    "/notes/:id",
    auth,
    validate(updateNoteRequestSchema, "body"),
    asyncHandler(controller.update),
  );
  router.delete("/notes/:id", auth, asyncHandler(controller.delete));

  return router;
}
