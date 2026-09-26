import { describe, expect, it } from "vitest";
import { Writable } from "node:stream";
import request from "supertest";
import { createApp } from "../app.js";
import { createLogger } from "../logger.js";
import { makeTestEnv } from "../test-helpers/test-env.js";

function captureLogs() {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      lines.push(chunk.toString());
      callback();
    },
  });
  return { lines, stream };
}

describe("request logging", () => {
  it("logs method/path/status/duration without leaking secrets", async () => {
    const { lines, stream } = captureLogs();
    const logger = createLogger(stream);
    const app = createApp(makeTestEnv(), { logger });

    await request(app)
      .post("/")
      .set("Authorization", "Bearer super-secret-token")
      .send({ password: "hunter2" });

    const logged = lines.join("\n");
    expect(logged).toMatch(/"method":"POST"/);
    expect(logged).toMatch(/"statusCode":\d+/);
    expect(logged).not.toMatch(/super-secret-token/);
    expect(logged).not.toMatch(/hunter2/);
  });
});
