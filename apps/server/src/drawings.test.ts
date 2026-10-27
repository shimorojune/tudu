import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  type DrawingScene,
  type Note,
  type NoteDrawing,
  type NoteFile,
  type SearchResponse,
  type SpaceSummary,
  type SyncResponse,
} from '@tudu/core';
import { eq, schema } from '@tudu/db';
import type { MemoryStorage } from './storage';
import { get, post, signIn, startServer, type Jar } from '../test/harness';
import { sweepNotebook } from './notebook';

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
}

async function person(): Promise<Person> {
  const { jar } = await signIn(server);
  const res = await get(server.app, '/api/me', jar);
  const me = (await res.json()) as { user: { id: string }; spaces: SpaceSummary[] };
  return { jar, userId: me.user.id };
}

let clock = Date.parse('2026-10-27T09:00:00.000Z');
function m(type: string, payload: Record<string, unknown>) {
  clock += 1000;
  return { id: randomUUID(), type, payload, at: new Date(clock).toISOString() };
}

async function sync(p: Person, mutations: unknown[], clientId = 'tab-1'): Promise<SyncResponse> {
  const res = await post(server.app, '/api/sync', { clientId, mutations }, p.jar);
  expect(res.status).toBe(200);
  return (await res.json()) as SyncResponse;
}

async function read<T>(p: Person, path: string, status = 200): Promise<T> {
  const res = await get(server.app, path, p.jar);
  expect(res.status).toBe(status);
  return (await res.json()) as T;
}

const block = (id: string) => `<div data-drawing="${id}"></div>`;

/** A scene with a rectangle, a text and, when given, an image. */
function scene(words: string, image?: { fileId: string; attachmentId: string }): DrawingScene {
  const elements: DrawingScene['elements'] = [
    { id: 'r1', type: 'rectangle', x: 0, y: 0, width: 200, height: 120, version: 1 },
    { id: 't1', type: 'text', x: 20, y: 20, text: words, originalText: words, version: 1 },
  ];
  if (image) elements.push({ id: 'i1', type: 'image', fileId: image.fileId, version: 1 });
  return {
    elements,
    files: image ? { [image.fileId]: { attachmentId: image.attachmentId, mimeType: 'image/png' } } : {},
  };
}

async function note(p: Person, title: string, html = ''): Promise<string> {
  const id = randomUUID();
  const r = await sync(p, [m('note.create', { id, folderId: null, title, html: '' })]);
  expect(r.results[0]!.status).toBe('ok');
  if (html) expect((await sync(p, [m('note.body', { id, html, baseRev: 0 })])).results[0]!.status).toBe('ok');
  return id;
}

async function upload(p: Person, name = 'pic.png'): Promise<NoteFile> {
  const form = new FormData();
  form.append('file', new File([new Uint8Array([137, 80, 78, 71])], name, { type: 'image/png' }));
  const up = await server.app.request('/api/notebook/files', {
    method: 'POST',
    headers: { origin: 'http://localhost:5173', cookie: p.jar.header() },
    body: form,
  });
  expect(up.status).toBe(201);
  return (await up.json()) as NoteFile;
}

const drawingRow = async (id: string) =>
  (await server.db.select().from(schema.noteDrawings).where(eq(schema.noteDrawings.id, id)))[0];
const fileRow = async (id: string) =>
  (await server.db.select().from(schema.attachments).where(eq(schema.attachments.id, id)))[0];

describe('C22-U82 making a drawing', () => {
  it('C22-U82 drawing.save on baseRev 0 makes it in your own note; in someone else’s note it is turned down 404', async () => {
    const you = await person();
    const meera = await person();
    const d = randomUUID();
    const id = await note(you, 'Offsite floor plan', block(d));
    const r = await sync(you, [m('drawing.save', { id: d, noteId: id, scene: scene('tables'), baseRev: 0 })]);
    expect(r.results[0]!.status).toBe('ok');
    expect(await drawingRow(d)).toMatchObject({ noteId: id, userId: you.userId, rev: 1, text: 'tables' });

    const theirs = await sync(meera, [
      m('drawing.save', { id: randomUUID(), noteId: id, scene: scene('mine'), baseRev: 0 }),
      m('drawing.save', { id: d, noteId: id, scene: scene('mine'), baseRev: 1 }),
    ]);
    expect(theirs.results.map((x) => [x.status, x.code])).toEqual([
      ['rejected', 404],
      ['rejected', 404],
    ]);
    expect((await drawingRow(d))!.text).toBe('tables');
  });
});

