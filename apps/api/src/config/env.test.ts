import { describe, expect, it } from "vitest";
import { parseEnv } from "./env.js";

const validEnv = {
  NODE_ENV: "development",
  PORT: "4000",
  DATABASE_URL: "postgresql://user:pass@localhost:5432/db",
  CORS_ALLOWED_ORIGINS: "http://localhost:5173",
  JWT_ACCESS_SECRET: "access-secret",
  JWT_REFRESH_SECRET: "refresh-secret",
};

describe("parseEnv", () => {
  it("parses successfully with valid input", () => {
    const env = parseEnv(validEnv);

    expect(env.PORT).toBe(4000);
    expect(env.DATABASE_URL).toBe(validEnv.DATABASE_URL);
    expect(env.CORS_ALLOWED_ORIGINS).toEqual(["http://localhost:5173"]);
  });

  it("throws a clear error when a required variable is missing", () => {
    const { DATABASE_URL: _omit, ...rest } = validEnv;

    expect(() => parseEnv(rest)).toThrowError(/DATABASE_URL/);
  });

  it("throws a clear error when a variable is malformed", () => {
    expect(() => parseEnv({ ...validEnv, PORT: "not-a-number" })).toThrowError(/PORT/);
  });

  it("defaults the share rate limit window and max when unset", () => {
    const env = parseEnv(validEnv);

    expect(env.SHARE_RATE_LIMIT_WINDOW_MS).toBe(60 * 1000);
    expect(env.SHARE_RATE_LIMIT_MAX).toBe(20);
  });

  it("parses explicit share rate limit values", () => {
    const env = parseEnv({
      ...validEnv,
      SHARE_RATE_LIMIT_WINDOW_MS: "30000",
      SHARE_RATE_LIMIT_MAX: "5",
    });

    expect(env.SHARE_RATE_LIMIT_WINDOW_MS).toBe(30000);
    expect(env.SHARE_RATE_LIMIT_MAX).toBe(5);
  });

  it("throws a clear error when SHARE_RATE_LIMIT_MAX is malformed", () => {
    expect(() => parseEnv({ ...validEnv, SHARE_RATE_LIMIT_MAX: "not-a-number" })).toThrowError(
      /SHARE_RATE_LIMIT_MAX/,
    );
  });
});
