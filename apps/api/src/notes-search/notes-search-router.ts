import { Router } from "express";
import type { PrismaClient } from "@note-taking-app/db";
import { searchNotesQuerySchema } from "@note-taking-app/shared";
import type { Env } from "../config/env.js";
import { asyncHandler } from "../middleware/async-handler.js";
import { requireAuth } from "../middleware/require-auth.js";
import { validate } from "../middleware/validate.js";
import { NotesSearchController } from "./notes-search-controller.js";
import { NotesSearchRepository } from "./notes-search-repository.js";
import { NotesSearchService } from "./notes-search-service.js";

/**
 * Mounted before createNotesRouter (see app.ts) — GET /notes/:id would
 * otherwise capture "search" as an :id and this route would never be
 * reached (see design.md, Decision 5).
 */
export function createNotesSearchRouter(prisma: PrismaClient, env: Env): Router {
  const router = Router();
  const auth = requireAuth(env.JWT_ACCESS_SECRET);
  const controller = new NotesSearchController(
    new NotesSearchService(new NotesSearchRepository(prisma)),
  );

  router.get(
    "/notes/search",
    auth,
    validate(searchNotesQuerySchema, "query"),
    asyncHandler(controller.search),
  );

  return router;
}
