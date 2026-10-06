// Environment shared by the E2E launcher and the migration step. Anything already set in the
// process environment (for example by CI) wins; the defaults match docker-compose.yml.
import process from "node:process";

export function e2eEnv(base = process.env) {
  return {
    ...base,
    FORCE_COLOR: "0", // no ANSI codes inside the lines the tests match against
    NODE_ENV: base.NODE_ENV ?? "test",
    PORT: base.PORT ?? "4000",
    DATABASE_URL:
      base.DATABASE_URL ?? "postgresql://note_app:note_app@localhost:5432/note_app?schema=public",
    CORS_ALLOWED_ORIGINS: base.CORS_ALLOWED_ORIGINS ?? "http://localhost:5173",
    JWT_ACCESS_SECRET: base.JWT_ACCESS_SECRET ?? "e2e-access-secret",
    JWT_REFRESH_SECRET: base.JWT_REFRESH_SECRET ?? "e2e-refresh-secret",
    // A serial journey stays well under the defaults; the raised limits are only a safety margin.
    RATE_LIMIT_MAX: base.RATE_LIMIT_MAX ?? "100000",
    SHARE_RATE_LIMIT_MAX: base.SHARE_RATE_LIMIT_MAX ?? "100000",
  };
}
