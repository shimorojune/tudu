import { NotebookStore, type NoteView, type SaveState } from '@tudu/client';
import {
  buildTree,
  daysLeft,
  daysLeftWords,
  editedAgo,
  folderPath,
  isoToday,
  noteName,
  type NotebookResponse,
  type NoteHeader,
  type NoteListItem,
  type NoteSearchHit,
  type NoteTask,
  type SearchHit,
  type SpaceSummary,
  type TreeFolder,
  type TrashItem,
} from '@tudu/core';
import {
  showToast,
  type NoteEditorNote,
  type NoteFolderItem,
  type NoteHitItem,
  type NoteItem,
  type NoteTaskItem,
  type NoteTrashItem,
  type PickItem,
} from '@tudu/ui';
import { useSyncExternalStore } from 'react';
import { desktop } from './desktop';
import { api, queryClient } from './session';
import { taskStore } from './tasks';

/** Your Notebook, through the same outbox as your tasks. */
export const notebookStore = new NotebookStore({
  api,
  queryClient,
  tasks: taskStore,
  onRejected: (message) => showToast(message),
});

// Words still waiting for quiet save as the page goes (a reload, a closed tab or popup).
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => notebookStore.flushAll());
  // For end-to-end tests: words waiting for quiet are not saved yet either.
  const hook = (window as unknown as { __tudu?: { idle?: () => Promise<boolean> } }).__tudu;
  if (hook) hook.idle = async () => !notebookStore.isBusy() && (await taskStore.idle());
}

/** A note's save state and whether its save is taking a while, kept live. */
export function useSaveState(id: string | null): { state: SaveState; slow: boolean } {
  const key = useSyncExternalStore(
    (l) => notebookStore.subscribe(l),
    () => (id ? `${notebookStore.saveState(id)}:${notebookStore.isSlow(id) ? 1 : 0}` : 'saved:0'),
    () => 'saved:0',
  );
  const [state, slow] = key.split(':');
  return { state: state as SaveState, slow: slow === '1' };
}

export function noteItem(h: NoteHeader & { where?: string | null }, now = new Date()): NoteItem {
  return {
    id: h.id,
    title: h.title,
    first: h.first,
    where: h.where === undefined ? undefined : (h.where ?? 'Not in a folder'),
    edited: editedAgo(h.updatedAt, now),
    links: h.links,
  };
}

/** The tree as the system's NoteTree draws it. */
export function treeItems(
  data: NotebookResponse | undefined,
  now = new Date(),
): { folders: NoteFolderItem[]; notes: NoteItem[] } {
  if (!data) return { folders: [], notes: [] };
  const tree = buildTree(data.folders, data.notes);
  const fold = (f: TreeFolder): NoteFolderItem => ({
    id: f.id,
    name: f.name,
    folders: f.folders.map(fold),
    notes: f.notes.map((n) => noteItem(n, now)),
  });
  return { folders: tree.folders.map(fold), notes: tree.loose.map((n) => noteItem(n, now)) };
}

/** Every note in the order the tree shows them (for the next one after a delete, and pickers). */
export function notesInOrder(data: NotebookResponse | undefined): NoteHeader[] {
  if (!data) return [];
  const tree = buildTree(data.folders, data.notes);
  const out: NoteHeader[] = [];
  const walk = (list: TreeFolder[]) =>
    list.forEach((f) => {
      walk(f.folders);
      out.push(...f.notes);
    });
  walk(tree.folders);
  out.push(...tree.loose);
  return out;
}

/** Every note of yours, for Link a note: its title, then where it lives and when it changed. */
export function notePicks(data: NotebookResponse | undefined, now = new Date()): PickItem[] {
  if (!data) return [];
  return notesInOrder(data).map((n) => ({
    key: n.id,
    title: noteName(n),
    sub: `${folderPath(data.folders, n.folderId).join(' / ') || 'Not in a folder'} · ${editedAgo(n.updatedAt, now)}`,
  }));
}

export function taskItem(t: NoteTask): NoteTaskItem {
  return {
    key: t.id,
    id: t.ref,
    title: t.title,
    space: { name: t.space.name, color: t.space.color ?? undefined, personal: t.space.personal },
  };
}

