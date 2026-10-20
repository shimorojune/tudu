import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type {
  Attachment,
  DayResponse,
  MarksResponse,
  SyncResponse,
  Task,
  TaskDetail,
  TasksChangedEvent,
} from '@tudu/core';
import { eq, schema } from '@tudu/db';
import { sweepAttachments } from './files';
import type { MemoryStorage } from './storage';
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
  userId: string;
  spaceId: string;
}

async function person(): Promise<Person> {
  const { jar } = await signIn(server);
  const me = (await (await get(server.app, '/api/me', jar)).json()) as {
    user: { id: string };
    spaces: Array<{ id: string }>;
  };
  return { jar, userId: me.user.id, spaceId: me.spaces[0]!.id };
}

let clock = Date.parse('2026-10-18T09:00:00.000Z');
/** A mutation with its own id and a clock that moves forward a second each time (or the one you give). */
function m(type: string, payload: Record<string, unknown>, at?: string) {
  clock += 1000;
  return { id: randomUUID(), type, payload, at: at ?? new Date(clock).toISOString() };
}

async function sync(p: Person, mutations: unknown[], clientId = 'tab-1'): Promise<SyncResponse> {
  const res = await post(server.app, '/api/sync', { clientId, mutations }, p.jar);
  expect(res.status).toBe(200);
  return (await res.json()) as SyncResponse;
}

async function day(p: Person, iso: string, today?: string): Promise<DayResponse> {
  const q = today ? `?today=${today}` : '';
  const res = await get(server.app, `/api/spaces/${p.spaceId}/days/${iso}${q}`, p.jar);
  expect(res.status).toBe(200);
  return (await res.json()) as DayResponse;
}

function create(p: Person, title: string, iso: string | null, position: number, id = randomUUID()) {
  return m('task.create', { id, spaceId: p.spaceId, title, day: iso, position });
}

const titles = (d: DayResponse) => d.tasks.map((t) => t.title);

