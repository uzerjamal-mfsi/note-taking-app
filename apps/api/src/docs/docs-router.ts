import { Router } from "express";
import swaggerUi from "swagger-ui-express";
import type { Env } from "../config/env.js";
import { buildOpenApiDocument } from "./openapi.js";

export function createDocsRouter(env: Env): Router {
  const router = Router();

  if (env.NODE_ENV === "production") {
    return router;
  }

  const document = buildOpenApiDocument();

  router.get("/api-docs/openapi.json", (_req, res) => {
    res.json(document);
  });
  router.use("/api-docs", swaggerUi.serve, swaggerUi.setup(document));

  return router;
}