describe('C22-U83 a drawing has its own rev', () => {
  it('C22-U83 a save on an old rev is stale; on the current rev it goes up; a body save meanwhile still lands', async () => {
    const you = await person();
    const d = randomUUID();
    const id = await note(you, 'Plan', `<p>Two rooms</p>${block(d)}`);
    await sync(you, [m('drawing.save', { id: d, noteId: id, scene: scene('one'), baseRev: 0 })]);
    const both = await sync(you, [
      m('drawing.save', { id: d, noteId: id, scene: scene('two'), baseRev: 1 }),
      m('note.body', { id, html: `<p>Two rooms, long one</p>${block(d)}`, baseRev: 1 }),
    ]);
    expect(both.results.map((x) => x.status)).toEqual(['ok', 'ok']);
    const stale = await sync(
      you,
      [m('drawing.save', { id: d, noteId: id, scene: scene('old'), baseRev: 1 })],
      'window',
    );
    expect(stale.results[0]).toMatchObject({ status: 'rejected', code: 409, reason: 'stale' });
    const got = await read<NoteDrawing>(you, `/api/notebook/drawings/${d}`);
    expect(got).toMatchObject({ rev: 2, noteId: id });
    expect(got.scene.elements.find((e) => e.type === 'text')).toMatchObject({ text: 'two' });
  });
});

describe('C22-U84 search reads drawings', () => {
  it('C22-U84 the note’s text holds the drawing’s words, and search finds the note by one', async () => {
    const you = await person();
    const d = randomUUID();
    const id = await note(you, 'Floor plan', `<p>Two rooms</p>${block(d)}`);
    await sync(you, [
      m('drawing.save', { id: d, noteId: id, scene: scene('quillback projector'), baseRev: 0 }),
    ]);
    const [row] = await server.db.select().from(schema.notes).where(eq(schema.notes.id, id));
    expect(row!.text).toBe('Two rooms\nquillback projector');
    const s = await read<SearchResponse>(you, '/api/search?q=quillback');
    expect(s.notes!.map((n) => n.id)).toEqual([id]);
    expect(s.notes![0]!.snippet).toContain('quillback');
  });
});

describe('C22-U85 a block taken out of the words', () => {
  it('C22-U85 marks it orphaned, putting it back clears that, and the sweep removes one orphaned 30 days', async () => {
    const you = await person();
    const d = randomUUID();
    const pic = await upload(you);
    const id = await note(you, 'Sketches', `<p>Hi</p>${block(d)}`);
    await sync(you, [
      m('drawing.save', {
        id: d,
        noteId: id,
        scene: scene('zebrine', { fileId: 'f1', attachmentId: pic.id }),
        baseRev: 0,
      }),
    ]);
    await sync(you, [m('note.body', { id, html: '<p>Hi</p>', baseRev: 1 })]);
    expect((await drawingRow(d))!.orphanedAt).not.toBeNull();
    // Its words leave search with it.
    expect((await read<SearchResponse>(you, '/api/search?q=zebrine')).notes).toEqual([]);
    await sync(you, [m('note.body', { id, html: `<p>Hi</p>${block(d)}`, baseRev: 2 })]);
    expect((await drawingRow(d))!.orphanedAt).toBeNull();
    expect((await read<SearchResponse>(you, '/api/search?q=zebrine')).notes!.map((n) => n.id)).toEqual([id]);

    await sync(you, [m('note.body', { id, html: '<p>Hi</p>', baseRev: 3 })]);
    const storage = server.storage as MemoryStorage;
    const key = `notes/${you.userId}/${pic.id}`;
    expect(storage.objects.has(key)).toBe(true);
    // Younger than 30 days: kept.
    await sweepNotebook(server.db, server.storage);
    expect(await drawingRow(d)).toBeDefined();
    await server.db
      .update(schema.noteDrawings)
      .set({ orphanedAt: new Date(Date.now() - 31 * 86_400_000) })
      .where(eq(schema.noteDrawings.id, d));
    await sweepNotebook(server.db, server.storage);
    expect(await drawingRow(d)).toBeUndefined();
    expect(await fileRow(pic.id)).toBeUndefined();
    expect(storage.objects.has(key)).toBe(false);
  });

  it('C22-U85 drawing.delete marks it orphaned; one never saved is nothing to delete', async () => {
    const you = await person();
    const d = randomUUID();
    const id = await note(you, 'Empty', block(d));
    await sync(you, [m('drawing.save', { id: d, noteId: id, scene: scene('x'), baseRev: 0 })]);
    const r = await sync(you, [m('drawing.delete', { id: d }), m('drawing.delete', { id: randomUUID() })]);
    expect(r.results.map((x) => x.status)).toEqual(['ok', 'ok']);
    expect((await drawingRow(d))!.orphanedAt).not.toBeNull();
  });
});

