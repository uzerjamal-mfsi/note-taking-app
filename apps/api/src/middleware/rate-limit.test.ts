import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { makeTestEnv } from "../test-helpers/test-env.js";

describe("rate limiting", () => {
  it("rejects requests once the threshold is exceeded", async () => {
    const app = createApp(makeTestEnv({ RATE_LIMIT_MAX: 3 }));

    for (let i = 0; i < 3; i += 1) {
      const ok = await request(app).get("/");
      expect(ok.status).toBe(200);
    }

    const limited = await request(app).get("/");
    expect(limited.status).toBe(429);
  });
});
