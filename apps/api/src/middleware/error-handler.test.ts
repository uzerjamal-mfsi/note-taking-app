import { describe, expect, it } from "vitest";
import { z } from "zod";
import request from "supertest";
import { createApp } from "../app.js";
import { makeTestEnv } from "../test-helpers/test-env.js";
import { AppError } from "../errors/app-error.js";
import { asyncHandler } from "./async-handler.js";

const bodySchema = z.object({ email: z.string().email() });

function withTestRoutes(app: import("express").Express) {
  app.get(
    "/boom/app-error",
    asyncHandler(async () => {
      throw new AppError("NOTE_NOT_FOUND", 404, "Note not found");
    }),
  );

  app.post(
    "/boom/validate",
    asyncHandler(async (req) => {
      bodySchema.parse(req.body);
    }),
  );

  app.get(
    "/boom/unexpected",
    asyncHandler(async () => {
      throw new Error("something exploded");
    }),
  );
}

describe("central error handling middleware", () => {
  it("maps a thrown AppError to its declared status and the shared shape", async () => {
    const app = createApp(makeTestEnv(), { extraRoutes: withTestRoutes });

    const response = await request(app).get("/boom/app-error");

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ code: "NOTE_NOT_FOUND", message: "Note not found" });
  });

  it("maps a Zod validation failure to the shared shape with details", async () => {
    const app = createApp(makeTestEnv(), { extraRoutes: withTestRoutes });

    const response = await request(app)
      .post("/boom/validate")
      .set("Content-Type", "application/json")
      .send({ email: "not-an-email" });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe("VALIDATION_FAILED");
    expect(response.body.details).toBeDefined();
  });

  it("maps an unhandled error to a generic 500 without leaking internals", async () => {
    const app = createApp(makeTestEnv(), { extraRoutes: withTestRoutes });

    const response = await request(app).get("/boom/unexpected");

    expect(response.status).toBe(500);
    expect(response.body.code).toBe("INTERNAL_SERVER_ERROR");
    expect(JSON.stringify(response.body)).not.toMatch(/something exploded/);
  });
});
