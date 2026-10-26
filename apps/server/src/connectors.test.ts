import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type {
  ConnectorChangedEvent,
  ConnectorSpacesResponse,
  JiraConnectionResponse,
  JiraIssueDetail,
  JiraIssuesResponse,
  JiraLinksResponse,
  JiraView,
  SearchResponse,
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
const JIRA = '/api/connectors/jira';
const inSpace = (spaceId: string) => `/api/spaces/${spaceId}/connectors/jira`;

/** Connect Jira for the account; from a space by default, which turns it on there. */
async function connect(p: Person, spaceId: string | null = p.personalId, token = good()) {
  const res = await post(
    server.app,
    JIRA,
    { site: JIRA_TEST_SITE, token, ...(spaceId ? { spaceId } : {}) },
    p.jar,
  );
  return {
    res,
    token,
    body: (await res.json()) as JiraConnectionResponse & { error?: string; code?: string; field?: string },
  };
}

async function read(p: Person) {
  return (await (await get(server.app, JIRA, p.jar)).json()) as JiraConnectionResponse & {
    count?: number | null;
    state?: string;
    onIn?: number;
    views?: JiraView[];
  };
}

const turn = (p: Person, spaceId: string, on: boolean) => call('PUT', inSpace(spaceId), p.jar, { on });

async function spaces(p: Person) {
  return ((await (await get(server.app, `${JIRA}/spaces`, p.jar)).json()) as ConnectorSpacesResponse).spaces;
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

const linkedTo = (key: string) => ({ link: { provider: 'jira', key }, source: 'connector' });

async function teamSpace(a: Person, ...others: Person[]): Promise<string> {
  const res = await post(
    server.app,
    '/api/spaces',
    { name: `Northwind ${randomUUID().slice(0, 6)}`, color: '#8a9a8b' },
    a.jar,
  );
  const { space } = (await res.json()) as { space: { id: string } };
  for (const b of others) await invite(a, b, space.id);
  return space.id;
}

async function invite(a: Person, b: Person, spaceId: string) {
  await post(server.app, `/api/spaces/${spaceId}/invites`, { emails: [b.email] }, a.jar);
  const mail = server.outbox
    .to(b.email)
    .filter((m) => /invited you/.test(m.subject))
    .at(-1)!;
  const token = /\/join\/([A-Za-z0-9_-]+)/.exec(mail.text)![1]!;
  expect((await post(server.app, `/api/join/${token}`, {}, b.jar)).status).toBe(200);
}

async function links(p: Person) {
  return ((await (await get(server.app, `${JIRA}/links`, p.jar)).json()) as JiraLinksResponse).links;
}

function events(userId: string) {
  const seen: Array<{ type: string; data: unknown }> = [];
  const off = server.hub.subscribe(userId, (e) => seen.push({ type: e.type, data: e.data }));
  return { seen, off };
}

describe('Jira (chunk 10), once per account and on per space', () => {
  it('C10-A01 connect stores the token sealed, refuses each bad case under its field, replaces on a second connect', async () => {
    const a = await person();
    const { res, token, body } = await connect(a);
    expect(res.status).toBe(200);
    expect(body).toMatchObject({
      connected: true,
      site: JIRA_TEST_SITE,
      state: 'ok',
      who: { name: 'Asha Rao', email: 'asha@northwind.io' },
      onIn: 1,
    });
    expect(JSON.stringify(body)).not.toContain(token);
    const [row] = await server.db
      .select()
      .from(schema.connections)
      .where(eq(schema.connections.userId, a.userId));
    expect(row!.provider).toBe('jira');
    expect(row!.tokenSealed).not.toContain(token);
    expect(row!.tokenSealed.startsWith('v1.')).toBe(true);

    const bad = async (site: string, tok: string) => {
      const r = await post(server.app, JIRA, { site, token: tok }, a.jar);
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

    const second = await connect(a, null);
    expect(second.res.status).toBe(200);
    const rows = await server.db
      .select()
      .from(schema.connections)
      .where(eq(schema.connections.userId, a.userId));
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

    // Connecting from a space you are not in is refused, and nothing is kept.
    const stranger = await person();
    const r = await post(
      server.app,
      JIRA,
      { site: JIRA_TEST_SITE, token: good(), spaceId: a.personalId },
      stranger.jar,
    );
    expect(r.status).toBe(403);
    expect((await read(stranger)).connected).toBe(false);
  });

  it('C10-A02 the connection read: site, who, views and the count across your spaces; nothing connected', async () => {
    const a = await person();
    const b = await person();
    expect(await read(a)).toEqual({ connected: false });
    await connect(a);
    const r = await read(a);
    // Seven unresolved issues assigned to "you" in the fake Jira.
    expect(r).toMatchObject({ count: 7, views: [], onIn: 1 });
    expect((r as { assigned: string[] }).assigned).toHaveLength(7);

    // An open linked task takes one off the count; crossing it off puts it back.
    const t = create(a.personalId, linkedTo('TUDU-212'));
    await sync(a, [t.m]);
    expect((await read(a)).count).toBe(6);
    await sync(a, [{ id: randomUUID(), at: at(), type: 'task.cross', payload: { id: t.id, done: true } }]);
    expect((await read(a)).count).toBe(7);

    // A linked task in a team space counts too, even with Jira off there.
    const team = await teamSpace(a, b);
    await sync(a, [create(team, linkedTo('TUDU-219')).m]);
    expect((await read(a)).count).toBe(6);
    // The colleague has nothing of yours.
    expect(await read(b)).toEqual({ connected: false });
  });

  it('C10-A03 issues: the assigned view and a custom JQL in Jira order, the JQL error, expiry, Jira unreachable', async () => {
    const a = await person();
    const { token } = await connect(a);
    const base = `${inSpace(a.personalId)}/issues`;
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
    expect(await read(a)).toMatchObject({ state: 'expired', count: null });
  });

  it('C10-A04 the preview: facts, cleaned description, comments oldest first; search across Jira; an unknown key is 404', async () => {
    const a = await person();
    await connect(a);
    const d = (await (
      await get(server.app, `${inSpace(a.personalId)}/issues/tudu-212`, a.jar)
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
          await get(server.app, `${inSpace(a.personalId)}/search?q=${encodeURIComponent(q)}`, a.jar)
        ).json()) as JiraIssuesResponse
      ).issues.map((i) => i.key);
    expect(await search('OPS-14')).toEqual(['OPS-14']);
    expect(await search('staging')).toEqual(['OPS-14', 'TUDU-226']);
    expect(await search('nothing like this')).toEqual([]);

    expect((await get(server.app, `${inSpace(a.personalId)}/issues/NOPE-1`, a.jar)).status).toBe(404);
  });

  it('C10-A05 links: your tasks with a key, with day, title and done; a colleague’s is not yours; reads follow changes', async () => {
    const a = await person();
    const b = await person();
    const team = await teamSpace(a, b);
    await connect(a, team);
    const mine = create(team, { ...linkedTo('TUDU-219'), title: 'Fix the date picker on Safari' });
    const theirs = create(team, linkedTo('TUDU-219'));
    await sync(a, [mine.m]);
    await sync(b, [theirs.m]);
    const ls = await links(a);
    expect(ls).toHaveLength(1);
    expect(ls[0]).toMatchObject({
      key: 'TUDU-219',
      taskId: mine.id,
      spaceId: team,
      title: 'Fix the date picker on Safari',
      day: '2026-10-18',
      done: false,
    });
    expect(ls[0]!.ref).toMatch(/^[A-Z]+-\d+$/);
    await sync(a, [
      { id: randomUUID(), at: at(), type: 'task.place', payload: { id: mine.id, day: null, position: null } },
    ]);
    expect((await links(a))[0]).toMatchObject({ day: null });
    await sync(a, [{ id: randomUUID(), at: at(), type: 'task.delete', payload: { id: mine.id } }]);
    expect(await links(a)).toEqual([]);
  });

  it('C10-A06 task.create with a link and task.link link and unlink with their history; idempotent; refusals; task.jira still works', async () => {
    const a = await person();
    const b = await person();
    const t = create(a.personalId, { ...linkedTo('tudu-224'), title: 'Write the release notes for 0.38' });
    const r1 = await sync(a, [t.m]);
    expect(r1.tasks[0]).toMatchObject({ links: [{ provider: 'jira', key: 'TUDU-224' }], jira: 'TUDU-224' });
    const detail = async () =>
      (await (
        await get(server.app, `/api/spaces/${a.personalId}/tasks/${t.id}`, a.jar)
      ).json()) as TaskDetail;
    expect((await detail()).history[0]).toMatchObject({
      kind: 'created',
      source: 'connector',
      provider: 'jira',
      key: 'TUDU-224',
    });

    const unlink = {
      id: randomUUID(),
      at: at(),
      type: 'task.link',
      payload: { id: t.id, provider: 'jira', key: null },
    };
    const r2 = await sync(a, [unlink, unlink]);
    expect(r2.results.map((r) => r.status)).toEqual(['ok', 'ok']);
    expect((await detail()).links).toEqual([]);
    const link = {
      id: randomUUID(),
      at: at(),
      type: 'task.link',
      payload: { id: t.id, provider: 'jira', key: 'ops-14' },
    };
    await sync(a, [link]);
    let d = await detail();
    expect(d).toMatchObject({ links: [{ provider: 'jira', key: 'OPS-14' }], jira: 'OPS-14' });
    expect(d.history.filter((e) => e.kind.startsWith('link.'))).toMatchObject([
      { kind: 'link.removed', provider: 'jira', key: 'TUDU-224' },
      { kind: 'link.added', provider: 'jira', key: 'OPS-14' },
    ]);

    // A client from before connectors: task.jira and a create with `jira` land as links.
    await sync(a, [
      { id: randomUUID(), at: at(), type: 'task.jira', payload: { id: t.id, jira: 'tudu-226' } },
    ]);
    d = await detail();
    expect(d.links).toEqual([{ provider: 'jira', key: 'TUDU-226' }]);
    const old = create(a.personalId, { jira: 'tudu-231', source: 'jira' });
    const r3 = await sync(a, [old.m]);
    expect(r3.tasks[0]).toMatchObject({ links: [{ provider: 'jira', key: 'TUDU-231' }] });

    for (const payload of [
      { id: t.id, provider: 'jira', key: 'not a key' },
      { id: t.id, provider: 'linear', key: 'ENG-1' },
    ]) {
      const bad = await sync(a, [{ id: randomUUID(), at: at(), type: 'task.link', payload }]);
      expect(bad.results[0]).toMatchObject({ status: 'rejected', code: 400 });
    }

    const team = await teamSpace(a, b);
    const theirs = create(team);
    await sync(b, [theirs.m]);
    const no = await sync(a, [
      {
        id: randomUUID(),
        at: at(),
        type: 'task.link',
        payload: { id: theirs.id, provider: 'jira', key: 'TUDU-1' },
      },
    ]);
    expect(no.results[0]).toMatchObject({ status: 'rejected', code: 403 });
  });

  it('C10-A07 views: save, list in order, remove; a name twice is refused; one set for every space; they go with the connection', async () => {
    const a = await person();
    const b = await person();
    await connect(a);
    const base = `${JIRA}/views`;
    const save = async (name: string, jql: string, index?: number) => {
      const r = await post(server.app, base, { name, jql, index }, a.jar);
      return { status: r.status, body: (await r.json()) as JiraView & { code?: string } };
    };
    const one = await save('My open bugs', 'issuetype = Bug AND resolution = Unresolved');
    expect(one.status).toBe(201);
    await save('Ops', 'project = OPS');
    expect((await save('my open bugs', 'project = TUDU')).body).toMatchObject({ code: 'name-taken' });
    const names = async () => (await read(a)).views!.map((v) => v.name);
    expect(await names()).toEqual(['My open bugs', 'Ops']);
    const list = (await (
      await get(server.app, `${inSpace(a.personalId)}/issues?view=${one.body.id}`, a.jar)
    ).json()) as JiraIssuesResponse;
    expect(list.issues.map((i) => i.key)).toEqual(['TUDU-219', 'TUDU-240']);
    // The same view answers in another space with Jira on.
    const team = await teamSpace(a, b);
    await turn(a, team, true);
    const there = (await (
      await get(server.app, `${inSpace(team)}/issues?view=${one.body.id}`, a.jar)
    ).json()) as JiraIssuesResponse;
    expect(there.issues.map((i) => i.key)).toEqual(['TUDU-219', 'TUDU-240']);
    expect((await call('DELETE', `${base}/${one.body.id}`, a.jar)).status).toBe(204);
    expect(await names()).toEqual(['Ops']);
    // Undo puts it back in its place.
    await save('My open bugs', 'issuetype = Bug AND resolution = Unresolved', 0);
    expect(await names()).toEqual(['My open bugs', 'Ops']);
    await call('DELETE', JIRA, a.jar);
    const [row] = await server.db
      .select({ n: schema.connectionViews.id })
      .from(schema.connectionViews)
      .innerJoin(schema.connections, eq(schema.connections.id, schema.connectionViews.connectionId))
      .where(eq(schema.connections.userId, a.userId));
    expect(row).toBeUndefined();
  });

  it('C10-A08 disconnect: views and switches gone, tasks keep their links; reconnecting after an expiry keeps the views', async () => {
    const a = await person();
    const { token } = await connect(a);
    await post(server.app, `${JIRA}/views`, { name: 'Ops', jql: 'project = OPS' }, a.jar);
    await post(server.app, '/__test/jira/expire', { token }, a.jar);
    await get(server.app, `${inSpace(a.personalId)}/issues?view=assigned`, a.jar);
    const again = await connect(a, null);
    expect(again.body).toMatchObject({ state: 'ok', views: [{ name: 'Ops' }], onIn: 1 });

    const t = create(a.personalId, linkedTo('TUDU-220'));
    await sync(a, [t.m]);
    const [conn] = await server.db
      .select()
      .from(schema.connections)
      .where(eq(schema.connections.userId, a.userId));
    expect((await call('DELETE', JIRA, a.jar)).status).toBe(204);
    expect((await read(a)).connected).toBe(false);
    const kept = await server.db.select().from(schema.taskLinks).where(eq(schema.taskLinks.taskId, t.id));
    expect(kept.map((l) => l.key)).toEqual(['TUDU-220']);
    expect(
      await server.db
        .select()
        .from(schema.connectionViews)
        .where(eq(schema.connectionViews.connectionId, conn!.id)),
    ).toEqual([]);
    expect(
      await server.db
        .select()
        .from(schema.connectionSpaces)
        .where(eq(schema.connectionSpaces.userId, a.userId)),
    ).toEqual([]);
    // The links read still answers from Tudu's own database.
    expect((await links(a)).map((l) => l.key)).toEqual(['TUDU-220']);
    // Connecting again turns on only the space you connect from.
    const b = await person();
    const team = await teamSpace(a, b);
    await connect(a, team);
    expect((await spaces(a)).filter((s) => s.on).map((s) => s.id)).toEqual([team]);
  });

  it('C10-A10 one connection, switched per space: off is 404 off-here with no Jira read; on, the same read answers', async () => {
    const a = await person();
    const b = await person();
    const team = await teamSpace(a, b);
    const { token } = await connect(a);
    expect((await spaces(a)).map((s) => [s.id, s.on])).toEqual([
      [a.personalId, true],
      [team, false],
    ]);
    // Off in Northwind: refused before Jira is asked. An expired token would answer `expired`; it says off-here.
    await post(server.app, '/__test/jira/expire', { token }, a.jar);
    const off = await get(server.app, `${inSpace(team)}/issues`, a.jar);
    expect(off.status).toBe(404);
    expect(await off.json()).toMatchObject({ code: 'off-here' });
    expect((await get(server.app, `${inSpace(team)}/search?q=staging`, a.jar)).status).toBe(404);
    expect((await get(server.app, `${inSpace(team)}/issues/TUDU-212`, a.jar)).status).toBe(404);
    await connect(a, null);

    expect((await turn(a, team, true)).status).toBe(204);
    expect((await turn(a, team, true)).status).toBe(204);
    const on = await get(server.app, `${inSpace(team)}/issues`, a.jar);
    expect(on.status).toBe(200);
    expect(((await on.json()) as JiraIssuesResponse).issues).toHaveLength(7);
    expect((await read(a)).onIn).toBe(2);
    expect((await spaces(a)).every((s) => s.on)).toBe(true);
    expect((await turn(a, team, false)).status).toBe(204);
    expect((await get(server.app, `${inSpace(team)}/issues`, a.jar)).status).toBe(404);
    expect((await read(a)).onIn).toBe(1);
  });

  it('C10-A11 two people in one space: each reads Jira with their own token, sees only their own switches, hears only their own events', async () => {
    const a = await person();
    const b = await person();
    const team = await teamSpace(a, b);
    const ada = events(a.userId);
    const ben = events(b.userId);
    const { token: adaToken } = await connect(a, team);
    expect(await read(b)).toEqual({ connected: false });
    expect(await (await get(server.app, `${inSpace(team)}/issues`, b.jar)).json()).toMatchObject({
      code: 'not-connected',
    });
    expect((await spaces(b)).find((s) => s.id === team)!.on).toBe(false);

    await connect(b, team);
    // Ada's token stops working: Ben's reads in the same space still answer, so they never used hers.
    await post(server.app, '/__test/jira/expire', { token: adaToken }, a.jar);
    expect((await get(server.app, `${inSpace(team)}/issues`, a.jar)).status).toBe(401);
    expect((await get(server.app, `${inSpace(team)}/issues`, b.jar)).status).toBe(200);
    expect((await read(b)).state).toBe('ok');

    // Ben turning Jira off is Ben's alone.
    await turn(b, team, false);
    expect((await spaces(a)).find((s) => s.id === team)!.on).toBe(true);
    ada.off();
    ben.off();
    const changed = (s: typeof ada.seen) =>
      s.filter((e) => e.type === 'connector.changed').map((e) => e.data as ConnectorChangedEvent);
    expect(changed(ada.seen)).toEqual([{ provider: 'jira' }]);
    expect(changed(ben.seen)).toEqual([{ provider: 'jira' }, { provider: 'jira' }]);
  });

  it('C10-A12 the switch: only in your own spaces; any member; on needs a connection; an unknown app is not found', async () => {
    const a = await person();
    const b = await person();
    const c = await person();
    const harbour = await teamSpace(a);
    const team = await teamSpace(a, b);
    await connect(b, null);
    expect((await turn(b, harbour, true)).status).toBe(403);
    expect((await turn(b, team, true)).status).toBe(204);
    const no = await turn(c, c.personalId, true);
    expect(no.status).toBe(409);
    expect(await no.json()).toMatchObject({ code: 'not-connected' });
    expect((await call('PUT', inSpace(team), b.jar, { on: 'yes' })).status).toBe(400);
    for (const [method, path] of [
      ['GET', '/api/connectors/linear'],
      ['POST', '/api/connectors/linear'],
      ['DELETE', '/api/connectors/linear'],
      ['GET', '/api/connectors/linear/spaces'],
      ['GET', '/api/connectors/linear/links'],
      ['PUT', `/api/spaces/${team}/connectors/linear`],
    ] as const)
      expect((await call(method, path, b.jar, method === 'GET' ? undefined : { on: true })).status).toBe(404);
  });

  it('C10-A13 links span your spaces: yours in each, never a colleague’s, and they stay when Jira is off there', async () => {
    const a = await person();
    const b = await person();
    const team = await teamSpace(a, b);
    await connect(a);
    const one = create(a.personalId, linkedTo('TUDU-212'));
    const two = create(team, linkedTo('TUDU-219'));
    await sync(a, [one.m, two.m]);
    await sync(b, [create(team, linkedTo('TUDU-220')).m]);
    const ls = await links(a);
    expect(ls.map((l) => [l.key, l.spaceId])).toEqual([
      ['TUDU-212', a.personalId],
      ['TUDU-219', team],
    ]);
    expect((await read(a)).count).toBe(5);
    expect((await spaces(a)).map((s) => s.linked)).toEqual([1, 1]);
    await turn(a, team, false);
    expect((await links(a)).map((l) => l.key)).toEqual(['TUDU-212', 'TUDU-219']);
  });

  it('C10-A14 leaving or being removed drops your switch; coming back, or a new space, starts off', async () => {
    const a = await person();
    const b = await person();
    const team = await teamSpace(a, b);
    await connect(b, team);
    const onIn = async () => (await spaces(b)).filter((s) => s.on).map((s) => s.id);
    expect(await onIn()).toEqual([team]);
    expect((await post(server.app, `/api/spaces/${team}/leave`, {}, b.jar)).status).toBeLessThan(300);
    const rows = () =>
      server.db
        .select()
        .from(schema.connectionSpaces)
        .where(and(eq(schema.connectionSpaces.userId, b.userId), eq(schema.connectionSpaces.spaceId, team)));
    expect(await rows()).toEqual([]);
    await invite(a, b, team);
    expect(await onIn()).toEqual([]);

    await turn(b, team, true);
    expect((await call('DELETE', `/api/spaces/${team}/members/${b.userId}`, a.jar)).status).toBe(204);
    expect(await rows()).toEqual([]);
    expect(
      (await post(server.app, `/api/spaces/${team}/members/${b.userId}/restore`, {}, a.jar)).status,
    ).toBe(200);
    expect(await onIn()).toEqual([]);

    // A space deleted takes its switches with it; a new one starts off.
    const harbour = await teamSpace(b);
    await turn(b, harbour, true);
    expect((await call('DELETE', `/api/spaces/${harbour}`, b.jar, { confirm: true })).status).toBeLessThan(
      300,
    );
    expect(
      await server.db
        .select()
        .from(schema.connectionSpaces)
        .where(eq(schema.connectionSpaces.spaceId, harbour)),
    ).toEqual([]);
    const fresh = await teamSpace(b);
    expect((await spaces(b)).find((s) => s.id === fresh)!.on).toBe(false);
  });

  it('C10-A15 an expired token pauses Jira in every space it is on, and one new token clears all of them', async () => {
    const a = await person();
    const b = await person();
    const team = await teamSpace(a, b);
    const { token } = await connect(a);
    await turn(a, team, true);
    await post(server.app, '/__test/jira/expire', { token }, a.jar);
    for (const s of [a.personalId, team])
      expect(await (await get(server.app, `${inSpace(s)}/issues`, a.jar)).json()).toMatchObject({
        code: 'expired',
      });
    await connect(a, null);
    for (const s of [a.personalId, team])
      expect((await get(server.app, `${inSpace(s)}/issues`, a.jar)).status).toBe(200);
    expect((await read(a)).onIn).toBe(2);
  });

  it('C10-A18 search and close matches read a task’s key from its links', async () => {
    const a = await person();
    const t = create(a.personalId, { ...linkedTo('TUDU-226'), title: 'Tidy the staging buckets' });
    await sync(a, [t.m]);
    const hits = async (q: string) =>
      (
        (await (
          await get(server.app, `/api/search?q=${encodeURIComponent(q)}`, a.jar)
        ).json()) as SearchResponse
      ).hits;
    expect((await hits('TUDU-226'))[0]).toMatchObject({ id: t.id, jira: 'TUDU-226' });
    expect((await hits('226')).map((h) => h.id)).toContain(t.id);
    await sync(a, [
      { id: randomUUID(), at: at(), type: 'task.link', payload: { id: t.id, provider: 'jira', key: null } },
    ]);
    expect((await hits('TUDU-226')).map((h) => h.id)).not.toContain(t.id);
    expect((await hits('staging'))[0]).toMatchObject({ id: t.id, jira: null });
  });
});
