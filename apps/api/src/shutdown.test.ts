import { describe, expect, it, vi } from "vitest";
import http from "node:http";
import request from "supertest";
import { createApp } from "./app.js";
import { makeTestEnv } from "./test-helpers/test-env.js";
import { createGracefulShutdown } from "./shutdown.js";

describe("graceful shutdown", () => {
  it("stops accepting new connections, drains in-flight requests, and exits with code 0", async () => {
    let resolveRequestStarted: () => void;
    const requestStarted = new Promise<void>((resolve) => {
      resolveRequestStarted = resolve;
    });

    const app = createApp(makeTestEnv(), {
      extraRoutes: (a) => {
        a.get("/slow", (_req, res) => {
          resolveRequestStarted();
          setTimeout(() => res.status(200).json({ done: true }), 100);
        });
      },
    });
    const server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, resolve));

    const exit = vi.fn();
    const shutdown = createGracefulShutdown(server, { exit });

    const inFlight = request(server)
      .get("/slow")
      .then((r) => r);
    await requestStarted;
    const shutdownPromise = shutdown("SIGTERM");

    const [response] = await Promise.all([inFlight, shutdownPromise]);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ done: true });
    expect(exit).toHaveBeenCalledWith(0);
    expect(server.listening).toBe(false);
  });
});
