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

// #region agent log
function debugLog(message, data, hypothesisId) {
  const payload = {
    sessionId: "a1c39c",
    location: "backfill-migration-journal.mjs",
    message,
    data,
    hypothesisId,
    timestamp: Date.now(),
    runId: process.env.DEBUG_MIGRATE_RUN_ID ?? "ci",
  };
  console.log(`[migrate-backfill] ${JSON.stringify(payload)}`);
  fetch("http://127.0.0.1:7656/ingest/ae28efba-55db-4631-92e6-b07a974e22cc", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Debug-Session-Id": "a1c39c",
    },
    body: JSON.stringify(payload),
  }).catch(() => {});
}
// #endregion

async function hasTable(sql, tableName) {
  const rows = await sql`
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = ${tableName}
    LIMIT 1
  `;
  return rows.length > 0;
}

async function hasColumn(sql, tableName, columnName) {
  const rows = await sql`
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = ${tableName}
      AND column_name = ${columnName}
    LIMIT 1
  `;
  return rows.length > 0;
}

async function hasType(sql, typeName) {
  const rows = await sql`
    SELECT 1
    FROM pg_type
    WHERE typname = ${typeName}
    LIMIT 1
  `;
  return rows.length > 0;
}

async function hasEnumLabel(sql, typeName, label) {
  const rows = await sql`
    SELECT 1
    FROM pg_enum e
    INNER JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = ${typeName}
      AND e.enumlabel = ${label}
    LIMIT 1
  `;
  return rows.length > 0;
}

/** One probe per migration tag; highest matching tag wins (reverse journal walk). */
const MIGRATION_PROBES = {
  "0022_task_ids": (sql) => hasColumn(sql, "tasks", "task_number"),
  "0021_moved_to_space_timeline": (sql) =>
    hasEnumLabel(sql, "timeline_event_type", "moved_to_space"),
  "0020_organizations": (sql) => hasTable(sql, "orgs"),
  "0019_notifications_revamp": (sql) =>
    hasColumn(sql, "notification_preferences", "regular_enabled"),
  "0018_superb_argent": (sql) =>
    hasColumn(sql, "notification_preferences", "reminders_focus"),
  "0017_tiresome_vargas": (sql) => hasTable(sql, "notification_preferences"),
  "0016_faulty_runaways": (sql) => hasTable(sql, "push_device_tokens"),
  "0015_great_professor_monster": (sql) => hasTable(sql, "task_attachments"),
  "0014_boring_blockbuster": (sql) =>
    hasColumn(sql, "jira_issues", "status_color_name"),
  "0013_natural_hardball": (sql) => hasTable(sql, "jira_jql_presets"),
  "0012_bright_santa_claus": (sql) =>
    hasColumn(sql, "jira_issues", "assigned_list_at"),
  "0011_clammy_captain_flint": (sql) => hasTable(sql, "jira_connections"),
  "0010_blushing_scalphunter": (sql) =>
    hasColumn(sql, "projects", "is_private"),
  "0009_clammy_redwing": (sql) =>
    hasEnumLabel(sql, "timeline_event_type", "project_changed"),
  "0008_kind_meteorite": (sql) =>
    hasEnumLabel(sql, "notification_kind", "inbox_declined"),
  "0007_real_young_avengers": (sql) => hasTable(sql, "notifications"),
  "0006_empty_umar": (sql) => hasTable(sql, "sync_events"),
  "0005_organic_absorbing_man": (sql) =>
    hasEnumLabel(sql, "timeline_event_type", "inbox_sent"),
  "0004_fancy_exiles": (sql) => hasColumn(sql, "tasks", "in_progress"),
  "0003_unique_goliath": (sql) =>
    hasEnumLabel(sql, "timeline_event_type", "description_changed"),
  "0002_giant_texas_twister": (sql) =>
    hasEnumLabel(sql, "timeline_event_type", "rolled_over"),
  "0001_flaky_captain_stacy": (sql) => hasType(sql, "timeline_event_type"),
  "0000_public_mulholland_black": (sql) => hasType(sql, "task_bucket"),
};

export async function detectLastAppliedTag(sql, entries = readJournal()) {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const tag = entries[index].tag;
    const probe = MIGRATION_PROBES[tag];
    if (!probe) {
      continue;
    }
    if (await probe(sql)) {
      return tag;
    }
  }
  return null;
}

async function journalMaxAppliedIndex(sql, entries) {
  const rows = await sql`
    SELECT created_at
    FROM drizzle.__drizzle_migrations
    ORDER BY created_at DESC
    LIMIT 1
  `;
  if (rows.length === 0) {
    return -1;
  }
  const when = Number(rows[0].created_at);
  return entries.findIndex((entry) => entry.when === when);
}

async function ensureJournalTable(sql) {
  await sql`CREATE SCHEMA IF NOT EXISTS drizzle`;
  await sql`
    CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
      id SERIAL PRIMARY KEY,
      hash text NOT NULL,
      created_at bigint
    )
  `;
}

async function insertJournalRows(sql, entries, fromIndex, toIndex) {
  for (let index = fromIndex; index <= toIndex; index += 1) {
    const entry = entries[index];
    const hash = migrationFileHash(entry.tag);
    await sql`
      INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
      VALUES (${hash}, ${entry.when})
    `;
  }
}

export async function backfillMigrationJournalIfNeeded(databaseUrl) {
  const sql = neon(databaseUrl);
  const entries = readJournal();

  const journalTableExists = await sql`
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'drizzle'
      AND table_name = '__drizzle_migrations'
    LIMIT 1
  `;
  const journalRowCount =
    journalTableExists.length > 0
      ? (await sql`SELECT COUNT(*)::int AS count FROM drizzle.__drizzle_migrations`)[0]
          ?.count ?? 0
      : 0;

  const lastTag = await detectLastAppliedTag(sql, entries);
  if (!lastTag) {
    debugLog("skip backfill: empty database", { journalRowCount }, "H3");
    return { backfilled: false, reason: "empty_database" };
  }

  const detectedIndex = entries.findIndex((entry) => entry.tag === lastTag);
  if (detectedIndex < 0) {
    throw new Error(`Unknown migration tag for backfill: ${lastTag}`);
  }

  await ensureJournalTable(sql);
  const journalIndex = await journalMaxAppliedIndex(sql, entries);

  debugLog(
    "detection",
    {
      journalRowCount,
      journalIndex,
      detectedIndex,
      lastTag,
      journalTag: journalIndex >= 0 ? entries[journalIndex]?.tag : null,
    },
    "H1",
  );

  if (detectedIndex <= journalIndex) {
    debugLog("skip backfill: journal up to date", { journalIndex, detectedIndex }, "H2");
    return { backfilled: false, reason: "journal_up_to_date" };
  }

  const fromIndex = journalIndex + 1;
  await insertJournalRows(sql, entries, fromIndex, detectedIndex);

  debugLog(
    "backfilled journal",
    {
      fromTag: entries[fromIndex]?.tag,
      throughTag: lastTag,
      inserted: detectedIndex - fromIndex + 1,
    },
    "H1",
  );

  console.log(
    `Backfilled drizzle migration journal through ${lastTag} (${detectedIndex + 1} migrations recorded)`,
  );
  return {
    backfilled: true,
    throughTag: lastTag,
    count: detectedIndex + 1,
    inserted: detectedIndex - fromIndex + 1,
  };
}
