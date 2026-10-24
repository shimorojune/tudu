import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { InboxChangedEvent, InboxCounts, InboxResponse, SpaceSummary, SyncResponse } from '@tudu/core';
import { eq, schema } from '@tudu/db';
import { freshEmail, get, post, signIn, startServer, type Jar } from '../test/harness';
import { CLEARED_KEEP_MS, sweepCleared } from './inbox';

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
  user: { id: string };
  spaces: SpaceSummary[];
  inbox: InboxCounts;
}

async function me(jar: Jar): Promise<Me> {
  const res = await get(server.app, '/api/me', jar);
  expect(res.status).toBe(200);
  return (await res.json()) as Me;
}

async function person(email?: string): Promise<Person> {
  const { jar, email: e } = await signIn(server, email);
  const m = await me(jar);
  return { jar, email: e, userId: m.user.id, personalId: m.spaces[0]!.id };
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

async function space(owner: Person, name: string, members: Person[] = []): Promise<SpaceSummary> {
  const res = await post(
    server.app,
    '/api/spaces',
    { name, color: '#3d5a80', invites: members.map((p) => p.email) },
    owner.jar,
  );
  const s = ((await res.json()) as { space: SpaceSummary }).space;
  for (const p of members)
    expect((await post(server.app, `/api/join/${joinToken(p.email)}`, {}, p.jar)).status).toBe(200);
  return s;
}

let clock = Date.parse('2026-10-24T09:00:00.000Z');
function m(type: string, payload: Record<string, unknown>) {
  clock += 1000;
  return { id: randomUUID(), type, payload, at: new Date(clock).toISOString() };
}

async function sync(p: Person, mutations: unknown[]): Promise<SyncResponse> {
  const res = await post(server.app, '/api/sync', { clientId: 'tab-1', mutations }, p.jar);
  expect(res.status).toBe(200);
  return (await res.json()) as SyncResponse;
}

const send = (spaceId: string, toId: string, title: string) =>
  m('request.send', { id: randomUUID(), spaceId, toId, title, askedDay: '2026-10-26' });

async function inbox(p: Person, query = ''): Promise<InboxResponse> {
  const res = await get(server.app, `/api/inbox${query}`, p.jar);
  expect(res.status).toBe(200);
  return (await res.json()) as InboxResponse;
}

/** A comment by `by` on a task of `owner`'s in a space: an update in the owner's Inbox. */
async function commentOn(owner: Person, by: Person, spaceId: string, words: string): Promise<void> {
  const taskId = randomUUID();
  await sync(owner, [
    m('task.create', { id: taskId, spaceId, title: `Task for ${words}`, day: '2026-10-26', position: null }),
  ]);
  await sync(by, [m('comment.create', { id: randomUUID(), taskId, html: `<p>${words}</p>` })]);
}

/** Meera owns Northwind and Pilot Farm; you are in both. */
async function world() {
  const meera = await person();
  const you = await person();
  const nw = await space(meera, 'Northwind', [you]);
  const pf = await space(meera, 'Pilot Farm', [you]);
  return { meera, you, nw, pf };
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

describe('one Inbox across every space', () => {
  it('C08-A11 GET /api/inbox: items from Northwind and Pilot Farm in one list, newest first, each with its space', async () => {
    const { meera, you, nw, pf } = await world();
    await sync(meera, [send(nw.id, you.userId, 'Draft the agenda')]);
    await commentOn(you, meera, pf.id, 'Restore took 4 minutes');
    const box = await inbox(you);
    expect(box.toAnswer.map((i) => i.space?.name)).toEqual(['Northwind']);
    expect(box.toAnswer[0]!.request!.title).toBe('Draft the agenda');
    expect(box.updates).toHaveLength(1);
    expect(box.updates[0]!.space).toMatchObject({ id: pf.id, name: 'Pilot Farm', slug: pf.slug });
    expect(box.updates[0]!.spaceName).toBe('Pilot Farm');
    expect(box.counts).toEqual({ toAnswer: 1, unread: 1 });
    // /api/me carries the total as well as each space's
    const mine = await me(you.jar);
    expect(mine.inbox).toEqual({ toAnswer: 1, unread: 1 });
    expect(mine.spaces.find((s) => s.id === nw.id)!.inbox).toEqual({ toAnswer: 1, unread: 0 });
    // newest first, across spaces
    await sync(meera, [send(pf.id, you.userId, 'Order the seed')]);
    expect((await inbox(you)).toAnswer.map((i) => i.space?.name)).toEqual(['Pilot Farm', 'Northwind']);
    // the views work across spaces too
    expect((await inbox(you, '?view=sent')).sent).toEqual([]);
    expect((await inbox(meera, '?view=sent')).sent.map((r) => r.title)).toEqual([
      'Order the seed',
      'Draft the agenda',
    ]);
  });

  it('C08-A12 ?space= narrows the list while bySpace keeps every space; a space you are not in is 403', async () => {
    const { meera, you, nw, pf } = await world();
    await sync(meera, [
      send(nw.id, you.userId, 'Draft the agenda'),
      send(pf.id, you.userId, 'Order the seed'),
    ]);
    const box = await inbox(you, `?space=${nw.id}`);
    expect(box.toAnswer.map((i) => i.request!.title)).toEqual(['Draft the agenda']);
    expect(box.counts).toEqual({ toAnswer: 2, unread: 0 });
    expect(box.bySpace[nw.id]).toEqual({ toAnswer: 1, unread: 0 });
    expect(box.bySpace[pf.id]).toEqual({ toAnswer: 1, unread: 0 });
    expect(box.bySpace[you.personalId]).toEqual({ toAnswer: 0, unread: 0 });
    const stranger = await person();
    expect((await get(server.app, `/api/inbox?space=${nw.id}`, stranger.jar)).status).toBe(403);
    expect((await get(server.app, '/api/inbox?view=nope', you.jar)).status).toBe(400);
  });

  it('C08-A13 removed from Pilot Farm: its items go and a removed notice comes; putting you back takes the notice away', async () => {
    const { meera, you, pf } = await world();
    await commentOn(you, meera, pf.id, 'Looks good');
    const heard = nextEvent<InboxChangedEvent>(you.userId, 'inbox.changed');
    expect((await call('DELETE', `/api/spaces/${pf.id}/members/${you.userId}`, meera.jar)).status).toBe(204);
    await heard;
    const box = await inbox(you);
    expect(box.updates).toHaveLength(1);
    const notice = box.updates[0]!;
    expect(notice.kind).toBe('notice');
    expect(notice.notice).toEqual({ type: 'removed', by: expect.any(String) });
    expect(notice.space).toBeNull();
    expect(notice.spaceName).toBe('Pilot Farm');
    expect(box.bySpace[pf.id]).toBeUndefined();
    expect(
      (await post(server.app, `/api/spaces/${pf.id}/members/${you.userId}/restore`, {}, meera.jar)).status,
    ).toBe(200);
    const back = await inbox(you);
    expect(back.updates.map((i) => i.kind)).toEqual(['comment']);
    expect(back.updates[0]!.space?.id).toBe(pf.id);
  });

  it('C08-A14 deleting Pilot Farm leaves a deleted notice for each other member with the name kept; its items are gone', async () => {
    const meera = await person();
    const you = await person();
    const arjun = await person();
    const pf = await space(meera, 'Pilot Farm', [you, arjun]);
    await sync(meera, [send(pf.id, you.userId, 'Order the seed')]);
    expect((await call('DELETE', `/api/spaces/${pf.id}`, meera.jar)).status).toBe(204);
    for (const p of [you, arjun]) {
      const box = await inbox(p);
      expect(box.toAnswer).toEqual([]);
      expect(box.updates).toHaveLength(1);
      expect(box.updates[0]).toMatchObject({
        kind: 'notice',
        spaceId: null,
        space: null,
        spaceName: 'Pilot Farm',
        notice: { type: 'deleted' },
      });
    }
    // the one who deleted it is not told
    expect((await inbox(meera)).updates).toEqual([]);
  });

  it('C08-A15 inbox.unread then inbox.read round-trips readAt and the counts follow; someone else’s item is 403', async () => {
    const { meera, you, nw } = await world();
    await commentOn(you, meera, nw.id, 'Venue confirmed');
    const id = (await inbox(you)).updates[0]!.id;
    await sync(you, [m('inbox.read', { id })]);
    let box = await inbox(you);
    expect(box.updates[0]!.readAt).not.toBeNull();
    expect(box.counts.unread).toBe(0);
    await sync(you, [m('inbox.unread', { id })]);
    box = await inbox(you);
    expect(box.updates[0]!.readAt).toBeNull();
    expect(box.counts.unread).toBe(1);
    expect((await me(you.jar)).inbox.unread).toBe(1);
    const out = await sync(meera, [m('inbox.unread', { id })]);
    expect(out.results[0]).toMatchObject({ status: 'rejected', code: 403 });
  });

  it('C08-A16 inbox.delete hides a comment for good; a request still waiting is refused', async () => {
    const { meera, you, nw } = await world();
    await commentOn(you, meera, nw.id, 'Venue confirmed');
    await sync(meera, [send(nw.id, you.userId, 'Draft the agenda')]);
    const box = await inbox(you);
    await sync(you, [m('inbox.delete', { id: box.updates[0]!.id })]);
    expect((await inbox(you)).updates).toEqual([]);
    const out = await sync(you, [m('inbox.delete', { id: box.toAnswer[0]!.id })]);
    expect(out.results[0]).toMatchObject({
      status: 'rejected',
      code: 409,
      error: 'Answer or decline it first.',
    });
    expect((await inbox(you)).toAnswer).toHaveLength(1);
    // a declined one can go
    await sync(you, [m('request.decline', { id: box.toAnswer[0]!.request!.id, reason: 'Busy' })]);
    const answered = (await inbox(you, '?view=answered')).answered[0]!;
    expect((await sync(you, [m('inbox.delete', { id: answered.id })])).results[0]!.status).toBe('ok');
  });

  it('C08-A17 inbox.clear takes only the ids sent; a later item survives; inbox.restore brings them back as they were', async () => {
    const { meera, you, nw, pf } = await world();
    await commentOn(you, meera, nw.id, 'one');
    await commentOn(you, meera, pf.id, 'two');
    await commentOn(you, meera, nw.id, 'three');
    const shown = (await inbox(you)).updates;
    await sync(you, [m('inbox.read', { id: shown[0]!.id })]);
    // something lands after the list was read
    await commentOn(you, meera, nw.id, 'four');
    const ids = shown.map((i) => i.id);
    await sync(you, [m('inbox.clear', { id: randomUUID(), ids })]);
    let left = (await inbox(you)).updates;
    expect(left.map((i) => i.comment!.html)).toEqual(['<p>four</p>']);
    await sync(you, [m('inbox.restore', { id: randomUUID(), ids })]);
    left = (await inbox(you)).updates;
    expect(left).toHaveLength(4);
    expect(left.find((i) => i.id === shown[0]!.id)!.readAt).not.toBeNull();
    expect(left.find((i) => i.id === shown[1]!.id)!.readAt).toBeNull();
    // Clear all never takes a request still waiting
    await sync(meera, [send(nw.id, you.userId, 'Draft the agenda')]);
    const req = (await inbox(you)).toAnswer[0]!;
    await sync(you, [m('inbox.clear', { id: randomUUID(), ids: [req.id] })]);
    expect((await inbox(you)).toAnswer).toHaveLength(1);
    // a stranger's ids do nothing to yours
    const stranger = await person();
    await sync(stranger, [m('inbox.clear', { id: randomUUID(), ids: [left[0]!.id] })]);
    expect((await inbox(you)).updates).toHaveLength(4);
    // cleared rows are swept after 30 days
    await sync(you, [m('inbox.clear', { id: randomUUID(), ids: [left[0]!.id] })]);
    await sweepCleared(server.db, Date.now() + CLEARED_KEEP_MS + 60_000);
    const [row] = await server.db
      .select()
      .from(schema.inboxItems)
      .where(eq(schema.inboxItems.id, left[0]!.id));
    expect(row).toBeUndefined();
  });

  it('C08-A18 inviting someone with an account makes one invite item, live; again still one; a sign-up after the invite gets it', async () => {
    const meera = await person();
    const you = await person();
    const nw = await space(meera, 'Northwind');
    const heard = nextEvent<InboxChangedEvent>(you.userId, 'inbox.changed');
    await post(server.app, `/api/spaces/${nw.id}/invites`, { emails: [you.email] }, meera.jar);
    await heard;
    let box = await inbox(you);
    expect(box.toAnswer).toHaveLength(1);
    expect(box.toAnswer[0]).toMatchObject({ kind: 'invite', spaceName: 'Northwind', space: null });
    expect(box.toAnswer[0]!.invite).toMatchObject({ state: 'open', space: { id: nw.id, name: 'Northwind' } });
    expect(box.toAnswer[0]!.invite!.from?.id).toBe(meera.userId);
    expect(box.counts.toAnswer).toBe(1);
    await post(server.app, `/api/spaces/${nw.id}/invites`, { emails: [you.email] }, meera.jar);
    box = await inbox(you);
    expect(box.toAnswer).toHaveLength(1);
    // Not now puts it away; a fresh send brings it back
    await sync(you, [m('inbox.delete', { id: box.toAnswer[0]!.id })]);
    expect((await inbox(you)).toAnswer).toEqual([]);
    await new Promise((r) => setTimeout(r, 5));
    await post(server.app, `/api/spaces/${nw.id}/invites`, { emails: [you.email] }, meera.jar);
    expect((await inbox(you)).toAnswer).toHaveLength(1);
    // someone invited before they had an account
    const later = freshEmail('later');
    await post(server.app, `/api/spaces/${nw.id}/invites`, { emails: [later] }, meera.jar);
    const newcomer = await person(later);
    expect((await me(newcomer.jar)).inbox.toAnswer).toBe(1);
    expect((await inbox(newcomer)).toAnswer[0]!.kind).toBe('invite');
  });

  it('C08-A19 POST /api/invites/:id/join makes you a member, spends the invite, clears the item and returns the space', async () => {
    const meera = await person();
    const you = await person();
    const nw = await space(meera, 'Northwind');
    await post(server.app, `/api/spaces/${nw.id}/invites`, { emails: [you.email] }, meera.jar);
    const item = (await inbox(you)).toAnswer[0]!;
    const res = await post(server.app, `/api/invites/${item.invite!.id}/join`, {}, you.jar);
    expect(res.status).toBe(200);
    const out = (await res.json()) as { space: SpaceSummary; joined: boolean };
    expect(out.joined).toBe(true);
    expect(out.space).toMatchObject({ id: nw.id, slug: nw.slug });
    expect((await me(you.jar)).spaces.map((s) => s.id)).toContain(nw.id);
    expect((await inbox(you)).toAnswer).toEqual([]);
    // the email's link is spent too
    expect((await get(server.app, `/api/join/${joinToken(you.email)}`, you.jar)).status).toBe(200);
  });

  it('C08-A20 Join on an expired, taken-back or other-address invite says so, and the item stays', async () => {
    const meera = await person();
    const you = await person();
    const nw = await space(meera, 'Northwind');
    await post(server.app, `/api/spaces/${nw.id}/invites`, { emails: [you.email] }, meera.jar);
    const item = (await inbox(you)).toAnswer[0]!;
    // taken back
    expect((await call('DELETE', `/api/invites/${item.invite!.id}`, meera.jar)).status).toBe(204);
    let res = await post(server.app, `/api/invites/${item.invite!.id}/join`, {}, you.jar);
    expect(res.status).toBe(410);
    expect(((await res.json()) as { state: string }).state).toBe('cancelled');
    const ended = (await inbox(you)).updates.find((i) => i.id === item.id)!;
    expect(ended.invite!.state).toBe('cancelled');
    // expired
    await post(server.app, `/api/invites/${item.invite!.id}/restore`, {}, meera.jar);
    await server.db
      .update(schema.spaceInvites)
      .set({ sentAt: new Date(Date.now() - 8 * 86_400_000) })
      .where(eq(schema.spaceInvites.id, item.invite!.id));
    res = await post(server.app, `/api/invites/${item.invite!.id}/join`, {}, you.jar);
    expect(res.status).toBe(410);
    expect(((await res.json()) as { state: string }).state).toBe('expired');
    // another address: someone else can't use your invite
    await server.db
      .update(schema.spaceInvites)
      .set({ sentAt: new Date() })
      .where(eq(schema.spaceInvites.id, item.invite!.id));
    const other = await person();
    res = await post(server.app, `/api/invites/${item.invite!.id}/join`, {}, other.jar);
    expect(res.status).toBe(403);
    expect((await me(you.jar)).spaces.map((s) => s.id)).not.toContain(nw.id);
    expect((await inbox(you)).toAnswer.map((i) => i.id)).toEqual([item.id]);
  });

  it('C08-A21 compat: GET /spaces/:id/inbox still answers with that space’s counts, and inbox.readAll is still taken', async () => {
    const { meera, you, nw, pf } = await world();
    await commentOn(you, meera, nw.id, 'one');
    await commentOn(you, meera, pf.id, 'two');
    const res = await get(server.app, `/api/spaces/${nw.id}/inbox`, you.jar);
    expect(res.status).toBe(200);
    const box = (await res.json()) as InboxResponse;
    expect(box.updates).toHaveLength(1);
    expect(box.counts).toEqual({ toAnswer: 0, unread: 1 });
    await sync(you, [m('inbox.readAll', { id: randomUUID(), spaceId: nw.id })]);
    expect((await inbox(you)).counts.unread).toBe(1);
  });
});
