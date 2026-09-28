import { execSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, readFileSync } from "node:fs";
import { config, parse } from "dotenv";

const packageDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(packageDir, "../../..");

config({ path: resolve(repoRoot, ".env") });

const e2eUrl = process.env.E2E_DATABASE_URL?.trim();
if (!e2eUrl) {
  console.error("E2E_DATABASE_URL is required");
  process.exit(1);
}

const envPath = resolve(repoRoot, ".env");
let devDatabaseUrl: string | undefined;
if (existsSync(envPath)) {
  const dotenv = parse(readFileSync(envPath, "utf8"));
  devDatabaseUrl = dotenv.DATABASE_URL?.trim();
}

const authSecret =
  process.env.E2E_BETTER_AUTH_SECRET?.trim() ??
  process.env.BETTER_AUTH_SECRET?.trim();

const migrateEnv: NodeJS.ProcessEnv = {
  ...process.env,
  DATABASE_URL: e2eUrl,
};
if (authSecret) {
  migrateEnv.BETTER_AUTH_SECRET = authSecret;
}

const resetEnv: NodeJS.ProcessEnv = {
  ...process.env,
  E2E_DATABASE_URL: e2eUrl,
};
if (devDatabaseUrl) {
  resetEnv.DATABASE_URL = devDatabaseUrl;
} else {
  delete resetEnv.DATABASE_URL;
}

execSync("pnpm --filter @tudu/e2e exec tsx scripts/reset-db.ts", {
  cwd: repoRoot,
  stdio: "inherit",
  env: resetEnv,
});

execSync("pnpm db:migrate", { cwd: repoRoot, stdio: "inherit", env: migrateEnv });
execSync("pnpm db:seed", { cwd: repoRoot, stdio: "inherit", env: migrateEnv });

console.log("E2E database migrated and seeded");
