import crypto from "node:crypto";
import fs from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { neon } from "@neondatabase/serverless";

const packageDir = dirname(fileURLToPath(import.meta.url));
const migrationsFolder = resolve(packageDir, "../drizzle");
const journalPath = resolve(migrationsFolder, "meta/_journal.json");

function readJournal() {
  const journal = JSON.parse(fs.readFileSync(journalPath, "utf8"));
  return journal.entries;
}

export function migrationFileHash(tag) {
  const query = fs.readFileSync(resolve(migrationsFolder, `${tag}.sql`), "utf8");
  return crypto.createHash("sha256").update(query).digest("hex");
}

async function migrationJournalRowCount(sql) {
  const rows = await sql`
    SELECT COUNT(*)::int AS count
    FROM information_schema.tables
    WHERE table_schema = 'drizzle'
      AND table_name = '__drizzle_migrations'
  `;
  if ((rows[0]?.count ?? 0) === 0) {
    return 0;
  }
  const applied = await sql`SELECT COUNT(*)::int AS count FROM drizzle.__drizzle_migrations`;
  return applied[0]?.count ?? 0;
}

async function hasTaskBucketType(sql) {
  const rows = await sql`
    SELECT 1
    FROM pg_type
    WHERE typname = 'task_bucket'
    LIMIT 1
  `;
  return rows.length > 0;
}

async function hasOrgsTable(sql) {
  const rows = await sql`
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'orgs'
    LIMIT 1
  `;
  return rows.length > 0;
}

async function hasMovedToSpaceTimelineValue(sql) {
  const rows = await sql`
    SELECT 1
    FROM pg_enum e
    INNER JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'timeline_event_type'
      AND e.enumlabel = 'moved_to_space'
    LIMIT 1
  `;
  return rows.length > 0;
}

async function hasTaskNumberColumn(sql) {
  const rows = await sql`
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'tasks'
      AND column_name = 'task_number'
    LIMIT 1
  `;
  return rows.length > 0;
}

export async function detectLastAppliedTag(sql) {
  if (await hasTaskNumberColumn(sql)) {
    return "0022_task_ids";
  }
  if (await hasOrgsTable(sql)) {
    if (await hasMovedToSpaceTimelineValue(sql)) {
      return "0021_moved_to_space_timeline";
    }
    return "0020_organizations";
  }
  if (await hasTaskBucketType(sql)) {
    return "0000_public_mulholland_black";
  }
  return null;
}

export async function backfillMigrationJournalIfNeeded(databaseUrl) {
  const sql = neon(databaseUrl);
  const appliedCount = await migrationJournalRowCount(sql);
  if (appliedCount > 0) {
    return { backfilled: false, reason: "journal_not_empty" };
  }

  const lastTag = await detectLastAppliedTag(sql);
  if (!lastTag) {
    return { backfilled: false, reason: "empty_database" };
  }

  const entries = readJournal();
  const lastIndex = entries.findIndex((entry) => entry.tag === lastTag);
  if (lastIndex < 0) {
    throw new Error(`Unknown migration tag for backfill: ${lastTag}`);
  }

  await sql`CREATE SCHEMA IF NOT EXISTS drizzle`;
  await sql`
    CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
      id SERIAL PRIMARY KEY,
      hash text NOT NULL,
      created_at bigint
    )
  `;

  for (let index = 0; index <= lastIndex; index += 1) {
    const entry = entries[index];
    const hash = migrationFileHash(entry.tag);
    await sql`
      INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
      VALUES (${hash}, ${entry.when})
    `;
  }

  console.log(
    `Backfilled drizzle migration journal through ${lastTag} (${lastIndex + 1} migrations)`,
  );
  return { backfilled: true, throughTag: lastTag, count: lastIndex + 1 };
}
