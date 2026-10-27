import {
  canHoldFolder,
  canNest,
  drawingIds,
  drawingText,
  firstLine,
  folderPath,
  nameTaken,
  nameTakenWords,
  NOTE_SEARCH_LIMIT,
  noteHtml,
  POSITION_STEP,
  RECENT_NOTES,
  searchTokens,
  snippetOf,
  textOf,
  TRASH_DAYS,
  wordCount,
  type Note,
  type NoteDrawing,
  type NoteDrawingInfo,
  type NotebookFolder,
  type NotebookResponse,
  type NoteHeader,
  type NoteListItem,
  type NoteSearchHit,
  type NoteTask,
  type SyncMutation,
  type TrashItem,
} from '@tudu/core';
import {
  and,
  asc,
  count,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  lt,
  notInArray,
  or,
  schema,
  sql,
  type Db,
} from '@tudu/db';
import type { NotebookClocks } from '@tudu/db/schema';
import { readableBy } from './closeMatches';
import type { Storage } from './storage';
import { Rejected, type Applied } from './tasks';

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
type Executor = Db | Tx;

export type NotebookMutation = Extract<
  SyncMutation,
  { type: `note.${string}` | `folder.${string}` | `drawing.${string}` | 'trash.empty' }
>;

const NOTE_GONE = 'That note isn’t there any more.';
const FOLDER_GONE = 'That folder isn’t there any more.';
const IN_TRASH = 'That note is in Trash.';
const TOO_DEEP = 'Folders go three levels deep.';
const TASK_GONE = 'That task isn’t there any more.';
export const STALE = 'This note changed in another window.';
export const DRAWING_STALE = 'This drawing changed in another window.';
const DRAWING_GONE = 'That drawing isn’t there any more.';

const N = schema.notes;
const F = schema.notebookFolders;
const L = schema.noteLinks;
const D = schema.noteDrawings;

// ---- reading ----------------------------------------------------------------------------------------------------

/** Your folders, live ones only unless `all` (for where something in Trash came from). */
async function foldersOf(db: Executor, userId: string, all = false): Promise<NotebookFolder[]> {
  const rows = await db
    .select({ id: F.id, parentId: F.parentId, name: F.name, position: F.position })
    .from(F)
    .where(and(eq(F.userId, userId), all ? undefined : isNull(F.deletedAt)))
    .orderBy(asc(F.position), asc(F.createdAt));
  return rows;
}

/** How many tasks you can still read each note is linked to. */
async function linkCounts(db: Executor, userId: string, ids: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (!ids.length) return out;
  const rows = await db
    .select({ noteId: L.noteId, n: count() })
    .from(L)
    .innerJoin(schema.tasks, eq(schema.tasks.id, L.taskId))
    .where(and(inArray(L.noteId, ids), readableBy(userId)))
    .groupBy(L.noteId);
  for (const r of rows) out.set(r.noteId, r.n);
  return out;
}

const headerColumns = {
  id: N.id,
  folderId: N.folderId,
  title: N.title,
  html: N.html,
  position: N.position,
  updatedAt: N.updatedAt,
};
type HeaderRow = {
  id: string;
  folderId: string | null;
  title: string;
  html: string;
  position: number;
  updatedAt: Date;
};

function toHeader(r: HeaderRow, links: Map<string, number>): NoteHeader {
  return {
    id: r.id,
    folderId: r.folderId,
    title: r.title,
    first: r.title ? '' : firstLine(r.html),
    position: r.position,
    updatedAt: r.updatedAt.toISOString(),
    links: links.get(r.id) ?? 0,
  };
}

/** What Trash holds: notes deleted on their own, and folders (with what went with them). */
async function trashRows(db: Executor, userId: string) {
  const notes = await db
    .select({ ...headerColumns, deletedAt: N.deletedAt })
    .from(N)
    .where(and(eq(N.userId, userId), isNotNull(N.deletedAt), isNull(N.deletedWith)))
    .orderBy(desc(N.deletedAt));
  const folders = await db
    .select({ id: F.id, parentId: F.parentId, name: F.name, deletedAt: F.deletedAt })
    .from(F)
    .where(and(eq(F.userId, userId), isNotNull(F.deletedAt), isNull(F.deletedWith)))
    .orderBy(desc(F.deletedAt));
  return { notes, folders };
}

