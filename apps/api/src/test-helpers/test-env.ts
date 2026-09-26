import type { Env } from "../config/env.js";

export function makeTestEnv(overrides: Partial<Env> = {}): Env {
  return {
    NODE_ENV: "test",
    PORT: 4000,
    DATABASE_URL: "postgresql://user:pass@localhost:5432/db",
    CORS_ALLOWED_ORIGINS: ["http://localhost:5173"],
    JWT_ACCESS_SECRET: "test-access-secret",
    JWT_REFRESH_SECRET: "test-refresh-secret",
    RATE_LIMIT_WINDOW_MS: 15 * 60 * 1000,
    RATE_LIMIT_MAX: 100,
    ...overrides,
  };
}
