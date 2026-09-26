import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { makeTestEnv } from "../test-helpers/test-env.js";

describe("CORS", () => {
  it("allows an origin on the allowlist", async () => {
    const app = createApp(makeTestEnv({ CORS_ALLOWED_ORIGINS: ["http://localhost:5173"] }));

    const response = await request(app).get("/").set("Origin", "http://localhost:5173");

    expect(response.headers["access-control-allow-origin"]).toBe("http://localhost:5173");
  });

  it("does not allow an origin not on the allowlist", async () => {
    const app = createApp(makeTestEnv({ CORS_ALLOWED_ORIGINS: ["http://localhost:5173"] }));

    const response = await request(app).get("/").set("Origin", "http://evil.example.com");

    expect(response.headers["access-control-allow-origin"]).toBeUndefined();
  });
});
