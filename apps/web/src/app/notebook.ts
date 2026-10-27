import { NotebookStore, type DrawingView, type NoteView, type SaveState } from '@tudu/client';
import {
  buildTree,
  daysLeft,
  daysLeftWords,
  drawingText,
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
  TOAST_WITH_ACTION_MS,
  type DrawingPictures,
  type NoteEditorDrawings,
  type NoteEditorNote,
  type NoteFolderItem,
  type NoteHitItem,
  type NoteItem,
  type NoteTaskItem,
  type NoteTrashItem,
  type PickItem,
} from '@tudu/ui';
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { API_URL } from './config';
import { desktop } from './desktop';
import { api, queryClient } from './session';
import { taskStore } from './tasks';

/** Your Notebook, through the same outbox as your tasks. */
export const notebookStore = new NotebookStore({
  api,
  queryClient,
  tasks: taskStore,
  // A move the server turned down: the tree has put it back already; say so, with a way to send it again.
  onRejected: (message, move) =>
    move
      ? showToast(`Couldn’t move “${move.name}”. It’s back where it was.`, {
          action: 'Try again',
          onAction: move.retry,
        })
      : showToast(message),
  onDrawingStale: (message, openMine) =>
    showToast(message, { action: 'Open mine', onAction: openMine, duration: TOAST_WITH_ACTION_MS }),
});

// Words still waiting for quiet save as the page goes (a reload, a closed tab or popup).
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => notebookStore.flushAll());
  // For end-to-end tests: words waiting for quiet are not saved yet either.
  const hook = (window as unknown as { __tudu?: { idle?: () => Promise<boolean> } }).__tudu;
  if (hook) hook.idle = async () => !notebookStore.isBusy() && (await taskStore.idle());
}

/** A picture of a drawing for its block: the Notebook file's address. */
const fileUrl = (id: string | null) => (id ? `${API_URL}/api/files/${encodeURIComponent(id)}` : null);

function wordsOf(text: string): number {
  const t = text.trim();
  return t ? t.split(/\s+/).length : 0;
}

/**
 * Drawings in a note, for its NoteEditor: each block's picture (the one made here on Done until the server has
 * its own), Draw, and the open drawing's sheet with its scene, saves and uploads.
 */
export function useNoteDrawings(
  noteId: string | null,
  view: NoteView | undefined,
): NoteEditorDrawings | undefined {
  const [open, setOpen] = useState<{ id: string; from: DOMRect | null } | null>(null);
  const [drawing, setDrawing] = useState<DrawingView | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  // Another note: whatever was open there closes.
  const [seen, setSeen] = useState(noteId);
  if (seen !== noteId) {
    setSeen(noteId);
    setOpen(null);
    setDrawing(null);
  }
  const live = useSyncExternalStore(
    (l) => notebookStore.subscribe(l),
    () =>
      open
        ? `${notebookStore.drawingSaveState(open.id)}:${notebookStore.isDrawingSlow(open.id) ? 1 : 0}:${notebookStore.drawingNow(open.id)?.gen ?? 0}:${notebookStore.pictureVersion}`
        : `-:${notebookStore.pictureVersion}`,
    () => '',
  );
  const [save, slow] = live.split(':');
  useEffect(() => {
    if (!open || !noteId) return;
    let gone = false;
    notebookStore.openDrawing(open.id, noteId).then(
      (d) => !gone && setDrawing(d),
      () => !gone && setError(true),
    );
    return () => {
      gone = true;
    };
  }, [open, noteId, attempt]);

  return useMemo(() => {
    if (!noteId || !view) return undefined;
    const info = notebookStore.drawingInfo(view);
    // Once it has loaded, the store's is the one to show: a newer scene from another window moves its gen.
    const sheetDrawing =
      drawing && open && drawing.id === open.id ? (notebookStore.drawingNow(open.id) ?? drawing) : null;
    return {
      picture: (id) => {
        const d = info.get(id);
        if (!d) return undefined;
        return {
          light: d.local?.light ?? fileUrl(d.previewLight),
          dark: d.local?.dark ?? fileUrl(d.previewDark),
          words: d.local?.words ?? d.words,
        };
      },
      newId: () => notebookStore.newDrawing(noteId),
      open,
      onOpen: (id, from) => {
        setDrawing(null);
        setError(false);
        setOpen({ id, from });
      },
      sheet: open
        ? {
            drawing: sheetDrawing
              ? { id: sheetDrawing.id, scene: sheetDrawing.scene, gen: sheetDrawing.gen }
              : null,
            error,
            onRetry: () => {
              setError(false);
              setAttempt((n) => n + 1);
            },
            loadImage: (attachmentId) => notebookStore.drawingImage(attachmentId),
            upload: (file) => notebookStore.upload(file),
            hold: () => notebookStore.holdDrawing(open.id),
            onChange: (scene) => notebookStore.editDrawing(open.id, scene),
            save: (save as SaveState) || 'saved',
            slow: slow === '1',
          }
        : undefined,
      onDone: (id, out) => {
        setOpen(null);
        setDrawing(null);
        if (notebookStore.closeDrawing(id)) return true;
        if (out.pictures) sendPictures(id, out.pictures);
        return false;
      },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteId, view, open, drawing, error, save, slow, live]);
}

/** The note's pictures of a drawing: shown here at once, uploaded, then sent with its save (which waits for them). */
function sendPictures(id: string, pictures: DrawingPictures): void {
  const scene = notebookStore.drawingNow(id)?.scene;
  notebookStore.setLocalPicture(id, {
    light: URL.createObjectURL(pictures.light),
    dark: URL.createObjectURL(pictures.dark),
    words: scene ? wordsOf(drawingText(scene)) : 0,
  });
  const release = notebookStore.holdDrawing(id);
  const file = (b: Blob, name: string) => new File([b], name, { type: 'image/png' });
  Promise.all([
    notebookStore.upload(file(pictures.light, 'Drawing.png')),
    notebookStore.upload(file(pictures.dark, 'Drawing (dark).png')),
  ]).then(
    ([light, dark]) => {
      notebookStore.setDrawingPictures(id, light.id, dark.id);
      release();
    },
    // Offline or it failed: the drawing saves without, and the picture is made the next time it opens.
    () => release(),
  );
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
    where: h.where === undefined ? undefined : (h.where ?? 'Notebook'),
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
    sub: `${folderPath(data.folders, n.folderId).join(' / ') || 'Notebook'} · ${editedAgo(n.updatedAt, now)}`,
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
    draft: !!v.draft,
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
