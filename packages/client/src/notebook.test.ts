import { QueryClient } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NOTEBOOK_CHANGED, type Note, type NotebookResponse, type SyncResult } from '@tudu/core';
import { createApi } from './api';
import { NotebookStore, noteKey, notebookKey, type NoteView } from './notebook';
import { MemoryOutboxStore } from './outbox';
import { TaskStore } from './tasks';

interface Sent {
  id: string;
  type: string;
  payload: Record<string, unknown>;
}

const serverNote = (id: string, extra: Partial<Note> = {}): Note => ({
  id,
  folderId: null,
  title: 'Offsite agenda',
  first: '',
  position: 1024,
  updatedAt: '2026-10-26T09:00:00.000Z',
  links: 0,
  html: '<p>Day one</p>',
  rev: 3,
  path: [],
  words: 2,
  linked: [],
  createdAt: '2026-10-20T09:00:00.000Z',
  ...extra,
});

/** A pretend server: the sync answer is the test's to set; the note read answers `note`. */
function setup() {
  const sent: Sent[] = [];
  let answer: (m: Sent) => SyncResult = (m) => ({ id: m.id, status: 'ok' });
  let offline = false;
  let note = serverNote('n1');
  const fetch = vi.fn(async (url: string, init?: RequestInit) => {
    const u = new URL(url);
    if (offline) throw new TypeError('Network request failed');
    if (u.pathname === '/api/sync') {
      const body = JSON.parse(String(init!.body)) as { mutations: Sent[] };
      sent.push(...body.mutations);
      return new Response(
        JSON.stringify({ results: body.mutations.map((m) => answer(m)), tasks: [], deleted: [] }),
      );
    }
    if (u.pathname === '/api/notebook')
      return new Response(
        JSON.stringify({ folders: [], notes: [], trashCount: 0 } satisfies NotebookResponse),
      );
    if (u.pathname.startsWith('/api/notebook/notes/')) return new Response(JSON.stringify(note));
    return new Response('{}');
  });
  const api = createApi({ baseUrl: 'http://api.test', fetch: fetch as unknown as typeof globalThis.fetch });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const tasks = new TaskStore({ api, queryClient, store: new MemoryOutboxStore(), clientId: 'tab-1' });
  let n = 0;
  const notebook = new NotebookStore({ api, queryClient, tasks, newId: () => `id-${++n}` });
  return {
    sent,
    tasks,
    notebook,
    queryClient,
    setAnswer: (fn: (m: Sent) => SyncResult) => (answer = fn),
    setOffline: (v: boolean) => (offline = v),
    setNote: (v: Note) => (note = v),
  };
}

/** Let timers and the outbox's promises run. */
const tick = (ms = 0) => vi.advanceTimersByTimeAsync(ms);

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('C22-U07 a blank note is never kept', () => {
  it('C22-U07 a blank new note sends nothing; closing it blank leaves the outbox empty', async () => {
    const s = setup();
    const id = s.notebook.draft();
    expect(s.notebook.isDraft(id)).toBe(true);
    await tick(1000);
    s.notebook.close(id);
    await tick(1000);
    expect(s.sent).toEqual([]);
    expect(await s.tasks.outbox.idle()).toBe(true);
    expect(s.queryClient.getQueryData(noteKey(id))).toBeUndefined();
  });

  it('C22-U07 the first word sends note.create, then note.body', async () => {
    const s = setup();
    const id = s.notebook.draft({ linkTo: 'task-9' });
    s.notebook.edit(id, { html: '<p>first</p>' });
    await tick(700);
    expect(s.sent.map((m) => m.type)).toEqual(['note.create', 'note.body']);
    expect(s.sent[0]!.payload).toMatchObject({ id, title: '', html: '', linkTo: 'task-9' });
    expect(s.sent[1]!.payload).toMatchObject({ id, html: '<p>first</p>', baseRev: 0 });
  });

  it('C22-U07 a note made here and emptied again goes away on close', async () => {
    const s = setup();
    const id = s.notebook.draft();
    s.notebook.edit(id, { title: 'T' });
    await tick(700);
    s.notebook.edit(id, { title: '' });
    s.notebook.close(id);
    await tick(10);
    expect(s.sent.map((m) => m.type)).toEqual(['note.create', 'note.purge']);
  });
});

