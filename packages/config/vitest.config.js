import { defineConfig } from "vitest/config";
import { sharedVitestConfig } from "./src/vitest.js";

export default defineConfig({
  test: {
    ...sharedVitestConfig.test,
    environment: "node",
  },
});