export function editorNote(v: NoteView, now = new Date()): NoteEditorNote {
  return {
    id: v.id,
    title: v.title,
    first: v.first,
    html: v.html,
    folderId: v.folderId,
    path: v.path,
    linked: v.linked.map(taskItem),
    edited: v.draft ? null : editedAgo(v.updatedAt, now),
    words: v.words,
    gen: v.gen,
  };
}

/** A search hit (a task) as a task to link: its space, from the spaces you are in. */
export function taskPick(h: SearchHit, spaces: SpaceSummary[]): PickItem & { task: NoteTask } {
  const s = spaces.find((x) => x.id === h.spaceId);
  const space = {
    name: s?.name ?? '',
    color: s?.color ?? null,
    personal: s?.kind === 'personal',
  };
  return {
    key: h.id,
    id: h.ref,
    title: h.title,
    sub: space.name,
    space: { name: space.name, color: space.color ?? undefined, personal: space.personal },
    task: { id: h.id, ref: h.ref, title: h.title, spaceId: h.spaceId ?? '', space },
  };
}

export function trashItem(x: TrashItem, now = new Date()): NoteTrashItem {
  return {
    id: x.id,
    kind: x.kind,
    title: x.title,
    first: x.first,
    where: x.where,
    left: daysLeftWords(daysLeft(x.deletedAt, now)),
    notes: x.notes,
  };
}

export function hitItem(h: NoteSearchHit, now = new Date()): NoteHitItem {
  return {
    key: h.id,
    title: h.title,
    first: h.first,
    snippet: h.snippet,
    where: h.where,
    edited: editedAgo(h.updatedAt, now),
    links: h.links,
  };
}

export function listItem(n: NoteListItem, now = new Date()): NoteItem {
  return noteItem(n, now);
}

/** "Moved to Offsite." / "Moved out of its folder." */
export function movedWords(name: string | null): string {
  return name ? `Moved to ${name}.` : 'Moved out of its folder.';
}

/** Today, as the client has it, for Make a task. */
export const todayIso = () => isoToday();

// ---- the note window ---------------------------------------------------------------------------------------------

/** The note the note window shows, and whether it is the blank one it opened on. */
export interface WindowNote {
  id: string;
  blank: boolean;
}

let shown = false;
let winNote: WindowNote | null = null;
const winListeners = new Set<() => void>();
const notifyWin = () => winListeners.forEach((l) => l());

/**
 * Show a note in the note window, or a blank one (linked to a task). The note it showed before saves what's
 * waiting, and goes away again if it was blank.
 */
export function showInWindow(id: string | null, linkTo?: string): void {
  if (winNote && winNote.id !== id) notebookStore.close(winNote.id);
  winNote = { id: id ?? notebookStore.draft({ linkTo }), blank: !id };
  notifyWin();
}

/** The note window is done with its note (it closes, or goes to the Notebook page). */
export function leaveWindow(): void {
  if (winNote) notebookStore.close(winNote.id);
  winNote = null;
  notifyWin();
}

/** The Mac app refused to open its note window (a version from before it): notes open over the page instead. */
let fallback = false;
let openUpdates: (() => void) | null = null;

/** What the fallback's Update Tudu shows: Settings › This Mac (the desk sets it). */
export function setOpenUpdates(fn: (() => void) | null): void {
  openUpdates = fn;
}

/** The note window over the page in the Mac app: only once the app said it has no window of its own. */
export function noteWindowFallback(): boolean {
  return fallback;
}

export const FALLBACK_TOAST =
  'This version of Tudu can’t float notes over other apps, so this one opens here.';

/**
 * Open the note window on a note, or on a blank one. On the desk in the browser it is the panel over the page; in
 * the Mac app the app's own window (the desktop bridge asks it); on a phone there is no window (the note's page).
 * An app too old to have the window refuses: the note opens over the page, and a toast (once) offers the update.
 */
export function openNoteWindow(o: { id?: string; linkTo?: string } = {}): void {
  // The Mac app's own window, from the desk or the menu bar's sheet; the note window itself switches in place.
  const d = desktop();
  if (d && d.window !== 'note' && !fallback) {
    d.openNote(o.id ?? null, o.linkTo ?? null).catch(() => {
      fallback = true;
      notifyWin();
      openHere(o);
      showToast(FALLBACK_TOAST, {
        action: 'Update Tudu',
        onAction: () => {
          void d.checkUpdate(true).catch(() => {});
          openUpdates?.();
        },
      });
    });
    return;
  }
  openHere(o);
}