describe('tasks and sync', () => {
  it('C02-A01 a new task lands on its day with the next number and its place at the end', async () => {
    const p = await person();
    const res = await sync(p, [
      create(p, 'Pay the electricity bill', '2026-10-18', 1024),
      create(p, 'Call Sam at 3pm', '2026-10-18', 2048),
    ]);
    expect(res.results.map((r) => r.status)).toEqual(['ok', 'ok']);
    expect(res.tasks.map((t) => t.ref).sort()).toEqual(['ME-1', 'ME-2']);
    const d = await day(p, '2026-10-18');
    expect(titles(d)).toEqual(['Pay the electricity bill', 'Call Sam at 3pm']);
    expect(d.tasks.map((t) => t.ref)).toEqual(['ME-1', 'ME-2']);
    expect(d.tasks[1]!.position).toBeGreaterThan(d.tasks[0]!.position);
  });

  it('C02-A02 the same mutation twice applies once', async () => {
    const p = await person();
    const c = create(p, 'Water the plants', '2026-10-18', 1024);
    await sync(p, [c]);
    const again = await sync(p, [c]);
    expect(again.results).toEqual([{ id: c.id, status: 'ok' }]);
    expect(again.tasks).toHaveLength(1);
    const d = await day(p, '2026-10-18');
    expect(d.tasks).toHaveLength(1);
    expect(d.tasks[0]!.ref).toBe('ME-1');
    // a rename replayed after a later rename does not win twice
    const id = d.tasks[0]!.id;
    const first = m('task.rename', { id, title: 'Water the ferns' });
    const second = m('task.rename', { id, title: 'Water the basil' });
    await sync(p, [first, second, first]);
    expect(titles(await day(p, '2026-10-18'))).toEqual(['Water the basil']);
  });

  it('C02-A03 last write wins per field, whatever the arrival order', async () => {
    const p = await person();
    const id = randomUUID();
    await sync(p, [create(p, 'Draft agenda', '2026-10-18', 1024, id)]);
    const early = m('task.rename', { id, title: 'Draft the agenda' }, '2026-10-18T10:00:00.000Z');
    const late = m('task.rename', { id, title: 'Draft the planning agenda' }, '2026-10-18T10:05:00.000Z');
    await sync(p, [late], 'tab-2');
    await sync(p, [early], 'tab-1');
    expect(titles(await day(p, '2026-10-18'))).toEqual(['Draft the planning agenda']);
    // a newer cross-off does not undo an older rename of the same task: the fields are separate
    await sync(p, [m('task.cross', { id, done: true }, '2026-10-18T10:06:00.000Z')]);
    await sync(p, [m('task.rename', { id, title: 'Old words' }, '2026-10-18T10:01:00.000Z')]);
    const d = await day(p, '2026-10-18');
    expect(d.tasks[0]).toMatchObject({ title: 'Draft the planning agenda', done: true });
  });

  it('C02-A04 crossing off and uncrossing set and clear the time; the counts follow', async () => {
    const p = await person();
    const a = randomUUID();
    const b = randomUUID();
    await sync(p, [create(p, 'One', '2026-10-18', 1024, a), create(p, 'Two', '2026-10-18', 2048, b)]);
    const at = '2026-10-18T11:00:00.000Z';
    await sync(p, [m('task.cross', { id: a, done: true }, at)]);
    let d = await day(p, '2026-10-18');
    expect(d.counts).toEqual({ total: 2, done: 1 });
    expect(d.tasks[0]).toMatchObject({ done: true, doneAt: at });
    await sync(p, [m('task.cross', { id: a, done: false }, '2026-10-18T11:01:00.000Z')]);
    d = await day(p, '2026-10-18');
    expect(d.counts).toEqual({ total: 2, done: 0 });
    expect(d.tasks[0]).toMatchObject({ done: false, doneAt: null });
  });

  it('C02-A05 a reorder is saved and the day comes back in that order', async () => {
    const p = await person();
    const ids = [randomUUID(), randomUUID(), randomUUID()];
    await sync(p, [
      create(p, 'First', '2026-10-18', 1024, ids[0]),
      create(p, 'Second', '2026-10-18', 2048, ids[1]),
      create(p, 'Third', '2026-10-18', 3072, ids[2]),
    ]);
    await sync(p, [m('task.place', { id: ids[2], day: '2026-10-18', position: 0 })]);
    expect(titles(await day(p, '2026-10-18'))).toEqual(['Third', 'First', 'Second']);
  });

  it('C02-A06 moving to another day or to none puts it at the end there', async () => {
    const p = await person();
    const a = randomUUID();
    const b = randomUUID();
    await sync(p, [
      create(p, 'Book car service', '2026-10-18', 1024, a),
      create(p, 'Dentist at 4pm', '2026-10-19', 1024, b),
      create(p, 'Renew the domain', '2026-10-18', 2048),
    ]);
    await sync(p, [m('task.place', { id: a, day: '2026-10-19', position: 2048 })]);
    expect(titles(await day(p, '2026-10-18'))).toEqual(['Renew the domain']);
    expect(titles(await day(p, '2026-10-19'))).toEqual(['Dentist at 4pm', 'Book car service']);
    // without a position (a day the client has not loaded) it goes to the end
    const res = await sync(p, [m('task.place', { id: b, day: null, position: null })]);
    expect(res.tasks[0]).toMatchObject({ id: b, day: null, position: 1024 });
    await sync(p, [m('task.place', { id: b, day: '2026-10-19', position: null })]);
    expect(titles(await day(p, '2026-10-19'))).toEqual(['Book car service', 'Dentist at 4pm']);
    await sync(p, [m('task.place', { id: b, day: null, position: null })]);
    expect(titles(await day(p, '2026-10-19'))).toEqual(['Book car service']);
  });

  it('C02-A07 delete is soft: the task leaves the day and stays out after a reload', async () => {
    const p = await person();
    const id = randomUUID();
    await sync(p, [
      create(p, 'Throw this away', '2026-10-18', 1024, id),
      create(p, 'Keep', '2026-10-18', 2048),
    ]);
    const res = await sync(p, [m('task.delete', { id })]);
    expect(res.deleted).toEqual([id]);
    expect(res.tasks).toEqual([]);
    expect(titles(await day(p, '2026-10-18'))).toEqual(['Keep']);
    expect(titles(await day(p, '2026-10-18'))).toEqual(['Keep']);
    // a change to a deleted task is refused, so the client undoes it
    const late = await sync(p, [m('task.rename', { id, title: 'Back?' })]);
    expect(late.results[0]).toMatchObject({ status: 'rejected', code: 410 });
    // the next task still gets a new number; numbers are never reused
    const next = await sync(p, [create(p, 'Next', '2026-10-18', 3072)]);
    expect(next.tasks[0]!.ref).toBe('ME-3');
  });

  it('C02-A08 asking for today carries unfinished tasks forward, once, with where they came from', async () => {
    const p = await person();
    const done = randomUUID();
    await sync(p, [
      create(p, 'Sync with Meera', '2026-10-16', 1024),
      create(p, 'Send the invoice', '2026-10-17', 1024, done),
      create(p, 'Water the plants', '2026-10-17', 2048),
      create(p, 'Already on Sunday', '2026-10-18', 1024),
    ]);
    await sync(p, [m('task.cross', { id: done, done: true })]);

    // looking at another day carries nothing
    expect(titles(await day(p, '2026-10-17', '2026-10-19'))).toEqual([
      'Send the invoice',
      'Water the plants',
    ]);

    const sunday = await day(p, '2026-10-18', '2026-10-18');
    expect(titles(sunday)).toEqual(['Sync with Meera', 'Water the plants', 'Already on Sunday']);
    expect(sunday.tasks.map((t) => t.carriedFrom)).toEqual(['2026-10-16', '2026-10-17', null]);
    expect(titles(await day(p, '2026-10-17'))).toEqual(['Send the invoice']);
    expect(titles(await day(p, '2026-10-16'))).toEqual([]);

    // once a day: asking again changes nothing, even after a task is planned on a past day
    await sync(p, [create(p, 'Late entry on Saturday', '2026-10-17', 4096)]);
    expect(titles(await day(p, '2026-10-18', '2026-10-18'))).toEqual(titles(sunday));
    expect(titles(await day(p, '2026-10-17'))).toEqual(['Send the invoice', 'Late entry on Saturday']);

    // the next day carries again, oldest day first, and keeps the first day each came from
    const monday = await day(p, '2026-10-19', '2026-10-19');
    expect(monday.tasks.map((t) => [t.title, t.carriedFrom])).toEqual([
      ['Late entry on Saturday', '2026-10-17'],
      ['Sync with Meera', '2026-10-16'],
      ['Water the plants', '2026-10-17'],
      ['Already on Sunday', '2026-10-18'],
    ]);

    // keeping it clears the marker; moving it clears it too
    const [, keep, move] = monday.tasks;
    await sync(p, [
      m('task.keep', { id: keep!.id }),
      m('task.place', { id: move!.id, day: '2026-10-20', position: 1 }),
    ]);
    expect((await day(p, '2026-10-19')).tasks[1]).toMatchObject({
      title: 'Sync with Meera',
      carriedFrom: null,
    });
    expect((await day(p, '2026-10-20')).tasks[0]).toMatchObject({
      title: 'Water the plants',
      carriedFrom: null,
    });
  });

  it('C02-A09 a task in another person’s space is refused and nothing changes', async () => {
    const owner = await person();
    const other = await person();
    const id = randomUUID();
    await sync(owner, [create(owner, 'Mine', '2026-10-18', 1024, id)]);
    const res = await sync(other, [
      m('task.rename', { id, title: 'Yours now' }),
      m('task.cross', { id, done: true }),
      m('task.delete', { id }),
      m('task.create', {
        id: randomUUID(),
        spaceId: owner.spaceId,
        title: 'Sneaked in',
        day: '2026-10-18',
        position: 1,
      }),
    ]);
    expect(res.results.map((r) => [r.status, r.code])).toEqual([
      ['rejected', 403],
      ['rejected', 403],
      ['rejected', 403],
      ['rejected', 403],
    ]);
    expect(res.tasks).toEqual([]);
    const read = await get(server.app, `/api/spaces/${owner.spaceId}/days/2026-10-18`, other.jar);
    expect(read.status).toBe(403);
    const d = await day(owner, '2026-10-18');
    expect(d.tasks.map((t) => [t.title, t.done])).toEqual([['Mine', false]]);
  });

  it('C02-A10 every accepted change tells the space’s people, and nobody else', async () => {
    const p = await person();
    const stranger = await person();
    const mine: Array<{ type: string; data: TasksChangedEvent }> = [];
    const theirs: unknown[] = [];
    const off1 = server.hub.subscribe(p.userId, (e) => mine.push(e as never));
    const off2 = server.hub.subscribe(stranger.userId, (e) => theirs.push(e));
    const id = randomUUID();
    await sync(p, [create(p, 'Announce me', '2026-10-18', 1024, id)], 'tab-9');
    await sync(p, [m('task.place', { id, day: '2026-10-19', position: 1024 })], 'tab-9');
    // a rejected change says nothing
    await sync(stranger, [m('task.rename', { id, title: 'No' })]);
    off1();
    off2();
    expect(mine.map((e) => e.type)).toEqual(['tasks.changed', 'tasks.changed']);
    expect(mine[0]!.data).toEqual({
      spaceId: p.spaceId,
      days: ['2026-10-18'],
      tasks: [id],
      clientId: 'tab-9',
    });
    expect(mine[1]!.data.days.sort()).toEqual(['2026-10-18', '2026-10-19']);
    expect(theirs).toEqual([]);
  });

  it('C02-A11 a day comes back with its tasks, their IDs and the counts for the ring', async () => {
    const p = await person();
    const a = randomUUID();
    await sync(p, [
      create(p, 'One', '2026-10-21', 1024, a),
      create(p, 'Two', '2026-10-21', 2048),
      create(p, 'Three', '2026-10-21', 3072),
      create(p, 'Elsewhere', '2026-10-22', 1024),
    ]);
    await sync(p, [m('task.cross', { id: a, done: true })]);
    const d = await day(p, '2026-10-21');
    expect(d.day).toBe('2026-10-21');
    expect(d.counts).toEqual({ total: 3, done: 1 });
    const first = d.tasks[0] as Task;
    expect(first).toMatchObject({
      id: a,
      spaceId: p.spaceId,
      number: 1,
      ref: 'ME-1',
      title: 'One',
      day: '2026-10-21',
    });
    expect(Object.keys(first).sort()).toEqual(
      [
        'carriedFrom',
        'commentCount',
        'createdAt',
        'day',
        'done',
        'doneAt',
        'due',
        'id',
        'number',
        'position',
        'projectId',
        'ref',
        'spaceId',
        'subsDone',
        'subsTotal',
        'subtasks',
        'title',
        'updatedAt',
        'visibility',
      ].sort(),
    );
    const marks = (await (
      await get(server.app, `/api/spaces/${p.spaceId}/marks?from=2026-10-01&to=2026-10-31`, p.jar)
    ).json()) as MarksResponse;
    expect(marks.marks).toEqual({ '2026-10-21': 3, '2026-10-22': 1 });
    const bad = await get(server.app, `/api/spaces/${p.spaceId}/days/2026-02-30`, p.jar);
    expect(bad.status).toBe(400);
  });

  it('C02-A12 task numbers never repeat, even when two clients create at the same time', async () => {
    const p = await person();
    const batches = Array.from({ length: 16 }, (_, i) =>
      sync(p, [create(p, `Task ${i}`, '2026-10-18', 1024 + i)], i % 2 ? 'laptop' : 'phone'),
    );
    const all = await Promise.all(batches);
    const numbers = all.flatMap((r) => r.tasks.map((t) => t.number)).sort((x, y) => x! - y!);
    expect(numbers).toEqual(Array.from({ length: 16 }, (_, i) => i + 1));
  });

  it('refuses a malformed change in plain words and keeps going with the rest', async () => {
    const p = await person();
    const res = await sync(p, [
      m('task.create', {
        id: randomUUID(),
        spaceId: p.spaceId,
        title: '   ',
        day: '2026-10-18',
        position: 1,
      }),
      m('task.explode', { id: 'x' }),
      create(p, 'Fine', '2026-10-18', 1024),
    ]);
    expect(res.results.map((r) => [r.status, r.code])).toEqual([
      ['rejected', 400],
      ['rejected', 400],
      ['ok', undefined],
    ]);
    expect(res.results[0]!.error).toBe('A task needs a title.');
    const anon = await post(server.app, '/api/sync', { clientId: 'x', mutations: [] });
    expect(anon.status).toBe(401);
  });
});

