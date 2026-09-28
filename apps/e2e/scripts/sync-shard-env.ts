import { config } from "dotenv";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  e2eShardCount,
  resolveShardUrl,
  shardDatabaseName,
} from "./e2e-shard-url.js";

const packageDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(packageDir, "../../..");
const envPath = resolve(repoRoot, ".env");

config({ path: envPath });

function upsertEnvLine(lines: string[], key: string, value: string): string[] {
  const prefix = `${key}=`;
  const next = lines.filter((line) => !line.startsWith(prefix));
  next.push(`${prefix}${value}`);
  return next;
}

function main() {
  const template =
    process.env.E2E_DATABASE_URL?.trim() ??
    process.env.E2E_DATABASE_URL_0?.trim();
  if (!template) {
    console.error("Set E2E_DATABASE_URL or E2E_DATABASE_URL_0 in .env first.");
    process.exit(1);
  }

  let lines = readFileSync(envPath, "utf8").split(/\r?\n/);
  const count = e2eShardCount();
  for (let index = 0; index < count; index += 1) {
    const key = `E2E_DATABASE_URL_${index}`;
    lines = upsertEnvLine(lines, key, resolveShardUrl(template, index));
    console.log(`Updated ${key} -> ${shardDatabaseName(index)}`);
  }
  const shard0 = resolveShardUrl(template, 0);
  lines = upsertEnvLine(lines, "E2E_DATABASE_URL", shard0);
  console.log("Updated E2E_DATABASE_URL -> tudu_e2e_0 (shard 0 / CI unit job)");

  writeFileSync(envPath, `${lines.filter((l) => l.length > 0).join("\n")}\n`);
}

main();