describe('C22-U08 body saves', () => {
  it('C22-U08 debounce to one note.body per 600 ms of quiet and flush on close; each carries the last known rev', async () => {
    const s = setup();
    s.queryClient.setQueryData<NoteView>(noteKey('n1'), { ...serverNote('n1'), gen: 0 });
    s.notebook.edit('n1', { html: '<p>D</p>' });
    await tick(300);
    s.notebook.edit('n1', { html: '<p>Da</p>' });
    await tick(300);
    s.notebook.edit('n1', { html: '<p>Day</p>' });
    expect(s.sent).toEqual([]);
    await tick(650);
    expect(s.sent.map((m) => [m.type, m.payload.html, m.payload.baseRev])).toEqual([
      ['note.body', '<p>Day</p>', 3],
    ]);
    s.notebook.edit('n1', { html: '<p>Day two</p>' });
    s.notebook.close('n1');
    await tick(10);
    expect(s.sent.map((m) => m.payload.baseRev)).toEqual([3, 4]);
  });
});

describe('C22-U09 the save state', () => {
  it('C22-U09 saving while queued (the ring after 500 ms), saved on ack, offline while disconnected, conflict on stale, error when turned down', async () => {
    const s = setup();
    s.queryClient.setQueryData<NoteView>(noteKey('n1'), { ...serverNote('n1'), gen: 0 });
    expect(s.notebook.saveState('n1')).toBe('saved');
    s.notebook.edit('n1', { html: '<p>x</p>' });
    // Typing shows nothing.
    expect(s.notebook.saveState('n1')).toBe('saved');
    s.notebook.flush('n1');
    expect(s.notebook.saveState('n1')).toBe('saving');
    expect(s.notebook.isSlow('n1')).toBe(false);
    await tick(10);
    expect(s.notebook.saveState('n1')).toBe('saved');

    // Offline: the save waits on this device.
    s.setOffline(true);
    s.notebook.edit('n1', { html: '<p>xy</p>' });
    s.notebook.flush('n1');
    await tick(10);
    expect(s.notebook.saveState('n1')).toBe('offline');
    await tick(600);
    expect(s.notebook.isSlow('n1')).toBe(true);
    s.setOffline(false);
    await tick(5000);
    expect(s.notebook.saveState('n1')).toBe('saved');
    expect(s.notebook.isSlow('n1')).toBe(false);

    // Another window saved first.
    s.setAnswer((m) =>
      m.type === 'note.body'
        ? {
            id: m.id,
            status: 'rejected',
            code: 409,
            reason: 'stale',
            error: 'This note changed in another window.',
          }
        : { id: m.id, status: 'ok' },
    );
    s.notebook.edit('n1', { html: '<p>xyz</p>' });
    s.notebook.flush('n1');
    await tick(10);
    expect(s.notebook.saveState('n1')).toBe('conflict');

    const t = setup();
    const told: string[] = [];
    const nb = new NotebookStore({
      api: createApi({ baseUrl: 'http://api.test', fetch: vi.fn(async () => new Response('{}')) as never }),
      queryClient: t.queryClient,
      tasks: t.tasks,
      onRejected: (msg) => told.push(msg),
    });
    t.queryClient.setQueryData<NoteView>(noteKey('n2'), { ...serverNote('n2'), gen: 0 });
    t.setAnswer((m) => ({ id: m.id, status: 'rejected', code: 400, error: 'That note is too long.' }));
    nb.edit('n2', { html: '<p>long</p>' });
    nb.flush('n2');
    await tick(10);
    expect(nb.saveState('n2')).toBe('error');
    expect(told).toEqual(['That note is too long.']);
  });
});

