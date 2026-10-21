import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type {
  DayResponse,
  JoinResponse,
  MembersResponse,
  PeopleResponse,
  PersonResponse,
  SpaceSummary,
  SyncResponse,
  TaskDetail,
  TasksChangedEvent,
  MembersChangedEvent,
} from '@tudu/core';
import { get, post, signIn, startServer, type Jar } from '../test/harness';

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
  user: { id: string; color: string | null };
  spaces: SpaceSummary[];
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

async function del(path: string, jar: Jar): Promise<Response> {
  const res = await server.app.request(path, {
    method: 'DELETE',
    headers: { origin: 'http://localhost:5173', cookie: jar.header() },
  });
  return res;
}

/** A team space made by `p`, with `invites` mailed. */
async function makeSpace(p: Person, name: string, invites: string[] = []): Promise<SpaceSummary> {
  const res = await post(server.app, '/api/spaces', { name, color: '#3d5a80', invites }, p.jar);
  expect(res.status).toBe(201);
  return ((await res.json()) as { space: SpaceSummary }).space;
}

/** The join link mailed to an address, newest. */
function joinLink(email: string): string {
  const mail = server.outbox
    .to(email)
    .filter((m) => /invited you/.test(m.subject))
    .at(-1);
  expect(mail, `an invite mail to ${email}`).toBeTruthy();
  const m = /\/join\/([A-Za-z0-9_-]+)/.exec(mail!.text);
  expect(m).toBeTruthy();
  return m![1]!;
}

/** Someone joins a space from the link mailed to them. */
async function joinSpace(p: Person, token: string): Promise<SpaceSummary> {
  const res = await post(server.app, `/api/join/${token}`, {}, p.jar);
  expect(res.status).toBe(200);
  return ((await res.json()) as { space: SpaceSummary }).space;
}

/** Two people in one team space: `a` made it, `b` joined. */
async function team(): Promise<{ a: Person; b: Person; space: SpaceSummary }> {
  const a = await person();
  const b = await person();
  const space = await makeSpace(a, 'Northwind', [b.email]);
  await joinSpace(b, joinLink(b.email));
  return { a, b, space };
}

let clock = Date.parse('2026-10-18T09:00:00.000Z');
function m(type: string, payload: Record<string, unknown>, at?: string) {
  clock += 1000;
  return { id: randomUUID(), type, payload, at: at ?? new Date(clock).toISOString() };
}

async function sync(p: Person, mutations: unknown[]): Promise<SyncResponse> {
  const res = await post(server.app, '/api/sync', { clientId: 'tab-1', mutations }, p.jar);
  expect(res.status).toBe(200);
  return (await res.json()) as SyncResponse;
}

function create(spaceId: string, title: string, day: string | null, id = randomUUID(), extra = {}) {
  return m('task.create', { id, spaceId, title, day, position: null, ...extra });
}

async function day(p: Person, spaceId: string, iso: string): Promise<DayResponse> {
  const res = await get(server.app, `/api/spaces/${spaceId}/days/${iso}`, p.jar);
  expect(res.status).toBe(200);
  return (await res.json()) as DayResponse;
}

const titles = (d: { tasks: Array<{ title: string }> }) => d.tasks.map((t) => t.title);

/** Wait for the live stream to deliver one event of a type to a person. */
function nextEvent<T>(userId: string, type: string): Promise<T> {
  return new Promise((resolve) => {
    const off = server.hub.subscribe(userId, (e) => {
      if (e.type !== type) return;
      off();
      resolve(e.data as T);
    });
  });
}

