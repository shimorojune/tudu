import { config } from "dotenv";
import { neon } from "@neondatabase/serverless";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const packageDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(packageDir, "../../..");

config({ path: resolve(repoRoot, ".env") });

function databaseNameFromUrl(url: string): string {
  const withoutQuery = url.split("?")[0] ?? url;
  const segment = withoutQuery.split("/").pop() ?? "";
  return decodeURIComponent(segment);
}

function assertSafeE2eUrl(e2eUrl: string): void {
  const devUrl = process.env.DATABASE_URL?.trim();
  if (devUrl && devUrl === e2eUrl) {
    throw new Error(
      "E2E_DATABASE_URL must not equal DATABASE_URL. Use a separate Neon database.",
    );
  }

  const name = databaseNameFromUrl(e2eUrl).toLowerCase();
  if (!name.includes("e2e")) {
    throw new Error(
      `E2E database name must contain "e2e" (got "${name}"). Refusing to reset.`,
    );
  }
}

async function main() {
  const e2eUrl = process.env.E2E_DATABASE_URL?.trim();
  if (!e2eUrl) {
    console.error("E2E_DATABASE_URL is required");
    process.exit(1);
  }

  assertSafeE2eUrl(e2eUrl);

  const sql = neon(e2eUrl);
  await sql`DROP SCHEMA IF EXISTS public CASCADE`;
  await sql`DROP SCHEMA IF EXISTS drizzle CASCADE`;
  await sql`CREATE SCHEMA public`;
  await sql`GRANT ALL ON SCHEMA public TO public`;

  console.log("E2E database reset complete");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
