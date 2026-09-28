import { config } from "dotenv";
import { neon } from "@neondatabase/serverless";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  e2eShardCount,
  resolveShardUrl,
  shardDatabaseName,
} from "./e2e-shard-url.js";

const packageDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(packageDir, "../../..");

config({ path: resolve(repoRoot, ".env") });

async function main() {
  const template =
    process.env.E2E_DATABASE_URL?.trim() ??
    process.env.E2E_DATABASE_URL_0?.trim();
  if (!template) {
    console.error("E2E_DATABASE_URL or E2E_DATABASE_URL_0 is required");
    process.exit(1);
  }

  const count = e2eShardCount();
  for (let index = 0; index < count; index += 1) {
    const url = resolveShardUrl(template, index);
    const name = shardDatabaseName(index);
    const sql = neon(url);
    await sql`SELECT 1 AS ok`;
    console.log(`OK ${name}`);
  }
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
