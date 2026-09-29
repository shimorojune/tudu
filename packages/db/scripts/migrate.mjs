import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { migrate } from "drizzle-orm/neon-http/migrator";
import { backfillMigrationJournalIfNeeded } from "./backfill-migration-journal.mjs";

const packageDir = dirname(fileURLToPath(import.meta.url));
const migrationsFolder = resolve(packageDir, "../drizzle");

config({ path: resolve(packageDir, "../../../.env") });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

await backfillMigrationJournalIfNeeded(databaseUrl);

const db = drizzle(neon(databaseUrl));
await migrate(db, { migrationsFolder });
console.log("Migrations applied");
