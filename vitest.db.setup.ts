import { execSync } from "node:child_process";
import { config } from "dotenv";
import { resolve } from "node:path";

config({ path: resolve(process.cwd(), ".env") });

export async function setup() {
  const e2eUrl = process.env.E2E_DATABASE_URL?.trim();
  if (!e2eUrl) {
    throw new Error("E2E_DATABASE_URL is required for pnpm test:db");
  }

  const env = {
    ...process.env,
    DATABASE_URL: e2eUrl,
  };

  execSync("pnpm exec tsx apps/e2e/scripts/prepare-e2e-db.ts", {
    cwd: process.cwd(),
    stdio: "inherit",
    env,
  });

  process.env.DATABASE_URL = e2eUrl;
}
