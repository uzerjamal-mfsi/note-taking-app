// Applies pending migrations before any E2E server starts (`pretest:e2e`). Exits non-zero, with
// Prisma's own error, if the database is unreachable or a migration fails, so the run aborts
// before Playwright launches the API or the web app.
import console from "node:console";
import process from "node:process";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { e2eEnv } from "./e2e-env.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

const result = spawnSync(
  pnpm,
  ["--filter", "@note-taking-app/db", "exec", "prisma", "migrate", "deploy"],
  { cwd: repoRoot, env: e2eEnv(), stdio: "inherit", shell: process.platform === "win32" },
);

if (result.error) {
  console.error(`migrate: could not run prisma migrate deploy: ${result.error.message}`);
  process.exit(1);
}
process.exit(result.status ?? 1);