/** The tree: folders and note headers, never bodies. Trash is left out; its count comes along. */
export async function notebookTree(db: Executor, userId: string): Promise<NotebookResponse> {
  const folders = await foldersOf(db, userId);
  const rows = await db
    .select(headerColumns)
    .from(N)
    .where(and(eq(N.userId, userId), isNull(N.deletedAt)))
    .orderBy(asc(N.position), asc(N.createdAt));
  const links = await linkCounts(
    db,
    userId,
    rows.map((r) => r.id),
  );
  const trash = await trashRows(db, userId);
  return {
    folders,
    notes: rows.map((r) => toHeader(r, links)),
    trashCount: trash.notes.length + trash.folders.length,
  };
}

/** The tasks a note is linked to that you can still read: a space you left hides its links until you're back. */
async function linkedTasks(db: Executor, userId: string, noteId: string): Promise<NoteTask[]> {
  const rows = await db
    .select({
      id: schema.tasks.id,
      number: schema.tasks.number,
      prefix: schema.spaces.taskPrefix,
      title: schema.tasks.title,
      spaceId: schema.tasks.spaceId,
      name: schema.spaces.name,
      color: schema.spaces.color,
      kind: schema.spaces.kind,
    })
    .from(L)
    .innerJoin(schema.tasks, eq(schema.tasks.id, L.taskId))
    .innerJoin(schema.spaces, eq(schema.spaces.id, schema.tasks.spaceId))
    .where(and(eq(L.noteId, noteId), readableBy(userId)))
    .orderBy(asc(L.linkedAt));
  return rows.map((r) => ({
    id: r.id,
    ref: `${r.prefix}-${r.number}`,
    title: r.title,
    spaceId: r.spaceId,
    space: { name: r.name, color: r.color, personal: r.kind === 'personal' },
  }));
}

/** One of your notes in full, or null: someone else's note is not there for you. */
export async function noteRead(db: Executor, userId: string, id: string): Promise<Note | null> {
  const [r] = await db
    .select({ ...headerColumns, rev: N.rev, createdAt: N.createdAt, deletedAt: N.deletedAt })
    .from(N)
    .where(and(eq(N.id, id), eq(N.userId, userId)));
  if (!r || r.deletedAt) return null;
  const folders = await foldersOf(db, userId);
  const linked = await linkedTasks(db, userId, id);
  const head = toHeader(r, new Map([[id, linked.length]]));
  return {
    ...head,
    html: r.html,
    rev: r.rev,
    path: folderPath(folders, r.folderId),
    words: wordCount(r.html),
    linked,
    createdAt: r.createdAt.toISOString(),
    drawings: await drawingsOf(db, id),
  };
}

function wordsIn(text: string): number {
  const t = text.trim();
  return t ? t.split(/\s+/).length : 0;
}

/** Every drawing a note has held (orphaned ones too, so Undo finds its picture), oldest first. */
async function drawingsOf(db: Executor, noteId: string): Promise<NoteDrawingInfo[]> {
  const rows = await db
    .select({ id: D.id, rev: D.rev, previewLight: D.previewLight, previewDark: D.previewDark, text: D.text })
    .from(D)
    .where(eq(D.noteId, noteId))
    .orderBy(asc(D.createdAt));
  return rows.map(({ text, ...r }) => ({ ...r, words: wordsIn(text) }));
}

/** One of your drawings in full, or null: someone else's, or one in a note in Trash, is not there for you. */
export async function drawingRead(db: Executor, userId: string, id: string): Promise<NoteDrawing | null> {
  const [r] = await db
    .select({
      id: D.id,
      noteId: D.noteId,
      userId: D.userId,
      scene: D.scene,
      text: D.text,
      rev: D.rev,
      previewLight: D.previewLight,
      previewDark: D.previewDark,
      deletedAt: N.deletedAt,
    })
    .from(D)
    .innerJoin(N, eq(N.id, D.noteId))
    .where(eq(D.id, id));
  if (!r || r.userId !== userId || r.deletedAt) return null;
  return {
    id: r.id,
    noteId: r.noteId,
    scene: r.scene,
    rev: r.rev,
    previewLight: r.previewLight,
    previewDark: r.previewDark,
    words: wordsIn(r.text),
  };
}

function withWhere(h: NoteHeader, folders: NotebookFolder[]): NoteListItem {
  const p = folderPath(folders, h.folderId);
  return { ...h, where: p.length ? p.join(' / ') : null };
}

/** Your notes, the newest change first, for the window's Recent list. */
export async function recentNotes(
  db: Executor,
  userId: string,
  limit = RECENT_NOTES,
): Promise<NoteListItem[]> {
  const rows = await db
    .select(headerColumns)
    .from(N)
    .where(and(eq(N.userId, userId), isNull(N.deletedAt)))
    .orderBy(desc(N.updatedAt))
    .limit(Math.max(1, Math.min(limit, 50)));
  const links = await linkCounts(
    db,
    userId,
    rows.map((r) => r.id),
  );
  const folders = await foldersOf(db, userId);
  return rows.map((r) => withWhere(toHeader(r, links), folders));
}

