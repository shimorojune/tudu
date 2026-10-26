import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb, sql } from '@tudu/db';
import { migrateDatabase } from '@tudu/db/migrate';
import { createTestDatabase } from '@tudu/db/test';
import { TokenSeal } from './connectors/seal';

// A database made just before connectors, filled the way per-space Jira left it, then moved to connectors.
let db: Awaited<ReturnType<typeof createTestDatabase>>;
let conn: ReturnType<typeof createDb>;
const seal = new TokenSeal('test-secret-test-secret-test-secret');
const sealed = {
  p: seal.seal('good-p'),
  n: seal.seal('good-n'),
  h: seal.seal('good-h'),
  b: seal.seal('good-b'),
};

beforeAll(async () => {
  db = await createTestDatabase({ prefix: 'tudu_mig', upTo: '0014_feedback-issues' });
  conn = createDb(db.url, { max: 1 });
  const q = (s: ReturnType<typeof sql>) => conn.db.execute(s);
  await q(
    sql`insert into "user" (id, name, email) values ('ada', 'Ada', 'ada@x.io'), ('ben', 'Ben', 'ben@x.io')`,
  );
  await q(sql`insert into spaces (id, kind, name, slug, task_prefix) values
    ('s1', 'team', 'One', 'one', 'ON'), ('s2', 'team', 'Two', 'two', 'TW'),
    ('s3', 'team', 'Three', 'three', 'TH'), ('s4', 'team', 'Left', 'left', 'LF')`);
  await q(sql`insert into space_members (space_id, user_id) values
    ('s1', 'ada'), ('s2', 'ada'), ('s3', 'ada'), ('s2', 'ben')`);
  // Ada: Personal-like s1 (works, site A), s2 (expired, site A, the newest), s3 (works, site B, the oldest), and s4
  // which she has left since. Ben: s2 only.
  await q(sql`insert into jira_connections (id, user_id, space_id, site, token_sealed, jira_name, jira_email, state, connected_at) values
    ('c-p', 'ada', 's1', 'https://a.jira', ${sealed.p}, 'Ada R', 'ada@a.jira', 'ok', '2026-10-02'),
    ('c-n', 'ada', 's2', 'https://a.jira', ${sealed.n}, 'Ada R', 'ada@a.jira', 'expired', '2026-10-03'),
    ('c-h', 'ada', 's3', 'https://b.jira', ${sealed.h}, 'Ada R', 'ada@b.jira', 'ok', '2026-10-01'),
    ('c-l', 'ada', 's4', 'https://a.jira', ${sealed.p}, 'Ada R', 'ada@a.jira', 'ok', '2026-09-01'),
    ('c-b', 'ben', 's2', 'https://a.jira', ${sealed.b}, 'Ben K', 'ben@a.jira', 'ok', '2026-10-05')`);
  await q(sql`insert into jira_views (id, connection_id, name, jql, position, created_at) values
    ('v1', 'c-p', 'Mine', 'assignee = currentUser()', 1024, '2026-10-02'),
    ('v2', 'c-p', 'Bugs', 'issuetype = Bug', 2048, '2026-10-02'),
    ('v3', 'c-n', 'mine', 'project = TW', 1024, '2026-10-03'),
    ('v4', 'c-n', 'Ops', 'project = OPS', 2048, '2026-10-03'),
    ('v5', 'c-b', 'Mine', 'reporter = currentUser()', 1024, '2026-10-05')`);
  await q(sql`insert into tasks (id, space_id, number, title, position, owner_id, jira_key, done_at, deleted_at, updated_at) values
    ('t1', 's1', 1, 'Linked', 1024, 'ada', 'TUDU-1', null, null, '2026-10-10'),
    ('t2', 's2', 1, 'Crossed off', 1024, 'ada', 'TUDU-2', '2026-10-11', null, '2026-10-11'),
    ('t3', 's1', 2, 'Deleted', 2048, 'ada', 'TUDU-3', null, '2026-10-12', '2026-10-12'),
    ('t4', 's1', 3, 'Not linked', 3072, 'ada', null, null, null, '2026-10-12'),
    ('t5', 's2', 2, 'Ben''s', 2048, 'ben', 'TUDU-5', null, null, '2026-10-13')`);
  await q(sql`insert into task_events (task_id, kind, data, actor_id, at) values
    ('t1', 'created', '{"source":"jira","key":"TUDU-9"}', 'ada', '2026-10-04'),
    ('t1', 'jira.unlinked', '{"key":"TUDU-9"}', 'ada', '2026-10-05'),
    ('t1', 'jira.linked', '{"key":"TUDU-1"}', 'ada', '2026-10-06'),
    ('t4', 'created', '{"source":"quick-add"}', 'ada', '2026-10-04')`);
  await migrateDatabase(db.url);
});

