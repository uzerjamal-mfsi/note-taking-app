import { defineConfig, devices } from "@playwright/test";

const WEB_URL = "http://localhost:5173";
const API_URL = "http://localhost:4000";
const isCI = Boolean(process.env.CI);

// The journey is one serial story against a shared database, so there is exactly one worker.
// Migrations are applied by `pretest:e2e` before this config is loaded, i.e. before any server
// below is started.
export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  workers: 1,
  forbidOnly: isCI,
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: WEB_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      // Starts the API and tees its console output to e2e/.api.log (the OTP is only logged).
      command: "node e2e/start-api.mjs",
      url: `${API_URL}/health`,
      reuseExistingServer: !isCI,
      timeout: 60_000,
      stdout: "pipe",
      stderr: "pipe",
    },
    {
      command: "pnpm exec vite --port 5173 --strictPort",
      url: WEB_URL,
      reuseExistingServer: !isCI,
      timeout: 60_000,
    },
  ],
});