/** Your notes linked to a task, or null when you can't read the task. Nobody else's, even on a shared task. */
export async function notesOfTask(
  db: Executor,
  userId: string,
  taskId: string,
): Promise<NoteListItem[] | null> {
  const [t] = await db
    .select({ id: schema.tasks.id })
    .from(schema.tasks)
    .where(and(eq(schema.tasks.id, taskId), readableBy(userId)));
  if (!t) return null;
  const rows = await db
    .select(headerColumns)
    .from(L)
    .innerJoin(N, eq(N.id, L.noteId))
    .where(and(eq(L.taskId, taskId), eq(N.userId, userId), isNull(N.deletedAt)))
    .orderBy(asc(L.linkedAt));
  const links = await linkCounts(
    db,
    userId,
    rows.map((r) => r.id),
  );
  const folders = await foldersOf(db, userId);
  return rows.map((r) => withWhere(toHeader(r, links), folders));
}

/** Trash, newest first: where each thing came from and, for a folder, how many notes went with it. */
export async function trashOf(db: Executor, userId: string): Promise<TrashItem[]> {
  const { notes, folders } = await trashRows(db, userId);
  const all = await foldersOf(db, userId, true);
  const held = folders.length
    ? await db
        .select({ with: N.deletedWith, n: count() })
        .from(N)
        .where(
          and(
            eq(N.userId, userId),
            inArray(
              N.deletedWith,
              folders.map((f) => f.id),
            ),
          ),
        )
        .groupBy(N.deletedWith)
    : [];
  const counts = new Map(held.map((h) => [h.with!, h.n]));
  const where = (id: string | null) => {
    const p = folderPath(all, id);
    return p.length ? p.join(' / ') : null;
  };
  const items: TrashItem[] = [
    ...notes.map((n) => ({
      id: n.id,
      kind: 'note' as const,
      title: n.title,
      first: n.title ? '' : firstLine(n.html),
      where: where(n.folderId),
      deletedAt: n.deletedAt!.toISOString(),
      notes: 0,
    })),
    ...folders.map((f) => ({
      id: f.id,
      kind: 'folder' as const,
      title: f.name,
      first: '',
      where: where(f.parentId),
      deletedAt: f.deletedAt!.toISOString(),
      notes: counts.get(f.id) ?? 0,
    })),
  ];
  return items.sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));
}

/** A word as a pattern for ILIKE: its own wildcards escaped. */
function like(word: string): string {
  return `%${word.replace(/[\\%_]/g, '\\$&')}%`;
}

/**
 * Your notes (not in Trash) whose title or words hold every word typed: title hits first, then the newest change,
 * at most five. Each comes with the line that matched (when the title alone didn't), its folder and its time.
 */
export async function searchNotes(db: Executor, userId: string, q: string): Promise<NoteSearchHit[]> {
  const toks = searchTokens(q.trim().toLowerCase());
  if (!toks.length) return [];
  const rows = await db
    .select({ ...headerColumns, text: N.text })
    .from(N)
    .where(
      and(
        eq(N.userId, userId),
        isNull(N.deletedAt),
        ...toks.map((w) => or(sql`${N.title} ILIKE ${like(w)}`, sql`${N.text} ILIKE ${like(w)}`)!),
      ),
    )
    .orderBy(desc(N.updatedAt))
    .limit(100);
  const inTitle = (r: (typeof rows)[number]) => toks.every((w) => r.title.toLowerCase().includes(w));
  const ranked = [...rows].sort((a, b) => Number(inTitle(b)) - Number(inTitle(a)));
  const top = ranked.slice(0, NOTE_SEARCH_LIMIT);
  const links = await linkCounts(
    db,
    userId,
    top.map((r) => r.id),
  );
  const folders = await foldersOf(db, userId);
  return top.map((r) => {
    const p = folderPath(folders, r.folderId);
    return {
      id: r.id,
      title: r.title,
      first: r.title ? '' : firstLine(r.html),
      snippet: inTitle(r) ? null : snippetOf(r.text, q),
      where: p.length ? p.join(' / ') : null,
      updatedAt: r.updatedAt.toISOString(),
      links: links.get(r.id) ?? 0,
    };
  });
}

// ---- changing ---------------------------------------------------------------------------------------------------

/** True when a write made at `at` is at least as new as the field's last write. */
function newer(at: string, clock: string | undefined): boolean {
  return !clock || Date.parse(at) >= Date.parse(clock);
}

function done(notes: string[] = [], folders: string[] = [], files: string[] = []): Applied {
  return { taskId: '', spaceId: '', days: [], notebook: { notes, folders }, purged: files };
}