describe('C22-U86 a drawing’s images and pictures', () => {
  it('C22-U86 images and pictures it names become the note’s; Trash and back keeps them; purge removes them', async () => {
    const you = await person();
    const d = randomUUID();
    const img = await upload(you, 'shot.png');
    const light = await upload(you, 'Drawing.png');
    const dark = await upload(you, 'Drawing (dark).png');
    const id = await note(you, 'Annotated', block(d));
    await sync(you, [
      m('drawing.save', {
        id: d,
        noteId: id,
        scene: scene('arrow here', { fileId: 'f1', attachmentId: img.id }),
        previewLight: light.id,
        previewDark: dark.id,
        baseRev: 0,
      }),
    ]);
    for (const f of [img, light, dark]) expect((await fileRow(f.id))!.noteId).toBe(id);
    // New pictures: the old ones go for good.
    const light2 = await upload(you, 'Drawing.png');
    const dark2 = await upload(you, 'Drawing (dark).png');
    await sync(you, [
      m('drawing.save', {
        id: d,
        noteId: id,
        scene: scene('arrow here', { fileId: 'f1', attachmentId: img.id }),
        previewLight: light2.id,
        previewDark: dark2.id,
        baseRev: 1,
      }),
    ]);
    expect(await fileRow(light.id)).toBeUndefined();
    expect(await fileRow(dark.id)).toBeUndefined();

    await sync(you, [m('note.delete', { id })]);
    await read(you, `/api/notebook/drawings/${d}`, 404);
    await sync(you, [m('note.restore', { id })]);
    const back = await read<NoteDrawing>(you, `/api/notebook/drawings/${d}`);
    expect(back.scene.files).toEqual({ f1: { attachmentId: img.id, mimeType: 'image/png' } });
    expect(await fileRow(img.id)).toBeDefined();

    await sync(you, [m('note.delete', { id })]);
    await sync(you, [m('note.purge', { id })]);
    expect(await drawingRow(d)).toBeUndefined();
    for (const f of [img, light2, dark2]) expect(await fileRow(f.id)).toBeUndefined();
  });
});

describe('C22-U87 reading drawings', () => {
  it('C22-U87 GET /notebook/drawings/:id is the owner’s alone; the note lists its drawings with picture ids', async () => {
    const you = await person();
    const meera = await person();
    const d = randomUUID();
    const light = await upload(you, 'Drawing.png');
    const id = await note(you, 'Mine', `<p>Words</p>${block(d)}`);
    await sync(you, [
      m('drawing.save', {
        id: d,
        noteId: id,
        scene: scene('three small words'),
        previewLight: light.id,
        previewDark: null,
        baseRev: 0,
      }),
    ]);
    const got = await read<NoteDrawing>(you, `/api/notebook/drawings/${d}`);
    expect(got).toMatchObject({
      id: d,
      noteId: id,
      rev: 1,
      previewLight: light.id,
      previewDark: null,
      words: 3,
    });
    await read(meera, `/api/notebook/drawings/${d}`, 404);
    await read(you, `/api/notebook/drawings/${randomUUID()}`, 404);
    const n = await read<Note>(you, `/api/notebook/notes/${id}`);
    expect(n.drawings).toEqual([{ id: d, rev: 1, previewLight: light.id, previewDark: null, words: 3 }]);
    expect(n.html).toBe(`<p>Words</p>${block(d)}`);
  });
});
