import { OpenAPIRegistry, OpenApiGeneratorV3 } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import {
  authResponseDtoSchema,
  errorResponseSchema,
  loginRequestSchema,
  registerRequestSchema,
} from "@note-taking-app/shared";

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

registry.registerPath({
  method: "post",
  path: "/auth/register",
  description: "Registers a new user and starts a session.",
  request: {
    body: { content: { "application/json": { schema: registerRequestSchema } } },
  },
  responses: {
    201: {
      description: "The user was created and a session started.",
      content: { "application/json": { schema: authResponseDtoSchema } },
    },
    409: {
      description: "The email is already registered.",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    422: {
      description: "The request body failed validation.",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
});

registry.registerPath({
  method: "post",
  path: "/auth/login",
  description: "Authenticates a user and starts a session.",
  request: {
    body: { content: { "application/json": { schema: loginRequestSchema } } },
  },
  responses: {
    200: {
      description: "Login succeeded and a session started.",
      content: { "application/json": { schema: authResponseDtoSchema } },
    },
    401: {
      description: "The email or password is invalid.",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    422: {
      description: "The request body failed validation.",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
});

registry.registerPath({
  method: "post",
  path: "/auth/refresh",
  description: "Rotates the refresh-token cookie and returns a new access token.",
  responses: {
    200: {
      description: "The session was refreshed.",
      content: { "application/json": { schema: z.object({ accessToken: z.string() }) } },
    },
    401: {
      description: "The refresh-token cookie is missing, expired, or already used.",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
});

registry.registerPath({
  method: "post",
  path: "/auth/logout",
  description: "Revokes the current session's refresh token.",
  responses: {
    204: { description: "The session was ended." },
    401: {
      description: "No refresh-token cookie was present.",
      content: { "application/json": { schema: errorResponseSchema } },
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