function openHere(o: { id?: string; linkTo?: string }): void {
  shown = true;
  showInWindow(o.id ?? null, o.linkTo);
}

/** Tests only: an app that has its window again. */
export function resetNoteWindowFallback(): void {
  fallback = false;
}

/**
 * Open a note where it opens from a task or Search: the note window on the desk and in the Mac app, the note's own
 * page on a phone (a new one is a blank note there, already linked to the task).
 */
export function openNote(
  o: { id?: string; linkTo?: string },
  phone: boolean,
  navigate: (href: string) => void,
): void {
  if (!phone) return openNoteWindow(o);
  const id = o.id ?? notebookStore.draft({ linkTo: o.linkTo });
  navigate(`/notebook/${encodeURIComponent(id)}`);
}

export function closeNoteWindow(): void {
  leaveWindow();
  if (!shown) return;
  shown = false;
  notifyWin();
}

export function useNoteWindow(): { open: boolean; note: WindowNote | null } {
  useSyncExternalStore(
    (l) => {
      winListeners.add(l);
      return () => winListeners.delete(l);
    },
    () => `${shown ? 1 : 0}:${winNote?.id ?? ''}:${winNote?.blank ? 1 : 0}`,
    () => '0::0',
  );
  return { open: shown, note: winNote };
}

/** Where the floating panel sits and how big it is, per browser. */
export interface WindowFrame {
  x: number;
  y: number;
  w: number;
  h: number;
}
export const FRAME_KEY = 'tudu.noteWindow';
export const NOTE_WINDOW_MIN = { w: 420, h: 320 };

export function readFrame(): WindowFrame | null {
  try {
    const f = JSON.parse(localStorage.getItem(FRAME_KEY) ?? 'null') as WindowFrame | null;
    return f && [f.x, f.y, f.w, f.h].every((n) => Number.isFinite(n)) ? f : null;
  } catch {
    return null;
  }
}

export function saveFrame(f: WindowFrame): void {
  try {
    localStorage.setItem(FRAME_KEY, JSON.stringify(f));
  } catch {
    /* fine: it lasts for this visit */
  }
}

/** How close the window comes to the page's edges. */
const EDGE_GAP = 8;

/**
 * Resizing from an edge or corner: the edges it names follow the pointer by dx/dy while the opposite ones stay put,
 * never smaller than the least and never closer than 8px to the page's edges (where `fitFrame` keeps it on a reload).
 */
export function resizeFrame(
  f: WindowFrame,
  edge: 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw',
  dx: number,
  dy: number,
  vw: number,
  vh: number,
): WindowFrame {
  let { x, y, w, h } = f;
  const right = x + w;
  const bottom = y + h;
  if (edge.includes('e')) w = Math.max(NOTE_WINDOW_MIN.w, Math.min(w + dx, vw - EDGE_GAP - x));
  if (edge.includes('s')) h = Math.max(NOTE_WINDOW_MIN.h, Math.min(h + dy, vh - EDGE_GAP - y));
  if (edge.includes('w')) {
    x = Math.max(EDGE_GAP, Math.min(x + dx, right - NOTE_WINDOW_MIN.w));
    w = right - x;
  }
  if (edge.includes('n')) {
    y = Math.max(EDGE_GAP, Math.min(y + dy, bottom - NOTE_WINDOW_MIN.h));
    h = bottom - y;
  }
  return { x, y, w, h };
}

/** Inside the page, whatever it was saved at: at least 120px of the bar on screen, never smaller than the least. */
export function fitFrame(f: WindowFrame | null, vw: number, vh: number): WindowFrame {
  const w = Math.max(NOTE_WINDOW_MIN.w, Math.min(f?.w ?? 600, vw - 16));
  const h = Math.max(NOTE_WINDOW_MIN.h, Math.min(f?.h ?? 460, vh - 16));
  const x = Math.max(8, Math.min(f?.x ?? vw - w - 32, vw - w - 8));
  const y = Math.max(8, Math.min(f?.y ?? 96, vh - 60));
  return { x, y, w, h };
}
