import { Router } from "express";
import type { PrismaClient } from "@note-taking-app/db";
import { createTagRequestSchema, updateTagRequestSchema } from "@note-taking-app/shared";
import type { Env } from "../config/env.js";
import { asyncHandler } from "../middleware/async-handler.js";
import { requireAuth } from "../middleware/require-auth.js";
import { validate } from "../middleware/validate.js";
import { TagsController } from "./tags-controller.js";
import { TagsRepository } from "./tags-repository.js";
import { TagsService } from "./tags-service.js";

export function createTagsRouter(prisma: PrismaClient, env: Env): Router {
  const router = Router();
  const auth = requireAuth(env.JWT_ACCESS_SECRET);
  const controller = new TagsController(new TagsService(new TagsRepository(prisma), prisma));

  router.post(
    "/tags",
    auth,
    validate(createTagRequestSchema, "body"),
    asyncHandler(controller.create),
  );
  router.get("/tags", auth, asyncHandler(controller.list));
  router.patch(
    "/tags/:id",
    auth,
    validate(updateTagRequestSchema, "body"),
    asyncHandler(controller.update),
  );
  router.delete("/tags/:id", auth, asyncHandler(controller.delete));

  return router;
}
