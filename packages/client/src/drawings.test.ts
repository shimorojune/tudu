import { QueryClient } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DrawingScene, NoteDrawing, SyncResult } from '@tudu/core';
import { createApi } from './api';
import { DRAWING_STALE_WORDS, NotebookStore } from './notebook';
import { MemoryOutboxStore } from './outbox';
import { TaskStore } from './tasks';

interface Sent {
  id: string;
  type: string;
  payload: Record<string, unknown>;
}

const scene = (words: string, n = 1): DrawingScene => ({
  elements: [
    { id: 'r1', type: 'rectangle', version: n },
    { id: 't1', type: 'text', text: words, version: n },
  ],
  files: {},
});

/** A pretend server: the sync answer is the test's to set; the drawing read answers `drawing`. */
function setup() {
  const sent: Sent[] = [];
  let answer: (m: Sent) => SyncResult = (m) => ({ id: m.id, status: 'ok' });
  let drawing: NoteDrawing | null = null;
  const fetch = vi.fn(async (url: string, init?: RequestInit) => {
    const u = new URL(url);
    if (u.pathname === '/api/sync') {
      const body = JSON.parse(String(init!.body)) as { mutations: Sent[] };
      sent.push(...body.mutations);
      return new Response(
        JSON.stringify({ results: body.mutations.map((m) => answer(m)), tasks: [], deleted: [] }),
      );
    }
    if (u.pathname.startsWith('/api/notebook/drawings/'))
      return drawing
        ? new Response(JSON.stringify(drawing))
        : new Response(JSON.stringify({ error: 'That drawing isn’t there any more.' }), { status: 404 });
    return new Response('{}');
  });
  const api = createApi({ baseUrl: 'http://api.test', fetch: fetch as unknown as typeof globalThis.fetch });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const tasks = new TaskStore({ api, queryClient, store: new MemoryOutboxStore(), clientId: 'tab-1' });
  const stale = vi.fn<(message: string, openMine: () => void) => void>();
  let n = 0;
  const notebook = new NotebookStore({
    api,
    queryClient,
    tasks,
    newId: () => `d-${++n}`,
    onDrawingStale: stale,
  });
  return {
    sent,
    notebook,
    stale,
    saves: () => sent.filter((m) => m.type.startsWith('drawing.')),
    setAnswer: (fn: (m: Sent) => SyncResult) => (answer = fn),
    setDrawing: (d: NoteDrawing | null) => (drawing = d),
  };
}

const tick = (ms = 0) => vi.advanceTimersByTimeAsync(ms);

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('C22-U88 drawing saves', () => {
  it('C22-U88 debounce to one drawing.save per 800 ms of quiet and flush on close; each carries the last rev', async () => {
    const s = setup();
    const id = s.notebook.newDrawing('n1');
    await s.notebook.openDrawing(id, 'n1');
    s.notebook.editDrawing(id, scene('t', 1));
    await tick(400);
    s.notebook.editDrawing(id, scene('ta', 2));
    await tick(400);
    s.notebook.editDrawing(id, scene('tables', 3));
    expect(s.saves()).toEqual([]);
    await tick(850);
    expect(s.saves().map((m) => [m.type, m.payload.noteId, m.payload.baseRev])).toEqual([
      ['drawing.save', 'n1', 0],
    ]);
    expect((s.saves()[0]!.payload.scene as DrawingScene).elements[1]).toMatchObject({ text: 'tables' });
    s.notebook.editDrawing(id, scene('tables in a U', 4));
    expect(s.notebook.closeDrawing(id)).toBe(false);
    await tick(10);
    expect(s.saves().map((m) => m.payload.baseRev)).toEqual([0, 1]);
    expect(s.notebook.drawingSaveState(id)).toBe('saved');
  });

  it('C22-U88 a drawing the server has opens on its rev; saves go on from there', async () => {
    const s = setup();
    s.setDrawing({
      id: 'd9',
      noteId: 'n1',
      scene: scene('old'),
      rev: 4,
      previewLight: null,
      previewDark: null,
      words: 1,
    });
    const v = await s.notebook.openDrawing('d9', 'n1');
    expect(v).toMatchObject({ id: 'd9', rev: 4 });
    s.notebook.editDrawing('d9', scene('new', 2));
    s.notebook.closeDrawing('d9');
    await tick(10);
    expect(s.saves().map((m) => m.payload.baseRev)).toEqual([4]);
  });
});

