import { config } from "dotenv";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  e2eShardCount,
  resolveShardUrl,
  shardIndexFromPlaywrightShard,
} from "./e2e-shard-url.js";

const packageDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(packageDir, "../../..");

config({ path: resolve(repoRoot, ".env") });

function main() {
  const shardArg = process.argv[2];
  const shard = shardArg ? Number(shardArg) : NaN;
  const total = e2eShardCount();
  if (!Number.isInteger(shard) || shard < 1 || shard > total) {
    console.error(`Usage: pnpm test:e2e:shard -- <1..${total}>`);
    process.exit(1);
  }

  const template =
    process.env.E2E_DATABASE_URL?.trim() ??
    process.env.E2E_DATABASE_URL_0?.trim();
  if (!template) {
    console.error("E2E_DATABASE_URL or E2E_DATABASE_URL_0 is required in .env");
    process.exit(1);
  }

  const index = shardIndexFromPlaywrightShard(shard);
  const e2eUrl = resolveShardUrl(template, index);
  process.env.E2E_DATABASE_URL = e2eUrl;

  const extra = process.argv.slice(3);
  const args = [
    "playwright",
    "test",
    "--config",
    "apps/e2e/playwright.config.ts",
    `--shard=${shard}/${total}`,
    ...extra,
  ];

  const result = spawnSync("pnpm", ["exec", ...args], {
    cwd: repoRoot,
    stdio: "inherit",
    env: process.env,
  });
  process.exit(result.status ?? 1);
}

main();
