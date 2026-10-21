import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type {
  JiraConnectionResponse,
  JiraIssueDetail,
  JiraIssuesResponse,
  JiraLinksResponse,
  JiraView,
  SpaceSummary,
  SyncResponse,
  TaskDetail,
} from '@tudu/core';
import { and, eq, schema } from '@tudu/db';
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

async function person(): Promise<Person> {
  const { jar, email } = await signIn(server);
  const res = await get(server.app, '/api/me', jar);
  const m = (await res.json()) as { user: { id: string }; spaces: SpaceSummary[] };
  return { jar, email, userId: m.user.id, personalId: m.spaces[0]!.id };
}

function call(method: string, path: string, jar: Jar, body?: unknown): Promise<Response> {
  return Promise.resolve(
    server.app.request(path, {
      method,
      headers: {
        origin: 'http://localhost:5173',
        cookie: jar.header(),
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
}

const good = () => `good-${randomUUID()}`;

async function connect(p: Person, spaceId = p.personalId, token = good()) {
  const res = await post(server.app, `/api/spaces/${spaceId}/jira`, { site: JIRA_TEST_SITE, token }, p.jar);
  return {
    res,
    token,
    body: (await res.json()) as JiraConnectionResponse & { error?: string; code?: string; field?: string },
  };
}

async function sync(p: Person, mutations: unknown[]): Promise<SyncResponse> {
  const res = await post(server.app, '/api/sync', { clientId: 'c1', mutations }, p.jar);
  expect(res.status).toBe(200);
  return (await res.json()) as SyncResponse;
}

const at = () => new Date().toISOString();

function create(spaceId: string, extra: Record<string, unknown> = {}) {
  const id = randomUUID();
  return {
    id,
    m: {
      id: randomUUID(),
      at: at(),
      type: 'task.create',
      payload: { id, spaceId, title: 'From Jira', day: '2026-10-18', position: null, ...extra },
    },
  };
}

async function teamSpace(a: Person, b: Person): Promise<string> {
  const res = await post(
    server.app,
    '/api/spaces',
    { name: `Northwind ${randomUUID().slice(0, 6)}`, color: '#8a9a8b' },
    a.jar,
  );
  const { space } = (await res.json()) as { space: { id: string } };
  await post(server.app, `/api/spaces/${space.id}/invites`, { emails: [b.email] }, a.jar);
  const mail = server.outbox
    .to(b.email)
    .filter((m) => /invited you/.test(m.subject))
    .at(-1)!;
  const token = /\/join\/([A-Za-z0-9_-]+)/.exec(mail.text)![1]!;
  expect((await post(server.app, `/api/join/${token}`, {}, b.jar)).status).toBe(200);
  return space.id;
}

async function links(p: Person, spaceId = p.personalId) {
  return (
    (await (await get(server.app, `/api/spaces/${spaceId}/jira/links`, p.jar)).json()) as JiraLinksResponse
  ).links;
}

describe('Jira (chunk 10)', () => {
  it('C10-A01 connect stores the token sealed, refuses each bad case under its field, replaces on a second connect', async () => {
    const a = await person();
    const { res, token, body } = await connect(a);
    expect(res.status).toBe(200);
    expect(body).toMatchObject({
      connected: true,
      site: JIRA_TEST_SITE,
      state: 'ok',
      who: { name: 'Asha Rao', email: 'asha@northwind.io' },
    });
    expect(JSON.stringify(body)).not.toContain(token);
    const [row] = await server.db
      .select()
      .from(schema.jiraConnections)
      .where(eq(schema.jiraConnections.userId, a.userId));
    expect(row!.tokenSealed).not.toContain(token);
    expect(row!.tokenSealed.startsWith('v1.')).toBe(true);

    const bad = async (site: string, tok: string) => {
      const r = await post(server.app, `/api/spaces/${a.personalId}/jira`, { site, token: tok }, a.jar);
      return { status: r.status, ...((await r.json()) as { code: string; field: string; error: string }) };
    };
    expect(await bad('jira.northwind', good())).toMatchObject({
      status: 400,
      code: 'not-address',
      field: 'site',
    });
    expect(await bad(JIRA_TEST_SITE, 'short')).toMatchObject({
      status: 400,
      code: 'token-refused',
      field: 'token',
    });
    expect(await bad('http://nowhere.example:9', good())).toMatchObject({
      status: 502,
      code: 'unreachable',
      field: 'site',
    });
    expect(await bad(JIRA_TEST_SITE, `noread-${randomUUID()}`)).toMatchObject({
      status: 400,
      code: 'no-read',
      field: 'token',
    });
    expect(await bad(`${JIRA_TEST_SITE}/nope`, good())).toMatchObject({ code: 'unreachable', field: 'site' });
    expect(await bad(JIRA_TEST_SITE, '  ')).toMatchObject({ field: 'token' });

    const second = await connect(a);
    expect(second.res.status).toBe(200);
    const rows = await server.db
      .select()
      .from(schema.jiraConnections)
      .where(eq(schema.jiraConnections.userId, a.userId));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.tokenSealed).not.toBe(row!.tokenSealed);

    // Staging's demo Jira: the same fake under /demo-jira when DEMO_JIRA=1, and nowhere without it.
    const demo = startServer({ DEMO_JIRA: '1' });
    const asked = await demo.app.request('/demo-jira/rest/api/2/myself', {
      headers: { authorization: 'Bearer good-x' },
    });
    expect(asked.status).toBe(200);
    await demo.close();
    expect((await server.app.request('/demo-jira/rest/api/2/myself')).status).toBe(404);

    const stranger = await person();
    const r = await post(
      server.app,
      `/api/spaces/${a.personalId}/jira`,
      { site: JIRA_TEST_SITE, token: good() },
      stranger.jar,
    );
    expect(r.status).toBe(403);
  });

  it('C10-A02 the connection read: site, who, views and the count; nothing connected; per person and per space', async () => {
    const a = await person();
    const b = await person();
    const none = (await (
      await get(server.app, `/api/spaces/${a.personalId}/jira`, a.jar)
    ).json()) as JiraConnectionResponse;
    expect(none).toEqual({ connected: false });
    await connect(a);
    const read = (await (await get(server.app, `/api/spaces/${a.personalId}/jira`, a.jar)).json()) as Extract<
      JiraConnectionResponse,
      { connected: true }
    >;
    // Seven unresolved issues assigned to "you" in the fake Jira.
    expect(read.count).toBe(7);
    expect(read.assigned).toHaveLength(7);
    expect(read.syncedAt).toBeTruthy();
    expect(read.views).toEqual([]);

    // An open linked task takes one off the count; crossing it off puts it back.
    const t = create(a.personalId, { jira: 'TUDU-212', source: 'jira' });
    await sync(a, [t.m]);
    const after = (await (await get(server.app, `/api/spaces/${a.personalId}/jira`, a.jar)).json()) as {
      count: number;
    };
    expect(after.count).toBe(6);
    await sync(a, [{ id: randomUUID(), at: at(), type: 'task.cross', payload: { id: t.id, done: true } }]);
    expect(
      ((await (await get(server.app, `/api/spaces/${a.personalId}/jira`, a.jar)).json()) as { count: number })
        .count,
    ).toBe(7);

    // A team space connects separately, and a colleague's connection is theirs.
    const team = await teamSpace(a, b);
    expect(
      ((await (await get(server.app, `/api/spaces/${team}/jira`, a.jar)).json()) as JiraConnectionResponse)
        .connected,
    ).toBe(false);
    await connect(b, team);
    expect(
      ((await (await get(server.app, `/api/spaces/${team}/jira`, a.jar)).json()) as JiraConnectionResponse)
        .connected,
    ).toBe(false);
    expect(
      ((await (await get(server.app, `/api/spaces/${team}/jira`, b.jar)).json()) as JiraConnectionResponse)
        .connected,
    ).toBe(true);
  });

  it('C10-A03 issues: the assigned view and a custom JQL in Jira order, the JQL error, expiry, Jira unreachable', async () => {
    const a = await person();
    const { token } = await connect(a);
    const base = `/api/spaces/${a.personalId}/jira/issues`;
    const assigned = (await (
      await get(server.app, `${base}?view=assigned`, a.jar)
    ).json()) as JiraIssuesResponse;
    expect(assigned.issues.map((i) => i.key)).toEqual([
      'TUDU-212',
      'TUDU-219',
      'TUDU-220',
      'TUDU-224',
      'OPS-14',
      'TUDU-226',
      'TUDU-231',
    ]);
    expect(assigned.issues[0]).toEqual({
      key: 'TUDU-212',
      summary: 'Make the Jira panel remember the last view',
      status: 'In progress',
      due: '2026-10-22',
      updated: '2026-10-18T08:40:00.000Z',
    });
    const bugs = (await (
      await get(
        server.app,
        `${base}?jql=${encodeURIComponent('issuetype = Bug ORDER BY updated DESC')}`,
        a.jar,
      )
    ).json()) as JiraIssuesResponse;
    expect(bugs.issues.map((i) => i.key)).toEqual(['TUDU-219', 'TUDU-240']);

    const typo = await get(server.app, `${base}?jql=${encodeURIComponent('stauts = Done')}`, a.jar);
    expect(typo.status).toBe(400);
    expect(await typo.json()).toMatchObject({ code: 'jql', error: expect.stringContaining('stauts') });
    const open = await get(server.app, `${base}?jql=${encodeURIComponent('summary ~ "date')}`, a.jar);
    expect(await open.json()).toMatchObject({
      code: 'jql',
      error: expect.stringContaining('has not been completed'),
    });

    await post(server.app, '/__test/jira/down', { token }, a.jar);
    const down = await get(server.app, `${base}?view=assigned`, a.jar);
    expect(down.status).toBe(502);
    expect(await down.json()).toMatchObject({ code: 'unreachable' });
    await post(server.app, '/__test/jira/down', { token, down: false }, a.jar);

    await post(server.app, '/__test/jira/expire', { token }, a.jar);
    const gone = await get(server.app, `${base}?view=assigned`, a.jar);
    expect(gone.status).toBe(401);
    expect(await gone.json()).toMatchObject({ code: 'expired', error: 'Your Jira token has expired.' });
    const read = (await (await get(server.app, `/api/spaces/${a.personalId}/jira`, a.jar)).json()) as {
      state: string;
      count: null;
    };
    expect(read).toMatchObject({ state: 'expired', count: null });
  });

  it('C10-A04 the preview: facts, cleaned description, comments oldest first; search across Jira; an unknown key is 404', async () => {
    const a = await person();
    await connect(a);
    const d = (await (
      await get(server.app, `/api/spaces/${a.personalId}/jira/issues/tudu-212`, a.jar)
    ).json()) as JiraIssueDetail;
    expect(d).toMatchObject({
      key: 'TUDU-212',
      issuetype: 'Story',
      assignee: 'Asha Rao',
      priority: 'High',
      status: 'In progress',
      due: '2026-10-22',
      commentTotal: 5,
    });
    expect(d.description).toContain('<ul><li>Per browser</li>');
    expect(d.comments.map((c) => c.who)).toEqual([
      'Meera Iyer',
      'Asha Rao',
      'Meera Iyer',
      'Arjun Mehta',
      'Meera Iyer',
    ]);
    expect(d.comments[0]!.html).toBe('<p>Is this per space or per browser?</p>');

    const search = async (q: string) =>
      (
        (await (
          await get(server.app, `/api/spaces/${a.personalId}/jira/search?q=${encodeURIComponent(q)}`, a.jar)
        ).json()) as JiraIssuesResponse
      ).issues.map((i) => i.key);
    expect(await search('OPS-14')).toEqual(['OPS-14']);
    expect(await search('staging')).toEqual(['OPS-14', 'TUDU-226']);
    expect(await search('nothing like this')).toEqual([]);

    expect((await get(server.app, `/api/spaces/${a.personalId}/jira/issues/NOPE-1`, a.jar)).status).toBe(404);
  });

  it('C10-A05 links: your tasks with a key, with day, title and done; a colleague’s is not yours; reads follow changes', async () => {
    const a = await person();
    const b = await person();
    const team = await teamSpace(a, b);
    await connect(a, team);
    const mine = create(team, { jira: 'TUDU-219', source: 'jira', title: 'Fix the date picker on Safari' });
    const theirs = create(team, { jira: 'TUDU-219', source: 'jira' });
    await sync(a, [mine.m]);
    await sync(b, [theirs.m]);
    const ls = await links(a, team);
    expect(ls).toHaveLength(1);
    expect(ls[0]).toMatchObject({
      key: 'TUDU-219',
      taskId: mine.id,
      title: 'Fix the date picker on Safari',
      day: '2026-10-18',
      done: false,
    });
    expect(ls[0]!.ref).toMatch(/^[A-Z]+-\d+$/);
    await sync(a, [
      { id: randomUUID(), at: at(), type: 'task.place', payload: { id: mine.id, day: null, position: null } },
    ]);
    expect((await links(a, team))[0]).toMatchObject({ day: null });
    await sync(a, [{ id: randomUUID(), at: at(), type: 'task.delete', payload: { id: mine.id } }]);
    expect(await links(a, team)).toEqual([]);
  });

  it('C10-A06 task.create with a key and task.jira link and unlink with their history; idempotent; refusals', async () => {
    const a = await person();
    const b = await person();
    const t = create(a.personalId, {
      jira: 'tudu-224',
      source: 'jira',
      title: 'Write the release notes for 0.38',
    });
    const r1 = await sync(a, [t.m]);
    expect(r1.tasks[0]!.jira).toBe('TUDU-224');
    let d = (await (
      await get(server.app, `/api/spaces/${a.personalId}/tasks/${t.id}`, a.jar)
    ).json()) as TaskDetail;
    expect(d.history[0]).toMatchObject({ kind: 'created', source: 'jira', key: 'TUDU-224' });

    const unlink = { id: randomUUID(), at: at(), type: 'task.jira', payload: { id: t.id, jira: null } };
    const r2 = await sync(a, [unlink, unlink]);
    expect(r2.results.map((r) => r.status)).toEqual(['ok', 'ok']);
    const link = { id: randomUUID(), at: at(), type: 'task.jira', payload: { id: t.id, jira: 'ops-14' } };
    await sync(a, [link]);
    d = (await (
      await get(server.app, `/api/spaces/${a.personalId}/tasks/${t.id}`, a.jar)
    ).json()) as TaskDetail;
    expect(d.jira).toBe('OPS-14');
    expect(d.history.filter((e) => e.kind.startsWith('jira.'))).toMatchObject([
      { kind: 'jira.unlinked', key: 'TUDU-224' },
      { kind: 'jira.linked', key: 'OPS-14' },
    ]);

    const bad = await sync(a, [
      { id: randomUUID(), at: at(), type: 'task.jira', payload: { id: t.id, jira: 'not a key' } },
    ]);
    expect(bad.results[0]).toMatchObject({ status: 'rejected', code: 400 });

    const team = await teamSpace(a, b);
    const theirs = create(team);
    await sync(b, [theirs.m]);
    const no = await sync(a, [
      { id: randomUUID(), at: at(), type: 'task.jira', payload: { id: theirs.id, jira: 'TUDU-1' } },
    ]);
    expect(no.results[0]).toMatchObject({ status: 'rejected', code: 403 });
  });

  it('C10-A07 views: save, list in order, remove; a name twice is refused; they go with the connection', async () => {
    const a = await person();
    await connect(a);
    const base = `/api/spaces/${a.personalId}/jira/views`;
    const save = async (name: string, jql: string, index?: number) => {
      const r = await post(server.app, base, { name, jql, index }, a.jar);
      return { status: r.status, body: (await r.json()) as JiraView & { code?: string } };
    };
    const one = await save('My open bugs', 'issuetype = Bug AND resolution = Unresolved');
    expect(one.status).toBe(201);
    await save('Ops', 'project = OPS');
    expect((await save('my open bugs', 'project = TUDU')).body).toMatchObject({ code: 'name-taken' });
    const read = async () =>
      (
        (await (await get(server.app, `/api/spaces/${a.personalId}/jira`, a.jar)).json()) as {
          views: JiraView[];
        }
      ).views.map((v) => v.name);
    expect(await read()).toEqual(['My open bugs', 'Ops']);
    const list = (await (
      await get(server.app, `/api/spaces/${a.personalId}/jira/issues?view=${one.body.id}`, a.jar)
    ).json()) as JiraIssuesResponse;
    expect(list.issues.map((i) => i.key)).toEqual(['TUDU-219', 'TUDU-240']);
    expect((await call('DELETE', `${base}/${one.body.id}`, a.jar)).status).toBe(204);
    expect(await read()).toEqual(['Ops']);
    // Undo puts it back in its place.
    await save('My open bugs', 'issuetype = Bug AND resolution = Unresolved', 0);
    expect(await read()).toEqual(['My open bugs', 'Ops']);
    await call('DELETE', `/api/spaces/${a.personalId}/jira`, a.jar);
    const [row] = await server.db
      .select({ n: schema.jiraViews.id })
      .from(schema.jiraViews)
      .innerJoin(schema.jiraConnections, eq(schema.jiraConnections.id, schema.jiraViews.connectionId))
      .where(eq(schema.jiraConnections.userId, a.userId));
    expect(row).toBeUndefined();
  });

  it('C10-A08 disconnect: views gone, tasks keep their keys; reconnecting after an expiry keeps the views', async () => {
    const a = await person();
    const { token } = await connect(a);
    await post(
      server.app,
      `/api/spaces/${a.personalId}/jira/views`,
      { name: 'Ops', jql: 'project = OPS' },
      a.jar,
    );
    await post(server.app, '/__test/jira/expire', { token }, a.jar);
    await get(server.app, `/api/spaces/${a.personalId}/jira/issues?view=assigned`, a.jar);
    const again = await connect(a);
    expect(again.body).toMatchObject({ state: 'ok', views: [{ name: 'Ops' }] });

    const t = create(a.personalId, { jira: 'TUDU-220', source: 'jira' });
    await sync(a, [t.m]);
    const [conn] = await server.db
      .select()
      .from(schema.jiraConnections)
      .where(eq(schema.jiraConnections.userId, a.userId));
    expect((await call('DELETE', `/api/spaces/${a.personalId}/jira`, a.jar)).status).toBe(204);
    expect(
      (
        (await (
          await get(server.app, `/api/spaces/${a.personalId}/jira`, a.jar)
        ).json()) as JiraConnectionResponse
      ).connected,
    ).toBe(false);
    const [task] = await server.db
      .select({ k: schema.tasks.jiraKey })
      .from(schema.tasks)
      .where(and(eq(schema.tasks.id, t.id)));
    expect(task!.k).toBe('TUDU-220');
    expect(
      await server.db.select().from(schema.jiraViews).where(eq(schema.jiraViews.connectionId, conn!.id)),
    ).toEqual([]);
    // The links read still answers from Tudu's own database.
    expect((await links(a)).map((l) => l.key)).toEqual(['TUDU-220']);
  });
});
