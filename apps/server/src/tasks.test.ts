import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DayResponse, MarksResponse, SyncResponse, Task, TasksChangedEvent } from '@tudu/core';
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
    expect(mine[0]!.data).toEqual({ spaceId: p.spaceId, days: ['2026-10-18'], clientId: 'tab-9' });
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
        'createdAt',
        'day',
        'done',
        'doneAt',
        'id',
        'number',
        'position',
        'ref',
        'spaceId',
        'title',
        'updatedAt',
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
