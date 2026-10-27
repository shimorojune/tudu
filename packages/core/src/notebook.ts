/**
 * The Notebook (chunk 22): your own notes, in folders up to three levels deep, each linked to any number of tasks
 * in any space. Nobody else ever sees them. The pure parts live here: the tree, the depth rule, the Move list, an
 * untitled note's first line, the days left in Trash and the rule that an empty new note is never kept.
 */
import { z } from 'zod';
import { drawingIds, NOTES_MAX, textOf } from './notes';

/** Folders go three levels deep (Northwind / Planning / Offsite). */
export const NOTEBOOK_DEPTH = 3;
export const FOLDER_NAME_MAX = 80;
export const NOTE_TITLE_MAX = 200;
/** Deleted notes and folders stay this long in Trash. */
export const TRASH_DAYS = 30;
/** An untitled note shows this much of its first line. */
export const FIRST_LINE_MAX = 80;
/** Search lists at most this many notes. */
export const NOTE_SEARCH_LIMIT = 5;
/** The window's Recent list. */
export const RECENT_NOTES = 8;
/** A drawing's scene may be this much JSON. Its pictures live in file storage, never in the scene. */
export const DRAWING_MAX = 2_000_000;
export const DRAWING_TOO_BIG = 'This drawing is too big to save. Split it into two drawings.';
/** What a note with no words but a drawing shows as its first line. */
export const DRAWING_LINE = 'Drawing';

export const NOTEBOOK_CHANGED = 'notebook.changed';

/** Only the owner hears: the notes and folders a batch changed, and which tab made it. */
export interface NotebookChangedEvent {
  notes: string[];
  folders: string[];
  clientId: string | null;
}

export interface NotebookFolder {
  id: string;
  /** Null at the top. */
  parentId: string | null;
  name: string;
  position: number;
}

/** A note as a list shows it: never its body. */
export interface NoteHeader {
  id: string;
  /** Null is the top of the Notebook (no folder). */
  folderId: string | null;
  title: string;
  /** The first line of its words, for an untitled note. */
  first: string;
  position: number;
  updatedAt: string;
  /** How many tasks it is linked to (that you can still read). */
  links: number;
}

/** `GET /api/notebook`: the tree, without Trash. */
export interface NotebookResponse {
  folders: NotebookFolder[];
  notes: NoteHeader[];
  trashCount: number;
}

/** A task a note is linked to, as its chip shows it. */
export interface NoteTask {
  id: string;
  /** "NW-38". */
  ref: string;
  title: string;
  spaceId: string;
  space: { name: string; color: string | null; personal: boolean };
}

/** An image in a drawing: the Notebook file holding its pixels. */
export interface DrawingImage {
  attachmentId: string;
  mimeType: string;
}

/**
 * A drawing as stored: Excalidraw's elements and, for each image in it, the file that holds it. No view state, and
 * no pixels: those are fetched from the file when the drawing opens.
 */
export interface DrawingScene {
  elements: Array<{ id: string; type: string; [k: string]: unknown }>;
  files: Record<string, DrawingImage>;
}

/** A drawing block as the note shows it: its pictures (light and dark, as file ids) and how many words it holds. */
export interface NoteDrawingInfo {
  id: string;
  rev: number;
  previewLight: string | null;
  previewDark: string | null;
  words: number;
}

/** `GET /api/notebook/drawings/:id`: one drawing in full. */
export interface NoteDrawing extends NoteDrawingInfo {
  noteId: string;
  scene: DrawingScene;
}

/** `GET /api/notebook/notes/:id`: one note in full. */
export interface Note extends NoteHeader {
  html: string;
  /** +1 for every body save; a save names the rev it was written on. */
  rev: number;
  /** The folder names above it, top first. */
  path: string[];
  words: number;
  linked: NoteTask[];
  createdAt: string;
  /** Every drawing that has been in it (a block taken out stays a while, for Undo). */
  drawings: NoteDrawingInfo[];
}

/** A note with where it lives, for the task panel and Recent. */
export interface NoteListItem extends NoteHeader {
  /** "Northwind / Planning", or null when it is in no folder. */
  where: string | null;
}

export interface NoteListResponse {
  notes: NoteListItem[];
}

/** Something in Trash: a note, or a folder deleted with everything in it. */
export interface TrashItem {
  id: string;
  kind: 'note' | 'folder';
  /** A note's title (or its first line), a folder's name. */
  title: string;
  first: string;
  /** Where it came from: the folder path, or null for the top. */
  where: string | null;
  deletedAt: string;
  /** For a folder: how many notes went with it. */
  notes: number;
}

