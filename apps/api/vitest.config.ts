import { defineConfig } from "vitest/config";
import { sharedVitestConfig } from "@note-taking-app/config/vitest";

export default defineConfig({
  ...sharedVitestConfig,
  test: {
    ...sharedVitestConfig.test,
    environment: "node",
    // Integration tests under src/auth/**/*.test.ts share one Postgres
    // database and reset its tables in beforeEach; running test files in
    // parallel would let one file's reset wipe rows another file's test is
    // still using.
    fileParallelism: false,
    // Registering a user hashes a password with bcrypt (cost 12, CPU-bound), so
    // a test that registers two users is already ~0.5s alone. When `pnpm -r test`
    // runs the web suite concurrently (as the pre-commit hook does), those tests
    // are CPU-starved and exceed the 5s default.
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
});
