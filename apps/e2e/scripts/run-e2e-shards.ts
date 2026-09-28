import { config } from "dotenv";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { e2eShardCount } from "./e2e-shard-url.js";

const packageDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(packageDir, "../../..");

config({ path: resolve(repoRoot, ".env") });

function main() {
  const total = e2eShardCount();
  const repeat = process.argv.includes("--repeat-each=2")
    ? ["--repeat-each=2"]
    : [];

  for (let shard = 1; shard <= total; shard += 1) {
    console.log(`\n=== E2E shard ${shard}/${total} ===\n`);
    const result = spawnSync(
      "pnpm",
      ["exec", "tsx", "apps/e2e/scripts/run-e2e-shard.ts", String(shard), ...repeat],
      { cwd: repoRoot, stdio: "inherit", env: process.env },
    );
    if (result.status !== 0) {
      process.exit(result.status ?? 1);
    }
  }
}

main();