async function detail(p: Person, taskId: string, expectStatus = 200): Promise<TaskDetail> {
  const res = await get(server.app, `/api/spaces/${p.spaceId}/tasks/${taskId}`, p.jar);
  expect(res.status).toBe(expectStatus);
  return (await res.json()) as TaskDetail;
}

const SUN = '2026-10-18';

describe('task detail (chunk 03)', () => {
  it('C03-A01 reading a task returns its fields, subtasks, comments and history; someone else’s space is 403', async () => {
    const p = await person();
    const id = randomUUID();
    const s1 = randomUUID();
    const c1 = randomUUID();
    await sync(p, [
      create(p, 'Review Quick Add PR', SUN, 1024, id),
      m('task.notes', { id, notes: '<p>Staging first.</p>' }),
      m('subtask.create', { id: s1, taskId: id, title: 'Pull the branch', position: 1024 }),
      m('subtask.create', { id: randomUUID(), taskId: id, title: 'Run it', position: 2048 }),
      m('comment.create', { id: c1, taskId: id, html: '<p>Will review tomorrow.</p>' }),
    ]);
    const d = await detail(p, id);
    expect(d).toMatchObject({
      id,
      ref: 'ME-1',
      title: 'Review Quick Add PR',
      day: SUN,
      due: null,
      visibility: 'space',
      notes: '<p>Staging first.</p>',
      subsDone: 0,
      subsTotal: 2,
      commentCount: 1,
    });
    expect(d.subtasks.map((s) => [s.title, s.done])).toEqual([
      ['Pull the branch', false],
      ['Run it', false],
    ]);
    expect(d.comments).toHaveLength(1);
    expect(d.comments[0]).toMatchObject({ id: c1, html: '<p>Will review tomorrow.</p>', editedAt: null });
    expect(d.comments[0]!.author.id).toBe(p.userId);
    expect(d.history.map((e) => e.kind)).toEqual(['created']);
    const stranger = await person();
    const res = await get(server.app, `/api/spaces/${p.spaceId}/tasks/${id}`, stranger.jar);
    expect(res.status).toBe(403);
    const wrong = await get(server.app, `/api/spaces/${stranger.spaceId}/tasks/${id}`, stranger.jar);
    expect(wrong.status).toBe(404);
  });

  it('C03-A02 due: set and clear, last write wins by clock, each change writes a history event', async () => {
    const p = await person();
    const id = randomUUID();
    await sync(p, [create(p, 'Reply to legal', SUN, 1024, id)]);
    await sync(p, [m('task.due', { id, due: '2026-10-21' })]);
    expect((await detail(p, id)).due).toBe('2026-10-21');
    const later = m('task.due', { id, due: null });
    const earlier = m('task.due', { id, due: '2026-10-16' }, '2026-10-18T08:00:00.000Z');
    await sync(p, [later, earlier]);
    const d = await detail(p, id);
    expect(d.due).toBeNull();
    expect(d.history.map((e) => e.kind)).toEqual(['created', 'due.set', 'due.cleared']);
    expect(d.history[1]).toMatchObject({ due: '2026-10-21' });
    const d2 = await day(p, SUN);
    expect(d2.tasks[0]!.due).toBeNull();
  });

  it('C03-A03 notes are saved cleaned; oversize notes are refused; last write wins', async () => {
    const p = await person();
    const id = randomUUID();
    await sync(p, [create(p, 'Notes', SUN, 1024, id)]);
    await sync(p, [
      m('task.notes', { id, notes: '<p>Hi<script>alert(1)</script> <b>there</b></p><img src=x onerror=y>' }),
    ]);
    expect((await detail(p, id)).notes).toBe('<p>Hi <b>there</b></p>');
    const big = await sync(p, [m('task.notes', { id, notes: 'x'.repeat(100_001) })]);
    expect(big.results[0]).toMatchObject({ status: 'rejected', code: 400 });
    const old = m('task.notes', { id, notes: '<p>old</p>' }, '2026-10-18T08:00:00.000Z');
    await sync(p, [old]);
    expect((await detail(p, id)).notes).toBe('<p>Hi <b>there</b></p>');
  });

  it('C03-A04 visibility: only me and space are accepted', async () => {
    const p = await person();
    const id = randomUUID();
    await sync(p, [create(p, 'Secret', SUN, 1024, id)]);
    await sync(p, [m('task.visibility', { id, visibility: 'me' })]);
    expect((await detail(p, id)).visibility).toBe('me');
    const bad = await sync(p, [m('task.visibility', { id, visibility: 'everyone' })]);
    expect(bad.results[0]).toMatchObject({ status: 'rejected', code: 400 });
    expect((await detail(p, id)).visibility).toBe('me');
  });

  it('C03-A05 subtasks: create, rename, cross off, reorder, delete; idempotent and last write wins', async () => {
    const p = await person();
    const id = randomUUID();
    const a = randomUUID();
    const b = randomUUID();
    await sync(p, [create(p, 'Parent', SUN, 1024, id)]);
    const ca = m('subtask.create', { id: a, taskId: id, title: 'A', position: 1024 });
    await sync(p, [ca, m('subtask.create', { id: b, taskId: id, title: 'B', position: null })]);
    await sync(p, [ca]);
    let d = await detail(p, id);
    expect(d.subtasks.map((s) => s.title)).toEqual(['A', 'B']);
    expect(d.subtasks[1]!.position).toBeGreaterThan(1024);
    const later = m('subtask.rename', { id: a, taskId: id, title: 'A, later' });
    const earlier = m(
      'subtask.rename',
      { id: a, taskId: id, title: 'A, earlier' },
      '2026-10-18T08:00:00.000Z',
    );
    await sync(p, [
      later,
      earlier,
      m('subtask.cross', { id: b, taskId: id, done: true }),
      m('subtask.place', { id: b, taskId: id, position: 512 }),
    ]);
    d = await detail(p, id);
    expect(d.subtasks.map((s) => [s.title, s.done])).toEqual([
      ['B', true],
      ['A, later', false],
    ]);
    expect([d.subsDone, d.subsTotal]).toEqual([1, 2]);
    await sync(p, [m('subtask.delete', { id: b, taskId: id })]);
    d = await detail(p, id);
    expect(d.subtasks.map((s) => s.title)).toEqual(['A, later']);
    const gone = await sync(p, [m('subtask.rename', { id: b, taskId: id, title: 'Back?' })]);
    expect(gone.results[0]).toMatchObject({ status: 'rejected', code: 410 });
    const otherTask = randomUUID();
    await sync(p, [create(p, 'Other', SUN, 2048, otherTask)]);
    const mismatch = await sync(p, [m('subtask.cross', { id: a, taskId: otherTask, done: true })]);
    expect(mismatch.results[0]).toMatchObject({ status: 'rejected', code: 404 });
    const stranger = await person();
    const refused = await sync(stranger, [m('subtask.cross', { id: a, taskId: id, done: true })]);
    expect(refused.results[0]).toMatchObject({ status: 'rejected', code: 403 });
  });

  it('C03-A06 comments: add, edit and delete by the author only; a deleted one stays out', async () => {
    const p = await person();
    const id = randomUUID();
    const c = randomUUID();
    await sync(p, [create(p, 'Parent', SUN, 1024, id)]);
    await sync(p, [m('comment.create', { id: c, taskId: id, html: '<p>First <script>x()</script></p>' })]);
    let d = await detail(p, id);
    expect(d.comments[0]).toMatchObject({ id: c, html: '<p>First </p>' });
    const empty = await sync(p, [m('comment.create', { id: randomUUID(), taskId: id, html: '<p><br></p>' })]);
    expect(empty.results[0]).toMatchObject({ status: 'rejected', code: 400 });
    await sync(p, [m('comment.edit', { id: c, taskId: id, html: '<p>Edited</p>' })]);
    d = await detail(p, id);
    expect(d.comments[0]!.html).toBe('<p>Edited</p>');
    expect(d.comments[0]!.editedAt).not.toBeNull();
    expect(d.commentCount).toBe(1);
    await sync(p, [m('comment.delete', { id: c, taskId: id })]);
    d = await detail(p, id);
    expect(d.comments).toEqual([]);
    expect(d.commentCount).toBe(0);
    const again = await sync(p, [m('comment.edit', { id: c, taskId: id, html: '<p>Back</p>' })]);
    expect(again.results[0]).toMatchObject({ status: 'rejected', code: 410 });
    // someone else's comment: a stranger is not even in the space; the author check is on the row
    const stranger = await person();
    const refused = await sync(stranger, [m('comment.delete', { id: c, taskId: id })]);
    expect(refused.results[0]).toMatchObject({ status: 'rejected', code: 403 });
  });

  it('C03-A07 history: moving, carrying, crossing off and uncrossing each write one event in order', async () => {
    const p = await person();
    const id = randomUUID();
    await sync(p, [create(p, 'Moving', null, 1024, id)]);
    await sync(p, [
      m('task.place', { id, day: '2026-10-17', position: 1024 }),
      m('task.cross', { id, done: true }),
      m('task.cross', { id, done: true }),
      m('task.cross', { id, done: false }),
    ]);
    await day(p, SUN, SUN); // carries it forward
    const d = await detail(p, id);
    expect(d.history.map((e) => e.kind)).toEqual(['created', 'moved', 'crossed', 'uncrossed', 'carried']);
    expect(d.history[1]).toMatchObject({ from: null, to: '2026-10-17' });
    expect(d.history[4]).toMatchObject({ from: '2026-10-17' });
    expect(d.day).toBe(SUN);
  });

  it('C03-A08 restore: a deleted task comes back on its day in its place with its subtasks and comments', async () => {
    const p = await person();
    const id = randomUUID();
    const s = randomUUID();
    await sync(p, [
      create(p, 'One', SUN, 1024),
      create(p, 'Two', SUN, 2048, id),
      create(p, 'Three', SUN, 3072),
      m('subtask.create', { id: s, taskId: id, title: 'Sub', position: 1024 }),
      m('comment.create', { id: randomUUID(), taskId: id, html: '<p>Hi</p>' }),
    ]);
    await sync(p, [m('task.delete', { id })]);
    expect(titles(await day(p, SUN))).toEqual(['One', 'Three']);
    await detail(p, id, 404);
    const res = await sync(p, [m('task.restore', { id })]);
    expect(res.results[0]).toMatchObject({ status: 'ok' });
    expect(res.tasks.map((t) => t.id)).toEqual([id]);
    expect(titles(await day(p, SUN))).toEqual(['One', 'Two', 'Three']);
    const d = await detail(p, id);
    expect(d.subtasks.map((x) => x.title)).toEqual(['Sub']);
    expect(d.commentCount).toBe(1);
    expect(d.history.map((e) => e.kind)).toEqual(['created', 'restored']);
    // restoring a live task is a no-op; an older restore does not undo a newer delete
    const noop = await sync(p, [m('task.restore', { id })]);
    expect(noop.results[0]).toMatchObject({ status: 'ok' });
    await sync(p, [m('task.delete', { id })]);
    await sync(p, [m('task.restore', { id }, '2026-10-18T08:00:00.000Z')]);
    expect(titles(await day(p, SUN))).toEqual(['One', 'Three']);
  });

  it('C03-A09 a day’s rows carry due, subtasks and comment counts', async () => {
    const p = await person();
    const id = randomUUID();
    await sync(p, [
      create(p, 'Rich', SUN, 1024, id),
      m('task.due', { id, due: '2026-10-23' }),
      m('subtask.create', { id: randomUUID(), taskId: id, title: 'A', position: 1024 }),
      m('subtask.create', { id: randomUUID(), taskId: id, title: 'B', position: 2048 }),
      m('comment.create', { id: randomUUID(), taskId: id, html: '<p>Hi</p>' }),
    ]);
    const d = await day(p, SUN);
    const t = d.tasks[0]!;
    expect([t.due, t.subsDone, t.subsTotal, t.commentCount]).toEqual(['2026-10-23', 0, 2, 1]);
    expect(t.subtasks.map((s) => s.title)).toEqual(['A', 'B']);
    expect('notes' in t).toBe(false);
  });

  it('C03-A10 every change names its task on the live stream, for the space’s people only', async () => {
    const p = await person();
    const stranger = await person();
    const mine: Array<{ type: string; data: TasksChangedEvent }> = [];
    const theirs: unknown[] = [];
    const off1 = server.hub.subscribe(p.userId, (e) => mine.push(e as never));
    const off2 = server.hub.subscribe(stranger.userId, (e) => theirs.push(e));
    const id = randomUUID();
    await sync(p, [create(p, 'Announce', SUN, 1024, id)], 'tab-9');
    await sync(
      p,
      [m('subtask.create', { id: randomUUID(), taskId: id, title: 'A', position: 1024 })],
      'tab-9',
    );
    await sync(p, [m('task.notes', { id, notes: '<p>n</p>' })], 'tab-9');
    await sync(stranger, [m('task.due', { id, due: SUN })]);
    off1();
    off2();
    expect(mine.map((e) => e.data.tasks)).toEqual([[id], [id], [id]]);
    expect(mine[1]!.data).toMatchObject({ spaceId: p.spaceId, days: [SUN], clientId: 'tab-9' });
    expect(theirs).toEqual([]);
  });

  it('C03-A11 /tasks/ref/ME-2 says where a task is for the person who can see it, 404 otherwise', async () => {
    const p = await person();
    const id = randomUUID();
    await sync(p, [create(p, 'One', SUN, 1024), create(p, 'Two', '2026-10-21', 1024, id)]);
    const res = await get(server.app, '/api/tasks/ref/ME-2', p.jar);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ taskId: id, spaceId: p.spaceId, day: '2026-10-21' });
    expect((await get(server.app, '/api/tasks/ref/me-2', p.jar)).status).toBe(200);
    expect((await get(server.app, '/api/tasks/ref/ME-9', p.jar)).status).toBe(404);
    expect((await get(server.app, '/api/tasks/ref/nonsense', p.jar)).status).toBe(404);
    const stranger = await person();
    // the stranger's own ME-2 does not exist yet, and ours is not theirs
    expect((await get(server.app, '/api/tasks/ref/ME-2', stranger.jar)).status).toBe(404);
    await sync(p, [m('task.delete', { id })]);
    expect((await get(server.app, '/api/tasks/ref/ME-2', p.jar)).status).toBe(404);
  });
});