async function lockNote(tx: Tx, userId: string, id: string) {
  const [n] = await tx
    .select({
      id: N.id,
      userId: N.userId,
      folderId: N.folderId,
      rev: N.rev,
      deletedAt: N.deletedAt,
      deletedWith: N.deletedWith,
      clocks: N.clocks,
    })
    .from(N)
    .where(eq(N.id, id))
    .for('update');
  // Someone else's note is not there for you: the same answer as no note at all.
  if (!n || n.userId !== userId) throw new Rejected(404, NOTE_GONE);
  return n;
}

async function lockFolder(tx: Tx, userId: string, id: string) {
  const [f] = await tx
    .select({
      id: F.id,
      userId: F.userId,
      parentId: F.parentId,
      name: F.name,
      deletedAt: F.deletedAt,
      deletedWith: F.deletedWith,
      clocks: F.clocks,
    })
    .from(F)
    .where(eq(F.id, id))
    .for('update');
  if (!f || f.userId !== userId) throw new Rejected(404, FOLDER_GONE);
  return f;
}

/** A live folder of yours to put something in; null is the top. */
async function folderToHold(tx: Tx, userId: string, id: string | null): Promise<void> {
  if (id === null) return;
  const f = await lockFolder(tx, userId, id);
  if (f.deletedAt) throw new Rejected(410, 'That folder is in Trash.');
}

/** The place after the last note of a folder (or of no folder). */
async function noteEnd(tx: Tx, userId: string, folderId: string | null): Promise<number> {
  const [row] = await tx
    .select({ max: sql<number | null>`max(${N.position})` })
    .from(N)
    .where(
      and(
        eq(N.userId, userId),
        folderId === null ? isNull(N.folderId) : eq(N.folderId, folderId),
        isNull(N.deletedAt),
      ),
    );
  return (row?.max ?? 0) + POSITION_STEP;
}

async function folderEnd(tx: Tx, userId: string, parentId: string | null): Promise<number> {
  const [row] = await tx
    .select({ max: sql<number | null>`max(${F.position})` })
    .from(F)
    .where(
      and(
        eq(F.userId, userId),
        parentId === null ? isNull(F.parentId) : eq(F.parentId, parentId),
        isNull(F.deletedAt),
      ),
    );
  return (row?.max ?? 0) + POSITION_STEP;
}

/** Notebook files the words mention become this note's (yours only, not yet another note's). */
async function claimFiles(tx: Tx, userId: string, noteId: string, html: string): Promise<void> {
  const ids = [...html.matchAll(/data-id="([A-Za-z0-9_-]{1,64})"/g)].map((m) => m[1]!);
  if (!ids.length) return;
  await tx
    .update(schema.attachments)
    .set({ noteId })
    .where(
      and(
        inArray(schema.attachments.id, ids),
        eq(schema.attachments.ownerId, userId),
        isNull(schema.attachments.noteId),
      ),
    );
}

/** Notebook files a drawing names (its images, its pictures) become its note's. */
async function claimIds(tx: Tx, userId: string, noteId: string, ids: string[]): Promise<void> {
  if (!ids.length) return;
  await tx
    .update(schema.attachments)
    .set({ noteId })
    .where(
      and(
        inArray(schema.attachments.id, ids),
        eq(schema.attachments.ownerId, userId),
        isNull(schema.attachments.noteId),
      ),
    );
}

/**
 * The note's search text: its words, then the words typed in its live drawings (the ones its words still hold).
 * A drawing taken out of the words is marked orphaned; one put back (Undo) is live again.
 */
async function noteText(tx: Tx, noteId: string, html: string): Promise<string> {
  const ids = drawingIds(html);
  await tx
    .update(D)
    .set({ orphanedAt: new Date() })
    .where(and(eq(D.noteId, noteId), isNull(D.orphanedAt), ids.length ? notInArray(D.id, ids) : undefined));
  if (!ids.length) return textOf(html);
  await tx
    .update(D)
    .set({ orphanedAt: null })
    .where(and(eq(D.noteId, noteId), inArray(D.id, ids), isNotNull(D.orphanedAt)));
  const rows = await tx
    .select({ id: D.id, text: D.text })
    .from(D)
    .where(and(eq(D.noteId, noteId), inArray(D.id, ids)));
  const byId = new Map(rows.map((r) => [r.id, r.text]));
  return [textOf(html), ...ids.map((id) => byId.get(id) ?? '')].filter(Boolean).join('\n');
}

