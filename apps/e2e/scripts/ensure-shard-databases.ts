import { config } from "dotenv";
import { neon } from "@neondatabase/serverless";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  adminDatabaseUrl,
  e2eShardCount,
  resolveShardUrl,
  shardDatabaseName,
} from "./e2e-shard-url.js";

const packageDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(packageDir, "../../..");

config({ path: resolve(repoRoot, ".env") });

async function databaseExists(
  sql: ReturnType<typeof neon>,
  name: string,
): Promise<boolean> {
  const rows = await sql`
    SELECT 1 AS ok FROM pg_database WHERE datname = ${name}
  `;
  return rows.length > 0;
}

async function main() {
  const template =
    process.env.E2E_DATABASE_URL?.trim() ??
    process.env.E2E_DATABASE_URL_0?.trim();
  if (!template) {
    console.error("Set E2E_DATABASE_URL or E2E_DATABASE_URL_0 in repo root .env");
    process.exit(1);
  }

  const admin = neon(adminDatabaseUrl(template));
  const count = e2eShardCount();

  for (let index = 0; index < count; index += 1) {
    const name = shardDatabaseName(index);
    const exists = await databaseExists(admin, name);
    if (!exists) {
      await admin.query(`CREATE DATABASE ${quoteIdent(name)}`);
      console.log(`Created database ${name}`);
    } else {
      console.log(`Database ${name} already exists`);
    }
    const url = resolveShardUrl(template, index);
    const check = neon(url);
    await check`SELECT 1 AS ok`;
    console.log(`Connection OK: ${name}`);
  }

  console.log(
    "\nRun pnpm test:e2e:sync-shard-env to write E2E_DATABASE_URL_0..4 into .env",
  );
  console.log("Set GitHub secrets E2E_DATABASE_URL_0 .. _4 to the same pooled URLs.");
}

function quoteIdent(name: string): string {
  if (!/^[a-z0-9_]+$/i.test(name)) {
    throw new Error(`Invalid database name: ${name}`);
  }
  return `"${name}"`;
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
