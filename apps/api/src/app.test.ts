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
