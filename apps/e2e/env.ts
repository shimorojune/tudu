import { config } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  E2E_SERVER_PORT,
  E2E_SERVER_URL,
  E2E_WEB_PORT,
  E2E_WEB_URL,
} from "./constants.js";

const e2eDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(e2eDir, "../..");

config({ path: resolve(repoRoot, ".env") });

export function requireE2eDatabaseUrl(): string {
  const url = process.env.E2E_DATABASE_URL?.trim();
  if (!url) {
    throw new Error("E2E_DATABASE_URL is required. See apps/e2e/README.md");
  }
  return url;
}

export function e2eServerEnv(): Record<string, string> {
  const databaseUrl = requireE2eDatabaseUrl();
  const authSecret =
    process.env.E2E_BETTER_AUTH_SECRET?.trim() ||
    process.env.BETTER_AUTH_SECRET?.trim() ||
    "e2e-better-auth-secret-min-32-chars-long";

  return {
    NODE_ENV: "test",
    PORT: String(E2E_SERVER_PORT),
    E2E_DATABASE_URL: databaseUrl,
    DATABASE_URL: databaseUrl,
    BETTER_AUTH_SECRET: authSecret,
    BETTER_AUTH_URL: E2E_SERVER_URL,
    CORS_ORIGINS: `${E2E_WEB_URL},http://localhost:1420,tauri://localhost`,
    NOTIFICATION_JOBS_ENABLED: "false",
    JIRA_TOKEN_ENCRYPTION_KEY:
      process.env.JIRA_TOKEN_ENCRYPTION_KEY?.trim() ||
      "e2e-jira-encryption-key-32bytes!",
    ATTACHMENT_STORAGE: "filesystem",
    ATTACHMENT_FS_ROOT: resolve(repoRoot, "apps/server/.data/e2e-attachments"),
    EMAIL_TRANSPORT: process.env.EMAIL_TRANSPORT?.trim() || "memory",
    E2E_TEST_ROUTES: process.env.E2E_TEST_ROUTES?.trim() || "1",
  };
}

export function e2eWebEnv(): Record<string, string> {
  return {
    VITE_API_URL: E2E_SERVER_URL,
  };
}

export { E2E_SERVER_PORT, E2E_WEB_PORT, E2E_SERVER_URL, E2E_WEB_URL };
