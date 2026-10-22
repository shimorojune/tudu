import { randomUUID } from 'node:crypto';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SearchResponse, SpaceSummary, SyncResponse } from '@tudu/core';
import { MEANING_FLOOR, embeddingText } from '@tudu/core';
import { eq, schema, sql } from '@tudu/db';
import { EMBEDDING_DIMENSIONS } from '@tudu/db/schema';
import { FakeEmbedder, type LocalEmbedder } from './embeddings';
import { Embeddings, readableBy, searchByMeaning } from './closeMatches';
import { get, post, signIn, startServer, type Jar } from '../test/harness';

const ROOT = resolve(fileURLToPath(import.meta.url), '../../../..');
const LONG = 60_000;

let server: ReturnType<typeof startServer>;
beforeAll(async () => {
  server = startServer();
  // The model loads once for the file.
  await (server.embeddings.embedder as LocalEmbedder).warm();
}, LONG);
afterAll(async () => {
  await server.close();
});

interface Person {
  jar: Jar;
  email: string;
  userId: string;
  spaceId: string;
}

async function person(): Promise<Person> {
  const { jar, email } = await signIn(server);
  const me = (await (await get(server.app, '/api/me', jar)).json()) as {
    user: { id: string };
    spaces: Array<{ id: string }>;
  };
  return { jar, email, userId: me.user.id, spaceId: me.spaces[0]!.id };
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
function create(spaceId: string, title: string, extra: Record<string, unknown> = {}, id = randomUUID()) {
  return m('task.create', { id, spaceId, title, day: null, position: 1024, ...extra });
}
/** Embed everything pending, as the batch after a sync would. */
const settle = () => server.embeddings.drain();

async function meaning(p: Person, q: string, exclude: string[] = []): Promise<SearchResponse> {
  const res = await get(
    server.app,
    `/api/search/meaning?q=${encodeURIComponent(q)}${exclude.length ? `&exclude=${exclude.join(',')}` : ''}`,
    p.jar,
  );
  expect(res.status).toBe(200);
  return (await res.json()) as SearchResponse;
}
async function search(p: Person, spaceId: string, query: string): Promise<SearchResponse> {
  const res = await get(server.app, `/api/spaces/${spaceId}/search?${query}`, p.jar);
  expect(res.status).toBe(200);
  return (await res.json()) as SearchResponse;
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
  const found = /\/join\/([A-Za-z0-9_-]+)/.exec(mail?.text ?? '');
  expect(found).toBeTruthy();
  return found![1]!;
}
async function joinSpace(p: Person, token: string): Promise<SpaceSummary> {
  const res = await post(server.app, `/api/join/${token}`, {}, p.jar);
  expect(res.status).toBe(200);
  return ((await res.json()) as { space: SpaceSummary }).space;
}
async function team(): Promise<{ a: Person; b: Person; space: SpaceSummary }> {
  const a = await person();
  const b = await person();
  const space = await makeSpace(a, 'Northwind', [b.email]);
  await joinSpace(b, joinLink(b.email));
  return { a, b, space };
}
async function vectorOf(id: string): Promise<{ embedding: number[] | null; embeddedText: string | null }> {
  const [row] = await server.db
    .select({ embedding: schema.tasks.embedding, embeddedText: schema.tasks.embeddedText })
    .from(schema.tasks)
    .where(eq(schema.tasks.id, id));
  return row!;
}

describe('close matches', () => {
  it(
    'C13-U03 the embedder: the fake in tests, the real one answers 384 numbers and the same text gives the same vector; EMBEDDINGS picks the adapter and a bad value fails the start',
    async () => {
      const fake = new FakeEmbedder();
      const [a, b, c] = await fake.embed(['renew passport', 'renew passport', 'book flights']);
      expect(a).toHaveLength(EMBEDDING_DIMENSIONS);
      expect(a).toEqual(b);
      expect(a).not.toEqual(c);
      expect(fake.seen).toEqual(['renew passport', 'renew passport', 'book flights']);
      const real = server.embeddings.embedder!;
      expect(real.dims).toBe(EMBEDDING_DIMENSIONS);
      const [x, y] = await real.embed(['dentist appointment', 'dentist appointment']);
      expect(x).toHaveLength(384);
      expect(x).toEqual(y);
      expect(Math.abs(x!.reduce((s, v) => s + v * v, 0) - 1)).toBeLessThan(1e-3);
      // off: no model, the meaning search is unavailable and the look-alikes fall back to words
      const off = startServer({ EMBEDDINGS: 'off' });
      expect(off.embeddings.on).toBe(false);
      await expect(off.embeddings.query('x')).rejects.toThrow(/aren’t available/);
      await off.close();
      expect(() => startServer({ EMBEDDINGS: 'hosted' })).toThrow(/Bad environment/);
    },
    LONG,
  );

  it(
    'C13-U04 readableBy: your own, shared by others, owner gone; never another’s Only me, never a space you are not in; the same rows from the word, meaning and look-alike reads',
    async () => {
      const { a, b, space } = await team();
      const mine = randomUUID();
      const shared = randomUUID();
      const secret = randomUUID();
      const personal = randomUUID();
      const gone = randomUUID();
      await sync(a, [create(space.id, 'Dentist appointment on Tuesday', {}, mine)]);
      await sync(b, [
        create(space.id, 'Dentist appointment for the kids', {}, shared),
        create(space.id, 'Dentist appointment, keep it quiet', {}, secret),
        m('task.visibility', { id: secret, visibility: 'me' }),
        create(b.spaceId, 'Dentist appointment at home', {}, personal),
        create(space.id, 'Dentist appointment left behind', {}, gone),
      ]);
      // an owner who is gone: the task belongs to everyone in the space
      await server.db.update(schema.tasks).set({ ownerId: null }).where(eq(schema.tasks.id, gone));
      const rows = await server.db
        .select({ id: schema.tasks.id })
        .from(schema.tasks)
        .where(readableBy(a.userId));
      const ids = rows.map((r) => r.id);
      expect(ids).toEqual(expect.arrayContaining([mine, shared, gone]));
      expect(ids).not.toContain(secret);
      expect(ids).not.toContain(personal);
      // and the same through each read
      await settle();
      const word = (await search(a, space.id, 'q=dentist')).hits.map((h) => h.id).sort();
      expect(word).toEqual([mine, shared, gone].sort());
      const alike = (await search(a, space.id, 'for=lookalike&q=Dentist%20appointment')).hits.map(
        (h) => h.id,
      );
      expect(alike).toHaveLength(3);
      expect(alike).not.toContain(secret);
      const close = (await meaning(a, 'teeth checkup')).hits.map((h) => h.id);
      expect(close.length).toBeGreaterThan(0);
      expect(close).not.toContain(secret);
      expect(close).not.toContain(personal);
    },
    LONG,
  );

  it(
    'C13-A01 search/meaning: a paraphrase finds the task, the closest first, at most four, above the floor, exclude honoured, hits from two spaces each carry their space',
    async () => {
      const p = await person();
      const nw = await makeSpace(p, 'Northwind');
      const dentist = randomUUID();
      const flights = randomUUID();
      await sync(p, [
        create(p.spaceId, 'Dentist appointment', { notes: '<p>Bring the insurance card.</p>' }, dentist),
        create(p.spaceId, 'Pay the electricity bill'),
        create(nw.id, 'Book flights to Lisbon', {}, flights),
        create(nw.id, 'Write the release notes'),
      ]);
      await settle();
      const teeth = await meaning(p, 'teeth checkup');
      expect(teeth.hits[0]).toMatchObject({ id: dentist, spaceId: p.spaceId, ref: 'ME-1', snippet: null });
      expect(teeth.hits.map((h) => h.id)).not.toContain(flights);
      const planes = await meaning(p, 'plane tickets to Portugal');
      expect(planes.hits[0]).toMatchObject({ id: flights, spaceId: nw.id, ref: 'NW-1' });
      // excluded: the word hits the panel already lists
      expect((await meaning(p, 'teeth checkup', [dentist])).hits.map((h) => h.id)).not.toContain(dentist);
      // at most four, the closest first, among six that all mean it
      const ids = [1, 2, 3, 4, 5, 6].map(() => randomUUID());
      await sync(
        p,
        ids.map((id, i) => create(nw.id, `Dentist appointment ${i + 1}`, {}, id)),
      );
      await settle();
      const many = await meaning(p, 'dentist appointment');
      expect(many.hits).toHaveLength(4);
      expect(many.hits.every((h) => /dentist/i.test(h.title))).toBe(true);
      // nothing above the floor: nothing
      expect((await meaning(p, 'quantum chromodynamics lecture')).hits).toEqual([]);
      // no words: nothing
      expect((await meaning(p, '   ')).hits).toEqual([]);
      // no session: 401
      expect((await get(server.app, '/api/search/meaning?q=dentist')).status).toBe(401);
    },
    LONG,
  );

  it(
    'C13-A02 who may see what, by meaning: a shared task is found, Only me never, a space you left never, another’s Personal never, even when it is the nearest; an outsider gets nothing; a stranger to a space is 403',
    async () => {
      const { a, b, space } = await team();
      const shared = randomUUID();
      const secret = randomUUID();
      const personal = randomUUID();
      await sync(b, [
        create(space.id, 'Dentist appointment for the kids', {}, shared),
        // the nearest by meaning, and never shown to a
        create(space.id, 'teeth checkup', {}, secret),
        m('task.visibility', { id: secret, visibility: 'me' }),
        create(b.spaceId, 'teeth checkup at the dentist', {}, personal),
      ]);
      await settle();
      const seen = (await meaning(a, 'teeth checkup')).hits.map((h) => h.id);
      expect(seen).toEqual([shared]);
      // b sees all three of their own
      expect((await meaning(b, 'teeth checkup')).hits.map((h) => h.id).sort()).toEqual(
        [shared, secret, personal].sort(),
      );
      // an outsider: nothing of theirs
      const c = await person();
      expect((await meaning(c, 'teeth checkup')).hits).toEqual([]);
      const stranger = await get(server.app, `/api/spaces/${space.id}/search?q=dentist`, c.jar);
      expect(stranger.status).toBe(403);
      // b left the space: what b wrote there is no longer b's to find, b's Personal still is
      const left = await post(server.app, `/api/spaces/${space.id}/leave`, {}, b.jar);
      expect(left.status).toBe(204);
      expect((await meaning(b, 'teeth checkup')).hits.map((h) => h.id)).toEqual([personal]);
    },
    LONG,
  );

  it(
    'C13-A03 who may see what, by word: the space’s word search lists a second member’s shared task and never their Only me one; Quick Add look-alikes the same',
    async () => {
      const { a, b, space } = await team();
      const shared = randomUUID();
      const secret = randomUUID();
      await sync(b, [
        create(space.id, 'Renew passport', {}, shared),
        create(space.id, 'Renew passport quietly', {}, secret),
        m('task.visibility', { id: secret, visibility: 'me' }),
      ]);
      await settle();
      expect((await search(a, space.id, 'q=passport')).hits.map((h) => h.id)).toEqual([shared]);
      expect(
        (await search(a, space.id, 'for=lookalike&q=Renew%20my%20passport')).hits.map((h) => h.id),
      ).toEqual([shared]);
      expect((await search(b, space.id, 'q=passport')).hits.map((h) => h.id).sort()).toEqual(
        [shared, secret].sort(),
      );
      // recently opened reads the same way
      expect((await search(a, space.id, `ids=${secret},${shared}`)).hits.map((h) => h.id)).toEqual([shared]);
    },
    LONG,
  );

  it(
    'C13-A04 a created task has a vector after the batch settles; a rename or a notes change nulls and refills it; a deleted task never matches; a crossed-off one still does',
    async () => {
      const p = await person();
      const id = randomUUID();
      await sync(p, [create(p.spaceId, 'Dentist appointment', {}, id)]);
      await settle();
      const first = await vectorOf(id);
      expect(first.embedding).toHaveLength(384);
      expect(first.embeddedText).toBe('dentist appointment');
      await sync(p, [m('task.rename', { id, title: 'Book flights to Lisbon' })]);
      expect((await vectorOf(id)).embedding).toBeNull();
      await settle();
      const second = await vectorOf(id);
      expect(second.embeddedText).toBe('book flights to lisbon');
      expect(second.embedding).not.toEqual(first.embedding);
      await sync(p, [m('task.notes', { id, notes: '<p>Window seat, <b>morning</b> flight.</p>' })]);
      expect((await vectorOf(id)).embedding).toBeNull();
      await settle();
      expect((await vectorOf(id)).embeddedText).toBe('book flights to lisbon\nwindow seat, morning flight.');
      // a cross-off keeps the vector and the task still matches, with its tick
      await sync(p, [m('task.cross', { id, done: true })]);
      expect((await vectorOf(id)).embedding).not.toBeNull();
      expect((await meaning(p, 'plane tickets')).hits[0]).toMatchObject({ id, done: true });
      await sync(p, [m('task.delete', { id })]);
      expect((await meaning(p, 'plane tickets')).hits).toEqual([]);
    },
    LONG,
  );

  it(
    'C13-A05 the backfill: rows with no vector get one from the tick, a few at a time, and embedded_text records what was embedded; a write in between is not overwritten',
    async () => {
      const fake = new FakeEmbedder();
      const quiet = new Embeddings(server.db, fake, { batch: 2 });
      const p = await person();
      const ids = [1, 2, 3, 4, 5].map(() => randomUUID());
      await sync(
        p,
        ids.map((id, i) => create(p.spaceId, `Task number ${i + 1}`, {}, id)),
      );
      // the real runner has done these after the sync; take them back to pending
      await settle();
      await server.db
        .update(schema.tasks)
        .set({ embedding: null, embeddedText: null })
        .where(
          sql`${schema.tasks.id} in (${sql.join(
            ids.map((x) => sql`${x}`),
            sql`, `,
          )})`,
        );
      expect(await quiet.step()).toBe(2);
      expect(fake.seen).toHaveLength(2);
      const done = await quiet.drain();
      expect(done).toBeGreaterThanOrEqual(3);
      for (const id of ids) {
        const v = await vectorOf(id);
        expect(v.embedding).toHaveLength(384);
        expect(v.embeddedText).toMatch(/^task number \d$/);
      }
      expect(await quiet.step()).toBe(0);
      // a change between the read and the write: the stale vector is not written
      const slow = new FakeEmbedder();
      const original = slow.embed.bind(slow);
      slow.embed = async (texts) => {
        // a rename lands while the model is busy (as the sync path does: new words, no vector)
        await server.db
          .update(schema.tasks)
          .set({ title: 'Renamed in between', embedding: null, embeddedText: null })
          .where(eq(schema.tasks.id, ids[0]!));
        return original(texts);
      };
      await server.db
        .update(schema.tasks)
        .set({ embedding: null, embeddedText: null })
        .where(eq(schema.tasks.id, ids[0]!));
      const racing = new Embeddings(server.db, slow, { batch: 1 });
      expect(await racing.step()).toBe(1);
      const after = await vectorOf(ids[0]!);
      expect(after.embedding).toBeNull();
      expect(await racing.step()).toBe(1);
      expect((await vectorOf(ids[0]!)).embeddedText).toBe('renamed in between');
    },
    LONG,
  );

  it(
    'C13-A06 for=lookalike returns the merged list: shared words, meaning, folded, at most three; with the model down the words alone',
    async () => {
      const p = await person();
      const renew = randomUUID();
      const expires = randomUUID();
      const flights = randomUUID();
      await sync(p, [
        create(p.spaceId, 'Renew passport', {}, renew),
        create(p.spaceId, 'Passport expires in March', {}, expires),
        create(p.spaceId, 'Book flights to Lisbon', {}, flights),
        create(p.spaceId, 'Pay the electricity bill'),
      ]);
      await settle();
      const hits = (await search(p, p.spaceId, 'for=lookalike&q=Renew%20my%20passport')).hits.map(
        (h) => h.id,
      );
      expect(hits[0]).toBe(renew);
      expect(hits).toContain(expires);
      expect(hits).not.toContain(flights);
      expect(hits.length).toBeLessThanOrEqual(3);
      // by meaning alone
      expect(
        (await search(p, p.spaceId, 'for=lookalike&q=get%20flights%20booked')).hits.map((h) => h.id),
      ).toEqual([flights]);
      // the model down: words still work, meaning is left out, nothing fails
      server.embeddings.down = true;
      try {
        expect((await search(p, p.spaceId, 'for=lookalike&q=get%20flights%20booked')).hits).toEqual([]);
        expect((await search(p, p.spaceId, 'for=lookalike&q=Renew%20my%20passport')).hits[0]!.id).toBe(renew);
        const down = await get(server.app, '/api/search/meaning?q=get%20flights%20booked', p.jar);
        expect(down.status).toBe(503);
      } finally {
        server.embeddings.down = false;
      }
    },
    LONG,
  );

  it(
    'C13-A07 accuracy: the labelled searches against the fixture space with the shipped model; recall at four and precision are written for docs/tests/chunk-13.md',
    async () => {
      const fixture = JSON.parse(
        readFileSync(resolve(ROOT, 'packages/core/test/fixtures/close-matches.json'), 'utf8'),
      ) as {
        tasks: Array<{ key: string; title: string; notes?: string }>;
        searches: Array<{ q: string; expect?: string; none?: boolean }>;
      };
      const p = await person();
      const idOf = new Map<string, string>();
      await sync(
        p,
        fixture.tasks.map((t) => {
          const id = randomUUID();
          idOf.set(t.key, id);
          return create(p.spaceId, t.title, t.notes ? { notes: `<p>${t.notes}</p>` } : {}, id);
        }),
      );
      await settle();
      const misses: string[] = [];
      let positives = 0;
      let recalled = 0;
      let negatives = 0;
      let clean = 0;
      for (const s of fixture.searches) {
        const hits = (await meaning(p, s.q)).hits;
        if (s.none) {
          negatives += 1;
          if (!hits.length) clean += 1;
          else misses.push(`"${s.q}" found ${hits.map((h) => h.title).join(' | ')}`);
        } else {
          positives += 1;
          if (hits.some((h) => h.id === idOf.get(s.expect!))) recalled += 1;
          else
            misses.push(`"${s.q}" missed ${s.expect}: ${hits.map((h) => h.title).join(' | ') || 'nothing'}`);
        }
      }
      const recall = recalled / positives;
      const precision = clean / negatives;
      mkdirSync(resolve(ROOT, 'reports'), { recursive: true });
      writeFileSync(
        resolve(ROOT, 'reports/close-matches.json'),
        JSON.stringify(
          {
            model: server.embeddings.embedder!.name,
            floor: MEANING_FLOOR,
            searches: fixture.searches.length,
            recall: Number(recall.toFixed(3)),
            precision: Number(precision.toFixed(3)),
            misses,
            at: new Date().toISOString(),
          },
          null,
          2,
        ),
      );
      expect(recall, misses.join('\n')).toBeGreaterThanOrEqual(0.85);
      expect(precision, misses.join('\n')).toBeGreaterThanOrEqual(0.9);
    },
    LONG,
  );

  it('C13-A08 migration 0010 applies on a database at 0009: the extension, the column, the index', async () => {
    const ext = await server.db.execute(sql`select extversion from pg_extension where extname = 'vector'`);
    expect(ext.rows).toHaveLength(1);
    const cols = (
      await server.db.execute(
        sql`select column_name, udt_name from information_schema.columns where table_name = 'tasks' and column_name in ('embedding', 'embedded_text') order by column_name`,
      )
    ).rows.map((r) => `${r.column_name}:${r.udt_name}`);
    expect(cols).toEqual(['embedded_text:text', 'embedding:vector']);
    const idx = await server.db.execute(
      sql`select indexdef from pg_indexes where tablename = 'tasks' and indexname = 'tasks_embedding'`,
    );
    expect(String(idx.rows[0]!.indexdef)).toMatch(/USING hnsw \(embedding vector_cosine_ops\)/);
    expect(embeddingText('x', '')).toBe('x');
  });

  it(
    'close matches through the db helper carry a similarity and respect the space filter',
    async () => {
      const p = await person();
      const nw = await makeSpace(p, 'Northwind');
      const home = randomUUID();
      const work = randomUUID();
      await sync(p, [
        create(p.spaceId, 'Dentist appointment', {}, home),
        create(nw.id, 'Dentist appointment', {}, work),
      ]);
      await settle();
      const all = await searchByMeaning(server.db, server.embeddings, p.userId, 'teeth checkup');
      expect(all.map((h) => h.id).sort()).toEqual([home, work].sort());
      expect(all[0]!.similarity).toBeGreaterThan(MEANING_FLOOR);
      const only = await searchByMeaning(server.db, server.embeddings, p.userId, 'teeth checkup', {
        spaceId: nw.id,
      });
      expect(only.map((h) => h.id)).toEqual([work]);
    },
    LONG,
  );
});
