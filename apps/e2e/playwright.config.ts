import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, devices } from "@playwright/test";
import { E2E_SERVER_URL, E2E_WEB_URL } from "./constants.js";
import { e2eServerEnv, e2eWebEnv } from "./env.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const authFile = path.join(__dirname, ".auth", "user.json");
const repoRoot = path.resolve(__dirname, "../..");

const serverEnv = e2eServerEnv();
const webEnv = e2eWebEnv();

const isCi = Boolean(process.env.CI);

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: isCi,
  timeout: 30_000,
  retries: isCi ? 2 : 1,
  workers: 1,
  expect: {
    timeout: 15_000,
  },
  reporter: isCi ? "github" : "list",
  globalSetup: "./global-setup.ts",
  grepInvert: isCi ? /@jira/ : undefined,
  use: {
    baseURL: E2E_WEB_URL,
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    storageState: authFile,
  },
  projects: [
    {
      name: "setup",
      testMatch: /auth\.setup\.ts/,
      use: {
        storageState: { cookies: [], origins: [] },
      },
    },
    {
      name: "desktop",
      dependencies: ["setup"],
      testIgnore: [/auth\.setup\.ts/],
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: "tablet",
      dependencies: ["setup"],
      testIgnore: [/auth\.setup\.ts/],
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1024, height: 768 },
      },
    },
    {
      name: "phone",
      dependencies: ["setup"],
      testIgnore: [/auth\.setup\.ts/],
      use: {
        ...devices["Pixel 7"],
      },
    },
  ],
  webServer: [
    {
      command: "pnpm --filter @tudu/server dev",
      cwd: repoRoot,
      url: `${E2E_SERVER_URL}/health`,
      reuseExistingServer: false,
      timeout: 180_000,
      env: serverEnv,
    },
    {
      command:
        "pnpm --filter @tudu/web exec vite --port 5174 --strictPort --host 127.0.0.1",
      cwd: repoRoot,
      url: E2E_WEB_URL,
      reuseExistingServer: false,
      timeout: 180_000,
      env: {
        ...process.env,
        ...webEnv,
      },
    },
  ],
});