describe('C22-U89 images hold the save', () => {
  it('C22-U89 a save waits while an image uploads and goes once it lands, with the pictures set meanwhile', async () => {
    const s = setup();
    const id = s.notebook.newDrawing('n1');
    await s.notebook.openDrawing(id, 'n1');
    const release = s.notebook.holdDrawing(id);
    s.notebook.editDrawing(id, scene('arrow'));
    await tick(900);
    expect(s.saves()).toEqual([]);
    // Done while it is still uploading: the drawing closes, the save is owed.
    s.notebook.closeDrawing(id);
    await tick(10);
    expect(s.saves()).toEqual([]);
    expect(s.notebook.drawingSaveState(id)).toBe('saving');
    s.notebook.setDrawingPictures(id, 'light-1', 'dark-1');
    release();
    await tick(10);
    expect(s.saves().map((m) => [m.payload.previewLight, m.payload.previewDark])).toEqual([
      ['light-1', 'dark-1'],
    ]);
    // Letting go twice changes nothing.
    release();
    await tick(10);
    expect(s.saves()).toHaveLength(1);
  });

  it('C22-U89 a failed upload lets go too: the drawing saves without that image', async () => {
    const s = setup();
    const id = s.notebook.newDrawing('n1');
    await s.notebook.openDrawing(id, 'n1');
    const release = s.notebook.holdDrawing(id);
    s.notebook.editDrawing(id, scene('x'));
    s.notebook.closeDrawing(id);
    // The sheet's upload failed: it lets go and offers Try again (DrawingSheet's toast).
    release();
    await tick(10);
    expect(s.saves().map((m) => m.type)).toEqual(['drawing.save']);
    expect(s.saves()[0]!.payload).not.toHaveProperty('previewLight');
  });
});

describe('C22-U90 a stale drawing', () => {
  it('C22-U90 shows the newer scene and raises the toast; Open mine resends this tab’s on the new rev', async () => {
    const s = setup();
    s.setDrawing({
      id: 'd1',
      noteId: 'n1',
      scene: scene('mine'),
      rev: 1,
      previewLight: null,
      previewDark: null,
      words: 1,
    });
    await s.notebook.openDrawing('d1', 'n1');
    s.setAnswer((m) =>
      m.type === 'drawing.save'
        ? {
            id: m.id,
            status: 'rejected',
            code: 409,
            error: 'This drawing changed in another window.',
            reason: 'stale',
          }
        : { id: m.id, status: 'ok' },
    );
    s.setDrawing({
      id: 'd1',
      noteId: 'n1',
      scene: scene('theirs'),
      rev: 3,
      previewLight: null,
      previewDark: null,
      words: 1,
    });
    s.notebook.editDrawing('d1', scene('mine, more', 2));
    s.notebook.closeDrawing('d1');
    await tick(10);
    expect(s.stale).toHaveBeenCalledTimes(1);
    expect(s.stale.mock.calls[0]![0]).toBe(DRAWING_STALE_WORDS);
    expect(DRAWING_STALE_WORDS).toBe('This drawing changed in another window. Showing the newest one.');
    const now = s.notebook.drawingNow('d1')!;
    expect(now.rev).toBe(3);
    expect(now.gen).toBe(1);
    expect(now.scene.elements[1]).toMatchObject({ text: 'theirs' });

    s.setAnswer((m) => ({ id: m.id, status: 'ok' }));
    s.stale.mock.calls[0]![1]();
    await tick(10);
    const last = s.saves().at(-1)!;
    expect(last.payload.baseRev).toBe(3);
    expect((last.payload.scene as DrawingScene).elements[1]).toMatchObject({ text: 'mine, more' });
    expect(s.notebook.drawingNow('d1')!.gen).toBe(2);
  });
});

describe('C22-U91 an empty drawing', () => {
  it('C22-U91 Done on a new empty drawing sends nothing and says its block should go', async () => {
    const s = setup();
    const id = s.notebook.newDrawing('n1');
    await s.notebook.openDrawing(id, 'n1');
    expect(s.notebook.closeDrawing(id)).toBe(true);
    await tick(1000);
    expect(s.saves()).toEqual([]);
  });

  it('C22-U91 a drawing erased back to nothing is taken out with drawing.delete', async () => {
    const s = setup();
    const id = s.notebook.newDrawing('n1');
    await s.notebook.openDrawing(id, 'n1');
    s.notebook.editDrawing(id, scene('x'));
    await tick(900);
    s.notebook.editDrawing(id, {
      elements: [{ id: 'r1', type: 'rectangle', version: 2, isDeleted: true }],
      files: {},
    });
    expect(s.notebook.closeDrawing(id)).toBe(true);
    await tick(1000);
    expect(s.saves().map((m) => m.type)).toEqual(['drawing.save', 'drawing.delete']);
  });
});
