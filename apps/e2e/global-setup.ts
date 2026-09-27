import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { FullConfig } from "@playwright/test";
import { e2eServerEnv } from "./env.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");

async function globalSetup(_config: FullConfig) {
  const env = {
    ...process.env,
    ...e2eServerEnv(),
  };

  execSync("pnpm exec tsx apps/e2e/scripts/prepare-e2e-db.ts", {
    cwd: repoRoot,
    stdio: "inherit",
    env,
  });
}

export default globalSetup;
