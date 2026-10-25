import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  ALL_SPACES_CHANGED,
  type AllSpacesChangedEvent,
  type AllSpacesPlacesResponse,
  type DayResponse,
  type SearchResponse,
  type SpaceSummary,
  type SyncResponse,
} from '@tudu/core';
import { eq, schema, sql } from '@tudu/db';
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

async function person(): Promise<Person> {
  const { jar, email } = await signIn(server);
  const me = (await (await get(server.app, '/api/me', jar)).json()) as {
    user: { id: string };
    spaces: SpaceSummary[];
  };
  return { jar, email, userId: me.user.id, personalId: me.spaces[0]!.id };
}

async function del(path: string, jar: Jar): Promise<Response> {
  return server.app.request(path, {
    method: 'DELETE',
    headers: { origin: 'http://localhost:5173', cookie: jar.header() },
  });
}

async function makeSpace(p: Person, name: string, invites: string[] = []): Promise<SpaceSummary> {
  const res = await post(server.app, '/api/spaces', { name, color: '#3d5a80', invites }, p.jar);
  expect(res.status).toBe(201);
  return ((await res.json()) as { space: SpaceSummary }).space;
}

function joinLink(email: string): string {
  const mail = server.outbox
    .to(email)
    .filter((x) => /invited you/.test(x.subject))
    .at(-1);
  const found = /\/join\/([A-Za-z0-9_-]+)/.exec(mail!.text);
  return found![1]!;
}

async function joinSpace(p: Person, token: string): Promise<void> {
  const res = await post(server.app, `/api/join/${token}`, {}, p.jar);
  expect(res.status).toBe(200);
}

