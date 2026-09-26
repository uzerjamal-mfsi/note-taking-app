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
  },
});
