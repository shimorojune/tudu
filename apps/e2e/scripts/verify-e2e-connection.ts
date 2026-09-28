import { config } from "dotenv";
import { neon } from "@neondatabase/serverless";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(packageDir, "../../..");

config({ path: resolve(repoRoot, ".env") });

function databaseNameFromUrl(url: string): string {
  const withoutQuery = url.split("?")[0] ?? url;
  const segment = withoutQuery.split("/").pop() ?? "";
  return decodeURIComponent(segment);
}

async function main() {
  const raw = process.env.E2E_DATABASE_URL?.trim();
  if (!raw) {
    console.error("E2E_DATABASE_URL is not set (repo root .env or shell env).");
    process.exit(1);
  }
  if ((raw.startsWith('"') && raw.endsWith('"')) || raw.includes("\n")) {
    console.error(
      "E2E_DATABASE_URL looks malformed (quotes or newlines). Paste the plain pooled URL only.",
    );
    process.exit(1);
  }

  const name = databaseNameFromUrl(raw).toLowerCase();
  if (!name.includes("e2e")) {
    console.error(
      `Database name must contain "e2e" (got "${name}"). See apps/e2e/README.md.`,
    );
    process.exit(1);
  }

  try {
    const sql = neon(raw);
    await sql`SELECT 1 AS ok`;
    console.log(`E2E database connection OK (${name}).`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("E2E database connection failed.");
    if (message.includes("password authentication failed")) {
      console.error(
        "Neon rejected the password. In the Neon console, reset the role password or copy a new pooled connection string, then update .env and the GitHub secret E2E_DATABASE_URL.",
      );
    } else {
      console.error(message);
    }
    process.exit(1);
  }
}

void main();
