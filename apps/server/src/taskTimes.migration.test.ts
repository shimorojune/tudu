import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb, sql } from '@tudu/db';
import { migrateDatabase } from '@tudu/db/migrate';
import { createTestDatabase } from '@tudu/db/test';

// A database made just before times (docs/plans/task-times.md), with tasks and a request in it, then moved to 0022.
let db: Awaited<ReturnType<typeof createTestDatabase>>;
let conn: ReturnType<typeof createDb>;
const q = (s: ReturnType<typeof sql>) => conn.db.execute(s);

beforeAll(async () => {
  db = await createTestDatabase({ prefix: 'tudu_mig', upTo: '0021_feedback-similar' });
  conn = createDb(db.url, { max: 1 });
  await q(
    sql`insert into "user" (id, name, email) values ('ada', 'Ada', 'ada@x.io'), ('ben', 'Ben', 'ben@x.io')`,
  );
  await q(
    sql`insert into spaces (id, kind, name, slug, task_prefix) values ('s1', 'team', 'One', 'one', 'ON')`,
  );
  await q(sql`insert into space_members (space_id, user_id) values ('s1', 'ada'), ('s1', 'ben')`);
  await q(sql`insert into tasks (id, space_id, number, title, day, due_day, position, owner_id) values
    ('t1', 's1', 1, 'Planned', '2026-10-21', '2026-10-23', 1024, 'ada'),
    ('t2', 's1', 2, 'Backlog', null, null, 2048, 'ada')`);
  await q(sql`insert into requests (id, space_id, from_id, to_id, title, due_day) values
    ('r1', 's1', 'ada', 'ben', 'Asked', '2026-10-24')`);
  await migrateDatabase(db.url);
});

afterAll(async () => {
  await conn?.close();
  await db?.drop();
});

describe('migration 0022 (times)', () => {
  it('TT-A07 old rows keep their days and read as one day with no times; the checks hold', async () => {
    const rows = (await q(
      sql`select id, day, end_day, start_time, end_time, due_day, due_time, places from tasks order by id`,
    )) as unknown as { rows: Array<Record<string, unknown>> };
    expect(rows.rows).toEqual([
      {
        id: 't1',
        day: '2026-10-21',
        end_day: null,
        start_time: null,
        end_time: null,
        due_day: '2026-10-23',
        due_time: null,
        places: {},
      },
      {
        id: 't2',
        day: null,
        end_day: null,
        start_time: null,
        end_time: null,
        due_day: null,
        due_time: null,
        places: {},
      },
    ]);
    const req = (await q(sql`select due_day, due_time from requests where id = 'r1'`)) as unknown as {
      rows: Array<Record<string, unknown>>;
    };
    expect(req.rows[0]).toEqual({ due_day: '2026-10-24', due_time: null });
    // A span needs a first day before its last; a time needs both ends and a day; a due time needs a due day.
    const refused = async (s: ReturnType<typeof sql>) => {
      const err = await q(s).then(
        () => null,
        (e: { cause?: { code?: string } }) => e,
      );
      // 23514: check_violation.
      expect(err?.cause?.code).toBe('23514');
    };
    await refused(sql`update tasks set end_day = '2026-10-20' where id = 't1'`);
    await refused(sql`update tasks set end_day = '2026-10-21' where id = 't2'`);
    await refused(sql`update tasks set start_time = '10:00' where id = 't1'`);
    await refused(sql`update tasks set start_time = '10:00', end_time = '11:00' where id = 't2'`);
    await refused(sql`update tasks set due_time = '17:00' where id = 't2'`);
    await q(
      sql`update tasks set end_day = '2026-10-23', start_time = '16:00', end_time = '10:00', due_time = '17:00' where id = 't1'`,
    );
    // The new history kinds are there.
    await q(sql`insert into task_events (task_id, kind, data) values
      ('t1', 'time.set', '{}'), ('t1', 'time.cleared', '{}'), ('t1', 'span.set', '{}'), ('t1', 'span.cleared', '{}')`);
  });
});
