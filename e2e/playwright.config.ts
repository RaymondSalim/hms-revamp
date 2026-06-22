import { defineConfig, devices } from "@playwright/test";
import { ADMIN_STORAGE_STATE } from "./fixtures/test-data";

const PORT = 3100;
const BASE_URL = `http://localhost:${PORT}`;
const E2E_DATABASE_URL = "postgresql://e2e:e2e@localhost:5434/hms_e2e";

export default defineConfig({
  testDir: "./specs",
  globalSetup: "./global-setup.ts",
  // next dev compiles routes on first hit; keep timeouts generous.
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], storageState: ADMIN_STORAGE_STATE },
      dependencies: ["setup"],
    },
  ],
  webServer: {
    command: `next dev -p ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: true,
    timeout: 120_000,
    env: {
      DATABASE_URL: E2E_DATABASE_URL,
      AUTH_SECRET: "e2e-secret",
      AUTH_URL: BASE_URL,
      NODE_ENV: "development",
    },
  },
});
