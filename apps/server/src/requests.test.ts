import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type {
  DayResponse,
  InboxChangedEvent,
  InboxResponse,
  SpaceSummary,
  SyncResponse,
  TaskDetail,
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

async function me(jar: Jar): Promise<{ user: { id: string }; spaces: SpaceSummary[] }> {
  const res = await get(server.app, '/api/me', jar);
  expect(res.status).toBe(200);
  return (await res.json()) as { user: { id: string }; spaces: SpaceSummary[] };
}

async function person(): Promise<Person> {
  const { jar, email } = await signIn(server);
  const m = await me(jar);
  return { jar, email, userId: m.user.id, personalId: m.spaces[0]!.id };
}

function joinToken(email: string): string {
  const mail = server.outbox
    .to(email)
    .filter((m) => /invited you/.test(m.subject))
    .at(-1)!;
  return /\/join\/([A-Za-z0-9_-]+)/.exec(mail.text)![1]!;
}

/** Two people in one team space. */
async function team(): Promise<{ a: Person; b: Person; space: SpaceSummary }> {
  const a = await person();
  const b = await person();
  const res = await post(
    server.app,
    '/api/spaces',
    { name: 'Northwind', color: '#3d5a80', invites: [b.email] },
    a.jar,
  );
  const space = ((await res.json()) as { space: SpaceSummary }).space;
  expect((await post(server.app, `/api/join/${joinToken(b.email)}`, {}, b.jar)).status).toBe(200);
  return { a, b, space };
}

let clock = Date.parse('2026-10-18T09:00:00.000Z');
function m(type: string, payload: Record<string, unknown>, at?: string) {
  clock += 1000;
  return { id: randomUUID(), type, payload, at: at ?? new Date(clock).toISOString() };
}

async function sync(p: Person, mutations: unknown[], clientId = 'tab-1'): Promise<SyncResponse> {
  const res = await post(server.app, '/api/sync', { clientId, mutations }, p.jar);
  expect(res.status).toBe(200);
  return (await res.json()) as SyncResponse;
}

function send(
  spaceId: string,
  toId: string,
  title: string,
  extra: Record<string, unknown> = {},
  id = randomUUID(),
) {
  return m('request.send', { id, spaceId, toId, title, askedDay: '2026-10-20', ...extra });
}

async function inbox(p: Person, spaceId: string, view = 'inbox', q = ''): Promise<InboxResponse> {
  const res = await get(
    server.app,
    `/api/spaces/${spaceId}/inbox?view=${view}&q=${encodeURIComponent(q)}`,
    p.jar,
  );
  expect(res.status).toBe(200);
  return (await res.json()) as InboxResponse;
}

async function day(p: Person, spaceId: string, iso: string): Promise<DayResponse> {
  const res = await get(server.app, `/api/spaces/${spaceId}/days/${iso}`, p.jar);
  expect(res.status).toBe(200);
  return (await res.json()) as DayResponse;
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

describe('requests and the Inbox', () => {
  it('C08-A06 send: a request with its note, day and files lands in the receiver’s Inbox; outsiders, yourself and repeats', async () => {
    const { a, b, space } = await team();
    // a file uploaded for it travels along
    const form = new FormData();
    form.append('file', new File(['hello'], 'brief.txt', { type: 'text/plain' }));
    const up = await server.app.request(`/api/spaces/${space.id}/files`, {
      method: 'POST',
      headers: { origin: 'http://localhost:5173', cookie: a.jar.header() },
      body: form,
    });
    expect(up.status).toBe(201);
    const file = (await up.json()) as { id: string };
    const req = send(space.id, b.userId, 'Draft the onboarding copy', {
      note: 'Keep it short.\n\nTwo paragraphs at most.',
      due: '2026-10-23',
      attachments: [file.id],
    });
    const heard = nextEvent<InboxChangedEvent>(b.userId, 'inbox.changed');
    const out = await sync(a, [req]);
    expect(out.results[0]!.status).toBe('ok');
    // no task was made: the day is empty for both
    expect(out.tasks).toEqual([]);
    expect((await day(b, space.id, '2026-10-20')).tasks).toEqual([]);
    expect((await heard).spaceId).toBe(space.id);
    const bx = await inbox(b, space.id);
    expect(bx.toAnswer).toHaveLength(1);
    const item = bx.toAnswer[0]!;
    expect(item.kind).toBe('request');
    expect(item.readAt).toBeNull();
    expect(item.request).toMatchObject({
      title: 'Draft the onboarding copy',
      note: 'Keep it short.\n\nTwo paragraphs at most.',
      askedDay: '2026-10-20',
      due: '2026-10-23',
      attachments: [file.id],
      state: 'waiting',
      seenAt: null,
    });
    expect(item.request!.from.id).toBe(a.userId);
    expect(item.request!.to.id).toBe(b.userId);
    expect(bx.counts).toEqual({ toAnswer: 1, unread: 0 });
    // the sender's Sent view says it waits
    const sent = await inbox(a, space.id, 'sent');
    expect(sent.sent).toHaveLength(1);
    expect(sent.sent[0]).toMatchObject({ state: 'waiting', seenAt: null });
    // /api/me carries the counts
    const bm = await me(b.jar);
    expect(bm.spaces.find((s) => s.id === space.id)!.inbox).toEqual({ toAnswer: 1, unread: 0 });
    // the same mutation id twice makes one request
    await sync(a, [req]);
    expect((await inbox(b, space.id)).toAnswer).toHaveLength(1);
    // a receiver outside the space, yourself, a stranger sending
    const c = await person();
    const bad = await sync(a, [send(space.id, c.userId, 'Nope'), send(space.id, a.userId, 'To me')]);
    expect(bad.results.map((r) => [r.status, r.code])).toEqual([
      ['rejected', 400],
      ['rejected', 400],
    ]);
    const stranger = await sync(c, [send(space.id, b.userId, 'From outside')]);
    expect(stranger.results[0]).toMatchObject({ status: 'rejected', code: 403 });
  });

  it('C08-A07 accept makes the task on the picked day with the note, files and history; the sender hears; decline needs a reason', async () => {
    const { a, b, space } = await team();
    const reqId = randomUUID();
    await sync(a, [send(space.id, b.userId, 'Draft the onboarding copy', { note: 'Keep it short.' }, reqId)]);
    const itemId = (await inbox(b, space.id)).toAnswer[0]!.id;
    // opening it marks it seen for the sender
    await sync(b, [m('inbox.read', { id: itemId })]);
    expect((await inbox(a, space.id, 'sent')).sent[0]!.seenAt).not.toBeNull();
    const taskId = randomUUID();
    const heard = nextEvent<InboxChangedEvent>(a.userId, 'inbox.changed');
    const accept = m('request.accept', { id: reqId, taskId, day: '2026-10-21' });
    const out = await sync(b, [accept]);
    expect(out.results[0]!.status).toBe('ok');
    expect(out.tasks.map((t) => t.id)).toEqual([taskId]);
    expect((await heard).spaceId).toBe(space.id);
    const d = await day(b, space.id, '2026-10-21');
    expect(d.tasks.map((t) => t.title)).toEqual(['Draft the onboarding copy']);
    expect(d.tasks[0]!.ownerId).toBe(b.userId);
    expect((await day(a, space.id, '2026-10-21')).tasks).toEqual([]);
    const detail = (await (
      await get(server.app, `/api/spaces/${space.id}/tasks/${taskId}`, b.jar)
    ).json()) as TaskDetail;
    expect(detail.notes).toBe('<p>Keep it short.</p>');
    expect(detail.history.map((h) => h.kind)).toEqual(['created', 'accepted']);
    expect(detail.history[1]).toMatchObject({ kind: 'accepted', from: a.email });
    // the request reads accepted; it is in Answered, not To answer; the sender has an update
    const bx = await inbox(b, space.id);
    expect(bx.toAnswer).toEqual([]);
    const answered = await inbox(b, space.id, 'answered');
    expect(answered.answered[0]!.request).toMatchObject({ state: 'accepted', taskId, taskDay: '2026-10-21' });
    const ax = await inbox(a, space.id);
    expect(ax.updates).toHaveLength(1);
    expect(ax.updates[0]!.kind).toBe('answer');
    expect(ax.updates[0]!.request!.state).toBe('accepted');
    expect(ax.counts).toEqual({ toAnswer: 0, unread: 1 });
    // accepting twice is one task; a second accept with another id is refused
    await sync(b, [accept]);
    expect((await day(b, space.id, '2026-10-21')).tasks).toHaveLength(1);
    const again = await sync(b, [m('request.accept', { id: reqId, taskId: randomUUID(), day: null })]);
    expect(again.results[0]).toMatchObject({ status: 'rejected', code: 409 });
    // decline: a reason is needed; the sender gets an update with it; only the receiver may answer
    const second = randomUUID();
    await sync(a, [send(space.id, b.userId, 'Plan the retro', {}, second)]);
    const noReason = await sync(b, [m('request.decline', { id: second, reason: '  ' })]);
    expect(noReason.results[0]).toMatchObject({ status: 'rejected', code: 400 });
    const notMine = await sync(a, [m('request.decline', { id: second, reason: 'No' })]);
    expect(notMine.results[0]).toMatchObject({ status: 'rejected', code: 403 });
    await sync(b, [m('request.decline', { id: second, reason: 'Priya owns the retro now.' })]);
    const declined = await inbox(b, space.id, 'answered');
    expect(declined.answered[0]!.request).toMatchObject({
      state: 'declined',
      reason: 'Priya owns the retro now.',
    });
    const ax2 = await inbox(a, space.id);
    expect(ax2.updates[0]!.request).toMatchObject({
      id: second,
      state: 'declined',
      reason: 'Priya owns the retro now.',
    });
    expect(ax2.counts.unread).toBe(2);
  });

  it('C08-A08 withdraw: a waiting or declined request comes back as your task; an accepted one is refused; the receiver’s item goes', async () => {
    const { a, b, space } = await team();
    const waiting = randomUUID();
    const declined = randomUUID();
    const accepted = randomUUID();
    await sync(a, [
      send(space.id, b.userId, 'Waiting one', {}, waiting),
      send(space.id, b.userId, 'Declined one', {}, declined),
      send(space.id, b.userId, 'Accepted one', {}, accepted),
    ]);
    await sync(b, [
      m('request.decline', { id: declined, reason: 'Busy.' }),
      m('request.accept', { id: accepted, taskId: randomUUID(), day: '2026-10-21' }),
    ]);
    expect((await inbox(b, space.id)).toAnswer.map((i) => i.request!.title)).toEqual(['Waiting one']);
    // Take it back: the task lands on the sender's Backlog
    const t1 = randomUUID();
    const heard = nextEvent<InboxChangedEvent>(b.userId, 'inbox.changed');
    const out = await sync(a, [m('request.withdraw', { id: waiting, taskId: t1, day: null })]);
    expect(out.results[0]!.status).toBe('ok');
    expect(out.tasks[0]).toMatchObject({ id: t1, day: null, ownerId: a.userId, title: 'Waiting one' });
    expect((await heard).spaceId).toBe(space.id);
    expect((await inbox(b, space.id)).toAnswer).toEqual([]);
    const detail = (await (
      await get(server.app, `/api/spaces/${space.id}/tasks/${t1}`, a.jar)
    ).json()) as TaskDetail;
    expect(detail.history.at(-1)).toMatchObject({ kind: 'withdrawn', to: b.email });
    // Do it myself after a decline: on the picked day; the sender's own update about the decline goes too
    const t2 = randomUUID();
    await sync(a, [m('request.withdraw', { id: declined, taskId: t2, day: '2026-10-22' })]);
    expect((await day(a, space.id, '2026-10-22')).tasks.map((t) => t.title)).toEqual(['Declined one']);
    expect((await inbox(a, space.id)).updates.filter((u) => u.request?.id === declined)).toEqual([]);
    // Sent leaves taken-back ones out; the accepted one stays
    expect((await inbox(a, space.id, 'sent')).sent.map((r) => r.title)).toEqual(['Accepted one']);
    // an accepted one cannot be taken back; nor can someone else's
    const no = await sync(a, [m('request.withdraw', { id: accepted, taskId: randomUUID(), day: null })]);
    expect(no.results[0]).toMatchObject({ status: 'rejected', code: 409 });
    const notYours = await sync(b, [
      m('request.withdraw', { id: accepted, taskId: randomUUID(), day: null }),
    ]);
    expect(notYours.results[0]).toMatchObject({ status: 'rejected', code: 403 });
  });

  it('C08-A09 the Inbox read: the views newest first with read flags, a comment on your task, q narrows each, a stranger is 403', async () => {
    const { a, b, space } = await team();
    const r1 = randomUUID();
    const r2 = randomUUID();
    await sync(a, [send(space.id, b.userId, 'Draft the Q4 hiring plan', { note: 'Budget first.' }, r1)]);
    await sync(a, [send(space.id, b.userId, 'Book the offsite venue', {}, r2)]);
    // a comment from b on a's task lands in a's Inbox; a's own comment does not
    const taskId = randomUUID();
    await sync(a, [
      m('task.create', {
        id: taskId,
        spaceId: space.id,
        title: 'Write the release notes',
        day: '2026-10-19',
        position: null,
      }),
    ]);
    await sync(b, [
      m('comment.create', { id: randomUUID(), taskId, html: '<p>Can I take the <b>second</b> half?</p>' }),
    ]);
    await sync(a, [m('comment.create', { id: randomUUID(), taskId, html: '<p>My own words.</p>' })]);
    const ax = await inbox(a, space.id);
    expect(ax.updates).toHaveLength(1);
    expect(ax.updates[0]!.kind).toBe('comment');
    expect(ax.updates[0]!.comment).toMatchObject({
      task: { id: taskId, title: 'Write the release notes', day: '2026-10-19' },
    });
    expect(ax.updates[0]!.comment!.author.id).toBe(b.userId);
    expect(ax.updates[0]!.readAt).toBeNull();
    // newest first on the receiver's side
    const bx = await inbox(b, space.id);
    expect(bx.toAnswer.map((i) => i.request!.title)).toEqual([
      'Book the offsite venue',
      'Draft the Q4 hiring plan',
    ]);
    // q narrows by the sender's name, the title and the note; nothing matches
    expect((await inbox(b, space.id, 'inbox', 'hiring')).toAnswer).toHaveLength(1);
    expect((await inbox(b, space.id, 'inbox', 'budget')).toAnswer.map((i) => i.request!.id)).toEqual([r1]);
    expect((await inbox(b, space.id, 'inbox', a.email.slice(0, 6))).toAnswer).toHaveLength(2);
    expect((await inbox(b, space.id, 'inbox', 'zzz')).toAnswer).toEqual([]);
    expect((await inbox(a, space.id, 'inbox', 'second')).updates).toHaveLength(1);
    expect((await inbox(a, space.id, 'inbox', 'nothing-here')).updates).toEqual([]);
    expect((await inbox(a, space.id, 'sent', 'offsite')).sent.map((r) => r.id)).toEqual([r2]);
    // answered carries the outcome; counts stay the same whatever the view or the words
    await sync(b, [m('request.decline', { id: r2, reason: 'Already booked.' })]);
    const answered = await inbox(b, space.id, 'answered', 'booked');
    expect(answered.answered.map((i) => i.request!.id)).toEqual([r2]);
    expect(answered.counts).toEqual({ toAnswer: 1, unread: 0 });
    // a stranger and a bad view
    const c = await person();
    expect((await get(server.app, `/api/spaces/${space.id}/inbox?view=inbox`, c.jar)).status).toBe(403);
    expect((await get(server.app, `/api/spaces/${space.id}/inbox?view=nope`, a.jar)).status).toBe(400);
  });

  it('C08-A10 counts and events: /api/me carries them; read and readAll clear dots; every change tells the one person', async () => {
    const { a, b, space } = await team();
    const r1 = randomUUID();
    await sync(a, [send(space.id, b.userId, 'One', {}, r1)]);
    await sync(b, [m('request.decline', { id: r1, reason: 'No room.' })]);
    const taskId = randomUUID();
    await sync(a, [
      m('task.create', { id: taskId, spaceId: space.id, title: 'Mine', day: null, position: null }),
    ]);
    await sync(b, [m('comment.create', { id: randomUUID(), taskId, html: '<p>Hi</p>' })]);
    let am = await me(a.jar);
    expect(am.spaces.find((s) => s.id === space.id)!.inbox).toEqual({ toAnswer: 0, unread: 2 });
    // a request to a counts in toAnswer and stays counted once read
    const r2 = randomUUID();
    await sync(b, [send(space.id, a.userId, 'For you', {}, r2)]);
    am = await me(a.jar);
    expect(am.spaces.find((s) => s.id === space.id)!.inbox).toEqual({ toAnswer: 1, unread: 2 });
    const ax = await inbox(a, space.id);
    const reqItem = ax.toAnswer[0]!;
    const heardB = nextEvent<InboxChangedEvent>(b.userId, 'inbox.changed');
    await sync(a, [m('inbox.read', { id: reqItem.id })]);
    // reading a request tells the sender it was seen
    expect((await heardB).spaceId).toBe(space.id);
    expect((await inbox(a, space.id)).toAnswer[0]!.readAt).not.toBeNull();
    expect((await me(a.jar)).spaces.find((s) => s.id === space.id)!.inbox).toEqual({
      toAnswer: 1,
      unread: 2,
    });
    // one update read clears one dot; Mark all as read clears the rest
    await sync(a, [m('inbox.read', { id: ax.updates[0]!.id })]);
    expect((await me(a.jar)).spaces.find((s) => s.id === space.id)!.inbox.unread).toBe(1);
    const heardA = nextEvent<InboxChangedEvent>(a.userId, 'inbox.changed');
    await sync(a, [m('inbox.readAll', { id: randomUUID(), spaceId: space.id })]);
    expect((await heardA).spaceId).toBe(space.id);
    expect((await me(a.jar)).spaces.find((s) => s.id === space.id)!.inbox).toEqual({
      toAnswer: 1,
      unread: 0,
    });
    expect((await inbox(a, space.id)).updates.every((u) => u.readAt)).toBe(true);
    // someone else's item cannot be read; a stranger hears nothing of any of this
    const c = await person();
    const notMine = await sync(b, [m('inbox.read', { id: reqItem.id })]);
    expect(notMine.results[0]).toMatchObject({ status: 'rejected', code: 403 });
    expect(server.hub.since(c.userId, 0).filter((e) => e.type === 'inbox.changed')).toEqual([]);
  });
});
