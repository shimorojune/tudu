import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { migrateDatabase } from './migrate';

/**
 * A throwaway database for one test run: created from the server named by TUDU_TEST_DATABASE_URL (or the
 * local dev server), migrated, and dropped by `drop()`. Every run gets its own, so runs never share state.
 */
export async function createTestDatabase(
  options: { serverUrl?: string; prefix?: string } = {},
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
  await migrateDatabase(url);
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

function withDatabase(url: string, name: string): string {
  const u = new URL(url);
  u.pathname = `/${name}`;
  return u.toString();
}
