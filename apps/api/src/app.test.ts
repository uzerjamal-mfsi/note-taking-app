import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "./app.js";
import { makeTestEnv } from "./test-helpers/test-env.js";

describe("security headers", () => {
  it("includes Helmet's standard security headers on every response", async () => {
    const app = createApp(makeTestEnv());

    const response = await request(app).get("/");

    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.headers["x-dns-prefetch-control"]).toBe("off");
    expect(response.headers["content-security-policy"]).toBeDefined();
  });
});

describe("CORS", () => {
  it("allows credentials for an allow-listed origin", async () => {
    const app = createApp(makeTestEnv({ CORS_ALLOWED_ORIGINS: ["http://localhost:5173"] }));

    const response = await request(app)
      .options("/")
      .set("Origin", "http://localhost:5173")
      .set("Access-Control-Request-Method", "GET");

    expect(response.headers["access-control-allow-credentials"]).toBe("true");
    expect(response.headers["access-control-allow-origin"]).toBe("http://localhost:5173");
  });

  it("does not allow credentials/origin for a non-allow-listed origin", async () => {
    const app = createApp(makeTestEnv({ CORS_ALLOWED_ORIGINS: ["http://localhost:5173"] }));

    const response = await request(app)
      .options("/")
      .set("Origin", "http://evil.example.com")
      .set("Access-Control-Request-Method", "GET");

    expect(response.headers["access-control-allow-origin"]).toBeUndefined();
  });
});