afterAll(async () => {
  await conn?.close();
  await db?.drop();
});

async function rows<T>(s: ReturnType<typeof sql>): Promise<T[]> {
  return (await conn.db.execute(s)).rows as T[];
}

describe('the move to connectors (migration 0015)', () => {
  it('C10-A09 one connection each: the newest that works, on where it was on the same site, views merged by name', async () => {
    const cs = await rows<{
      id: string;
      user_id: string;
      provider: string;
      site: string;
      token_sealed: string;
      account_name: string;
      state: string;
    }>(
      sql`select id, user_id, provider, site, token_sealed, account_name, state from connections order by user_id`,
    );
    expect(cs).toEqual([
      {
        id: 'c-p',
        user_id: 'ada',
        provider: 'jira',
        site: 'https://a.jira',
        token_sealed: sealed.p,
        account_name: 'Ada R',
        state: 'ok',
      },
      {
        id: 'c-b',
        user_id: 'ben',
        provider: 'jira',
        site: 'https://a.jira',
        token_sealed: sealed.b,
        account_name: 'Ben K',
        state: 'ok',
      },
    ]);
    // The token sealed before connectors still opens with the same secret.
    expect(seal.open(cs[0]!.token_sealed)).toBe('good-p');

    // On in s1 and s2 (site A); off in s3 (another site) and in s4 (left).
    expect(
      await rows(sql`select user_id, space_id, provider from connection_spaces order by user_id, space_id`),
    ).toEqual([
      { user_id: 'ada', space_id: 's1', provider: 'jira' },
      { user_id: 'ada', space_id: 's2', provider: 'jira' },
      { user_id: 'ben', space_id: 's2', provider: 'jira' },
    ]);

    // The kept connection's views first, in their order; a name used twice (any case) kept once; Ben's untouched.
    expect(
      await rows(
        sql`select connection_id, name, query, position from connection_views order by connection_id, position`,
      ),
    ).toEqual([
      { connection_id: 'c-b', name: 'Mine', query: 'reporter = currentUser()', position: 1024 },
      { connection_id: 'c-p', name: 'Mine', query: 'assignee = currentUser()', position: 1024 },
      { connection_id: 'c-p', name: 'Bugs', query: 'issuetype = Bug', position: 2048 },
      { connection_id: 'c-p', name: 'Ops', query: 'project = OPS', position: 3072 },
    ]);
  });

  it('C10-A16 every key becomes a link, the history names the app, and the Jira-only tables and column are gone', async () => {
    const ls = await rows<{
      task_id: string;
      space_id: string;
      key: string;
      linked_by: string;
      linked_at: Date;
    }>(sql`select task_id, space_id, key, linked_by, linked_at from task_links order by task_id`);
    expect(ls.map((l) => [l.task_id, l.space_id, l.key, l.linked_by])).toEqual([
      ['t1', 's1', 'TUDU-1', 'ada'],
      ['t2', 's2', 'TUDU-2', 'ada'],
      ['t3', 's1', 'TUDU-3', 'ada'],
      ['t5', 's2', 'TUDU-5', 'ben'],
    ]);
    // Linked when its newest "linked" event says; else when the task last changed.
    expect(new Date(ls[0]!.linked_at).toISOString()).toBe(new Date('2026-10-06').toISOString());
    expect(new Date(ls[1]!.linked_at).toISOString()).toBe(new Date('2026-10-11').toISOString());

    expect(await rows(sql`select task_id, kind::text, data from task_events order by task_id, at`)).toEqual([
      { task_id: 't1', kind: 'created', data: { source: 'connector', provider: 'jira', key: 'TUDU-9' } },
      { task_id: 't1', kind: 'link.removed', data: { provider: 'jira', key: 'TUDU-9' } },
      { task_id: 't1', kind: 'link.added', data: { provider: 'jira', key: 'TUDU-1' } },
      { task_id: 't4', kind: 'created', data: { source: 'quick-add' } },
    ]);

    const gone = await rows<{ t: string | null }>(
      sql`select to_regclass('jira_connections')::text as t union all select to_regclass('jira_views')::text`,
    );
    expect(gone).toEqual([{ t: null }, { t: null }]);
    expect(
      await rows(
        sql`select column_name from information_schema.columns where table_name = 'tasks' and column_name = 'jira_key'`,
      ),
    ).toEqual([]);
    expect(await rows(sql`select typname from pg_type where typname = 'jira_state'`)).toEqual([]);
  });
});
