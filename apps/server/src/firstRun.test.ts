import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { inject } from 'vitest';
import type { GettingStarted, SpaceSummary } from '@tudu/core';
import { createDb, eq, schema, sql } from '@tudu/db';
import { MIGRATIONS_DIR } from '@tudu/db/migrate';
import { gettingStarted, parseRecord } from './firstRun';
import type { Jar } from '../test/harness';
import { JIRA_TEST_SITE, get, post, signIn, startServer } from '../test/harness';

let server: ReturnType<typeof startServer>;
beforeAll(() => {
  server = startServer();
});
afterAll(async () => {
  await server.close();
});

interface Person {
  jar: Jar;
  email: string;
  userId: string;
  personalId: string;
}

interface Me {
  user: { id: string; createdAt: string };
  firstSignIn: boolean;
  spaces: SpaceSummary[];
  gettingStarted: GettingStarted;
}

async function me(jar: Jar): Promise<Me> {
  const res = await get(server.app, '/api/me', jar);
  expect(res.status).toBe(200);
  return (await res.json()) as Me;
}

async function person(): Promise<Person> {
  const { jar, email } = await signIn(server);
  const m = await me(jar);
  return { jar, email, userId: m.user.id, personalId: m.spaces[0]!.id };
}

let clock = Date.parse('2026-10-18T09:00:00.000Z');
function m(type: string, payload: Record<string, unknown>) {
  clock += 1000;
  return { id: randomUUID(), type, payload, at: new Date(clock).toISOString() };
}

async function sync(p: Person, mutations: unknown[]) {
  const res = await post(server.app, '/api/sync', { clientId: 'tab-1', mutations }, p.jar);
  expect(res.status).toBe(200);
}

function record(p: Person | null, body: unknown) {
  return post(server.app, '/api/me/getting-started', body, p?.jar);
}

function joinToken(email: string): string {
  const mail = server.outbox
    .to(email)
    .filter((x) => /invited you/.test(x.subject))
    .at(-1)!;
  return /\/join\/([A-Za-z0-9_-]+)/.exec(mail.text)![1]!;
}

const none = { name: false, task: false, theme: false, jira: false };

