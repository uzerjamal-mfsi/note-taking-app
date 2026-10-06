import path from "node:path";
import { fileURLToPath } from "node:url";
import { configDefaults, coverageConfigDefaults, defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { sharedVitestConfig } from "@note-taking-app/config/vitest";

const dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(dirname, "./src"),
    },
  },
  test: {
    ...sharedVitestConfig.test,
    environment: "jsdom",
    // Playwright specs are run by `playwright test`, not Vitest.
    exclude: [...configDefaults.exclude, "e2e/**/*.spec.ts"],
    setupFiles: ["./src/test/setup.ts"],
    coverage: {
      ...sharedVitestConfig.test.coverage,
      // The E2E launchers, specs and config run under Node/Playwright, not Vitest.
      exclude: [
        ...coverageConfigDefaults.exclude,
        "e2e/**/*.mjs",
        "e2e/**/*.spec.ts",
        "playwright.config.ts",
      ],
    },
  },
});
