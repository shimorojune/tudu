import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type {
  DayResponse,
  InboxResponse,
  MembersResponse,
  PeopleResponse,
  Project,
  SpaceChangedEvent,
  SpaceGoneEvent,
  SpaceSummary,
  SyncResponse,
} from '@tudu/core';
import type { MemoryStorage } from './storage';
import { freshEmail, get, Jar, post, requestCode, signIn, startServer } from '../test/harness';

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
  user: { id: string; name: string; email: string; image: string | null };
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

function joinToken(email: string): string {
  const mail = server.outbox
    .to(email)
    .filter((m) => /invited you/.test(m.subject))
    .at(-1)!;
  return /\/join\/([A-Za-z0-9_-]+)/.exec(mail.text)![1]!;
}

async function invite(a: Person, spaceId: string, email: string) {
  expect((await post(server.app, `/api/spaces/${spaceId}/invites`, { emails: [email] }, a.jar)).status).toBe(
    200,
  );
}

async function join(p: Person) {
  expect((await post(server.app, `/api/join/${joinToken(p.email)}`, {}, p.jar)).status).toBe(200);
}

/** `a` made Northwind; everyone else joined. */
async function team(n = 2, name = 'Northwind'): Promise<{ people: Person[]; space: SpaceSummary }> {
  const people = [];
  for (let i = 0; i < n; i++) people.push(await person());
  const res = await post(
    server.app,
    '/api/spaces',
    { name, color: '#3d5a80', invites: people.slice(1).map((p) => p.email) },
    people[0]!.jar,
  );
  const space = ((await res.json()) as { space: SpaceSummary }).space;
  for (const p of people.slice(1)) await join(p);
  return { people, space };
}

let clock = Date.parse('2026-10-18T09:00:00.000Z');
function m(type: string, payload: Record<string, unknown>) {
  clock += 1000;
  return { id: randomUUID(), type, payload, at: new Date(clock).toISOString() };
}

async function sync(p: Person, mutations: unknown[]): Promise<SyncResponse> {
  const res = await post(server.app, '/api/sync', { clientId: 'tab-1', mutations }, p.jar);
  expect(res.status).toBe(200);
  return (await res.json()) as SyncResponse;
}

function create(spaceId: string, title: string, day: string | null, extra: Record<string, unknown> = {}) {
  return m('task.create', { id: randomUUID(), spaceId, title, day, position: null, ...extra });
}

async function members(p: Person, spaceId: string): Promise<MembersResponse> {
  const res = await get(server.app, `/api/spaces/${spaceId}/members`, p.jar);
  expect(res.status).toBe(200);
  return (await res.json()) as MembersResponse;
}

async function day(p: Person, spaceId: string, iso: string): Promise<DayResponse> {
  const res = await get(server.app, `/api/spaces/${spaceId}/days/${iso}`, p.jar);
  expect(res.status).toBe(200);
  return (await res.json()) as DayResponse;
}

async function people(p: Person, spaceId: string): Promise<PeopleResponse> {
  const res = await get(server.app, `/api/spaces/${spaceId}/people?from=2026-10-19&to=2026-10-25`, p.jar);
  expect(res.status).toBe(200);
  return (await res.json()) as PeopleResponse;
}

async function inbox(p: Person, spaceId: string, view = 'inbox'): Promise<InboxResponse> {
  const res = await get(server.app, `/api/spaces/${spaceId}/inbox?view=${view}`, p.jar);
  expect(res.status).toBe(200);
  return (await res.json()) as InboxResponse;
}

function nextEvent<T>(userId: string, type: string): Promise<T> {
  return new Promise((resolve) => {
    const off = server.hub.subscribe(userId, (e) => {
      if (e.type !== type) return;
      off();
      resolve(e.data as T);
    });
  });
}

// A 1×1 PNG.
const PNG = Uint8Array.from(
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64',
  ),
);

async function upload(p: Person, bytes: Uint8Array, name = 'me.png', type = 'image/png'): Promise<Response> {
  const form = new FormData();
  form.append('file', new File([new Uint8Array(bytes)], name, { type }));
  return server.app.request('/api/me/photo', {
    method: 'POST',
    headers: { origin: 'http://localhost:5173', cookie: p.jar.header() },
    body: form,
  });
}