describe('first run', () => {
  it('C12-U06 reads each row from the real thing, for that person only', async () => {
    const a = await person();
    const b = await person();
    expect(await gettingStarted(server.db, a.userId)).toEqual({ open: true, done: none });

    // A blank name is no name.
    await sync(a, [m('me.rename', { id: a.userId, name: '   Rohit Raj ' })]);
    // A team space with b in it: a's task there counts for a; a request a sends b becomes b's task on accepting,
    // but b did not write it.
    const made = await post(
      server.app,
      '/api/spaces',
      { name: 'Northwind', color: '#3d5a80', invites: [b.email] },
      a.jar,
    );
    const space = ((await made.json()) as { space: SpaceSummary }).space;
    expect((await post(server.app, `/api/join/${joinToken(b.email)}`, {}, b.jar)).status).toBe(200);
    const reqId = randomUUID();
    await sync(a, [
      m('task.create', { id: randomUUID(), spaceId: space.id, title: 'Plan the offsite', day: null }),
      m('request.send', {
        id: reqId,
        spaceId: space.id,
        toId: b.userId,
        title: 'Book rooms',
        askedDay: null,
      }),
    ]);
    await sync(b, [m('request.accept', { id: reqId, taskId: randomUUID(), day: null })]);
    // A Jira connection made from the team space counts.
    const jira = await post(
      server.app,
      '/api/connectors/jira',
      { site: JIRA_TEST_SITE, token: `good-${randomUUID()}`, spaceId: space.id },
      a.jar,
    );
    expect(jira.status).toBe(200);

    expect((await gettingStarted(server.db, a.userId)).done).toEqual({
      name: true,
      task: true,
      theme: false,
      jira: true,
    });
    expect(await gettingStarted(server.db, b.userId)).toEqual({ open: true, done: none });

    // The theme flag, then all four: no longer open.
    expect((await record(a, { theme: true })).status).toBe(200);
    expect(await gettingStarted(server.db, a.userId)).toEqual({
      open: false,
      done: { name: true, task: true, theme: true, jira: true },
    });
    // Hidden: closed with nothing done.
    expect((await record(b, { hidden: true })).status).toBe(200);
    expect(await gettingStarted(server.db, b.userId)).toEqual({ open: false, done: none });

    expect(parseRecord({ theme: true })).toEqual({ theme: true });
    expect(parseRecord({ hidden: true })).toEqual({ hidden: true });
    for (const bad of [null, [], {}, { theme: false }, { hidden: 'yes' }, { theme: true, hidden: true }, 'x'])
      expect(parseRecord(bad)).toBeNull();
  });

  it('C12-A01 /api/me carries createdAt and Getting started, ticking as things are done', async () => {
    const a = await person();
    const b = await person();
    const first = await me(a.jar);
    expect(Date.parse(first.user.createdAt)).toBeGreaterThan(Date.now() - 60_000);
    expect(first.firstSignIn).toBe(true);
    // Signing in again, however soon, is returning.
    const again = await signIn(server, a.email);
    expect((await me(again.jar)).firstSignIn).toBe(false);
    expect((await me(a.jar)).firstSignIn).toBe(true);
    expect(first.gettingStarted).toEqual({ open: true, done: none });

    await sync(a, [m('me.rename', { id: a.userId, name: 'Rohit' })]);
    expect((await me(a.jar)).gettingStarted.done).toEqual({ ...none, name: true });

    // A task sent to b and accepted is b's to do, not b's own writing.
    const made = await post(
      server.app,
      '/api/spaces',
      { name: 'Northwind', color: '#3d5a80', invites: [b.email] },
      a.jar,
    );
    const space = ((await made.json()) as { space: SpaceSummary }).space;
    expect((await post(server.app, `/api/join/${joinToken(b.email)}`, {}, b.jar)).status).toBe(200);
    const reqId = randomUUID();
    await sync(a, [
      m('request.send', {
        id: reqId,
        spaceId: space.id,
        toId: b.userId,
        title: 'Book rooms',
        askedDay: null,
      }),
    ]);
    await sync(b, [m('request.accept', { id: reqId, taskId: randomUUID(), day: null })]);
    expect((await me(b.jar)).gettingStarted.done.task).toBe(false);

    await sync(a, [
      m('task.create', { id: randomUUID(), spaceId: a.personalId, title: 'Call Meera', day: '2026-10-18' }),
    ]);
    expect((await me(a.jar)).gettingStarted.done).toEqual({ ...none, name: true, task: true });

    const jira = await post(
      server.app,
      '/api/connectors/jira',
      { site: JIRA_TEST_SITE, token: `good-${randomUUID()}` },
      a.jar,
    );
    expect(jira.status).toBe(200);
    expect((await me(a.jar)).gettingStarted).toEqual({
      open: true,
      done: { name: true, task: true, theme: false, jira: true },
    });
    // b's own read never shows a's flags.
    expect((await me(b.jar)).gettingStarted).toEqual({ open: true, done: none });

    // The joined space says who sent the invite; a's own space says nothing.
    const bSpace = (await me(b.jar)).spaces.find((s) => s.id === space.id)!;
    expect(bSpace.joined).toEqual({ by: 'Rohit' });
    expect((await me(a.jar)).spaces.find((s) => s.id === space.id)!.joined).toBeUndefined();
  });

  it('C12-A02 records a theme pick or a hide, once, for that person only', async () => {
    const a = await person();
    const b = await person();

    const theme = await record(a, { theme: true });
    expect(theme.status).toBe(200);
    expect(((await theme.json()) as { gettingStarted: GettingStarted }).gettingStarted.done.theme).toBe(true);
    const firstRun = async () =>
      (await server.db.select().from(schema.user).where(eq(schema.user.id, a.userId)))[0]!.firstRun;
    const before = await firstRun();
    expect((await record(a, { theme: true })).status).toBe(200);
    const after = await firstRun();
    // Asking again keeps the first time.
    expect(before?.themeAt).toBeTruthy();
    expect(after?.themeAt).toBe(before?.themeAt);

    expect((await record(a, { hidden: true })).status).toBe(200);
    expect((await record(a, { hidden: true })).status).toBe(200);
    const mine = await me(a.jar);
    expect(mine.gettingStarted.open).toBe(false);
    expect(mine.gettingStarted.done.theme).toBe(true);

    for (const bad of [{}, { theme: false }, { hidden: 1 }, { theme: true, hidden: true }, { other: true }])
      expect((await record(a, bad)).status).toBe(400);
    const raw = await server.app.request('/api/me/getting-started', {
      method: 'POST',
      headers: {
        origin: 'http://localhost:5173',
        cookie: a.jar.header(),
        'content-type': 'application/json',
      },
      body: 'not json',
    });
    expect(raw.status).toBe(400);
    expect((await record(null, { hidden: true })).status).toBe(401);

    expect((await me(b.jar)).gettingStarted).toEqual({ open: true, done: none });
  });

  it('C12-A03 migration 0009 adds first_run, null for everyone already there', async () => {
    const base = inject('databaseUrl');
    const name = `tudu_m0009_${Date.now().toString(36)}`;
    const admin = createDb(base, { max: 1 });
    await admin.db.execute(sql.raw(`CREATE DATABASE "${name}"`));
    const url = new URL(base);
    url.pathname = `/${name}`;
    const c = createDb(url.toString(), { max: 1 });
    try {
      // Every migration up to 0008, then someone signs up, then 0009.
      const files = readdirSync(MIGRATIONS_DIR)
        .filter((f) => f.endsWith('.sql'))
        .sort();
      const upTo = files.findIndex((f) => f.startsWith('0009_'));
      expect(upTo).toBeGreaterThan(0);
      const run = async (f: string) => {
        for (const stmt of readFileSync(join(MIGRATIONS_DIR, f), 'utf8').split('--> statement-breakpoint'))
          if (stmt.trim()) await c.db.execute(sql.raw(stmt));
      };
      for (const f of files.slice(0, upTo)) await run(f);
      await c.db.execute(
        sql.raw(
          `INSERT INTO "user" (id, name, email, email_verified) VALUES ('u1', 'Rohit', 'r@test.tudu', true)`,
        ),
      );
      await run(files[upTo]!);
      const out = await c.db.execute(sql.raw(`SELECT first_run FROM "user" WHERE id = 'u1'`));
      expect(out.rows).toEqual([{ first_run: null }]);
    } finally {
      await c.close();
      await admin.db.execute(sql.raw(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`));
      await admin.close();
    }
  });
});
