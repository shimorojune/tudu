import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  NOTEBOOK_CHANGED,
  type Note,
  type NotebookChangedEvent,
  type NotebookResponse,
  type NoteFile,
  type NoteListResponse,
  type SearchResponse,
  type SpaceSummary,
  type SyncResponse,
  type TrashResponse,
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
  email: string;
  userId: string;
  personalId: string;
}

async function person(): Promise<Person> {
  const { jar, email } = await signIn(server);
  const res = await get(server.app, '/api/me', jar);
  const me = (await res.json()) as { user: { id: string }; spaces: SpaceSummary[] };
  return { jar, email, userId: me.user.id, personalId: me.spaces.find((s) => s.kind === 'personal')!.id };
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

let clock = Date.parse('2026-10-26T09:00:00.000Z');
function m(type: string, payload: Record<string, unknown>, at?: number) {
  clock += 1000;
  return { id: randomUUID(), type, payload, at: new Date(at ?? clock).toISOString() };
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

const tree = (p: Person) => read<NotebookResponse>(p, '/api/notebook');
const noteOf = (p: Person, id: string) => read<Note>(p, `/api/notebook/notes/${id}`);

/** A new note of `p`'s with a title and words, in a folder or none. */
async function note(p: Person, title: string, html = '', folderId: string | null = null): Promise<string> {
  const id = randomUUID();
  const r = await sync(p, [m('note.create', { id, folderId, title, html })]);
  expect(r.results[0]!.status).toBe('ok');
  return id;
}

async function folder(p: Person, name: string, parentId: string | null = null): Promise<string> {
  const id = randomUUID();
  const r = await sync(p, [m('folder.create', { id, parentId, name, position: null })]);
  expect(r.results[0]).toMatchObject({ status: 'ok' });
  return id;
}

async function task(p: Person, spaceId: string, title: string, visibility?: 'me'): Promise<string> {
  const id = randomUUID();
  const ms = [m('task.create', { id, spaceId, title, day: '2026-10-26', position: null })];
  if (visibility) ms.push(m('task.visibility', { id, visibility }));
  await sync(p, ms);
  return id;
}

describe('C22-A01 a note round trip', () => {
  it('C22-A01 create, title, body and move show in the tree and the note; rev goes up by one per body save', async () => {
    const you = await person();
    const nw = await folder(you, 'Northwind');
    const id = await note(you, 'Onboarding interview notes', '<p>Five pilot interviews</p>');
    let t = await tree(you);
    expect(t.notes.find((n) => n.id === id)).toMatchObject({
      title: 'Onboarding interview notes',
      folderId: null,
    });
    expect(t.folders.map((f) => f.name)).toEqual(['Northwind']);
    let n = await noteOf(you, id);
    expect(n.rev).toBe(0);
    expect(n.html).toBe('<p>Five pilot interviews</p>');

    const r = await sync(you, [
      m('note.title', { id, title: 'Interview notes' }),
      m('note.body', { id, html: '<p>Five interviews</p><p>Same thing came up</p>', baseRev: 0 }),
      m('note.body', { id, html: '<p>Five interviews, again</p>', baseRev: 1 }),
      m('note.move', { id, folderId: nw, position: null }),
    ]);
    expect(r.results.map((x) => x.status)).toEqual(['ok', 'ok', 'ok', 'ok']);
    n = await noteOf(you, id);
    expect(n).toMatchObject({
      title: 'Interview notes',
      rev: 2,
      folderId: nw,
      path: ['Northwind'],
      words: 3,
    });
    t = await tree(you);
    // The tree never carries bodies.
    expect(t.notes.find((x) => x.id === id)).not.toHaveProperty('html');
    expect(t.notes.find((x) => x.id === id)!.folderId).toBe(nw);
  });

  it('C22-A01 an untitled note shows its first line', async () => {
    const you = await person();
    const id = await note(you, '', '<p>Sunday scribbles</p><p>Call the bank</p>');
    expect((await tree(you)).notes.find((n) => n.id === id)!.first).toBe('Sunday scribbles');
  });
});

describe('C22-A02 a notebook is private', () => {
  it('C22-A02 Meera’s reads of Rohit’s note, folder, trash or task notes answer 404 or nothing of his', async () => {
    const rohit = await person();
    const meera = await person();
    const nw = await space(meera, 'Northwind', [rohit]);
    const t = await task(rohit, nw.id, 'Write up the interviews');
    const f = await folder(rohit, 'Private');
    const id = await note(rohit, 'Salary thoughts', '<p>quokka plans</p>', f);
    await sync(rohit, [m('note.link', { id, taskId: t })]);
    const gone = await note(rohit, 'Binned');
    await sync(rohit, [m('note.delete', { id: gone })]);

    await read(meera, `/api/notebook/notes/${id}`, 404);
    expect((await tree(meera)).notes).toEqual([]);
    expect((await tree(meera)).folders).toEqual([]);
    expect((await read<TrashResponse>(meera, '/api/notebook/trash')).items).toEqual([]);
    expect((await read<NoteListResponse>(meera, `/api/tasks/${t}/notes`)).notes).toEqual([]);

    const r = await sync(meera, [
      m('note.title', { id, title: 'Mine now' }),
      m('note.body', { id, html: '<p>x</p>', baseRev: 0 }),
      m('note.delete', { id }),
      m('folder.rename', { id: f, name: 'Hers' }),
      m('note.link', { id, taskId: t }),
    ]);
    expect(r.results.every((x) => x.status === 'rejected' && x.code === 404)).toBe(true);
    expect((await noteOf(rohit, id)).title).toBe('Salary thoughts');
    const s = await read<SearchResponse>(meera, '/api/search?q=quokka');
    expect(s.notes).toEqual([]);
  });
});

describe('C22-A03 a body written on an old rev', () => {
  it('C22-A03 is rejected stale and changes nothing; on the current rev it lands', async () => {
    const you = await person();
    const id = await note(you, 'Offsite agenda', '<p>Day one</p>');
    await sync(you, [m('note.body', { id, html: '<p>Day one, from the desk</p>', baseRev: 0 })], 'desk');
    const r = await sync(you, [m('note.body', { id, html: '<p>From the window</p>', baseRev: 0 })], 'window');
    expect(r.results[0]).toMatchObject({ status: 'rejected', code: 409, reason: 'stale' });
    expect((await noteOf(you, id)).html).toBe('<p>Day one, from the desk</p>');
    const ok = await sync(you, [m('note.body', { id, html: '<p>Kept mine</p>', baseRev: 1 })], 'window');
    expect(ok.results[0]!.status).toBe('ok');
    expect(await noteOf(you, id)).toMatchObject({ html: '<p>Kept mine</p>', rev: 2 });
  });
});

describe('C22-A04 clocks', () => {
  it('C22-A04 an older title or move loses to a newer one; replaying a mutation is a no-op', async () => {
    const you = await person();
    const a = await folder(you, 'A');
    const b = await folder(you, 'B');
    const id = await note(you, 'First');
    const newerTitle = m('note.title', { id, title: 'Newer' }, Date.parse('2026-10-27T10:00:00.000Z'));
    const olderTitle = m('note.title', { id, title: 'Older' }, Date.parse('2026-10-27T09:00:00.000Z'));
    const newerMove = m(
      'note.move',
      { id, folderId: b, position: null },
      Date.parse('2026-10-27T10:00:00.000Z'),
    );
    const olderMove = m(
      'note.move',
      { id, folderId: a, position: null },
      Date.parse('2026-10-27T09:00:00.000Z'),
    );
    await sync(you, [newerTitle, newerMove]);
    await sync(you, [olderTitle, olderMove]);
    expect(await noteOf(you, id)).toMatchObject({ title: 'Newer', folderId: b });
    const body = m('note.body', { id, html: '<p>Once</p>', baseRev: 0 });
    await sync(you, [body]);
    // The same change again: already applied, nothing moves (it would be stale if it ran twice).
    const again = await sync(you, [body]);
    expect(again.results[0]!.status).toBe('ok');
    expect((await noteOf(you, id)).rev).toBe(1);
  });
});

describe('C22-A05 depth', () => {
  it('C22-A05 a fourth level is refused, and so is a folder moved into its own subtree', async () => {
    const you = await person();
    const nw = await folder(you, 'Northwind');
    const plan = await folder(you, 'Planning', nw);
    const off = await folder(you, 'Offsite', plan);
    const r = await sync(you, [
      m('folder.create', { id: randomUUID(), parentId: off, name: 'Day one', position: null }),
    ]);
    expect(r.results[0]).toMatchObject({ status: 'rejected', code: 400 });
    const home = await folder(you, 'Home');
    const kitchen = await folder(you, 'Kitchen', home);
    // Home holds two levels: under Planning it would reach a fourth.
    const deep = await sync(you, [m('folder.move', { id: home, parentId: plan, position: null })]);
    expect(deep.results[0]).toMatchObject({ status: 'rejected', code: 400 });
    const loop = await sync(you, [m('folder.move', { id: home, parentId: kitchen, position: null })]);
    expect(loop.results[0]).toMatchObject({ status: 'rejected', code: 400 });
    const fine = await sync(you, [m('folder.move', { id: kitchen, parentId: plan, position: null })]);
    expect(fine.results[0]!.status).toBe('ok');
    expect((await tree(you)).folders.find((f) => f.id === kitchen)!.parentId).toBe(plan);
  });
});

describe('C22-A06 linking', () => {
  it('C22-A06 any task you can read in any of your spaces; not one in a space you aren’t in, nor Meera’s only-me task', async () => {
    const you = await person();
    const meera = await person();
    const nw = await space(meera, 'Northwind', [you]);
    const pf = await space(meera, 'Pilot Farm');
    const mine = await task(you, you.personalId, 'Pay the electricity bill');
    const shared = await task(meera, nw.id, 'Plan the offsite');
    const hidden = await task(meera, nw.id, 'Meera’s own', 'me');
    const outside = await task(meera, pf.id, 'Not yours');
    const id = await note(you, 'Links');
    const r = await sync(you, [
      m('note.link', { id, taskId: mine }),
      m('note.link', { id, taskId: shared }),
      m('note.link', { id, taskId: hidden }),
      m('note.link', { id, taskId: outside }),
    ]);
    expect(r.results.map((x) => x.status)).toEqual(['ok', 'ok', 'rejected', 'rejected']);
    const n = await noteOf(you, id);
    expect(n.linked.map((t) => t.title).sort()).toEqual(['Pay the electricity bill', 'Plan the offsite']);
    expect(n.linked.find((t) => t.id === shared)!.space).toMatchObject({
      name: 'Northwind',
      personal: false,
    });
    expect((await tree(you)).notes.find((x) => x.id === id)!.links).toBe(2);
    await sync(you, [m('note.unlink', { id, taskId: mine })]);
    expect((await noteOf(you, id)).linked.map((t) => t.id)).toEqual([shared]);
  });
});

describe('C22-A07 task notes on a shared task', () => {
  it('C22-A07 return only the caller’s notes; Meera gets her own, never Rohit’s', async () => {
    const rohit = await person();
    const meera = await person();
    const nw = await space(meera, 'Northwind', [rohit]);
    const t = await task(meera, nw.id, 'Shared task');
    const his = await note(rohit, 'Rohit’s note');
    await sync(rohit, [m('note.link', { id: his, taskId: t })]);
    expect((await read<NoteListResponse>(rohit, `/api/tasks/${t}/notes`)).notes.map((n) => n.id)).toEqual([
      his,
    ]);
    expect((await read<NoteListResponse>(meera, `/api/tasks/${t}/notes`)).notes).toEqual([]);
    const hers = await note(meera, 'Meera’s note');
    await sync(meera, [m('note.link', { id: hers, taskId: t })]);
    expect((await read<NoteListResponse>(meera, `/api/tasks/${t}/notes`)).notes.map((n) => n.id)).toEqual([
      hers,
    ]);
    expect((await read<NoteListResponse>(rohit, `/api/tasks/${t}/notes`)).notes.map((n) => n.id)).toEqual([
      his,
    ]);
    // A task you can't read at all is not there.
    const other = await person();
    await read(other, `/api/tasks/${t}/notes`, 404);
  });
});

describe('C22-A08 links follow what you can read', () => {
  it('C22-A08 leaving a space hides links to its tasks; coming back shows them; a task deleted for good takes its links', async () => {
    const you = await person();
    const meera = await person();
    const nw = await space(meera, 'Northwind', [you]);
    const t = await task(meera, nw.id, 'Offsite');
    const id = await note(you, 'Offsite notes');
    await sync(you, [m('note.link', { id, taskId: t })]);
    expect((await noteOf(you, id)).linked).toHaveLength(1);
    const out = await server.app.request(`/api/spaces/${nw.id}/members/${you.userId}`, {
      method: 'DELETE',
      headers: { origin: 'http://localhost:5173', cookie: meera.jar.header() },
    });
    expect(out.ok).toBe(true);
    expect((await noteOf(you, id)).linked).toEqual([]);
    expect((await tree(you)).notes.find((n) => n.id === id)!.links).toBe(0);
    const back = await post(server.app, `/api/spaces/${nw.id}/members/${you.userId}/restore`, {}, meera.jar);
    expect(back.ok).toBe(true);
    expect((await noteOf(you, id)).linked.map((x) => x.id)).toEqual([t]);
    await server.db.delete(schema.tasks).where(eq(schema.tasks.id, t));
    const left = await server.db.select().from(schema.noteLinks).where(eq(schema.noteLinks.noteId, id));
    expect(left).toEqual([]);
  });
});

describe('C22-A09 a folder to Trash and back', () => {
  it('C22-A09 takes its subtree with it, and brings back exactly what went, not notes trashed before', async () => {
    const you = await person();
    const nw = await folder(you, 'Northwind');
    const plan = await folder(you, 'Planning', nw);
    const a = await note(you, 'A', '', nw);
    const b = await note(you, 'B', '', plan);
    const before = await note(you, 'Trashed before', '', plan);
    await sync(you, [m('note.delete', { id: before })]);
    await sync(you, [m('folder.delete', { id: nw })]);
    let t = await tree(you);
    expect(t.folders).toEqual([]);
    expect(t.notes).toEqual([]);
    const trash = await read<TrashResponse>(you, '/api/notebook/trash');
    expect(trash.items.map((i) => [i.kind, i.title, i.notes])).toEqual([
      ['folder', 'Northwind', 2],
      ['note', 'Trashed before', 0],
    ]);
    expect(trash.items[1]!.where).toBe('Northwind / Planning');
    expect(t.trashCount).toBe(2);
    await sync(you, [m('folder.restore', { id: nw })]);
    t = await tree(you);
    expect(t.folders.map((f) => f.name).sort()).toEqual(['Northwind', 'Planning']);
    expect(t.notes.map((n) => n.id).sort()).toEqual([a, b].sort());
    expect((await read<TrashResponse>(you, '/api/notebook/trash')).items.map((i) => i.id)).toEqual([before]);
  });
});

describe('C22-A10 putting back and deleting for good', () => {
  it('C22-A10 a note whose folder is gone comes back in no folder; purge and Empty Trash remove rows and files', async () => {
    const you = await person();
    const f = await folder(you, 'Reading');
    const id = await note(you, 'Shape Up', '', f);
    await sync(you, [m('note.delete', { id }), m('folder.delete', { id: f })]);
    await sync(you, [m('folder.purge', { id: f })]);
    await sync(you, [m('note.restore', { id })]);
    expect((await noteOf(you, id)).folderId).toBeNull();

    const form = new FormData();
    form.append('file', new File([new Uint8Array([1, 2, 3])], 'scan.pdf', { type: 'application/pdf' }));
    const up = await server.app.request('/api/notebook/files', {
      method: 'POST',
      headers: { origin: 'http://localhost:5173', cookie: you.jar.header() },
      body: form,
    });
    const file = (await up.json()) as NoteFile;
    const chip = `<p><a class="tp-att" data-id="${file.id}" href="/api/files/${file.id}">scan.pdf</a></p>`;
    const withFile = await note(you, 'Has a file', chip);
    const storage = server.storage as MemoryStorage;
    const key = `notes/${you.userId}/${file.id}`;
    expect(storage.objects.has(key)).toBe(true);
    await sync(you, [m('note.delete', { id: withFile })]);
    await sync(you, [m('note.purge', { id: withFile })]);
    expect(await server.db.select().from(schema.notes).where(eq(schema.notes.id, withFile))).toEqual([]);
    expect(
      await server.db.select().from(schema.attachments).where(eq(schema.attachments.id, file.id)),
    ).toEqual([]);
    expect(storage.objects.has(key)).toBe(false);

    const x = await note(you, 'X');
    const y = await note(you, 'Y');
    await sync(you, [m('note.delete', { id: x }), m('note.delete', { id: y })]);
    await sync(you, [m('trash.empty', { id: randomUUID() })]);
    expect((await read<TrashResponse>(you, '/api/notebook/trash')).items).toEqual([]);
    expect(await server.db.select().from(schema.notes).where(eq(schema.notes.id, x))).toEqual([]);
  });
});

describe('C22-A11 the sweep', () => {
  it('C22-A11 deletes notes and folders 30 days after deleted_at and keeps younger ones', async () => {
    const you = await person();
    const old = await note(you, 'Old');
    const young = await note(you, 'Young');
    const f = await folder(you, 'Old folder');
    await sync(you, [
      m('note.delete', { id: old }),
      m('note.delete', { id: young }),
      m('folder.delete', { id: f }),
    ]);
    const long = new Date(Date.now() - 31 * 86_400_000);
    await server.db.update(schema.notes).set({ deletedAt: long }).where(eq(schema.notes.id, old));
    await server.db
      .update(schema.notebookFolders)
      .set({ deletedAt: long })
      .where(eq(schema.notebookFolders.id, f));
    await sweepNotebook(server.db, server.storage);
    const left = (await read<TrashResponse>(you, '/api/notebook/trash')).items.map((i) => i.id);
    expect(left).toEqual([young]);
  });
});

describe('C22-A12 search', () => {
  it('C22-A12 title and body words find a note; trash and Meera’s never; at most 5; title hits first', async () => {
    const you = await person();
    const meera = await person();
    const body = await note(you, 'Venue shortlist', '<p>The Old Mill has a zephyrine garden</p>');
    const titled = await note(you, 'Zephyrine plan', '<p>words</p>');
    const binned = await note(you, 'Zephyrine binned');
    await sync(you, [m('note.delete', { id: binned })]);
    await note(meera, 'Zephyrine hers');
    const s = await read<SearchResponse>(you, '/api/search?q=zephyrine');
    expect(s.notes!.map((n) => n.id)).toEqual([titled, body]);
    expect(s.notes![1]!.snippet).toContain('zephyrine garden');
    expect(s.notes![0]!.snippet).toBeNull();
    for (let i = 0; i < 6; i++) await note(you, `Zephyrine ${i}`);
    expect((await read<SearchResponse>(you, '/api/search?q=zephyrine')).notes).toHaveLength(5);
    // Every word typed must be there.
    expect(
      (await read<SearchResponse>(you, '/api/search?q=zephyrine%20mill')).notes!.map((n) => n.id),
    ).toEqual([body]);
  });
});

describe('C22-A13 bodies are cleaned on the server', () => {
  it('C22-A13 a script tag or onerror sent in note.body is not stored', async () => {
    const you = await person();
    const id = await note(you, 'Clean', '<p>ok</p><script>steal()</script>');
    await sync(you, [
      m('note.body', {
        id,
        html: '<p onclick="x()">hi</p><img src=x onerror="alert(1)"><script>a()</script>',
        baseRev: 0,
      }),
    ]);
    const n = await noteOf(you, id);
    expect(n.html).toBe('<p>hi</p>');
  });
});

describe('C22-A14 files', () => {
  it('C22-A14 an upload to /api/notebook/files is served to its owner and is 404 to Meera', async () => {
    const you = await person();
    const meera = await person();
    const form = new FormData();
    form.append('file', new File(['hello'], 'hello.txt', { type: 'text/plain' }));
    const up = await server.app.request('/api/notebook/files', {
      method: 'POST',
      headers: { origin: 'http://localhost:5173', cookie: you.jar.header() },
      body: form,
    });
    expect(up.status).toBe(201);
    const file = (await up.json()) as NoteFile;
    const mine = await get(server.app, `/api/files/${file.id}`, you.jar);
    expect(mine.status).toBe(200);
    expect(await mine.text()).toBe('hello');
    expect((await get(server.app, `/api/files/${file.id}`, meera.jar)).status).toBe(404);
  });
});

describe('C22-A15 the live event', () => {
  it('C22-A15 every notebook change publishes NOTEBOOK_CHANGED to the owner only', async () => {
    const you = await person();
    const meera = await person();
    const heard: Array<{ who: string; e: NotebookChangedEvent }> = [];
    const offs = [you, meera].map((p) =>
      server.hub.subscribe(p.userId, (e) => {
        if (e.type === NOTEBOOK_CHANGED) heard.push({ who: p.userId, e: e.data as NotebookChangedEvent });
      }),
    );
    const f = await folder(you, 'Home');
    const id = await note(you, 'Flat', '', f);
    offs.forEach((off) => off());
    expect(heard.every((h) => h.who === you.userId)).toBe(true);
    expect(heard.map((h) => h.e)).toEqual([
      { notes: [], folders: [f], clientId: 'tab-1' },
      { notes: [id], folders: [], clientId: 'tab-1' },
    ]);
  });
});

describe('C22-A16 folder names', () => {
  it('C22-A16 a duplicate name in the same parent is rejected name-taken; under another parent it’s fine', async () => {
    const you = await person();
    const nw = await folder(you, 'Northwind');
    const plan = await folder(you, 'Planning', nw);
    await folder(you, 'Offsite', plan);
    const dup = await sync(you, [
      m('folder.create', { id: randomUUID(), parentId: plan, name: 'offsite', position: null }),
    ]);
    expect(dup.results[0]).toMatchObject({
      status: 'rejected',
      code: 409,
      reason: 'name-taken',
      error: 'Planning already has a folder called offsite.',
    });
    await folder(you, 'Offsite', nw);
    const other = await folder(you, 'Other', plan);
    const rename = await sync(you, [m('folder.rename', { id: other, name: 'Offsite' })]);
    expect(rename.results[0]).toMatchObject({ status: 'rejected', reason: 'name-taken' });
  });
});