describe('settings', () => {
  it('C09-A01 name and photo: a rename shows on /api/me and to members; a photo is an image, shown and removed', async () => {
    const { people: ps, space } = await team();
    const [a, b] = ps as [Person, Person];
    const heard = nextEvent(b.userId, 'members.changed');
    const out = await sync(a, [m('me.rename', { id: a.userId, name: 'Rohit Raj' })]);
    expect(out.results[0]!.status).toBe('ok');
    await heard;
    expect((await me(a.jar)).user.name).toBe('Rohit Raj');
    expect((await members(b, space.id)).members.find((x) => x.id === a.userId)!.name).toBe('Rohit Raj');
    // blank names and someone else's name are refused
    const bad = await sync(a, [m('me.rename', { id: a.userId, name: '   ' })]);
    expect(bad.results[0]!.status).toBe('rejected');
    const other = await sync(a, [m('me.rename', { id: b.userId, name: 'Not you' })]);
    expect(other.results[0]).toMatchObject({ status: 'rejected', code: 403 });

    expect((await upload(a, new TextEncoder().encode('not a picture'), 'x.png')).status).toBe(400);
    const big = new Uint8Array(5 * 1024 * 1024 + 10);
    big.set(PNG);
    expect((await upload(a, big)).status).toBe(413);
    const res = await upload(a, PNG);
    expect(res.status).toBe(200);
    const { image } = (await res.json()) as { image: string };
    expect(image).toMatch(new RegExp(`^/api/people/${a.userId}/photo/`));
    expect((await me(a.jar)).user.image).toBe(image);
    expect((await members(b, space.id)).members.find((x) => x.id === a.userId)!.image).toBe(image);
    // a member sees it; a stranger does not
    const seen = await get(server.app, image, b.jar);
    expect(seen.status).toBe(200);
    expect(seen.headers.get('content-type')).toBe('image/png');
    const stranger = await person();
    expect((await get(server.app, image, stranger.jar)).status).toBe(404);
    // a new photo retires the old address; Remove goes back to initials
    const again = (await (await upload(a, PNG)).json()) as { image: string };
    expect(again.image).not.toBe(image);
    expect((await get(server.app, image, a.jar)).status).toBe(404);
    expect((await call('DELETE', '/api/me/photo', a.jar)).status).toBe(204);
    expect((await me(a.jar)).user.image).toBeNull();
    expect((await get(server.app, again.image, a.jar)).status).toBe(404);
  });

  it('C09-A02 email change: the code goes to the new address; wrong, expired, in use; the right code keeps the session', async () => {
    const a = await person();
    const b = await person();
    // in use by someone else, or already yours
    expect((await post(server.app, '/api/me/email', { email: b.email }, a.jar)).status).toBe(409);
    expect((await post(server.app, '/api/me/email', { email: a.email }, a.jar)).status).toBe(400);
    expect((await post(server.app, '/api/me/email', { email: 'nope' }, a.jar)).status).toBe(400);
    expect((await post(server.app, '/api/me/email/confirm', { code: '123456' }, a.jar)).status).toBe(404);

    const next = freshEmail('moved');
    const before = server.outbox.to(a.email).length;
    expect((await post(server.app, '/api/me/email', { email: next }, a.jar)).status).toBe(200);
    expect(server.outbox.to(a.email).length).toBe(before);
    const mail = server.outbox.to(next).at(-1)!;
    expect(mail.subject).toMatch(/change your Tudu email/);
    const code = /\b(\d{6})\b/.exec(mail.text)![1]!;
    const wrong = code === '000000' ? '111111' : '000000';
    const miss = await post(server.app, '/api/me/email/confirm', { code: wrong }, a.jar);
    expect(miss.status).toBe(400);
    expect(((await miss.json()) as { error: string }).error).toMatch(/didn’t work/);
    expect((await post(server.app, '/api/me/email/confirm', { code }, a.jar)).status).toBe(200);
    // the same session, the new address; the old address heard
    expect((await me(a.jar)).user.email).toBe(next);
    expect(server.outbox.to(a.email).at(-1)!.subject).toBe('Your Tudu email changed');
    // the new address signs in to the same person
    const { code: signInCode } = await requestCode(server, next);
    const jar = new Jar();
    expect(
      (await post(server.app, '/api/auth/sign-in/email-otp', { email: next, otp: signInCode }, jar)).ok,
    ).toBe(true);
    expect((await me(jar)).user.id).toBe(a.userId);

    // an expired code is told so
    const later = freshEmail('later');
    await post(server.app, '/api/me/email', { email: later }, a.jar);
    const late = /\b(\d{6})\b/.exec(server.outbox.to(later).at(-1)!.text)![1]!;
    const { schema, eq } = await import('@tudu/db');
    await server.db
      .update(schema.emailChanges)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(schema.emailChanges.userId, a.userId));
    expect((await post(server.app, '/api/me/email/confirm', { code: late }, a.jar)).status).toBe(410);
  });

  it('C09-A03 space name and colour: admins only; the slug moves, the old one still resolves; the prefix stays', async () => {
    const { people: ps, space } = await team(2, 'Harbour');
    const [a, b] = ps as [Person, Person];
    const t = await sync(a, [create(space.id, 'Ship it', '2026-10-19')]);
    const ref = t.tasks[0]!.ref!;
    expect(ref.startsWith(`${space.prefix}-`)).toBe(true);
    const heard = nextEvent<SpaceChangedEvent>(b.userId, 'space.changed');
    const out = await sync(a, [m('space.update', { id: space.id, name: 'Harbour Labs', color: '#7a4e4e' })]);
    expect(out.results[0]!.status).toBe('ok');
    expect((await heard).spaceId).toBe(space.id);
    const now = (await me(b.jar)).spaces.find((s) => s.id === space.id)!;
    expect(now).toMatchObject({
      name: 'Harbour Labs',
      color: '#7a4e4e',
      slug: 'harbour-labs',
      prefix: space.prefix,
    });
    expect(now.oldSlugs).toEqual(['harbour']);
    // task refs keep their prefix and still resolve
    const hit = await get(server.app, `/api/tasks/ref/${ref}`, a.jar);
    expect(((await hit.json()) as { slug: string }).slug).toBe('harbour-labs');
    // nobody else can make a space called Harbour take the old address
    const c = await person();
    const res = await post(server.app, '/api/spaces', { name: 'Harbour', color: '#3d5a80' }, c.jar);
    expect(((await res.json()) as { space: SpaceSummary }).space.slug).toBe('harbour-2');
    // going back to the old name takes the old address back
    await sync(a, [m('space.update', { id: space.id, name: 'Harbour' })]);
    const back = (await me(a.jar)).spaces.find((s) => s.id === space.id)!;
    expect(back.slug).toBe('harbour');
    expect(back.oldSlugs).toEqual(['harbour-labs']);
    // a member can't; Personal can't
    const no = await sync(b, [m('space.update', { id: space.id, name: 'Mine now' })]);
    expect(no.results[0]).toMatchObject({ status: 'rejected', code: 403 });
    const personal = await sync(a, [m('space.update', { id: a.personalId, name: 'Home' })]);
    expect(personal.results[0]).toMatchObject({ status: 'rejected', code: 400 });
  });

  it('C09-A04 projects: rename, recolour, delete takes it off its tasks, restore gives it back; outsiders refused', async () => {
    const { people: ps, space } = await team();
    const [a, b] = ps as [Person, Person];
    const pid = randomUUID();
    await sync(a, [m('project.create', { id: pid, spaceId: space.id, name: 'Launch' })]);
    const t1 = create(space.id, 'One', '2026-10-19', { projectId: pid });
    const t2 = create(space.id, 'Two', '2026-10-20', { projectId: pid });
    await sync(a, [t1, t2]);
    // any member may change projects
    await sync(b, [
      m('project.update', { id: pid, spaceId: space.id, name: 'Launch week', color: '#7a4e7e' }),
    ]);
    const list = (await (await get(server.app, `/api/spaces/${space.id}/projects`, a.jar)).json()) as {
      projects: Project[];
    };
    expect(list.projects[0]).toMatchObject({ name: 'Launch week', color: '#7a4e7e' });
    const counted = (await (
      await get(server.app, `/api/spaces/${space.id}/projects?counts=1`, b.jar)
    ).json()) as {
      open: Record<string, number>;
    };
    expect(counted.open[pid]).toBe(2);
    const del = m('project.delete', { id: pid, spaceId: space.id });
    await sync(a, [del]);
    await sync(a, [del]); // the same mutation twice is one change
    expect((await day(a, space.id, '2026-10-19')).tasks[0]!.projectId).toBeNull();
    const gone = (await (await get(server.app, `/api/spaces/${space.id}/projects`, a.jar)).json()) as {
      projects: Project[];
    };
    expect(gone.projects).toEqual([]);
    await sync(a, [m('project.restore', { id: pid, spaceId: space.id })]);
    expect((await day(a, space.id, '2026-10-19')).tasks[0]!.projectId).toBe(pid);
    expect((await day(a, space.id, '2026-10-20')).tasks[0]!.projectId).toBe(pid);
    const stranger = await person();
    const no = await sync(stranger, [m('project.update', { id: pid, spaceId: space.id, name: 'Mine' })]);
    expect(no.results[0]).toMatchObject({ status: 'rejected', code: 403 });
  });

  it('C09-A05 roles: an admin changes a role; a member can’t; never your own; the last admin stays', async () => {
    const { people: ps, space } = await team(3);
    const [a, b, c] = ps as [Person, Person, Person];
    const path = (u: string) => `/api/spaces/${space.id}/members/${u}`;
    expect((await call('PATCH', path(c.userId), b.jar, { role: 'admin' })).status).toBe(403);
    expect((await call('PATCH', path(a.userId), a.jar, { role: 'member' })).status).toBe(400);
    expect((await call('PATCH', path(b.userId), a.jar, { role: 'owner' })).status).toBe(400);
    const heard = nextEvent(c.userId, 'members.changed');
    expect((await call('PATCH', path(b.userId), a.jar, { role: 'admin' })).status).toBe(200);
    await heard;
    expect((await members(c, space.id)).members.find((x) => x.id === b.userId)!.role).toBe('admin');
    // now b can make a a member, and then a can't make b one: b is the last admin
    expect((await call('PATCH', path(a.userId), b.jar, { role: 'member' })).status).toBe(200);
    expect((await call('PATCH', path(b.userId), a.jar, { role: 'member' })).status).toBe(403);
    expect((await me(a.jar)).spaces.find((s) => s.id === space.id)!.role).toBe('member');
  });

  it('C09-A06 remove: shared tasks stay marked Left, Only-me ones go, waiting requests decline; Restore undoes it all', async () => {
    const { people: ps, space } = await team(3);
    const [a, b, c] = ps as [Person, Person, Person];
    const shared = create(space.id, 'Meera’s shared', '2026-10-20');
    const secret = create(space.id, 'Meera’s own', '2026-10-20');
    await sync(b, [shared, secret]);
    await sync(b, [m('task.visibility', { id: secret.payload.id, visibility: 'me' })]);
    const req = m('request.send', {
      id: randomUUID(),
      spaceId: space.id,
      toId: b.userId,
      title: 'Review copy',
      askedDay: '2026-10-21',
    });
    await sync(c, [req]);
    // a member can't remove
    expect((await call('DELETE', `/api/spaces/${space.id}/members/${a.userId}`, c.jar)).status).toBe(403);
    expect((await call('DELETE', `/api/spaces/${space.id}/members/${a.userId}`, a.jar)).status).toBe(400);
    const gone = nextEvent<SpaceGoneEvent>(b.userId, 'space.gone');
    const told = nextEvent(c.userId, 'inbox.changed');
    expect((await call('DELETE', `/api/spaces/${space.id}/members/${b.userId}`, a.jar)).status).toBe(204);
    expect(await gone).toMatchObject({ spaceId: space.id, how: 'removed', name: 'Northwind' });
    await told;
    expect((await me(b.jar)).spaces.some((s) => s.id === space.id)).toBe(false);
    expect((await get(server.app, `/api/spaces/${space.id}/members`, b.jar)).status).toBe(403);
    // People: the shared task under b marked Left; the Only-me one nowhere
    const ppl = await people(a, space.id);
    const left = ppl.members.find((x) => x.id === b.userId)!;
    expect(left.left).toBe(true);
    expect(left.tasks.map((t) => t.title)).toEqual(['Meera’s shared']);
    // the sender's request came back declined, with an update in their Inbox
    const sent = await inbox(c, space.id, 'sent');
    expect(sent.sent[0]).toMatchObject({ state: 'declined' });
    expect(sent.sent[0]!.reason).toMatch(/was removed from Northwind/);
    expect((await inbox(c, space.id)).updates.some((u) => u.kind === 'answer')).toBe(true);

    // Undo: back as they were
    expect(
      (await post(server.app, `/api/spaces/${space.id}/members/${b.userId}/restore`, {}, a.jar)).status,
    ).toBe(200);
    expect((await me(b.jar)).spaces.find((s) => s.id === space.id)!.role).toBe('member');
    expect((await day(b, space.id, '2026-10-20')).tasks.map((t) => t.title).sort()).toEqual([
      'Meera’s own',
      'Meera’s shared',
    ]);
    expect((await inbox(c, space.id, 'sent')).sent[0]).toMatchObject({ state: 'waiting', reason: null });
    expect((await inbox(c, space.id)).updates.some((u) => u.kind === 'answer')).toBe(false);
    expect((await inbox(b, space.id)).toAnswer).toHaveLength(1);
    expect((await people(a, space.id)).members.find((x) => x.id === b.userId)!.left).toBeUndefined();
  });

  it('C09-A07 leave: like a removal; the last admin and the last person are stopped; a new invite brings tasks back', async () => {
    const { people: ps, space } = await team(2);
    const [a, b] = ps as [Person, Person];
    const solo = (await post(server.app, '/api/spaces', { name: 'Solo', color: '#3d5a80' }, a.jar)).json();
    const soloId = ((await solo) as { space: SpaceSummary }).space.id;
    const last = await post(server.app, `/api/spaces/${soloId}/leave`, {}, a.jar);
    expect(last.status).toBe(409);
    expect(((await last.json()) as { block: string }).block).toBe('last-person');
    const admin = await post(server.app, `/api/spaces/${space.id}/leave`, {}, a.jar);
    expect(admin.status).toBe(409);
    expect(((await admin.json()) as { block: string }).block).toBe('last-admin');
    expect((await post(server.app, `/api/spaces/${a.personalId}/leave`, {}, a.jar)).status).toBe(400);

    await sync(b, [create(space.id, 'Still mine', '2026-10-21')]);
    const gone = nextEvent<SpaceGoneEvent>(b.userId, 'space.gone');
    expect((await post(server.app, `/api/spaces/${space.id}/leave`, {}, b.jar)).status).toBe(204);
    expect((await gone).how).toBe('left');
    expect((await members(a, space.id)).members.map((x) => x.id)).toEqual([a.userId]);
    expect((await people(a, space.id)).members.find((x) => x.id === b.userId)!.left).toBe(true);
    // a member who left can't be restored by Undo of a removal
    expect(
      (await post(server.app, `/api/spaces/${space.id}/members/${b.userId}/restore`, {}, a.jar)).status,
    ).toBe(404);
    // invited again: their task is back on their own list, no longer marked Left
    await invite(a, space.id, b.email);
    await join(b);
    expect((await day(b, space.id, '2026-10-21')).tasks.map((t) => t.title)).toEqual(['Still mine']);
    expect((await people(a, space.id)).members.find((x) => x.id === b.userId)!.left).toBeUndefined();
  });

  it('C09-A08 delete: admins only; everything in the space goes, files too; Personal can’t; everyone hears', async () => {
    const { people: ps, space } = await team(2);
    const [a, b] = ps as [Person, Person];
    const form = new FormData();
    form.append('file', new File(['hello'], 'brief.txt', { type: 'text/plain' }));
    const up = await server.app.request(`/api/spaces/${space.id}/files`, {
      method: 'POST',
      headers: { origin: 'http://localhost:5173', cookie: a.jar.header() },
      body: form,
    });
    const file = (await up.json()) as { id: string };
    await sync(a, [create(space.id, 'With a file', '2026-10-19', { attachments: [file.id] })]);
    await sync(b, [
      m('request.send', { id: randomUUID(), spaceId: space.id, toId: a.userId, title: 'Hi', askedDay: null }),
    ]);
    const storage = server.storage as MemoryStorage;
    const before = storage.objects.size;
    expect((await call('DELETE', `/api/spaces/${space.id}`, b.jar)).status).toBe(403);
    expect((await call('DELETE', `/api/spaces/${a.personalId}`, a.jar)).status).toBe(400);
    const heardA = nextEvent<SpaceGoneEvent>(a.userId, 'space.gone');
    const heardB = nextEvent<SpaceGoneEvent>(b.userId, 'space.gone');
    expect((await call('DELETE', `/api/spaces/${space.id}`, a.jar)).status).toBe(204);
    expect(await heardB).toMatchObject({ spaceId: space.id, how: 'deleted', name: 'Northwind' });
    await heardA;
    expect(storage.objects.size).toBe(before - 1);
    expect((await me(b.jar)).spaces.some((s) => s.id === space.id)).toBe(false);
    expect((await get(server.app, `/api/files/${file.id}`, a.jar)).status).toBe(404);
    const { schema, eq } = await import('@tudu/db');
    for (const table of [
      schema.tasks,
      schema.requests,
      schema.inboxItems,
      schema.spaceInvites,
      schema.attachments,
    ])
      expect(await server.db.select().from(table).where(eq(table.spaceId, space.id))).toEqual([]);
  });
});