export interface TrashResponse {
  items: TrashItem[];
}

/** A note in Search: its title, the matched line, its folder and when it changed. */
export interface NoteSearchHit {
  id: string;
  title: string;
  first: string;
  snippet: string | null;
  where: string | null;
  updatedAt: string;
  links: number;
}

/** A file uploaded into your notebook (no space). */
export interface NoteFile {
  id: string;
  name: string;
  size: number;
  type: string;
  createdAt: string;
}

// ---- the wire ---------------------------------------------------------------------------------------------------

const id = z.string().min(1).max(64);
const position = z.number().finite();
const folderName = z
  .string()
  .trim()
  .min(1, 'A folder needs a name.')
  .max(FOLDER_NAME_MAX, 'That name is too long.');
const noteTitle = z.string().trim().max(NOTE_TITLE_MAX, 'That title is too long.');
const noteHtml = z.string().max(NOTES_MAX, 'That note is too long.');
const drawingScene = z
  .object({
    elements: z.array(z.looseObject({ id: z.string().min(1).max(100), type: z.string().min(1).max(40) })),
    files: z.record(
      z.string().min(1).max(100),
      z.object({ attachmentId: id, mimeType: z.string().max(100) }),
    ),
  })
  .refine((s) => JSON.stringify(s).length <= DRAWING_MAX, DRAWING_TOO_BIG);

/**
 * The Notebook's changes, sent through the same sync batch as tasks (so they queue offline and never double):
 *
 * | type           | writes                                                       |
 * | -------------- | ------------------------------------------------------------ |
 * | note.create    | a new note, once it has a title or a word; `linkTo` links it |
 * | note.title     | its title (last write wins)                                  |
 * | note.body      | its words, only on the rev it was written on, else `stale`   |
 * | note.move      | its folder and place (last write wins)                       |
 * | note.delete    | to Trash; note.restore brings it back; note.purge for good    |
 * | note.link      | a link to a task you can read; note.unlink takes it off      |
 * | folder.*       | a folder's name, place, Trash (with everything in it)        |
 * | trash.empty    | everything in Trash, for good                                |
 * | drawing.save   | a drawing's scene (and pictures), only on its rev, else stale |
 * | drawing.delete | a drawing out of its note (kept 30 days, for Undo)           |
 */
export const notebookMutationSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('note.create'),
    payload: z.object({
      id,
      folderId: id.nullable(),
      title: noteTitle,
      html: noteHtml,
      /** Null puts it at the end of its folder. */
      position: position.nullable().optional(),
      /** The task panel's New note: linked to the task in the same step. */
      linkTo: id.optional(),
    }),
  }),
  z.object({ type: z.literal('note.title'), payload: z.object({ id, title: noteTitle }) }),
  z.object({
    type: z.literal('note.body'),
    payload: z.object({ id, html: noteHtml, baseRev: z.number().int().min(0) }),
  }),
  z.object({
    type: z.literal('note.move'),
    payload: z.object({ id, folderId: id.nullable(), position: position.nullable() }),
  }),
  z.object({ type: z.literal('note.delete'), payload: z.object({ id }) }),
  z.object({ type: z.literal('note.restore'), payload: z.object({ id }) }),
  z.object({ type: z.literal('note.purge'), payload: z.object({ id }) }),
  z.object({ type: z.literal('note.link'), payload: z.object({ id, taskId: id }) }),
  z.object({ type: z.literal('note.unlink'), payload: z.object({ id, taskId: id }) }),
  z.object({
    type: z.literal('folder.create'),
    payload: z.object({ id, parentId: id.nullable(), name: folderName, position: position.nullable() }),
  }),
  z.object({ type: z.literal('folder.rename'), payload: z.object({ id, name: folderName }) }),
  z.object({
    type: z.literal('folder.move'),
    payload: z.object({ id, parentId: id.nullable(), position: position.nullable() }),
  }),
  z.object({ type: z.literal('folder.delete'), payload: z.object({ id }) }),
  z.object({ type: z.literal('folder.restore'), payload: z.object({ id }) }),
  z.object({ type: z.literal('folder.purge'), payload: z.object({ id }) }),
  /** `id` is the change's own: everything in Trash goes. */
  z.object({ type: z.literal('trash.empty'), payload: z.object({ id }) }),
  z.object({
    type: z.literal('drawing.save'),
    payload: z.object({
      id,
      noteId: id,
      scene: drawingScene,
      /** New pictures for the note (light and dark), uploaded as Notebook files; left out to keep the old ones. */
      previewLight: id.nullable().optional(),
      previewDark: id.nullable().optional(),
      /** 0 makes it. */
      baseRev: z.number().int().min(0),
    }),
  }),
  z.object({ type: z.literal('drawing.delete'), payload: z.object({ id }) }),
]);