describe('spaces', () => {
  it('C08-A01 creating a space: the maker is its admin; the prefix and slug come from the name; invites go out', async () => {
    const p = await person();
    const other = `friend-${Date.now().toString(36)}@test.tudu`;
    const events = nextEvent<MembersChangedEvent>(p.userId, 'members.changed');
    const res = await post(
      server.app,
      '/api/spaces',
      { name: 'Northwind', color: '#3d5a80', invites: [other, 'not-an-email'] },
      p.jar,
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as { space: SpaceSummary; invited: string[] };
    expect(body.space).toMatchObject({
      kind: 'team',
      name: 'Northwind',
      role: 'admin',
      prefix: 'NW',
      members: 1,
    });
    expect(body.space.slug).toMatch(/^northwind(-\d+)?$/);
    expect(body.invited).toEqual([other]);
    expect((await events).spaceId).toBe(body.space.id);
    // /api/me lists it, Personal first
    const mine = await me(p.jar);
    expect(mine.spaces.map((s) => s.kind)).toEqual(['personal', 'team']);
    expect(mine.spaces[0]).toMatchObject({ slug: 'me', prefix: 'ME', members: 1 });
    expect(mine.spaces[1]).toMatchObject({ id: body.space.id, slug: body.space.slug, role: 'admin' });
    expect(mine.user.color).toMatch(/^#[0-9a-f]{6}$/);
    // the mail carries a join link
    const mail = server.outbox.to(other).at(-1)!;
    expect(mail.subject).toContain('invited you to Northwind');
    expect(mail.text).toMatch(/\/join\/[A-Za-z0-9_-]+/);
    // a second space with a clashing prefix grows a letter; a clashing slug gets a number
    const again = await makeSpace(p, 'Northwind');
    expect(again.prefix).toBe('NWO');
    expect(again.slug).not.toBe(body.space.slug);
    expect(again.slug.startsWith('northwind')).toBe(true);
    // a blank name is refused
    const blank = await post(server.app, '/api/spaces', { name: '  ', color: '#3d5a80' }, p.jar);
    expect(blank.status).toBe(400);
    // tasks written there carry its prefix
    const t = await sync(p, [create(body.space.id, 'Plan the offsite', '2026-10-19')]);
    expect(t.tasks[0]!.ref).toBe('NW-1');
  });

  it('C08-A02 invites: pending, cancel and undo, the join link, joining, spent and cancelled links, another address', async () => {
    const a = await person();
    const b = await person();
    const space = await makeSpace(a, 'Northwind');
    // a member may invite; the pending list shows it
    let res = await post(server.app, `/api/spaces/${space.id}/invites`, { emails: [b.email] }, a.jar);
    expect(res.status).toBe(200);
    let out = (await res.json()) as {
      results: Array<{ email: string; outcome: string }>;
      invites: unknown[];
    };
    expect(out.results).toEqual([{ email: b.email, outcome: 'sent' }]);
    expect(out.invites).toHaveLength(1);
    const token1 = joinLink(b.email);
    // what the link says, to anyone
    res = await get(server.app, `/api/join/${token1}`);
    expect(res.status).toBe(200);
    let info = (await res.json()) as JoinResponse;
    expect(info).toMatchObject({
      space: { name: 'Northwind' },
      count: 1,
      email: b.email,
      state: 'open',
      you: null,
    });
    expect(info.from?.name).toBeTruthy();
    // inviting again resends with a fresh link; the old one is dead
    res = await post(server.app, `/api/spaces/${space.id}/invites`, { emails: [b.email] }, a.jar);
    out = (await res.json()) as typeof out;
    expect(out.results[0]!.outcome).toBe('resent');
    const token2 = joinLink(b.email);
    expect(token2).not.toBe(token1);
    expect((await get(server.app, `/api/join/${token1}`)).status).toBe(404);
    // cancel: the link says so; undo brings it back
    const members = (await (
      await get(server.app, `/api/spaces/${space.id}/members`, a.jar)
    ).json()) as MembersResponse;
    const inviteId = members.invites[0]!.id;
    expect((await del(`/api/invites/${inviteId}`, a.jar)).status).toBe(204);
    res = await get(server.app, `/api/join/${token2}`, b.jar);
    expect(res.status).toBe(410);
    expect(((await res.json()) as JoinResponse).state).toBe('cancelled');
    expect((await post(server.app, `/api/join/${token2}`, {}, b.jar)).status).toBe(410);
    expect((await post(server.app, `/api/invites/${inviteId}/restore`, {}, a.jar)).status).toBe(200);
    // signed in as b, the link is theirs and they are not in yet
    res = await get(server.app, `/api/join/${token2}`, b.jar);
    info = (await res.json()) as JoinResponse;
    expect(info.you).toEqual({ member: false, matches: true });
    // another person cannot use it
    const c = await person();
    res = await post(server.app, `/api/join/${token2}`, {}, c.jar);
    expect(res.status).toBe(403);
    // b joins: a member now, the token spent, everyone hears
    const heard = nextEvent<MembersChangedEvent>(a.userId, 'members.changed');
    const joined = await joinSpace(b, token2);
    expect(joined).toMatchObject({ id: space.id, role: 'member', members: 2 });
    expect((await heard).spaceId).toBe(space.id);
    expect((await me(b.jar)).spaces.map((s) => s.id)).toContain(space.id);
    // the spent link: for b it still opens the space; for anyone else it is gone
    res = await get(server.app, `/api/join/${token2}`, b.jar);
    expect(res.status).toBe(200);
    expect(((await res.json()) as JoinResponse).you).toEqual({ member: true, matches: true });
    expect((await get(server.app, `/api/join/${token2}`)).status).toBe(410);
    // an address already in the space is told so, and gets no mail
    const before = server.outbox.to(b.email).length;
    res = await post(server.app, `/api/spaces/${space.id}/invites`, { emails: [b.email] }, a.jar);
    out = (await res.json()) as typeof out;
    expect(out.results).toEqual([{ email: b.email, outcome: 'member' }]);
    expect(server.outbox.to(b.email).length).toBe(before);
    // a stranger may not invite or list members; a bad address is refused
    expect(
      (await post(server.app, `/api/spaces/${space.id}/invites`, { emails: [c.email] }, c.jar)).status,
    ).toBe(403);
    expect((await get(server.app, `/api/spaces/${space.id}/members`, c.jar)).status).toBe(403);
    expect(
      (await post(server.app, `/api/spaces/${space.id}/invites`, { emails: ['nope'] }, a.jar)).status,
    ).toBe(400);
    // Personal takes no invites
    expect(
      (await post(server.app, `/api/spaces/${a.personalId}/invites`, { emails: [c.email] }, a.jar)).status,
    ).toBe(400);
  });

  it('C08-A03 ownership: every page answers with the caller’s own tasks; a task is owned by its writer', async () => {
    const { a, b, space } = await team();
    await sync(a, [
      create(space.id, 'Arjun’s task', '2026-10-19'),
      create(space.id, 'Arjun’s backlog', null),
    ]);
    await sync(b, [create(space.id, 'Meera’s task', '2026-10-19')]);
    expect(titles(await day(a, space.id, '2026-10-19'))).toEqual(['Arjun’s task']);
    expect(titles(await day(b, space.id, '2026-10-19'))).toEqual(['Meera’s task']);
    const dA = await day(a, space.id, '2026-10-19');
    expect(dA.tasks[0]!.ownerId).toBe(a.userId);
    const week = (await (
      await get(server.app, `/api/spaces/${space.id}/weeks/2026-10-19`, b.jar)
    ).json()) as { days: DayResponse[]; backlog: Array<{ title: string }> };
    expect(titles(week.days[0]!)).toEqual(['Meera’s task']);
    expect(week.backlog).toEqual([]);
    const backlog = (await (await get(server.app, `/api/spaces/${space.id}/backlog`, a.jar)).json()) as {
      tasks: Array<{ title: string }>;
    };
    expect(titles(backlog)).toEqual(['Arjun’s backlog']);
    const marks = (await (
      await get(server.app, `/api/spaces/${space.id}/marks?from=2026-10-12&to=2026-10-25`, b.jar)
    ).json()) as { marks: Record<string, number> };
    expect(marks.marks).toEqual({ '2026-10-19': 1 });
    const found = (await (
      await get(server.app, `/api/spaces/${space.id}/search?q=task&today=2026-10-18`, b.jar)
    ).json()) as { hits: Array<{ title: string }> };
    expect(found.hits.map((h) => h.title)).toEqual(['Meera’s task']);
    // Personal is unchanged: your own tasks, as before
    await sync(a, [create(a.personalId, 'Home thing', '2026-10-19')]);
    expect(titles(await day(a, a.personalId, '2026-10-19'))).toEqual(['Home thing']);
  });

  it('C08-A04 another member’s task: readable with its comments, Only me is 404, every edit refused, a comment lands', async () => {
    const { a, b, space } = await team();
    const shared = randomUUID();
    const secret = randomUUID();
    await sync(b, [
      create(space.id, 'Meera’s shared task', '2026-10-19', shared),
      create(space.id, 'Meera’s own business', '2026-10-19', secret),
      m('task.visibility', { id: secret, visibility: 'me' }),
    ]);
    let res = await get(server.app, `/api/spaces/${space.id}/tasks/${shared}`, a.jar);
    expect(res.status).toBe(200);
    const detail = (await res.json()) as TaskDetail;
    expect(detail.owner).toMatchObject({ id: b.userId, email: b.email });
    expect(detail.ownerId).toBe(b.userId);
    res = await get(server.app, `/api/spaces/${space.id}/tasks/${secret}`, a.jar);
    expect(res.status).toBe(404);
    expect((await get(server.app, `/api/spaces/${space.id}/tasks/${secret}`, b.jar)).status).toBe(200);
    // every edit by a is refused and nothing changes
    const edits = [
      m('task.rename', { id: shared, title: 'Hijacked' }),
      m('task.cross', { id: shared, done: true }),
      m('task.place', { id: shared, day: '2026-10-20', position: null }),
      m('task.due', { id: shared, due: '2026-10-21' }),
      m('task.notes', { id: shared, notes: '<p>mine now</p>' }),
      m('task.visibility', { id: shared, visibility: 'me' }),
      m('task.delete', { id: shared }),
      m('subtask.create', { id: randomUUID(), taskId: shared, title: 'Sneaky', position: null }),
    ];
    const out = await sync(a, edits);
    expect(out.results.every((r) => r.status === 'rejected' && r.code === 403)).toBe(true);
    // a change to the Only-me task reads as gone
    const hidden = await sync(a, [m('task.rename', { id: secret, title: 'Seen you' })]);
    expect(hidden.results[0]).toMatchObject({ status: 'rejected', code: 404 });
    const still = (await (
      await get(server.app, `/api/spaces/${space.id}/tasks/${shared}`, b.jar)
    ).json()) as TaskDetail;
    expect(still).toMatchObject({
      title: 'Meera’s shared task',
      done: false,
      day: '2026-10-19',
      notes: '',
      subsTotal: 0,
    });
    // a comment is the one write anyone may make; the owner hears the task changed
    const heard = nextEvent<TasksChangedEvent>(b.userId, 'tasks.changed');
    const commented = await sync(a, [
      m('comment.create', { id: randomUUID(), taskId: shared, html: '<p>Can I take the second half?</p>' }),
    ]);
    expect(commented.results[0]!.status).toBe('ok');
    expect((await heard).tasks).toContain(shared);
    const withComment = (await (
      await get(server.app, `/api/spaces/${space.id}/tasks/${shared}`, a.jar)
    ).json()) as TaskDetail;
    expect(withComment.comments).toHaveLength(1);
    expect(withComment.comments[0]!.author.id).toBe(a.userId);
    // a stranger reads nothing
    const c = await person();
    expect((await get(server.app, `/api/spaces/${space.id}/tasks/${shared}`, c.jar)).status).toBe(403);
    // the ref of a shared task resolves for a colleague, with the space's slug
    const ref = (await (await get(server.app, `/api/tasks/ref/${still.ref}`, a.jar)).json()) as {
      taskId: string;
      slug: string;
    };
    expect(ref).toMatchObject({ taskId: shared, slug: space.slug });
  });

  it('C08-A05 People: shared tasks by member in a range, Only me left out, one person, a stranger is 404', async () => {
    const { a, b, space } = await team();
    const secret = randomUUID();
    await sync(a, [
      create(space.id, 'A on Monday', '2026-10-19'),
      create(space.id, 'A on Sunday', '2026-10-18'),
      create(space.id, 'A next month', '2026-11-20'),
      create(space.id, 'A in the Backlog', null),
    ]);
    await sync(b, [
      create(space.id, 'B on Monday', '2026-10-19'),
      create(space.id, 'B secret', '2026-10-19', secret),
      m('task.visibility', { id: secret, visibility: 'me' }),
      m('task.cross', {
        id: (await sync(b, [create(space.id, 'B done', '2026-10-20')])).tasks[0]!.id,
        done: true,
      }),
    ]);
    let res = await get(server.app, `/api/spaces/${space.id}/people?from=2026-10-12&to=2026-10-25`, a.jar);
    expect(res.status).toBe(200);
    const people = (await res.json()) as PeopleResponse;
    expect(people.members).toHaveLength(2);
    const mine = people.members.find((x) => x.id === a.userId)!;
    const theirs = people.members.find((x) => x.id === b.userId)!;
    expect(mine.you).toBe(true);
    expect(mine.count).toBe(2);
    expect(mine.tasks.map((t) => t.title)).toEqual(['A on Sunday', 'A on Monday']);
    expect(theirs.you).toBe(false);
    expect(theirs.count).toBe(2);
    expect(theirs.tasks.map((t) => t.title)).toEqual(['B on Monday', 'B done']);
    expect(theirs.tasks[1]!.done).toBe(true);
    expect(theirs.initials).toBeTruthy();
    // one person
    res = await get(
      server.app,
      `/api/spaces/${space.id}/people/${b.userId}?from=2026-10-19&to=2026-10-19`,
      a.jar,
    );
    expect(res.status).toBe(200);
    const one = (await res.json()) as PersonResponse;
    expect(one.person.tasks.map((t) => t.title)).toEqual(['B on Monday']);
    // a stranger to the space is 404; a bad range 400; an outsider 403
    const c = await person();
    expect(
      (
        await get(
          server.app,
          `/api/spaces/${space.id}/people/${c.userId}?from=2026-10-19&to=2026-10-19`,
          a.jar,
        )
      ).status,
    ).toBe(404);
    expect(
      (await get(server.app, `/api/spaces/${space.id}/people?from=2026-10-19&to=2026-12-19`, a.jar)).status,
    ).toBe(400);
    expect(
      (await get(server.app, `/api/spaces/${space.id}/people?from=2026-10-19&to=2026-10-19`, c.jar)).status,
    ).toBe(403);
    // the members list
    const members = (await (
      await get(server.app, `/api/spaces/${space.id}/members`, b.jar)
    ).json()) as MembersResponse;
    expect(members.members.map((x) => x.role)).toEqual(['admin', 'member']);
    expect(members.invites).toEqual([]);
  });
});