/** A task you can read, for a link. */
async function readableTask(tx: Tx, userId: string, taskId: string): Promise<boolean> {
  const [t] = await tx
    .select({ id: schema.tasks.id })
    .from(schema.tasks)
    .where(and(eq(schema.tasks.id, taskId), readableBy(userId)));
  return !!t;
}

/** Notes and their files, gone for good. Returns the files' keys, for the bucket. */
async function purgeNotes(tx: Tx, ids: string[]): Promise<string[]> {
  if (!ids.length) return [];
  const files = await tx
    .delete(schema.attachments)
    .where(inArray(schema.attachments.noteId, ids))
    .returning({ key: schema.attachments.key });
  await tx.delete(N).where(inArray(N.id, ids));
  return files.map((f) => f.key);
}

/** A name free in a place: the same, or "Offsite 2", "Offsite 3"… when another folder took it meanwhile. */
function freeName(folders: NotebookFolder[], parentId: string | null, name: string, except: string): string {
  if (!nameTaken(folders, parentId, name, except)) return name;
  for (let n = 2; ; n++) {
    const next = `${name} ${n}`;
    if (!nameTaken(folders, parentId, next, except)) return next;
  }
}

/** Apply one Notebook change for its owner. Throws Rejected for a change that will never apply. */
export async function applyNotebook(tx: Tx, userId: string, m: NotebookMutation): Promise<Applied> {
  const at = new Date(m.at);
  switch (m.type) {
    case 'note.create': {
      const p = m.payload;
      const [existing] = await tx.select({ userId: N.userId }).from(N).where(eq(N.id, p.id));
      if (existing) {
        if (existing.userId !== userId) throw new Rejected(400, 'That note already exists.');
        return done();
      }
      let folderId = p.folderId;
      if (folderId) {
        const f = await lockFolder(tx, userId, folderId);
        // Its folder went to Trash while this was on its way: the note lands in no folder.
        if (f.deletedAt) folderId = null;
      }
      const html = noteHtml(p.html);
      const clocks: NotebookClocks = { title: m.at, place: m.at, deleted: m.at };
      await tx.insert(N).values({
        id: p.id,
        userId,
        folderId,
        title: p.title.trim(),
        html,
        text: textOf(html),
        position: p.position ?? (await noteEnd(tx, userId, folderId)),
        clocks,
        createdAt: at,
        updatedAt: at,
      });
      await claimFiles(tx, userId, p.id, html);
      if (p.linkTo && (await readableTask(tx, userId, p.linkTo)))
        await tx.insert(L).values({ noteId: p.id, taskId: p.linkTo, linkedAt: at }).onConflictDoNothing();
      return done([p.id]);
    }
    case 'note.title': {
      const n = await lockNote(tx, userId, m.payload.id);
      if (n.deletedAt) throw new Rejected(410, IN_TRASH);
      if (!newer(m.at, n.clocks.title)) return done();
      await tx
        .update(N)
        .set({ title: m.payload.title.trim(), clocks: { ...n.clocks, title: m.at }, updatedAt: new Date() })
        .where(eq(N.id, n.id));
      return done([n.id]);
    }
    case 'note.body': {
      const n = await lockNote(tx, userId, m.payload.id);
      if (n.deletedAt) throw new Rejected(410, IN_TRASH);
      // The one field that never takes the last write: words written on an older rev would wipe newer ones.
      if (m.payload.baseRev !== n.rev) throw new Rejected(409, STALE, 'stale');
      const html = noteHtml(m.payload.html);
      await tx
        .update(N)
        .set({ html, text: await noteText(tx, n.id, html), rev: n.rev + 1, updatedAt: new Date() })
        .where(eq(N.id, n.id));
      await claimFiles(tx, userId, n.id, html);
      return done([n.id]);
    }
    case 'note.move': {
      const n = await lockNote(tx, userId, m.payload.id);
      if (n.deletedAt) throw new Rejected(410, IN_TRASH);
      if (!newer(m.at, n.clocks.place)) return done();
      await folderToHold(tx, userId, m.payload.folderId);
      await tx
        .update(N)
        .set({
          folderId: m.payload.folderId,
          position: m.payload.position ?? (await noteEnd(tx, userId, m.payload.folderId)),
          clocks: { ...n.clocks, place: m.at },
          updatedAt: new Date(),
        })
        .where(eq(N.id, n.id));
      return done([n.id]);
    }
    case 'note.delete': {
      const n = await lockNote(tx, userId, m.payload.id);
      if (n.deletedAt || !newer(m.at, n.clocks.deleted)) return done();
      await tx
        .update(N)
        .set({ deletedAt: at, deletedWith: null, clocks: { ...n.clocks, deleted: m.at } })
        .where(eq(N.id, n.id));
      return done([n.id]);
    }
    case 'note.restore': {
      const n = await lockNote(tx, userId, m.payload.id);
      if (!n.deletedAt) return done();
      // Back in its folder, or in no folder when that folder is gone or in Trash.
      let folderId = n.folderId;
      if (folderId) {
        const [f] = await tx.select({ deletedAt: F.deletedAt }).from(F).where(eq(F.id, folderId));
        if (!f || f.deletedAt) folderId = null;
      }
      await tx
        .update(N)
        .set({
          deletedAt: null,
          deletedWith: null,
          folderId,
          clocks: { ...n.clocks, deleted: m.at },
          updatedAt: new Date(),
        })
        .where(eq(N.id, n.id));
      return done([n.id]);
    }
    case 'note.purge': {
      const n = await lockNote(tx, userId, m.payload.id).catch((err) => {
        // Already gone for good: nothing to do.
        if (err instanceof Rejected && err.code === 404) return null;
        throw err;
      });
      if (!n) return done();
      return done([n.id], [], await purgeNotes(tx, [n.id]));
    }
    case 'note.link': {
      const n = await lockNote(tx, userId, m.payload.id);
      if (n.deletedAt) throw new Rejected(410, IN_TRASH);
      if (!(await readableTask(tx, userId, m.payload.taskId))) throw new Rejected(404, TASK_GONE);
      await tx
        .insert(L)
        .values({ noteId: n.id, taskId: m.payload.taskId, linkedAt: at })
        .onConflictDoNothing();
      return done([n.id]);
    }
    case 'note.unlink': {
      const n = await lockNote(tx, userId, m.payload.id);
      await tx.delete(L).where(and(eq(L.noteId, n.id), eq(L.taskId, m.payload.taskId)));
      return done([n.id]);
    }
    case 'folder.create': {
      const p = m.payload;
      const [existing] = await tx.select({ userId: F.userId }).from(F).where(eq(F.id, p.id));
      if (existing) {
        if (existing.userId !== userId) throw new Rejected(400, 'That folder already exists.');
        return done();
      }
      await folderToHold(tx, userId, p.parentId);
      const folders = await foldersOf(tx, userId);
      if (!canHoldFolder(folders, p.parentId)) throw new Rejected(400, TOO_DEEP);
      if (nameTaken(folders, p.parentId, p.name))
        throw new Rejected(409, nameTakenWords(folders, p.parentId, p.name), 'name-taken');
      await tx.insert(F).values({
        id: p.id,
        userId,
        parentId: p.parentId,
        name: p.name.trim(),
        position: p.position ?? (await folderEnd(tx, userId, p.parentId)),
        clocks: { name: m.at, place: m.at, deleted: m.at },
        createdAt: at,
      });
      return done([], [p.id]);
    }
    case 'folder.rename': {
      const f = await lockFolder(tx, userId, m.payload.id);
      if (f.deletedAt) throw new Rejected(410, 'That folder is in Trash.');
      if (!newer(m.at, f.clocks.name)) return done();
      const folders = await foldersOf(tx, userId);
      if (nameTaken(folders, f.parentId, m.payload.name, f.id))
        throw new Rejected(409, nameTakenWords(folders, f.parentId, m.payload.name), 'name-taken');
      await tx
        .update(F)
        .set({ name: m.payload.name.trim(), clocks: { ...f.clocks, name: m.at }, updatedAt: new Date() })
        .where(eq(F.id, f.id));
      return done([], [f.id]);
    }
    case 'folder.move': {
      const f = await lockFolder(tx, userId, m.payload.id);
      if (f.deletedAt) throw new Rejected(410, 'That folder is in Trash.');
      if (!newer(m.at, f.clocks.place)) return done();
      const parentId = m.payload.parentId;
      await folderToHold(tx, userId, parentId);
      const folders = await foldersOf(tx, userId);
      // Never into itself or below itself, never past the third level.
      if (!canNest(folders, f.id, parentId)) throw new Rejected(400, TOO_DEEP);
      if (parentId !== f.parentId && nameTaken(folders, parentId, f.name, f.id))
        throw new Rejected(409, nameTakenWords(folders, parentId, f.name), 'name-taken');
      await tx
        .update(F)
        .set({
          parentId,
          position: m.payload.position ?? (await folderEnd(tx, userId, parentId)),
          clocks: { ...f.clocks, place: m.at },
          updatedAt: new Date(),
        })
        .where(eq(F.id, f.id));
      return done([], [f.id]);
    }
    case 'folder.delete': {
      const f = await lockFolder(tx, userId, m.payload.id);
      if (f.deletedAt) return done();
      const folders = await foldersOf(tx, userId);
      const below = folders.filter((x) => x.id !== f.id && isUnder(folders, x.id, f.id)).map((x) => x.id);
      const set = [f.id, ...below];
      // Everything in it goes to Trash with it, marked, so putting the folder back brings exactly that.
      await tx
        .update(F)
        .set({ deletedAt: at, deletedWith: null, clocks: { ...f.clocks, deleted: m.at } })
        .where(eq(F.id, f.id));
      if (below.length)
        await tx
          .update(F)
          .set({ deletedAt: at, deletedWith: f.id })
          .where(and(inArray(F.id, below), isNull(F.deletedAt)));
      const went = await tx
        .update(N)
        .set({ deletedAt: at, deletedWith: f.id })
        .where(and(eq(N.userId, userId), inArray(N.folderId, set), isNull(N.deletedAt)))
        .returning({ id: N.id });
      return done(
        went.map((n) => n.id),
        set,
      );
    }
    case 'folder.restore': {
      const f = await lockFolder(tx, userId, m.payload.id);
      if (!f.deletedAt) return done();
      // Back where it was, or at the top when that folder is gone; a name taken meanwhile gets a number.
      let parentId = f.parentId;
      if (parentId) {
        const [p] = await tx.select({ deletedAt: F.deletedAt }).from(F).where(eq(F.id, parentId));
        if (!p || p.deletedAt) parentId = null;
      }
      const folders = await foldersOf(tx, userId);
      if (parentId && !canNest([...folders, { ...f, position: 0 }], f.id, parentId)) parentId = null;
      const name = freeName(folders, parentId, f.name, f.id);
      await tx
        .update(F)
        .set({
          deletedAt: null,
          deletedWith: null,
          parentId,
          name,
          clocks: { ...f.clocks, deleted: m.at },
          updatedAt: new Date(),
        })
        .where(eq(F.id, f.id));
      const back = await tx
        .update(F)
        .set({ deletedAt: null, deletedWith: null })
        .where(and(eq(F.userId, userId), eq(F.deletedWith, f.id)))
        .returning({ id: F.id });
      const notes = await tx
        .update(N)
        .set({ deletedAt: null, deletedWith: null, updatedAt: new Date() })
        .where(and(eq(N.userId, userId), eq(N.deletedWith, f.id)))
        .returning({ id: N.id });
      return done(
        notes.map((n) => n.id),
        [f.id, ...back.map((b) => b.id)],
      );
    }
    case 'folder.purge': {
      const f = await lockFolder(tx, userId, m.payload.id).catch((err) => {
        if (err instanceof Rejected && err.code === 404) return null;
        throw err;
      });
      if (!f) return done();
      if (!f.deletedAt) throw new Rejected(400, 'Only a folder in Trash can be deleted for good.');
      const went = await tx
        .select({ id: N.id })
        .from(N)
        .where(and(eq(N.userId, userId), eq(N.deletedWith, f.id)));
      const files = await purgeNotes(
        tx,
        went.map((n) => n.id),
      );
      // Its folders go with it (the parent key cascades).
      await tx.delete(F).where(eq(F.id, f.id));
      return done(
        went.map((n) => n.id),
        [f.id],
        files,
      );
    }
    case 'trash.empty': {
      const binned = await tx
        .select({ id: N.id })
        .from(N)
        .where(and(eq(N.userId, userId), isNotNull(N.deletedAt)));
      const files = await purgeNotes(
        tx,
        binned.map((n) => n.id),
      );
      const folders = await tx
        .delete(F)
        .where(and(eq(F.userId, userId), isNotNull(F.deletedAt)))
        .returning({ id: F.id });
      return done(
        binned.map((n) => n.id),
        folders.map((x) => x.id),
        files,
      );
    }
    case 'drawing.save': {
      const p = m.payload;
      const n = await lockNote(tx, userId, p.noteId);
      if (n.deletedAt) throw new Rejected(410, IN_TRASH);
      const [d] = await tx
        .select({
          noteId: D.noteId,
          userId: D.userId,
          rev: D.rev,
          previewLight: D.previewLight,
          previewDark: D.previewDark,
        })
        .from(D)
        .where(eq(D.id, p.id))
        .for('update');
      if (d && (d.userId !== userId || d.noteId !== n.id)) throw new Rejected(404, DRAWING_GONE);
      // A scene written on an older rev would wipe newer strokes: turned down, like a note's words.
      if ((d?.rev ?? 0) !== p.baseRev) throw new Rejected(409, DRAWING_STALE, 'stale');
      const text = drawingText(p.scene);
      const pictures = {
        ...(p.previewLight !== undefined ? { previewLight: p.previewLight } : {}),
        ...(p.previewDark !== undefined ? { previewDark: p.previewDark } : {}),
      };
      if (d)
        await tx
          .update(D)
          .set({ scene: p.scene, text, rev: d.rev + 1, updatedAt: new Date(), ...pictures })
          .where(eq(D.id, p.id));
      else
        await tx.insert(D).values({
          id: p.id,
          noteId: n.id,
          userId,
          scene: p.scene,
          text,
          rev: 1,
          createdAt: at,
          updatedAt: at,
          ...pictures,
        });
      await claimIds(tx, userId, n.id, [
        ...Object.values(p.scene.files).map((f) => f.attachmentId),
        ...[p.previewLight, p.previewDark].filter((x): x is string => !!x),
      ]);
      // Pictures it no longer shows go for good.
      const old = [
        p.previewLight !== undefined && d?.previewLight !== p.previewLight ? d?.previewLight : null,
        p.previewDark !== undefined && d?.previewDark !== p.previewDark ? d?.previewDark : null,
      ].filter((x): x is string => !!x);
      const files = old.length
        ? await tx
            .delete(schema.attachments)
            .where(and(inArray(schema.attachments.id, old), eq(schema.attachments.ownerId, userId)))
            .returning({ key: schema.attachments.key })
        : [];
      const [now] = await tx.select({ html: N.html }).from(N).where(eq(N.id, n.id));
      await tx
        .update(N)
        .set({ text: await noteText(tx, n.id, now?.html ?? ''), updatedAt: new Date() })
        .where(eq(N.id, n.id));
      return done(
        [n.id],
        [],
        files.map((f) => f.key),
      );
    }
    case 'drawing.delete': {
      const [d] = await tx
        .select({ noteId: D.noteId, userId: D.userId })
        .from(D)
        .where(eq(D.id, m.payload.id));
      // Never saved, or not yours: nothing to take out.
      if (!d || d.userId !== userId) return done();
      await tx
        .update(D)
        .set({ orphanedAt: at })
        .where(and(eq(D.id, m.payload.id), isNull(D.orphanedAt)));
      return done([d.noteId]);
    }
  }
}