export type NotebookMutationBody = z.infer<typeof notebookMutationSchema>;

/** A Notebook change: yours alone, no task or space list changes (a link is the note's, not the task's). */
export function isNotebookMutation(m: { type: string }): boolean {
  return (
    m.type.startsWith('note.') ||
    m.type.startsWith('folder.') ||
    m.type.startsWith('drawing.') ||
    m.type === 'trash.empty'
  );
}

/** Why the server turned a Notebook change down, when the client acts on it. */
export type NotebookRejection = 'stale' | 'name-taken';

// ---- the tree ---------------------------------------------------------------------------------------------------

interface Ordered {
  position: number;
  id: string;
}
const byPlace = (a: Ordered, b: Ordered) => a.position - b.position || a.id.localeCompare(b.id);

export interface TreeFolder<N extends NoteHeader = NoteHeader> extends NotebookFolder {
  depth: number;
  folders: TreeFolder<N>[];
  notes: N[];
}

export interface Tree<N extends NoteHeader = NoteHeader> {
  folders: TreeFolder<N>[];
  /** Notes in no folder (or whose folder is gone). */
  loose: N[];
}

type MaybeTrashed = { deletedAt?: string | null };

/**
 * Folders and notes nested by parent and position. Anything trashed is left out; a note whose folder is not there
 * sits at the top of the Notebook, and a folder whose parent is not there sits at the top.
 */
export function buildTree<N extends NoteHeader>(
  folders: Array<NotebookFolder & MaybeTrashed>,
  notes: Array<N & MaybeTrashed>,
): Tree<N> {
  const live = folders.filter((f) => !f.deletedAt);
  const known = new Set(live.map((f) => f.id));
  const kids = new Map<string | null, NotebookFolder[]>();
  for (const f of live) {
    const parent = f.parentId && known.has(f.parentId) ? f.parentId : null;
    kids.set(parent, [...(kids.get(parent) ?? []), f]);
  }
  const held = new Map<string | null, N[]>();
  for (const n of notes) {
    if (n.deletedAt) continue;
    const at = n.folderId && known.has(n.folderId) ? n.folderId : null;
    held.set(at, [...(held.get(at) ?? []), n]);
  }
  const seen = new Set<string>();
  const grow = (parent: string | null, depth: number): TreeFolder<N>[] =>
    [...(kids.get(parent) ?? [])].sort(byPlace).flatMap((f) => {
      // A loop in bad data is cut, never followed forever.
      if (seen.has(f.id)) return [];
      seen.add(f.id);
      return [
        {
          ...f,
          depth,
          folders: grow(f.id, depth + 1),
          notes: [...(held.get(f.id) ?? [])].sort(byPlace),
        },
      ];
    });
  return { folders: grow(null, 0), loose: [...(held.get(null) ?? [])].sort(byPlace) };
}

/** How deep a folder sits: 0 at the top, 2 on the third level. -1 when there is no such folder. */
export function depthOf(folders: NotebookFolder[], id: string | null): number {
  if (id === null) return -1;
  const byId = new Map(folders.map((f) => [f.id, f]));
  let d = -1;
  let at = byId.get(id);
  const seen = new Set<string>();
  while (at && !seen.has(at.id)) {
    seen.add(at.id);
    d += 1;
    at = at.parentId ? byId.get(at.parentId) : undefined;
  }
  return d;
}

/** How many levels a folder holds, itself included: 1 for a folder with no folders in it. */
export function levelsOf(folders: NotebookFolder[], id: string): number {
  const below = folders.filter((f) => f.parentId === id);
  return 1 + Math.max(0, ...below.map((f) => levelsOf(folders, f.id)));
}

/** True when `id` is the folder `ancestor` or anywhere below it. */
export function isWithin(folders: NotebookFolder[], id: string | null, ancestor: string): boolean {
  const byId = new Map(folders.map((f) => [f.id, f]));
  const seen = new Set<string>();
  for (let at = id; at && !seen.has(at); at = byId.get(at)?.parentId ?? null) {
    if (at === ancestor) return true;
    seen.add(at);
  }
  return false;
}