describe('C22-U10 after a conflict', () => {
  it('C22-U10 Keep mine resends the local body on the server’s rev; Show the newer one drops it and loads the server’s', async () => {
    const s = setup();
    s.queryClient.setQueryData<NoteView>(noteKey('n1'), { ...serverNote('n1'), gen: 0 });
    s.setAnswer((m) =>
      m.type === 'note.body' && m.payload.baseRev === 3
        ? { id: m.id, status: 'rejected', code: 409, reason: 'stale' }
        : { id: m.id, status: 'ok' },
    );
    s.notebook.edit('n1', { html: '<p>mine</p>' });
    s.notebook.flush('n1');
    await tick(10);
    expect(s.notebook.saveState('n1')).toBe('conflict');
    // The server has moved on to rev 5.
    s.setNote(serverNote('n1', { html: '<p>theirs</p>', rev: 5 }));
    await s.notebook.keepMine('n1');
    await tick(10);
    expect(s.sent.at(-1)).toMatchObject({ type: 'note.body', payload: { html: '<p>mine</p>', baseRev: 5 } });
    expect(s.notebook.saveState('n1')).toBe('saved');

    // Again, and this time the newer one wins.
    s.setAnswer((m) =>
      m.type === 'note.body'
        ? { id: m.id, status: 'rejected', code: 409, reason: 'stale' }
        : { id: m.id, status: 'ok' },
    );
    s.notebook.edit('n1', { html: '<p>mine again</p>' });
    s.notebook.flush('n1');
    await tick(10);
    s.setNote(serverNote('n1', { html: '<p>newest</p>', rev: 8 }));
    const before = s.sent.length;
    await s.notebook.showNewer('n1');
    await tick(1000);
    const view = s.queryClient.getQueryData<NoteView>(noteKey('n1'))!;
    expect(view.html).toBe('<p>newest</p>');
    expect(view.gen).toBe(1);
    expect(s.sent.length).toBe(before);
    expect(s.notebook.saveState('n1')).toBe('saved');
    // The next save is written on the server's rev.
    s.setAnswer((m) => ({ id: m.id, status: 'ok' }));
    s.notebook.edit('n1', { html: '<p>newest, then mine</p>' });
    s.notebook.flush('n1');
    await tick(10);
    expect(s.sent.at(-1)!.payload.baseRev).toBe(8);
  });
});

describe('C22-U11 the live event', () => {
  it('C22-U11 from another client invalidates only the named notes and the tree; from this client it does nothing', async () => {
    const s = setup();
    s.queryClient.setQueryData(notebookKey(), { folders: [], notes: [], trashCount: 0 });
    s.queryClient.setQueryData<NoteView>(noteKey('a'), { ...serverNote('a'), gen: 0 });
    s.queryClient.setQueryData<NoteView>(noteKey('b'), { ...serverNote('b'), gen: 0 });
    const stale = () =>
      [notebookKey(), noteKey('a'), noteKey('b')].map((k) => s.queryClient.getQueryState(k)!.isInvalidated);
    s.notebook.onEvent({
      id: '1',
      type: NOTEBOOK_CHANGED,
      data: { notes: ['a'], folders: [], clientId: 'tab-1' },
    });
    expect(stale()).toEqual([false, false, false]);
    s.notebook.onEvent({
      id: '2',
      type: NOTEBOOK_CHANGED,
      data: { notes: ['a'], folders: [], clientId: 'window' },
    });
    expect(stale()).toEqual([true, true, false]);
  });
});

describe('C22-U51 a turned-down move', () => {
  it('C22-U51 tells onRejected the note’s name, and its retry sends the same move again', async () => {
    const t = setup();
    const told: { msg: string; name?: string; retry?: () => void }[] = [];
    const nb = new NotebookStore({
      api: createApi({ baseUrl: 'http://api.test', fetch: vi.fn(async () => new Response('{}')) as never }),
      queryClient: t.queryClient,
      tasks: t.tasks,
      onRejected: (msg, move) => told.push({ msg, name: move?.name, retry: move?.retry }),
    });
    t.queryClient.setQueryData<NotebookResponse>(notebookKey(), {
      folders: [{ id: 'f1', parentId: null, name: 'Northwind', position: 1 }],
      notes: [serverNote('n1', { title: 'Offsite agenda' })],
      trashCount: 0,
    });
    t.setAnswer((m) => ({ id: m.id, status: 'rejected', code: 404, error: 'That folder is gone.' }));
    nb.moveNote('n1', 'f1');
    await tick(10);
    expect(told).toHaveLength(1);
    expect(told[0]).toMatchObject({ msg: 'That folder is gone.', name: 'Offsite agenda' });
    // No save-state error for a move: the toast says it.
    expect(nb.saveState('n1')).not.toBe('error');

    const before = t.sent.length;
    t.setAnswer((m) => ({ id: m.id, status: 'ok' }));
    told[0]!.retry!();
    await tick(10);
    const again = t.sent.slice(before);
    expect(again).toHaveLength(1);
    expect(again[0]).toMatchObject({ type: 'note.move', payload: { id: 'n1', folderId: 'f1' } });
  });
});
