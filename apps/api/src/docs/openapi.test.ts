import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { makeTestEnv } from "../test-helpers/test-env.js";

describe("API docs", () => {
  it("serves a valid OpenAPI document listing the health-check endpoint outside production", async () => {
    const app = createApp(makeTestEnv({ NODE_ENV: "development" }));

    const response = await request(app).get("/api-docs/openapi.json");

    expect(response.status).toBe(200);
    expect(response.body.openapi).toMatch(/^3\./);
    expect(response.body.paths["/health"]).toBeDefined();
  });

  it("returns 404 for the docs path in production", async () => {
    const app = createApp(makeTestEnv({ NODE_ENV: "production" }));

    const response = await request(app).get("/api-docs/openapi.json");

    expect(response.status).toBe(404);
  });
});
