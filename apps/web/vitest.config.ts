import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
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
    setupFiles: ["./src/test/setup.ts"],
  },
});