/** Every folder below one (not itself). */
export function foldersBelow(folders: NotebookFolder[], id: string): string[] {
  const out: string[] = [];
  for (const f of folders) if (f.parentId === id) out.push(f.id, ...foldersBelow(folders, f.id));
  return out;
}

/** May a folder go into `parentId` (null for the top)? Never into itself or below itself, never past three levels. */
export function canNest(folders: NotebookFolder[], id: string, parentId: string | null): boolean {
  if (parentId !== null && isWithin(folders, parentId, id)) return false;
  return depthOf(folders, parentId) + 1 + levelsOf(folders, id) <= NOTEBOOK_DEPTH;
}

/** A new folder can go in here: only above the third level. */
export function canHoldFolder(folders: NotebookFolder[], parentId: string | null): boolean {
  return depthOf(folders, parentId) + 1 < NOTEBOOK_DEPTH;
}

export type DragKind = 'note' | 'folder';
export interface DropTarget {
  kind: 'folder' | 'note' | 'root';
  id: string | null;
  /** Into a folder, before or after a row, or onto the loose list. */
  zone: 'into' | 'before' | 'after' | 'root';
}

/** Where a drop would put the thing: its new parent folder (null for the top). */
export function dropParent(
  folders: NotebookFolder[],
  notes: NoteHeader[],
  target: DropTarget,
): string | null {
  if (target.kind === 'root') return null;
  if (target.kind === 'folder')
    return target.zone === 'into' ? target.id : (folders.find((f) => f.id === target.id)?.parentId ?? null);
  return notes.find((n) => n.id === target.id)?.folderId ?? null;
}

/**
 * Is this drop allowed? A note can go anywhere. A folder can't go into itself or below itself, and nothing may end
 * up deeper than three levels; a folder only lands among folders.
 */
export function canDrop(
  folders: NotebookFolder[],
  notes: NoteHeader[],
  drag: { kind: DragKind; id: string },
  target: DropTarget,
): boolean {
  if (target.id !== null && drag.id === target.id && target.kind === drag.kind) return false;
  if (drag.kind === 'note') return true;
  if (target.kind === 'note') return false;
  return canNest(folders, drag.id, dropParent(folders, notes, target));
}

/** A folder's names from the top down to it. */
export function folderPath(folders: NotebookFolder[], id: string | null): string[] {
  const byId = new Map(folders.map((f) => [f.id, f]));
  const out: string[] = [];
  const seen = new Set<string>();
  for (let at = id ? byId.get(id) : undefined; at && !seen.has(at.id);) {
    seen.add(at.id);
    out.unshift(at.name);
    at = at.parentId ? byId.get(at.parentId) : undefined;
  }
  return out;
}

/** "Northwind / Planning", or null for no folder. */
export function whereOf(folders: NotebookFolder[], id: string | null): string | null {
  const p = folderPath(folders, id);
  return p.length ? p.join(' / ') : null;
}

export interface MoveTarget {
  key: string;
  /** Null is the top of the Notebook (no folder). */
  folderId: string | null;
  title: string;
  /** The path above it, "Northwind / Planning". */
  sub: string | null;
  here: boolean;
}

/** The Move list: the Notebook itself (no folder) first, then every folder in tree order with its path; the current one is Here. */
export function moveTargets(folders: NotebookFolder[], current: string | null): MoveTarget[] {
  const tree = buildTree(folders, []);
  const out: MoveTarget[] = [
    { key: '-', folderId: null, title: 'Notebook', sub: null, here: current === null },
  ];
  const walk = (list: TreeFolder[], above: string[]) => {
    for (const f of list) {
      out.push({
        key: f.id,
        folderId: f.id,
        title: f.name,
        sub: above.length ? above.join(' / ') : null,
        here: f.id === current,
      });
      walk(f.folders, [...above, f.name]);
    }
  };
  walk(tree.folders, []);
  return out;
}

/** Another live folder in the same place already has this name (any case). */
export function nameTaken(
  folders: NotebookFolder[],
  parentId: string | null,
  name: string,
  except: string | null = null,
): boolean {
  const n = name.trim().toLowerCase();
  return folders.some((f) => f.id !== except && f.parentId === parentId && f.name.toLowerCase() === n);
}

