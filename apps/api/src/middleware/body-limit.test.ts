import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { makeTestEnv } from "../test-helpers/test-env.js";

describe("request body size limit", () => {
  it("rejects a body over the configured size limit with 413", async () => {
    const app = createApp(makeTestEnv());
    const oversizedBody = { data: "x".repeat(2 * 1024 * 1024) }; // 2MB, over the 1MB limit

    const response = await request(app)
      .post("/")
      .set("Content-Type", "application/json")
      .send(oversizedBody);

    expect(response.status).toBe(413);
  });
});