function isUnder(folders: NotebookFolder[], id: string, ancestor: string): boolean {
  const byId = new Map(folders.map((f) => [f.id, f]));
  const seen = new Set<string>();
  for (let at = byId.get(id)?.parentId ?? null; at && !seen.has(at); at = byId.get(at)?.parentId ?? null) {
    if (at === ancestor) return true;
    seen.add(at);
  }
  return false;
}

/**
 * Trash keeps things 30 days: notes and folders deleted before that go for good, with their files. Returns how
 * many notes went.
 */
export async function sweepNotebook(db: Db, storage: Storage, now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - TRASH_DAYS * 86_400_000);
  const { keys, n } = await db.transaction(async (tx) => {
    const old = await tx
      .select({ id: N.id })
      .from(N)
      .where(and(isNotNull(N.deletedAt), lt(N.deletedAt, cutoff)));
    const keys = await purgeNotes(
      tx,
      old.map((r) => r.id),
    );
    await tx.delete(F).where(and(isNotNull(F.deletedAt), lt(F.deletedAt, cutoff)));
    return { keys: [...keys, ...(await sweepDrawings(tx, cutoff))], n: old.length };
  });
  for (const k of keys) await storage.delete(k).catch(() => {});
  return n;
}

/**
 * Drawings taken out of their notes over 30 days ago go for good, with their pictures and the images no other
 * drawing of that note still shows. Returns the files' keys, for the bucket.
 */
async function sweepDrawings(tx: Tx, cutoff: Date): Promise<string[]> {
  const gone = await tx
    .delete(D)
    .where(and(isNotNull(D.orphanedAt), lt(D.orphanedAt, cutoff)))
    .returning({
      noteId: D.noteId,
      scene: D.scene,
      previewLight: D.previewLight,
      previewDark: D.previewDark,
    });
  if (!gone.length) return [];
  const notes = [...new Set(gone.map((g) => g.noteId))];
  const kept = await tx.select({ scene: D.scene }).from(D).where(inArray(D.noteId, notes));
  const still = new Set(kept.flatMap((k) => Object.values(k.scene.files).map((f) => f.attachmentId)));
  const ids = gone
    .flatMap((g) => [
      ...Object.values(g.scene.files).map((f) => f.attachmentId),
      g.previewLight,
      g.previewDark,
    ])
    .filter((x): x is string => !!x && !still.has(x));
  if (!ids.length) return [];
  const files = await tx
    .delete(schema.attachments)
    .where(inArray(schema.attachments.id, ids))
    .returning({ key: schema.attachments.key });
  return files.map((f) => f.key);
}