describe('projects and Quick Add (chunk 04)', () => {
  async function projects(p: Person) {
    const res = await get(server.app, `/api/spaces/${p.spaceId}/projects`, p.jar);
    expect(res.status).toBe(200);
    return ((await res.json()) as { projects: Array<{ id: string; name: string; color: string }> }).projects;
  }

  it('C04-A01 projects: create with the next colour, rename, recolour, delete; a deleted project leaves its tasks without one; 403 for strangers', async () => {
    const p = await person();
    const a = randomUUID();
    const b = randomUUID();
    const t = randomUUID();
    await sync(p, [
      m('project.create', { id: a, spaceId: p.spaceId, name: ' Northwind ' }),
      m('project.create', { id: b, spaceId: p.spaceId, name: 'Platform' }),
      create(p, 'Deploy', SUN, 1024, t),
      m('task.project', { id: t, projectId: b }),
    ]);
    let list = await projects(p);
    expect(list.map((x) => [x.name, x.color])).toEqual([
      ['Northwind', '#3d5a80'],
      ['Platform', '#5b7553'],
    ]);
    await sync(p, [
      m('project.update', { id: b, spaceId: p.spaceId, name: 'Platform team', color: '#8a5a00' }),
    ]);
    list = await projects(p);
    expect(list[1]).toMatchObject({ name: 'Platform team', color: '#8a5a00' });
    expect((await detail(p, t)).projectId).toBe(b);
    await sync(p, [m('project.delete', { id: b, spaceId: p.spaceId })]);
    expect((await projects(p)).map((x) => x.name)).toEqual(['Northwind']);
    expect((await detail(p, t)).projectId).toBeNull();
    const gone = await sync(p, [m('project.update', { id: b, spaceId: p.spaceId, name: 'Back?' })]);
    expect(gone.results[0]).toMatchObject({ status: 'rejected', code: 410 });
    const stranger = await person();
    const refused = await sync(stranger, [
      m('project.create', { id: randomUUID(), spaceId: p.spaceId, name: 'Mine' }),
    ]);
    expect(refused.results[0]).toMatchObject({ status: 'rejected', code: 403 });
    expect((await get(server.app, `/api/spaces/${p.spaceId}/projects`, stranger.jar)).status).toBe(403);
    const bad = await sync(p, [m('project.create', { id: randomUUID(), spaceId: p.spaceId, name: '   ' })]);
    expect(bad.results[0]).toMatchObject({ status: 'rejected', code: 400 });
  });

  it('C04-A02 set a task’s project: last write wins; a project from another space is refused; the day’s rows carry it', async () => {
    const p = await person();
    const other = await person();
    const a = randomUUID();
    const foreign = randomUUID();
    const t = randomUUID();
    await sync(p, [
      m('project.create', { id: a, spaceId: p.spaceId, name: 'Home' }),
      create(p, 'Bills', SUN, 1024, t),
    ]);
    await sync(other, [m('project.create', { id: foreign, spaceId: other.spaceId, name: 'Theirs' })]);
    const later = m('task.project', { id: t, projectId: a });
    const earlier = m('task.project', { id: t, projectId: null }, '2026-10-18T08:00:00.000Z');
    await sync(p, [later, earlier]);
    expect((await day(p, SUN)).tasks[0]!.projectId).toBe(a);
    const refused = await sync(p, [m('task.project', { id: t, projectId: foreign })]);
    expect(refused.results[0]).toMatchObject({ status: 'rejected', code: 400 });
    expect((await detail(p, t)).projectId).toBe(a);
  });

  it('C04-A03 a task from Quick Add lands with its due day, notes, project and files; its history says so', async () => {
    const p = await person();
    const a = randomUUID();
    const t = randomUUID();
    const up = await upload(p, 'spec.pdf', 'application/pdf', 1200);
    await sync(p, [
      m('project.create', { id: a, spaceId: p.spaceId, name: 'Northwind' }),
      m('task.create', {
        id: t,
        spaceId: p.spaceId,
        title: 'Send the offsite agenda',
        day: SUN,
        position: 1024,
        due: '2026-10-22',
        projectId: a,
        notes: '<p>Keep it to one page.<script>x()</script></p>',
        attachments: [up.id],
        source: 'quick-add',
      }),
    ]);
    const d = await detail(p, t);
    expect(d).toMatchObject({ due: '2026-10-22', projectId: a });
    expect(d.notes).toBe(
      `<p>Keep it to one page.</p><p><a class="tp-att" data-type="attachment" contenteditable="false" href="/api/files/${up.id}" target="_blank" data-id="${up.id}" data-name="spec.pdf" data-size="1200"><span class="tp-att-i"></span>spec.pdf<span class="tp-att-s">1 KB</span></a></p>`,
    );
    expect(d.history.map((e) => [e.kind, (e as { source?: string }).source ?? null])).toEqual([
      ['created', 'quick-add'],
      ['due.set', null],
    ]);
    const file = await (await get(server.app, `/api/files/${up.id}`, p.jar)).text();
    expect(file.length).toBe(1200);
    // the file now belongs to the task
    const row = await server.db.select().from(schema.attachments).where(eq(schema.attachments.id, up.id));
    expect(row[0]!.taskId).toBe(t);
    const foreign = await sync(p, [
      create(p, 'Bad', SUN, 2048),
      m('task.create', {
        id: randomUUID(),
        spaceId: p.spaceId,
        title: 'Bad project',
        day: SUN,
        position: 3072,
        projectId: randomUUID(),
      }),
    ]);
    expect(foreign.results[1]).toMatchObject({ status: 'rejected', code: 400 });
  });

  it('C04-A04 upload: a file lands in the bucket under the space; over 25 MB is refused; no file is 400', async () => {
    const p = await person();
    const saved = await upload(p, 'venue map.png', 'image/png', 50_000);
    expect(saved).toMatchObject({
      spaceId: p.spaceId,
      taskId: null,
      name: 'venue map.png',
      size: 50_000,
      type: 'image/png',
    });
    const key = `spaces/${p.spaceId}/${saved.id}`;
    expect((server.storage as MemoryStorage).objects.has(key)).toBe(true);
    const big = await uploadRaw(p, 'big.bin', 'application/octet-stream', 25 * 1024 * 1024 + 1);
    expect(big.status).toBe(413);
    const none = await post(server.app, `/api/spaces/${p.spaceId}/files`, {}, p.jar);
    expect(none.status).toBe(400);
    const stranger = await person();
    const refused = await uploadRaw(stranger, 'x.txt', 'text/plain', 10, p.spaceId);
    expect(refused.status).toBe(403);
    const bad = await uploadRaw(p, 'x.txt', 'text/plain', 10, undefined, 'no-such-task');
    expect(bad.status).toBe(404);
  });

  it('C04-A05 download: a member streams it back with its name and type; a stranger gets 403; an unknown id 404', async () => {
    const p = await person();
    const saved = await upload(p, 'notes.txt', 'text/plain', 20);
    const res = await get(server.app, `/api/files/${saved.id}`, p.jar);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/plain');
    expect(res.headers.get('content-disposition')).toBe("inline; filename*=UTF-8''notes.txt");
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect((await res.text()).length).toBe(20);
    const dl = await get(server.app, `/api/files/${saved.id}?download=1`, p.jar);
    expect(dl.headers.get('content-disposition')).toMatch(/^attachment;/);
    const html = await upload(p, 'page.html', 'text/html', 20);
    expect(
      (await get(server.app, `/api/files/${html.id}`, p.jar)).headers.get('content-disposition'),
    ).toMatch(/^attachment;/);
    const stranger = await person();
    expect((await get(server.app, `/api/files/${saved.id}`, stranger.jar)).status).toBe(403);
    expect((await get(server.app, `/api/files/${randomUUID()}`, p.jar)).status).toBe(404);
  });

  it('C04-A06 attachment chips in notes and comments survive the cleaner with their id, name and size', async () => {
    const p = await person();
    const t = randomUUID();
    const c = randomUUID();
    const chip =
      '<a class="tp-att" href="/api/files/abc-1" data-id="abc-1" data-name="spec.pdf" data-size="1200" onclick="x()"><span class="tp-att-i"></span>spec.pdf<span class="tp-att-s">1 KB</span></a>';
    await sync(p, [
      create(p, 'With files', SUN, 1024, t),
      m('task.notes', { id: t, notes: `<p>See ${chip}</p>` }),
      m('comment.create', { id: c, taskId: t, html: `<p>Also ${chip}</p>` }),
    ]);
    const d = await detail(p, t);
    const kept =
      '<a class="tp-att" data-type="attachment" contenteditable="false" href="/api/files/abc-1" target="_blank" data-id="abc-1" data-name="spec.pdf" data-size="1200"><span class="tp-att-i"></span>spec.pdf<span class="tp-att-s">1 KB</span></a>';
    expect(d.notes).toBe(`<p>See ${kept}</p>`);
    expect(d.comments[0]!.html).toBe(`<p>Also ${kept}</p>`);
  });

  it('C04-A07 the sweep: a file for a task that never came goes after a day; a deleted task’s files go a day later; live ones stay', async () => {
    const p = await person();
    const t = randomUUID();
    const orphan = await upload(p, 'orphan.txt', 'text/plain', 5);
    const fresh = await upload(p, 'fresh.txt', 'text/plain', 5);
    const kept = await upload(p, 'kept.txt', 'text/plain', 5);
    await sync(p, [
      m('task.create', {
        id: t,
        spaceId: p.spaceId,
        title: 'Keeper',
        day: SUN,
        position: 1024,
        attachments: [kept.id],
      }),
    ]);
    const gone = randomUUID();
    const dropped = await upload(p, 'dropped.txt', 'text/plain', 5);
    await sync(p, [
      m('task.create', {
        id: gone,
        spaceId: p.spaceId,
        title: 'Going',
        day: SUN,
        position: 2048,
        attachments: [dropped.id],
      }),
    ]);
    await sync(p, [m('task.delete', { id: gone })]);
    // age the orphan and the deleted task by a day
    const old = new Date(Date.now() - 25 * 60 * 60 * 1000);
    await server.db
      .update(schema.attachments)
      .set({ createdAt: old })
      .where(eq(schema.attachments.id, orphan.id));
    await server.db.update(schema.tasks).set({ deletedAt: old }).where(eq(schema.tasks.id, gone));
    expect(await sweepAttachments(server.db, server.storage)).toBe(2);
    expect((await get(server.app, `/api/files/${orphan.id}`, p.jar)).status).toBe(404);
    expect((await get(server.app, `/api/files/${dropped.id}`, p.jar)).status).toBe(404);
    expect((await get(server.app, `/api/files/${fresh.id}`, p.jar)).status).toBe(200);
    expect((await get(server.app, `/api/files/${kept.id}`, p.jar)).status).toBe(200);
    expect((server.storage as MemoryStorage).objects.has(`spaces/${p.spaceId}/${orphan.id}`)).toBe(false);
  });

  it('C04-A08 every project change tells the space’s people, and nobody else', async () => {
    const p = await person();
    const stranger = await person();
    const mine: Array<{ type: string; data: unknown }> = [];
    const theirs: unknown[] = [];
    const off1 = server.hub.subscribe(p.userId, (e) => mine.push(e));
    const off2 = server.hub.subscribe(stranger.userId, (e) => theirs.push(e));
    const a = randomUUID();
    await sync(p, [m('project.create', { id: a, spaceId: p.spaceId, name: 'Home' })], 'tab-9');
    await sync(p, [m('project.update', { id: a, spaceId: p.spaceId, name: 'House' })], 'tab-9');
    await sync(p, [m('project.delete', { id: a, spaceId: p.spaceId })], 'tab-9');
    off1();
    off2();
    expect(mine.map((e) => e.type)).toEqual(['projects.changed', 'projects.changed', 'projects.changed']);
    expect(mine[0]!.data).toEqual({ spaceId: p.spaceId, clientId: 'tab-9' });
    expect(theirs).toEqual([]);
  });
});

async function uploadRaw(
  p: Person,
  name: string,
  type: string,
  size: number,
  spaceId = p.spaceId,
  taskId?: string,
) {
  const form = new FormData();
  form.append('file', new File([new Uint8Array(size)], name, { type }), name);
  if (taskId) form.append('taskId', taskId);
  const res = await server.app.request(`/api/spaces/${spaceId}/files`, {
    method: 'POST',
    headers: { origin: 'http://localhost:5173', cookie: p.jar.header() },
    body: form,
  });
  return res;
}

async function upload(p: Person, name: string, type: string, size: number): Promise<Attachment> {
  const res = await uploadRaw(p, name, type, size);
  expect(res.status).toBe(201);
  return (await res.json()) as Attachment;
}
