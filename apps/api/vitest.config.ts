import { defineConfig } from "vitest/config";
import { sharedVitestConfig } from "@note-taking-app/config/vitest";

export default defineConfig({
  ...sharedVitestConfig,
  test: {
    ...sharedVitestConfig.test,
    environment: "node",
  },
});