/** The line under the field: "Planning already has a folder called Offsite." */
export function nameTakenWords(folders: NotebookFolder[], parentId: string | null, name: string): string {
  const parent = parentId ? folders.find((f) => f.id === parentId)?.name : null;
  return parent
    ? `${parent} already has a folder called ${name.trim()}.`
    : `You already have a folder called ${name.trim()}.`;
}

// ---- notes ------------------------------------------------------------------------------------------------------

/** The first line of a note's words, tags stripped, cut at 80 characters. A note of drawings alone says Drawing. */
export function firstLine(html: string): string {
  const line =
    textOf(html)
      .split('\n')
      .map((l) => l.trim())
      .find(Boolean) ?? (drawingIds(html).length ? DRAWING_LINE : '');
  return line.length > FIRST_LINE_MAX ? `${line.slice(0, FIRST_LINE_MAX - 1).trimEnd()}…` : line;
}

/** A note with neither a title nor a word nor a drawing: it is never kept. */
export function isBlankNote(title: string, html: string): boolean {
  return !title.trim() && !textOf(html).trim() && !drawingIds(html).length;
}

/** The words typed in a drawing (text, and labels in shapes), for search. Handwriting and images aren't read. */
export function drawingText(scene: Pick<DrawingScene, 'elements'>): string {
  return scene.elements
    .filter((e) => e.type === 'text' && !e.isDeleted)
    .map((e) => String(e.originalText ?? e.text ?? '').trim())
    .filter(Boolean)
    .join('\n');
}

/** A drawing with nothing left on it (every element erased). */
export function isEmptyDrawing(scene: Pick<DrawingScene, 'elements'> | null | undefined): boolean {
  return !scene || !scene.elements.some((e) => !e.isDeleted);
}

/** How many words a note holds. */
export function wordCount(html: string): number {
  const t = textOf(html).trim();
  return t ? t.split(/\s+/).length : 0;
}

/** What a list calls a note: its title, else its first line, else Untitled. */
export function noteName(n: { title: string; first?: string }): string {
  return n.title.trim() || n.first?.trim() || 'Untitled';
}

/** Days left before something in Trash goes for good: 30 on the day, 1 on the last day, never below 1. */
export function daysLeft(deletedAt: string, now: Date = new Date()): number {
  const gone = Date.parse(deletedAt) + TRASH_DAYS * 86_400_000;
  return Math.max(1, Math.min(TRASH_DAYS, Math.ceil((gone - now.getTime()) / 86_400_000)));
}

export function daysLeftWords(n: number): string {
  return n === 1 ? '1 day left' : `${n} days left`;
}

/** Every note at or below a folder. */
export function notesBelow(folders: NotebookFolder[], notes: NoteHeader[], id: string): number {
  const set = new Set([id, ...foldersBelow(folders, id)]);
  return notes.filter((n) => n.folderId !== null && set.has(n.folderId)).length;
}

/** Find a note: by its name or a folder's name; the folders holding a match open. */
export function findInTree<N extends NoteHeader>(tree: Tree<N>, q: string): Tree<N> {
  const ql = q.trim().toLowerCase();
  if (!ql) return tree;
  const hit = (n: N) => noteName(n).toLowerCase().includes(ql);
  const prune = (list: TreeFolder<N>[]): TreeFolder<N>[] =>
    list.flatMap((f) => {
      const folders = prune(f.folders);
      const notes = f.notes.filter(hit);
      return folders.length || notes.length || f.name.toLowerCase().includes(ql)
        ? [{ ...f, folders, notes }]
        : [];
    });
  return { folders: prune(tree.folders), loose: tree.loose.filter(hit) };
}

/** "now", "4m", "2h", "Yesterday", "Thu", "12 Oct", "Aug 2025": a short, honest time. */
export function editedAgo(at: string, now: Date = new Date()): string {
  const t = new Date(at);
  const s = (now.getTime() - t.getTime()) / 1000;
  if (s < 60) return 'now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((day(now) - day(t)) / 86_400_000);
  if (days === 0) return `${Math.floor(s / 3600)}h`;
  if (days === 1) return 'Yesterday';
  const month = t.toLocaleString('en-GB', { month: 'short' });
  if (days < 7) return t.toLocaleString('en-GB', { weekday: 'short' });
  if (t.getFullYear() === now.getFullYear()) return `${t.getDate()} ${month}`;
  return `${month} ${t.getFullYear()}`;
}
