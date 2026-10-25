import { randomBytes } from 'node:crypto';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';
import { migrateDatabase, MIGRATIONS_DIR } from './migrate';

/**
 * A throwaway database for one test run: created from the server named by TUDU_TEST_DATABASE_URL (or the
 * local dev server), migrated, and dropped by `drop()`. Every run gets its own, so runs never share state.
 */
export async function createTestDatabase(
  options: {
    serverUrl?: string;
    prefix?: string;
    /** Stop after this migration ("0014_feedback-issues"), to test the next one against data made before it. */
    upTo?: string;
  } = {},
): Promise<{ url: string; name: string; drop: () => Promise<void> }> {
  const serverUrl =
    options.serverUrl ??
    process.env.TUDU_TEST_DATABASE_URL ??
    process.env.TUDU_CI_DATABASE_URL ??
    'postgres://tudu@127.0.0.1:54329/postgres';
  const name = `${options.prefix ?? 'tudu_test'}_${Date.now().toString(36)}_${randomBytes(3).toString('hex')}`;
  const admin = new pg.Client({ connectionString: serverUrl });
  await admin.connect();
  await admin.query(`CREATE DATABASE "${name}"`);
  await admin.end();
  const url = withDatabase(serverUrl, name);
  if (options.upTo) await migrateUpTo(url, options.upTo);
  else await migrateDatabase(url);
  return {
    url,
    name,
    drop: async () => {
      const c = new pg.Client({ connectionString: serverUrl });
      await c.connect();
      await c.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
      await c.end();
    },
  };
}

/** The migrations up to and including `tag`, applied from a copy of the folder with the rest left out. */
async function migrateUpTo(url: string, tag: string): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), 'tudu-migrations-'));
  try {
    cpSync(MIGRATIONS_DIR, dir, { recursive: true });
    const journalPath = join(dir, 'meta', '_journal.json');
    const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as { entries: Array<{ tag: string }> };
    const end = journal.entries.findIndex((e) => e.tag === tag);
    if (end < 0) throw new Error(`No migration ${tag}`);
    journal.entries = journal.entries.slice(0, end + 1);
    writeFileSync(journalPath, JSON.stringify(journal));
    await migrateDatabase(url, dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function withDatabase(url: string, name: string): string {
  const u = new URL(url);
  u.pathname = `/${name}`;
  return u.toString();
}
