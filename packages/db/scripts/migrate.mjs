import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { migrate } from "drizzle-orm/neon-http/migrator";

const packageDir = dirname(fileURLToPath(import.meta.url));
const migrationsFolder = resolve(packageDir, "../drizzle");

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const db = drizzle(neon(databaseUrl));
await migrate(db, { migrationsFolder });
console.log("Migrations applied");
