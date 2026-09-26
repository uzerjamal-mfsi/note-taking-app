import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { makeTestEnv } from "../test-helpers/test-env.js";

describe("404 handler", () => {
  it("returns HTTP 404 in the shared ErrorResponse shape for an undefined route", async () => {
    const app = createApp(makeTestEnv());

    const response = await request(app).get("/this-route-does-not-exist");

    expect(response.status).toBe(404);
    expect(response.body.code).toBeDefined();
    expect(response.body.message).toBeDefined();
  });
});
