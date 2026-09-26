import { OpenAPIRegistry, OpenApiGeneratorV3 } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

const registry = new OpenAPIRegistry();

registry.registerPath({
  method: "get",
  path: "/health",
  description: "Reports whether the API is up.",
  responses: {
    200: {
      description: "The API is healthy.",
      content: {
        "application/json": {
          schema: z.object({ status: z.literal("ok") }),
        },
      },
    },
  },
});

export function buildOpenApiDocument() {
  const generator = new OpenApiGeneratorV3(registry.definitions);
  return generator.generateDocument({
    openapi: "3.0.0",
    info: {
      title: "Note Taking App API",
      version: "0.0.0",
    },
  });
}