/** You and Meera in Northwind and Pilot Farm, both made by you; each of you also has Personal. */
async function world() {
  const you = await person();
  const meera = await person();
  const nw = await makeSpace(you, 'Northwind', [meera.email]);
  await joinSpace(meera, joinLink(meera.email));
  const pf = await makeSpace(you, 'Pilot Farm', [meera.email]);
  await joinSpace(meera, joinLink(meera.email));
  return { you, meera, nw, pf };
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

/** Write a task and return its id. */
async function task(p: Person, spaceId: string, title: string, day: string | null = DAY): Promise<string> {
  const id = randomUUID();
  const res = await sync(p, [m('task.create', { id, spaceId, title, day, position: null })]);
  expect(res.results[0]!.status).toBe('ok');
  return id;
}

async function places(p: Person, q = `from=${DAY}&to=${DAY}`) {
  const res = await get(server.app, `/api/all-spaces/places?${q}`, p.jar);
  expect(res.status).toBe(200);
  return ((await res.json()) as AllSpacesPlacesResponse).places;
}

async function search(p: Person, q: string): Promise<SearchResponse> {
  const res = await get(server.app, `/api/search?${q}`, p.jar);
  expect(res.status).toBe(200);
  return (await res.json()) as SearchResponse;
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

const DAY = '2026-10-18';

describe('All spaces (chunk 21)', () => {
  it('C21-A01 all.place keeps your place in Personal and Northwind and leaves the tasks themselves alone', async () => {
    const { you, nw } = await world();
    const a = await task(you, you.personalId, 'Call the bank');
    const b = await task(you, nw.id, 'Ship the pilot');
    const before = (await (
      await get(server.app, `/api/spaces/${nw.id}/days/${DAY}`, you.jar)
    ).json()) as DayResponse;
    const res = await sync(you, [
      m('all.place', { id: b, day: DAY, position: 1024 }),
      m('all.place', { id: a, day: DAY, position: 2048 }),
    ]);
    expect(res.results.map((r) => r.status)).toEqual(['ok', 'ok']);
    // no task changed, so the answer carries none
    expect(res.tasks).toEqual([]);
    expect(await places(you)).toEqual([
      { taskId: b, day: DAY, position: 1024 },
      { taskId: a, day: DAY, position: 2048 },
    ]);
    const after = (await (
      await get(server.app, `/api/spaces/${nw.id}/days/${DAY}`, you.jar)
    ).json()) as DayResponse;
    expect(after.tasks.map((t) => [t.id, t.position])).toEqual(before.tasks.map((t) => [t.id, t.position]));
  });

  it('C21-A02 auth: a space you are not in is 403; Meera’s shared task is 403; her “only me” task is 404', async () => {
    const { you, meera, nw } = await world();
    const stranger = await person();
    const hers = await task(meera, nw.id, 'Meera’s shared task');
    const secret = await task(meera, nw.id, 'Meera’s private task');
    await sync(meera, [m('task.visibility', { id: secret, visibility: 'me' })]);
    const mine = await task(you, nw.id, 'Mine');
    const res = await sync(you, [
      m('all.place', { id: hers, day: DAY, position: 1 }),
      m('all.place', { id: secret, day: DAY, position: 2 }),
    ]);
    expect(res.results.map((r) => [r.status, r.code])).toEqual([
      ['rejected', 403],
      ['rejected', 404],
    ]);
    const out = await sync(stranger, [m('all.place', { id: mine, day: DAY, position: 3 })]);
    expect(out.results[0]).toMatchObject({ status: 'rejected', code: 403 });
    expect(await places(you)).toEqual([]);
    expect(await places(stranger)).toEqual([]);
  });

  it('C21-A03 the places read is yours alone: Meera’s places never show, nor a space you have left', async () => {
    const { you, meera, nw, pf } = await world();
    const shared = await task(you, nw.id, 'Ownerless soon');
    const farm = await task(meera, pf.id, 'Meera’s farm task');
    const yours = await task(you, pf.id, 'Your farm task');
    await sync(meera, [m('all.place', { id: farm, day: DAY, position: 5 })]);
    await sync(you, [
      m('all.place', { id: shared, day: DAY, position: 10 }),
      m('all.place', { id: yours, day: DAY, position: 20 }),
    ]);
    expect((await places(you)).map((p) => p.taskId)).toEqual([shared, yours]);
    expect((await places(meera)).map((p) => p.taskId)).toEqual([farm]);
    // Meera leaves Pilot Farm: her place there is gone, yours stay
    expect((await post(server.app, `/api/spaces/${pf.id}/leave`, {}, meera.jar)).status).toBe(204);
    expect(await places(meera)).toEqual([]);
    expect((await places(you)).map((p) => p.taskId)).toEqual([shared, yours]);
  });

  it('C21-A04 a place only counts on its day: a moved task loses it, and a place for the wrong day is 400', async () => {
    const { you, nw } = await world();
    const t = await task(you, nw.id, 'Plan the review');
    await sync(you, [m('all.place', { id: t, day: DAY, position: 7 })]);
    expect(await places(you)).toHaveLength(1);
    await sync(you, [m('task.place', { id: t, day: '2026-10-19', position: null })]);
    expect(await places(you, `from=${DAY}&to=2026-10-19`)).toEqual([]);
    const res = await sync(you, [m('all.place', { id: t, day: DAY, position: 8 })]);
    expect(res.results[0]).toMatchObject({ status: 'rejected', code: 400 });
    // the Backlog only with backlog=1
    await sync(you, [m('task.place', { id: t, day: null, position: null })]);
    await sync(you, [m('all.place', { id: t, day: null, position: 9 })]);
    expect(await places(you)).toEqual([]);
    expect(await places(you, `from=${DAY}&to=${DAY}&backlog=1`)).toEqual([
      { taskId: t, day: null, position: 9 },
    ]);
    // a span longer than two months is refused
    expect(
      (await get(server.app, `/api/all-spaces/places?from=2026-01-01&to=2026-12-31`, you.jar)).status,
    ).toBe(400);
  });

  it('C21-A05 an older place loses to a newer one, and the same mutation twice applies once', async () => {
    const { you } = await world();
    const t = await task(you, you.personalId, 'Water the plants');
    const late = m('all.place', { id: t, day: DAY, position: 300 }, '2026-10-18T12:00:00.000Z');
    const early = m('all.place', { id: t, day: DAY, position: 100 }, '2026-10-18T11:00:00.000Z');
    await sync(you, [late]);
    await sync(you, [early]);
    expect((await places(you))[0]!.position).toBe(300);
    const again = await sync(you, [late, late]);
    expect(again.results.map((r) => r.status)).toEqual(['ok', 'ok']);
    expect(await places(you)).toHaveLength(1);
  });

  it('C21-A06 removing, putting back and deleting: the leaver’s places for that space go, no one else’s', async () => {
    const { you, meera, nw, pf } = await world();
    const hers = await task(meera, nw.id, 'Meera in Northwind');
    const herFarm = await task(meera, pf.id, 'Meera in Pilot Farm');
    const yours = await task(you, nw.id, 'You in Northwind');
    await sync(meera, [
      m('all.place', { id: hers, day: DAY, position: 1 }),
      m('all.place', { id: herFarm, day: DAY, position: 2 }),
    ]);
    await sync(you, [m('all.place', { id: yours, day: DAY, position: 3 })]);
    expect((await del(`/api/spaces/${nw.id}/members/${meera.userId}`, you.jar)).status).toBe(204);
    expect((await places(meera)).map((p) => p.taskId)).toEqual([herFarm]);
    expect((await places(you)).map((p) => p.taskId)).toEqual([yours]);
    // put back: no order comes back with her
    expect(
      (await post(server.app, `/api/spaces/${nw.id}/members/${meera.userId}/restore`, {}, you.jar)).status,
    ).toBe(200);
    expect((await places(meera)).map((p) => p.taskId)).toEqual([herFarm]);
    // deleting Pilot Farm takes everyone's places for its tasks with it
    expect((await del(`/api/spaces/${pf.id}`, you.jar)).status).toBe(204);
    expect(await places(meera)).toEqual([]);
    const rows = await server.db
      .select()
      .from(schema.allSpacesPlaces)
      .where(eq(schema.allSpacesPlaces.taskId, herFarm));
    expect(rows).toEqual([]);
  });

  it('C21-A07 all.place tells only you, on the live stream, with the day and your tab', async () => {
    const { you, meera, nw } = await world();
    const t = await task(you, nw.id, 'Draft the agenda');
    let meeraHeard = false;
    const off = server.hub.subscribe(meera.userId, (e) => {
      if (e.type === ALL_SPACES_CHANGED) meeraHeard = true;
    });
    const heard = nextEvent<AllSpacesChangedEvent>(you.userId, ALL_SPACES_CHANGED);
    await sync(you, [m('all.place', { id: t, day: DAY, position: 4 })], 'tab-9');
    expect(await heard).toEqual({ days: [DAY], clientId: 'tab-9' });
    off();
    expect(meeraHeard).toBe(false);
  });

  it('C21-A08 the slug "all" is All spaces’: a space that had it moves to all-2, its old address goes; a new “All” is all-3', async () => {
    const owner = await person();
    const id = randomUUID();
    await server.db
      .insert(schema.spaces)
      .values({ id, kind: 'team', name: 'All hands', slug: 'all', taskPrefix: 'AH' });
    await server.db.insert(schema.spaceMembers).values({ spaceId: id, userId: owner.userId, role: 'admin' });
    await server.db.insert(schema.spaceSlugs).values({ slug: 'all', spaceId: id }).onConflictDoNothing();
    const migration = readFileSync(
      fileURLToPath(new URL('../../../packages/db/migrations/0013_all-spaces.sql', import.meta.url)),
      'utf8',
    );
    const block = migration.slice(migration.indexOf('DO $$'));
    await server.db.execute(sql.raw(block));
    const [row] = await server.db
      .select({ slug: schema.spaces.slug })
      .from(schema.spaces)
      .where(eq(schema.spaces.id, id));
    expect(row!.slug).toBe('all-2');
    expect(await server.db.select().from(schema.spaceSlugs).where(eq(schema.spaceSlugs.slug, 'all'))).toEqual(
      [],
    );
    // running it again changes nothing
    await server.db.execute(sql.raw(block));
    const [still] = await server.db
      .select({ slug: schema.spaces.slug })
      .from(schema.spaces)
      .where(eq(schema.spaces.id, id));
    expect(still!.slug).toBe('all-2');
    const made = await makeSpace(owner, 'All');
    expect(made.slug).toBe('all-3');
  });

  it('C21-A09 search finds your tasks and Meera’s shared ones in every space, each with its space', async () => {
    const { you, meera, nw, pf } = await world();
    const mine = await task(you, you.personalId, 'Quarterly invoice for Personal');
    const nwMine = await task(you, nw.id, 'Quarterly invoice for Northwind');
    const pfHers = await task(meera, pf.id, 'Quarterly invoice for Pilot Farm');
    const { hits } = await search(you, `q=quarterly%20invoice&today=${DAY}`);
    expect(hits.map((h) => h.id).sort()).toEqual([mine, nwMine, pfHers].sort());
    expect(Object.fromEntries(hits.map((h) => [h.id, h.spaceId]))).toEqual({
      [mine]: you.personalId,
      [nwMine]: nw.id,
      [pfHers]: pf.id,
    });
    // Recently opened, across spaces, in the order asked
    const recent = await search(you, `ids=${pfHers},${mine}`);
    expect(recent.hits.map((h) => h.id)).toEqual([pfHers, mine]);
  });

  it('C21-A10 search never shows a colleague’s “only me” task, a space you aren’t in, one you’ve left, or a deleted task', async () => {
    // Meera searches; you are her colleague in Northwind and Pilot Farm.
    const { you, meera, nw, pf } = await world();
    const stranger = await person();
    const otherSpace = await makeSpace(stranger, 'Elsewhere');
    const outside = await task(stranger, otherSpace.id, 'Zebra plan outside');
    const secret = await task(you, nw.id, 'Zebra plan private');
    await sync(you, [m('task.visibility', { id: secret, visibility: 'me' })]);
    const farm = await task(you, pf.id, 'Zebra plan on the farm');
    const gone = await task(meera, meera.personalId, 'Zebra plan deleted');
    await sync(meera, [m('task.delete', { id: gone })]);
    const visible = await task(you, nw.id, 'Zebra plan shared');
    let ids = (await search(meera, 'q=zebra')).hits.map((h) => h.id);
    expect(ids.sort()).toEqual([farm, visible].sort());
    expect(
      (await search(meera, `ids=${outside},${secret},${gone},${visible}`)).hits.map((h) => h.id),
    ).toEqual([visible]);
    // after Meera leaves Pilot Farm its tasks drop out
    expect((await post(server.app, `/api/spaces/${pf.id}/leave`, {}, meera.jar)).status).toBe(204);
    ids = (await search(meera, 'q=zebra')).hits.map((h) => h.id);
    expect(ids).toEqual([visible]);
    expect((await search(meera, `ids=${farm}`)).hits).toEqual([]);
  });

  it('C21-A11 `here` only breaks ties; a space you aren’t in adds nothing; at most thirty; the old route still answers', async () => {
    const { you, nw } = await world();
    const stranger = await person();
    const elsewhere = await makeSpace(stranger, 'Elsewhere');
    await task(stranger, elsewhere.id, 'Kiwi elsewhere');
    const a = await task(you, you.personalId, 'Kiwi review');
    const b = await task(you, nw.id, 'Kiwi review');
    const plain = (await search(you, `q=kiwi&today=${DAY}`)).hits.map((h) => h.id);
    expect(plain.sort()).toEqual([a, b].sort());
    expect((await search(you, `q=kiwi&today=${DAY}&here=${nw.id}`)).hits.map((h) => h.id)).toEqual([b, a]);
    expect((await search(you, `q=kiwi&today=${DAY}&here=${you.personalId}`)).hits.map((h) => h.id)).toEqual([
      a,
      b,
    ]);
    // a forged here widens nothing
    expect((await search(you, `q=kiwi&here=${elsewhere.id}`)).hits.map((h) => h.id).sort()).toEqual(
      [a, b].sort(),
    );
    const many = Array.from({ length: 36 }, (_, i) =>
      m('task.create', {
        id: randomUUID(),
        spaceId: i % 2 ? nw.id : you.personalId,
        title: `Lemon ${i}`,
        day: DAY,
        position: null,
      }),
    );
    await sync(you, many);
    expect((await search(you, 'q=lemon')).hits).toHaveLength(30);
    // the per-space route stays for one release (the Mac app on 0.37)
    const old = await get(server.app, `/api/spaces/${nw.id}/search?q=kiwi`, you.jar);
    expect(old.status).toBe(200);
    expect(((await old.json()) as SearchResponse).hits.map((h) => h.id)).toEqual([b]);
  });
});
