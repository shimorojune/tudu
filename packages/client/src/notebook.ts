import type { QueryClient } from '@tanstack/react-query';
import { queryOptions } from '@tanstack/react-query';
import {
  drawingIds,
  firstLine,
  folderPath,
  foldersBelow,
  isBlankNote,
  isEmptyDrawing,
  isNotebookMutation,
  nameTaken,
  nameTakenWords,
  NOTEBOOK_CHANGED,
  placeAt,
  POSITION_STEP,
  RECENT_NOTES,
  wordCount,
  type DrawingScene,
  type NotebookChangedEvent,
  type NotebookFolder,
  type NotebookMutationBody,
  type NotebookResponse,
  type Note,
  type NoteDrawing,
  type NoteDrawingInfo,
  type NoteFile,
  type NoteHeader,
  type NoteListItem,
  type NoteListResponse,
  type NoteTask,
  type SyncMutation,
  type SyncResult,
  type TrashItem,
  type TrashResponse,
} from '@tudu/core';
import type { Api } from './api';
import type { LiveEvent } from './events';
import type { TaskStore } from './tasks';

export const notebookKey = () => ['notebook'] as const;
export const noteKey = (id: string) => ['notebook', 'note', id] as const;
export const recentKey = () => ['notebook', 'recent'] as const;
export const trashKey = () => ['notebook', 'trash'] as const;
export const taskNotesKey = (taskId: string) => ['notebook', 'task', taskId] as const;

/** How a note's words are doing: quiet unless it matters. */
export type SaveState = 'saved' | 'saving' | 'offline' | 'conflict' | 'error';

/** Body and title saves wait for this much quiet (and always go on blur or close). */
export const SAVE_QUIET_MS = 600;
/** A save that takes longer than this shows the small ring. */
export const SLOW_SAVE_MS = 500;
/** A drawing saves after this much quiet (Excalidraw changes on every pointer move), and always on Done. */
export const DRAWING_QUIET_MS = 800;
export const DRAWING_STALE_WORDS = 'This drawing changed in another window. Showing the newest one.';

/** A note as the editor holds it: the server's note with what you typed on top, and when to start the editor again. */
export interface NoteView extends Note {
  /** Bumped when the words change under the editor (another window, Show the newer one): the editor starts again. */
  gen: number;
  /** Not on the server yet: a blank note that is only kept once it has a title or a word. */
  draft?: boolean;
}

type NB = NotebookMutationBody;
type Change = Extract<SyncMutation, { type: NB['type'] }>;

/** What this tab knows of one note it is writing in. */
interface Writing {
  title: string;
  html: string;
  /** The rev the next body save is written on. */
  rev: number;
  /** On the server (or on its way there). */
  created: boolean;
  /** Made in this tab: closing it blank takes it away again. */
  fresh: boolean;
  folderId: string | null;
  linkTo?: string;
  titleDirty: boolean;
  bodyDirty: boolean;
  timer: ReturnType<typeof setTimeout> | null;
  /** Changes for this note the server hasn't answered. */
  waiting: Set<string>;
  slow: ReturnType<typeof setTimeout> | null;
  isSlow: boolean;
  conflict: boolean;
  error: boolean;
}

/** A drawing this tab has open or is saving. */
interface Sketch {
  noteId: string;
  /** The scene as drawn here; null until it has loaded. */
  scene: DrawingScene | null;
  /** The rev the next save is written on (0 makes it). */
  rev: number;
  dirty: boolean;
  timer: ReturnType<typeof setTimeout> | null;
  /** Images (and pictures) still uploading: no save goes out until they land. */
  holds: number;
  /** A save was asked for (Done) while something was held: it goes once nothing is. */
  owed: boolean;
  /** New pictures for the next save. */
  pictures: { light: string | null; dark: string | null } | null;
  waiting: Set<string>;
  slow: ReturnType<typeof setTimeout> | null;
  isSlow: boolean;
  error: boolean;
  /** Bumped when the scene is replaced under the editor (a newer one from another window). */
  gen: number;
}

/** A drawing as its editor opens it. */
export interface DrawingView {
  id: string;
  noteId: string;
  scene: DrawingScene;
  rev: number;
  gen: number;
}

/** What a drawing block shows before the server has its pictures: local ones, made as Done was pressed. */
export interface LocalPicture {
  light: string | null;
  dark: string | null;
  words: number;
}

/** A move the server turned down: the note's or folder's name, and the same move sent again. */
export interface RejectedMove {
  name: string;
  retry: () => void;
}

export interface NotebookStoreOptions {
  api: Api;
  queryClient: QueryClient;
  tasks: TaskStore;
  /**
   * A Notebook change turned down for another reason than a stale save: tell the person. A turned-down move also says
   * what moved and how to send it again (the tree has already put it back).
   */
  onRejected?: (message: string, move?: RejectedMove) => void;
  /** A drawing's save was stale: it now shows the newest one; `openMine` puts this tab's back and saves it. */
  onDrawingStale?: (message: string, openMine: () => void) => void;
  newId?: () => string;
  now?: () => Date;
  quietMs?: number;
  drawingQuietMs?: number;
}

const byPlace = (a: { position: number; id: string }, b: { position: number; id: string }) =>
  a.position - b.position || a.id.localeCompare(b.id);

/**
 * Apply one Notebook change to the tree. Pure: what the server will do, done here at once. Putting back from Trash
 * is left to the server, which says what comes back and where.
 */
export function applyToNotebook(data: NotebookResponse, m: Change, at: string): NotebookResponse {
  const p = m.payload as Record<string, unknown> & { id: string };
  const notes = (fn: (n: NoteHeader) => NoteHeader | null) => ({
    ...data,
    notes: data.notes.map(fn).filter((n): n is NoteHeader => !!n),
  });
  switch (m.type) {
    case 'note.create': {
      if (data.notes.some((n) => n.id === m.payload.id)) return data;
      const folderId = m.payload.folderId;
      const end = Math.max(0, ...data.notes.filter((n) => n.folderId === folderId).map((n) => n.position));
      return {
        ...data,
        notes: [
          ...data.notes,
          {
            id: m.payload.id,
            folderId,
            title: m.payload.title.trim(),
            first: m.payload.title.trim() ? '' : firstLine(m.payload.html),
            position: m.payload.position ?? end + POSITION_STEP,
            updatedAt: at,
            links: m.payload.linkTo ? 1 : 0,
          },
        ],
      };
    }
    case 'note.title':
      return notes((n) =>
        n.id === p.id
          ? {
              ...n,
              title: m.payload.title.trim(),
              first: m.payload.title.trim() ? '' : n.first,
              updatedAt: at,
            }
          : n,
      );
    case 'note.body':
      return notes((n) =>
        n.id === p.id ? { ...n, first: n.title ? '' : firstLine(m.payload.html), updatedAt: at } : n,
      );
    case 'note.move': {
      const folderId = m.payload.folderId;
      const end = Math.max(0, ...data.notes.filter((n) => n.folderId === folderId).map((n) => n.position));
      return notes((n) =>
        n.id === p.id ? { ...n, folderId, position: m.payload.position ?? end + POSITION_STEP } : n,
      );
    }
    case 'note.delete':
      if (!data.notes.some((n) => n.id === p.id)) return data;
      return { ...notes((n) => (n.id === p.id ? null : n)), trashCount: data.trashCount + 1 };
    case 'note.purge':
      return notes((n) => (n.id === p.id ? null : n));
    case 'note.link':
    case 'note.unlink':
      return notes((n) =>
        n.id === p.id ? { ...n, links: Math.max(0, n.links + (m.type === 'note.link' ? 1 : -1)) } : n,
      );
    case 'folder.create': {
      if (data.folders.some((f) => f.id === p.id)) return data;
      const parentId = m.payload.parentId;
      const end = Math.max(0, ...data.folders.filter((f) => f.parentId === parentId).map((f) => f.position));
      return {
        ...data,
        folders: [
          ...data.folders,
          {
            id: m.payload.id,
            parentId,
            name: m.payload.name.trim(),
            position: m.payload.position ?? end + POSITION_STEP,
          },
        ],
      };
    }
    case 'folder.rename':
      return {
        ...data,
        folders: data.folders.map((f) => (f.id === p.id ? { ...f, name: m.payload.name.trim() } : f)),
      };
    case 'folder.move': {
      const parentId = m.payload.parentId;
      const end = Math.max(0, ...data.folders.filter((f) => f.parentId === parentId).map((f) => f.position));
      return {
        ...data,
        folders: data.folders.map((f) =>
          f.id === p.id ? { ...f, parentId, position: m.payload.position ?? end + POSITION_STEP } : f,
        ),
      };
    }
    case 'folder.delete': {
      if (!data.folders.some((f) => f.id === p.id)) return data;
      const gone = new Set([p.id, ...foldersBelow(data.folders, p.id)]);
      return {
        folders: data.folders.filter((f) => !gone.has(f.id)),
        notes: data.notes.filter((n) => !n.folderId || !gone.has(n.folderId)),
        trashCount: data.trashCount + 1,
      };
    }
    case 'trash.empty':
      return { ...data, trashCount: 0 };
    default:
      // Putting back and deleting from Trash: the server says what comes back.
      return data;
  }
}

/**
 * The Notebook's layer over the task store's outbox. Every change shows at once in the tree, the note and the task
 * panel, and goes into the same outbox as tasks. A note's words save after 600 ms of quiet (and always on close),
 * each save naming the rev it was written on; the save state comes from what is still on its way. A new note is a
 * draft until it has a title or a word, so a blank one closed is never kept.
 */
export class NotebookStore {
  private readonly writing = new Map<string, Writing>();
  /** Which note each change in the outbox is for. */
  private readonly changes = new Map<string, string>();
  private readonly listeners = new Set<() => void>();
  private readonly quiet: number;
  private readonly sketches = new Map<string, Sketch>();
  /** Which drawing each drawing change in the outbox is for. */
  private readonly sketchChanges = new Map<string, string>();
  private readonly pictures = new Map<string, LocalPicture>();

  constructor(private readonly o: NotebookStoreOptions) {
    this.quiet = o.quietMs ?? SAVE_QUIET_MS;
  }

  private hooked = false;
  /** Hear the task store's answers and the connection, from the first change or the first listener on. */
  private hook(): void {
    if (this.hooked) return;
    this.hooked = true;
    this.o.tasks.onAnswered((results) => this.answered(results));
    this.o.tasks.onReachableChange(() => this.notify());
  }

  private get qc(): QueryClient {
    return this.o.queryClient;
  }

  // ---- reading ---------------------------------------------------------------------------------------------

  /** The tree, with every change still on its way applied on top. */
  treeQuery() {
    return queryOptions({
      queryKey: notebookKey(),
      queryFn: async (): Promise<NotebookResponse> => {
        let data = await this.o.api.get<NotebookResponse>('/api/notebook');
        for (const m of this.waitingChanges()) data = applyToNotebook(data, m, m.at);
        return data;
      },
    });
  }

  /** One note, with what you typed and haven't saved yet on top. */
  noteQuery(id: string) {
    return queryOptions({
      queryKey: noteKey(id),
      queryFn: async (): Promise<NoteView> => {
        const had = this.qc.getQueryData<NoteView>(noteKey(id));
        const w = this.writing.get(id);
        if (w && !w.created) return had ?? this.blank(id, w.folderId);
        const note = await this.o.api.get<Note>(`/api/notebook/notes/${id}`);
        return this.withWriting(note, had);
      },
    });
  }

  recentQuery(limit = RECENT_NOTES) {
    return queryOptions({
      queryKey: recentKey(),
      queryFn: async (): Promise<NoteListItem[]> =>
        (await this.o.api.get<NoteListResponse>(`/api/notebook/recent?limit=${limit}`)).notes,
    });
  }

  trashQuery() {
    return queryOptions({
      queryKey: trashKey(),
      queryFn: async (): Promise<TrashItem[]> =>
        (await this.o.api.get<TrashResponse>('/api/notebook/trash')).items,
    });
  }

  /** Your notes linked to a task, for its panel. */
  taskNotesQuery(taskId: string) {
    return queryOptions({
      queryKey: taskNotesKey(taskId),
      queryFn: async (): Promise<NoteListItem[]> =>
        (await this.o.api.get<NoteListResponse>(`/api/tasks/${taskId}/notes`)).notes,
    });
  }

  cachedTree(): NotebookResponse | undefined {
    return this.qc.getQueryData<NotebookResponse>(notebookKey());
  }

  // ---- writing ---------------------------------------------------------------------------------------------

  /**
   * A new blank note to write in, in a folder (or none), linked to a task once it's kept. Nothing reaches the
   * server until it has a title or a word. Returns its id.
   */
  draft(options: { folderId?: string | null; linkTo?: string } = {}): string {
    const id = this.newId();
    const folderId = options.folderId ?? null;
    this.writing.set(id, {
      ...this.fresh(folderId),
      linkTo: options.linkTo,
    });
    this.qc.setQueryData<NoteView>(noteKey(id), this.blank(id, folderId));
    this.notify();
    return id;
  }

  /** Is this note still a draft nobody has written in? */
  isDraft(id: string): boolean {
    const w = this.writing.get(id);
    return !!w && !w.created;
  }

  /**
   * You typed in a note: the title, the words, or both. The note shows it at once; the save waits for quiet. A
   * draft becomes a note on its first title or word.
   */
  edit(id: string, patch: { title?: string; html?: string }): void {
    const w = this.writingFor(id);
    if (patch.title !== undefined && patch.title !== w.title) {
      w.title = patch.title;
      w.titleDirty = true;
    }
    if (patch.html !== undefined && patch.html !== w.html) {
      w.html = patch.html;
      w.bodyDirty = true;
    }
    const view = this.qc.getQueryData<NoteView>(noteKey(id));
    const kept = w.created || !isBlankNote(w.title, w.html);
    if (view)
      this.qc.setQueryData<NoteView>(noteKey(id), {
        ...view,
        title: w.title,
        html: w.html,
        words: wordCount(w.html),
        ...(kept ? { draft: false, updatedAt: (this.o.now?.() ?? new Date()).toISOString() } : {}),
      });
    if (!w.created) {
      if (!kept) return;
      w.created = true;
      // The note is kept from its first word: made at once with its title, the words follow as a body save.
      this.send(id, {
        type: 'note.create',
        payload: {
          id,
          folderId: w.folderId,
          title: w.title.trim(),
          html: '',
          position: null,
          ...(w.linkTo ? { linkTo: w.linkTo } : {}),
        },
      });
      w.titleDirty = false;
      if (w.linkTo) this.placeInTask(w.linkTo, id);
    }
    if (w.timer) clearTimeout(w.timer);
    w.timer = setTimeout(() => this.flush(id), this.quiet);
    this.notify();
  }

  /** Save now what is waiting for quiet (blur, close, switching notes). */
  flush(id: string): void {
    const w = this.writing.get(id);
    if (!w) return;
    if (w.timer) clearTimeout(w.timer);
    w.timer = null;
    if (!w.created) return;
    if (w.titleDirty) {
      w.titleDirty = false;
      this.send(id, { type: 'note.title', payload: { id, title: w.title.trim() } });
    }
    if (w.bodyDirty && !w.conflict) {
      w.bodyDirty = false;
      const baseRev = w.rev;
      w.rev += 1;
      this.send(id, { type: 'note.body', payload: { id, html: w.html, baseRev } });
    }
  }

  /** True while some note's words are still waiting for quiet (not in the outbox yet). Tests wait on it. */
  isBusy(): boolean {
    for (const w of this.writing.values())
      if (w.timer || ((w.titleDirty || w.bodyDirty) && w.created)) return true;
    return this.isDrawingBusy();
  }

  /** Save every note's waiting words now (the page is going away). */
  flushAll(): void {
    for (const id of this.writing.keys()) this.flush(id);
    for (const id of this.sketches.keys()) this.flushDrawing(id, true);
  }

  /**
   * You're done with a note (the window closes, another note opens). Anything waiting saves; a note made here that
   * is still blank goes away again, and a draft nobody wrote in was never there.
   */
  close(id: string): void {
    const w = this.writing.get(id);
    if (!w) return;
    if (!w.created) {
      this.forget(id);
      this.qc.removeQueries({ queryKey: noteKey(id), exact: true });
      return;
    }
    if (w.fresh && isBlankNote(w.title, w.html)) {
      if (w.timer) clearTimeout(w.timer);
      this.send(id, { type: 'note.purge', payload: { id } });
      this.forget(id);
      return;
    }
    this.flush(id);
  }

  /** "Keep mine": your words again, on the rev the server has now. */
  async keepMine(id: string): Promise<void> {
    const w = this.writing.get(id);
    if (!w) return;
    const server = await this.o.api.get<Note>(`/api/notebook/notes/${id}`);
    w.conflict = false;
    w.error = false;
    w.rev = server.rev + 1;
    w.bodyDirty = false;
    this.send(id, { type: 'note.body', payload: { id, html: w.html, baseRev: server.rev } });
  }

  /** "Show the newer one": your unsaved words go, and the note shows what the server has. */
  async showNewer(id: string): Promise<void> {
    const w = this.writing.get(id);
    const server = await this.o.api.get<Note>(`/api/notebook/notes/${id}`);
    if (w) {
      if (w.timer) clearTimeout(w.timer);
      Object.assign(w, {
        title: server.title,
        html: server.html,
        rev: server.rev,
        conflict: false,
        error: false,
        titleDirty: false,
        bodyDirty: false,
        timer: null,
      });
    }
    const had = this.qc.getQueryData<NoteView>(noteKey(id));
    this.qc.setQueryData<NoteView>(noteKey(id), { ...server, gen: (had?.gen ?? 0) + 1 });
    this.notify();
  }

  /** How this note's words are doing. */
  saveState(id: string): SaveState {
    const w = this.writing.get(id);
    if (!w) return 'saved';
    if (w.conflict) return 'conflict';
    if (w.error) return 'error';
    if (!w.waiting.size) return 'saved';
    const online = this.o.tasks.isReachable && (typeof navigator === 'undefined' || navigator.onLine);
    return online ? 'saving' : 'offline';
  }

  /** True once a save has taken longer than half a second: the ring shows. */
  isSlow(id: string): boolean {
    return !!this.writing.get(id)?.isSlow;
  }

  /** For useSyncExternalStore: the save states and drafts changed. */
  subscribe(fn: () => void): () => void {
    this.hook();
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  // ---- drawings --------------------------------------------------------------------------------------------

  /** A new drawing in a note: nothing reaches the server until something is drawn on it. Returns its id. */
  newDrawing(noteId: string): string {
    const id = this.newId();
    this.sketches.set(id, { ...this.blankSketch(noteId), scene: { elements: [], files: {} } });
    return id;
  }

  /** A drawing to open: what this tab has, else the server's. One the server doesn't have yet opens empty. */
  async openDrawing(id: string, noteId: string): Promise<DrawingView> {
    const had = this.sketches.get(id);
    if (had?.scene) return { id, noteId: had.noteId, scene: had.scene, rev: had.rev, gen: had.gen };
    let server: NoteDrawing | null = null;
    try {
      server = await this.o.api.get<NoteDrawing>(`/api/notebook/drawings/${id}`);
    } catch (err) {
      if ((err as { status?: number }).status !== 404) throw err;
    }
    const s = this.sketches.get(id) ?? this.blankSketch(noteId);
    if (!s.scene) {
      s.scene = server?.scene ?? { elements: [], files: {} };
      s.rev = server?.rev ?? 0;
    }
    this.sketches.set(id, s);
    return { id, noteId: s.noteId, scene: s.scene!, rev: s.rev, gen: s.gen };
  }

  /** The drawing changed (a stroke, an image landed): saved after quiet. */
  editDrawing(id: string, scene: DrawingScene): void {
    const s = this.sketches.get(id);
    if (!s) return;
    s.scene = scene;
    s.dirty = true;
    if (s.timer) clearTimeout(s.timer);
    s.timer = setTimeout(() => this.flushDrawing(id), this.o.drawingQuietMs ?? DRAWING_QUIET_MS);
    this.notify();
  }

  /** Something in the drawing is uploading: its saves wait. Call what comes back once it has landed or failed. */
  holdDrawing(id: string): () => void {
    const s = this.sketches.get(id);
    if (!s) return () => {};
    s.holds += 1;
    this.notify();
    let done = false;
    return () => {
      if (done) return;
      done = true;
      s.holds = Math.max(0, s.holds - 1);
      // Done already went out while this was held (the note's pictures upload after it): the save it owes, or the
      // pictures that landed since, go now.
      if (!s.holds && (s.owed || s.pictures)) {
        s.owed = false;
        this.flushDrawing(id, true);
      }
      this.notify();
    };
  }

  /** The note's new pictures of the drawing (Notebook file ids), sent with its next save. */
  setDrawingPictures(id: string, light: string | null, dark: string | null): void {
    const s = this.sketches.get(id);
    if (!s) return;
    s.pictures = { light, dark };
    s.dirty = true;
  }

  /** What the block shows until the server has the drawing's pictures (object URLs made on Done). */
  setLocalPicture(id: string, picture: LocalPicture): void {
    const was = this.pictures.get(id);
    for (const u of [was?.light, was?.dark]) if (u && !Object.values(picture).includes(u)) revoke(u);
    this.pictures.set(id, picture);
    this.pictureVersion += 1;
    this.notify();
  }

  /** Moves whenever a block's local picture changes (for useSyncExternalStore). */
  pictureVersion = 0;

  localPicture(id: string): LocalPicture | undefined {
    return this.pictures.get(id);
  }

  /**
   * Save the drawing now. A save waits while an image is uploading (and goes when it lands), and one already on its
   * way goes first unless `now` (Done, closing) says to queue this one behind it.
   */
  flushDrawing(id: string, now = false): void {
    const s = this.sketches.get(id);
    if (!s) return;
    if (s.timer) clearTimeout(s.timer);
    s.timer = null;
    if (!s.dirty || !s.scene) return;
    if (s.holds) {
      if (now) s.owed = true;
      return;
    }
    // A brand-new drawing nobody drew on is never kept.
    if (s.rev === 0 && isEmptyDrawing(s.scene)) return;
    if (s.waiting.size && !now) return;
    s.dirty = false;
    const baseRev = s.rev;
    s.rev += 1;
    const pictures = s.pictures;
    s.pictures = null;
    this.send(null, {
      type: 'drawing.save',
      payload: {
        id,
        noteId: s.noteId,
        scene: s.scene,
        baseRev,
        ...(pictures ? { previewLight: pictures.light, previewDark: pictures.dark } : {}),
      },
    });
  }

  /**
   * Done (or back) on a drawing. Anything waiting saves; an empty drawing is not kept: it comes out of its note,
   * and the server forgets it. Returns true when it was empty (the block should leave the note).
   */
  closeDrawing(id: string): boolean {
    const s = this.sketches.get(id);
    if (!s) return false;
    if (isEmptyDrawing(s.scene)) {
      if (s.timer) clearTimeout(s.timer);
      s.timer = null;
      s.dirty = false;
      if (s.rev > 0) this.send(null, { type: 'drawing.delete', payload: { id } });
      this.pictures.delete(id);
      if (!s.waiting.size && !s.holds) this.sketches.delete(id);
      this.notify();
      return true;
    }
    this.flushDrawing(id, true);
    return false;
  }

  /** How a drawing's saves are doing, for the ring in its bar. */
  drawingSaveState(id: string): SaveState {
    const s = this.sketches.get(id);
    if (!s) return 'saved';
    if (s.error) return 'error';
    if (!s.waiting.size && !s.holds && !s.timer && !s.owed) return 'saved';
    const online = this.o.tasks.isReachable && (typeof navigator === 'undefined' || navigator.onLine);
    return online ? 'saving' : 'offline';
  }

  isDrawingSlow(id: string): boolean {
    return !!this.sketches.get(id)?.isSlow;
  }

  /** True while a drawing's changes wait for quiet or an upload. Tests wait on it. */
  isDrawingBusy(): boolean {
    for (const s of this.sketches.values()) if (s.timer || s.holds || s.owed) return true;
    return false;
  }

  /** The drawings the note's words hold, as each block shows it: the server's, with local pictures on top. */
  drawingInfo(
    note: Pick<Note, 'html' | 'drawings'>,
  ): Map<string, NoteDrawingInfo & { local?: LocalPicture }> {
    const known = new Map((note.drawings ?? []).map((d) => [d.id, d]));
    const out = new Map<string, NoteDrawingInfo & { local?: LocalPicture }>();
    for (const id of drawingIds(note.html)) {
      const d = known.get(id) ?? { id, rev: 0, previewLight: null, previewDark: null, words: 0 };
      out.set(id, { ...d, local: this.pictures.get(id) });
    }
    return out;
  }

  /** The drawing went stale: show the server's, and offer this tab's back. */
  private async staleDrawing(id: string): Promise<void> {
    const s = this.sketches.get(id);
    if (!s) return;
    const mine = s.scene;
    let server: NoteDrawing;
    try {
      server = await this.o.api.get<NoteDrawing>(`/api/notebook/drawings/${id}`);
    } catch {
      s.error = true;
      this.notify();
      return;
    }
    Object.assign(s, { scene: server.scene, rev: server.rev, dirty: false, pictures: null, gen: s.gen + 1 });
    if (s.timer) clearTimeout(s.timer);
    s.timer = null;
    void this.qc.invalidateQueries({ queryKey: noteKey(s.noteId), exact: true });
    this.notify();
    this.o.onDrawingStale?.(DRAWING_STALE_WORDS, () => {
      if (!mine) return;
      s.scene = mine;
      s.dirty = true;
      s.gen += 1;
      this.notify();
      this.flushDrawing(id, true);
    });
  }

  /** The drawing as this tab has it now (its editor reloads when `gen` moves). */
  drawingNow(id: string): DrawingView | null {
    const s = this.sketches.get(id);
    return s?.scene ? { id, noteId: s.noteId, scene: s.scene, rev: s.rev, gen: s.gen } : null;
  }

  /** Read a drawing's image from your Notebook files, as a data URL for the editor. */
  async drawingImage(attachmentId: string): Promise<string> {
    const res = await fetch(`${this.o.api.baseUrl}/api/files/${encodeURIComponent(attachmentId)}`, {
      credentials: 'include',
    });
    if (!res.ok) throw new Error('That image didn’t load.');
    const blob = await res.blob();
    return new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => reject(new Error('That image didn’t load.'));
      r.readAsDataURL(blob);
    });
  }

  private blankSketch(noteId: string): Sketch {
    return {
      noteId,
      scene: null,
      rev: 0,
      dirty: false,
      timer: null,
      holds: 0,
      owed: false,
      pictures: null,
      waiting: new Set(),
      slow: null,
      isSlow: false,
      error: false,
      gen: 0,
    };
  }

  // ---- the rest ---------------------------------------------------------------------------------------------

  /** Move a note into a folder (null for none), at `index` among its notes (the end when left out). */
  moveNote(id: string, folderId: string | null, index?: number): void {
    const data = this.cachedTree();
    const others = (data?.notes ?? []).filter((n) => n.folderId === folderId && n.id !== id).sort(byPlace);
    const position =
      index === undefined
        ? null
        : placeAt(
            others.map((n) => n.position),
            index,
          ).position;
    const w = this.writing.get(id);
    if (w) w.folderId = folderId;
    this.send(id, { type: 'note.move', payload: { id, folderId, position } });
    this.patchNote(id, (n) => ({ ...n, folderId, path: folderPath(data?.folders ?? [], folderId) }));
  }

  /** To Trash: it stays 30 days. */
  deleteNote(id: string): void {
    const w = this.writing.get(id);
    if (w?.timer) clearTimeout(w.timer);
    this.flush(id);
    this.send(id, { type: 'note.delete', payload: { id } });
    this.dropFromTasks(id);
  }

  /** Undo a delete, or Put back from Trash. */
  restoreNote(id: string): void {
    this.send(id, { type: 'note.restore', payload: { id } });
    this.dropFromTrash(id);
  }

  /** Delete now, from Trash: gone for good. */
  purgeNote(id: string): void {
    this.send(id, { type: 'note.purge', payload: { id } });
    this.dropFromTrash(id);
  }

  link(id: string, task: NoteTask): void {
    this.send(id, { type: 'note.link', payload: { id, taskId: task.id } });
    this.patchNote(id, (n) =>
      n.linked.some((t) => t.id === task.id) ? n : { ...n, linked: [...n.linked, task] },
    );
    this.placeInTask(task.id, id);
  }

  unlink(id: string, taskId: string): void {
    this.send(id, { type: 'note.unlink', payload: { id, taskId } });
    this.patchNote(id, (n) => ({ ...n, linked: n.linked.filter((t) => t.id !== taskId) }));
    const key = taskNotesKey(taskId);
    const list = this.qc.getQueryData<NoteListItem[]>(key);
    if (list)
      this.qc.setQueryData<NoteListItem[]>(
        key,
        list.filter((n) => n.id !== id),
      );
  }

  /**
   * A new folder, at the end of `parentId` (null for the top). A name another folder there already has is turned
   * down here, with the line to show under the field. Returns the folder's id, or that line.
   */
  createFolder(parentId: string | null, name: string): { id: string } | { error: string } {
    const folders = this.cachedTree()?.folders ?? [];
    if (nameTaken(folders, parentId, name)) return { error: nameTakenWords(folders, parentId, name) };
    const id = this.newId();
    this.send(null, { type: 'folder.create', payload: { id, parentId, name: name.trim(), position: null } });
    return { id };
  }

  renameFolder(id: string, name: string): { error: string } | null {
    const folders = this.cachedTree()?.folders ?? [];
    const f = folders.find((x) => x.id === id);
    if (f && nameTaken(folders, f.parentId, name, id))
      return { error: nameTakenWords(folders, f.parentId, name) };
    this.send(null, { type: 'folder.rename', payload: { id, name: name.trim() } });
    return null;
  }

  /** Move a folder into another (null for the top), at `index` among its folders. */
  moveFolder(id: string, parentId: string | null, index?: number): void {
    const folders = this.cachedTree()?.folders ?? [];
    const others = folders.filter((f) => f.parentId === parentId && f.id !== id).sort(byPlace);
    const position =
      index === undefined
        ? null
        : placeAt(
            others.map((f) => f.position),
            index,
          ).position;
    this.send(null, { type: 'folder.move', payload: { id, parentId, position } });
  }

  /** A folder and everything in it to Trash. */
  deleteFolder(id: string): void {
    this.send(null, { type: 'folder.delete', payload: { id } });
  }

  restoreFolder(id: string): void {
    this.send(null, { type: 'folder.restore', payload: { id } });
    this.dropFromTrash(id);
  }

  purgeFolder(id: string): void {
    this.send(null, { type: 'folder.purge', payload: { id } });
    this.dropFromTrash(id);
  }

  emptyTrash(): void {
    this.send(null, { type: 'trash.empty', payload: { id: this.newId() } });
    this.qc.setQueryData<TrashItem[]>(trashKey(), []);
  }

  /** Upload a file into your Notebook (a note's words link it). Needs a connection. */
  async upload(file: File, onProgress?: (ratio: number) => void): Promise<NoteFile> {
    const form = new FormData();
    form.append('file', file, file.name);
    return this.o.api.upload<NoteFile>('/api/notebook/files', form, onProgress);
  }

  /** Another window or device changed your Notebook: read again only what it names. Our own are on screen. */
  onEvent(e: LiveEvent): void {
    if (e.type !== NOTEBOOK_CHANGED) return;
    const ev = e.data as NotebookChangedEvent;
    if (ev.clientId && ev.clientId === this.o.tasks.clientId) return;
    void this.qc.invalidateQueries({ queryKey: notebookKey(), exact: true });
    void this.qc.invalidateQueries({ queryKey: recentKey(), exact: true });
    void this.qc.invalidateQueries({ queryKey: trashKey(), exact: true });
    void this.qc.invalidateQueries({ queryKey: ['notebook', 'task'] });
    for (const id of ev.notes) void this.qc.invalidateQueries({ queryKey: noteKey(id), exact: true });
  }

  /** After the stream was down: read the Notebook again. */
  refreshAll(): void {
    void this.qc.invalidateQueries({ queryKey: ['notebook'] });
  }

  // ---- inside ----------------------------------------------------------------------------------------------

  private newId(): string {
    return this.o.newId?.() ?? crypto.randomUUID();
  }

  private notify(): void {
    for (const fn of this.listeners) fn();
  }

  private fresh(folderId: string | null): Writing {
    return {
      title: '',
      html: '',
      rev: 0,
      created: false,
      fresh: true,
      folderId,
      titleDirty: false,
      bodyDirty: false,
      timer: null,
      waiting: new Set(),
      slow: null,
      isSlow: false,
      conflict: false,
      error: false,
    };
  }

  private blank(id: string, folderId: string | null): NoteView {
    const now = (this.o.now?.() ?? new Date()).toISOString();
    const folders = this.cachedTree()?.folders ?? [];
    return {
      id,
      folderId,
      title: '',
      first: '',
      position: 0,
      updatedAt: now,
      links: 0,
      html: '',
      rev: 0,
      path: folderPath(folders, folderId),
      words: 0,
      linked: [],
      createdAt: now,
      drawings: [],
      gen: 0,
      draft: true,
    };
  }

  /** The note this tab is writing in, from what the cache shows when it hasn't been touched here yet. */
  private writingFor(id: string): Writing {
    let w = this.writing.get(id);
    if (!w) {
      const view = this.qc.getQueryData<NoteView>(noteKey(id));
      w = { ...this.fresh(view?.folderId ?? null), created: true, fresh: false };
      if (view) Object.assign(w, { title: view.title, html: view.html, rev: view.rev });
      this.writing.set(id, w);
    }
    return w;
  }

  /** The server's note, with what this tab typed and hasn't had answered on top; a change from elsewhere restarts the editor. */
  private withWriting(note: Note, had: NoteView | undefined): NoteView {
    const w = this.writing.get(note.id);
    const busy = !!w && (w.titleDirty || w.bodyDirty || w.waiting.size > 0 || w.conflict);
    if (w && busy) return { ...note, title: w.title, html: w.html, rev: w.rev, gen: had?.gen ?? 0 };
    if (w) Object.assign(w, { title: note.title, html: note.html, rev: note.rev });
    const changed = !!had && !had.draft && (had.html !== note.html || had.title !== note.title);
    return { ...note, gen: (had?.gen ?? 0) + (changed ? 1 : 0) };
  }

  private forget(id: string): void {
    const w = this.writing.get(id);
    if (w?.timer) clearTimeout(w.timer);
    if (w?.slow) clearTimeout(w.slow);
    this.writing.delete(id);
    this.notify();
  }

  /** Queue a change, show it at once, and keep count of it for the note's save state. */
  private send(noteId: string | null, body: NB): void {
    this.hook();
    const mid = this.o.tasks.enqueue(body);
    this.sent.set(mid, body.type);
    if (body.type === 'note.move' || body.type === 'folder.move') this.moves.set(mid, body);
    if (body.type.startsWith('note.')) this.about.set(mid, body.payload.id);
    if (body.type.startsWith('drawing.')) {
      const s = this.sketches.get(body.payload.id);
      this.sketchChanges.set(mid, body.payload.id);
      if (s) {
        s.waiting.add(mid);
        if (!s.slow)
          s.slow = setTimeout(() => {
            s.slow = null;
            if (s.waiting.size) {
              s.isSlow = true;
              this.notify();
            }
          }, SLOW_SAVE_MS);
      }
    }
    const at = (this.o.now?.() ?? new Date()).toISOString();
    const m = { ...body, id: mid, at } as Change;
    const tree = this.cachedTree();
    if (tree) this.qc.setQueryData<NotebookResponse>(notebookKey(), applyToNotebook(tree, m, at));
    this.patchRecent(m, at);
    if (noteId && (body.type === 'note.create' || body.type === 'note.title' || body.type === 'note.body')) {
      const w = this.writing.get(noteId);
      if (w) {
        this.changes.set(mid, noteId);
        w.waiting.add(mid);
        if (!w.slow)
          w.slow = setTimeout(() => {
            w.slow = null;
            if (w.waiting.size) {
              w.isSlow = true;
              this.notify();
            }
          }, SLOW_SAVE_MS);
      }
    }
    this.notify();
  }

  /** The server answered: settle the notes' save states, and read again what only it knows. */
  private answered(results: SyncResult[]): void {
    const ours = results.filter((r) => this.sent.has(r.id));
    if (!ours.length) return;
    let refresh = false;
    for (const r of ours) {
      const type = this.sent.get(r.id)!;
      this.sent.delete(r.id);
      const moved = this.moves.get(r.id);
      this.moves.delete(r.id);
      // A link or a move: the note reads again for what the server knows (the task's ID, the folder's path).
      const about = this.about.get(r.id);
      this.about.delete(r.id);
      if (about && /^note\.(link|unlink|move|restore)$/.test(type))
        void this.qc.invalidateQueries({ queryKey: noteKey(about), exact: true });
      // What comes back from Trash, and where, is the server's word.
      if (/\.(restore|purge)$|^trash\./.test(type)) refresh = true;
      const drawingId = this.sketchChanges.get(r.id);
      this.sketchChanges.delete(r.id);
      if (drawingId) {
        this.drawingAnswered(drawingId, r);
        continue;
      }
      const noteId = this.changes.get(r.id);
      this.changes.delete(r.id);
      const w = noteId ? this.writing.get(noteId) : undefined;
      if (w) {
        w.waiting.delete(r.id);
        if (!w.waiting.size) {
          if (w.slow) clearTimeout(w.slow);
          w.slow = null;
          w.isSlow = false;
        }
      }
      if (r.status !== 'rejected') continue;
      refresh = true;
      // A stale save is the banner's to explain; anything else says why in a toast.
      if (r.reason === 'stale' && w) w.conflict = true;
      else {
        if (w && !moved) w.error = true;
        this.o.onRejected?.(
          r.error ?? 'That change couldn’t be saved.',
          moved ? this.rejectedMove(moved) : undefined,
        );
      }
    }
    void this.qc.invalidateQueries({ queryKey: recentKey(), exact: true });
    void this.qc.invalidateQueries({ queryKey: trashKey(), exact: true });
    void this.qc.invalidateQueries({ queryKey: ['notebook', 'task'] });
    if (refresh) void this.qc.invalidateQueries({ queryKey: notebookKey(), exact: true });
    this.notify();
  }

  /** A drawing's save came back: settle its ring, send what waited behind it, or deal with a turn-down. */
  private drawingAnswered(id: string, r: SyncResult): void {
    const s = this.sketches.get(id);
    if (!s) return;
    s.waiting.delete(r.id);
    if (!s.waiting.size) {
      if (s.slow) clearTimeout(s.slow);
      s.slow = null;
      s.isSlow = false;
    }
    if (r.status === 'rejected') {
      if (r.reason === 'stale') void this.staleDrawing(id);
      else {
        s.error = true;
        this.o.onRejected?.(r.error ?? 'That drawing couldn’t be saved.');
      }
      return;
    }
    s.error = false;
    // The note reads again for the drawing's new pictures and words.
    void this.qc.invalidateQueries({ queryKey: noteKey(s.noteId), exact: true });
    if (s.dirty && !s.timer) this.flushDrawing(id);
  }

  /** What a turned-down move was called, and how to send it again. */
  private rejectedMove(body: NB): RejectedMove {
    const tree = this.cachedTree();
    const id = body.payload.id;
    const name =
      body.type === 'folder.move'
        ? (tree?.folders.find((f) => f.id === id)?.name ?? 'the folder')
        : (() => {
            const n = tree?.notes.find((x) => x.id === id);
            return n?.title.trim() || n?.first.trim() || 'the note';
          })();
    return { name, retry: () => this.send(body.type === 'note.move' ? id : null, body) };
  }

  /** Notebook changes this tab sent that the server hasn't answered, by their type, and the note each is about. */
  private readonly sent = new Map<string, string>();
  /** The moves among them, kept whole so a turned-down one can be sent again. */
  private readonly moves = new Map<string, NB>();
  private readonly about = new Map<string, string>();

  private waitingChanges(): Change[] {
    return this.o.tasks.pendingChanges().filter((m) => isNotebookMutation(m)) as Change[];
  }

  private patchNote(id: string, fn: (n: NoteView) => NoteView): void {
    const view = this.qc.getQueryData<NoteView>(noteKey(id));
    if (view) this.qc.setQueryData<NoteView>(noteKey(id), fn(view));
  }

  private patchRecent(m: Change, at: string): void {
    const list = this.qc.getQueryData<NoteListItem[]>(recentKey());
    if (!list) return;
    const id = m.payload.id;
    if (m.type === 'note.delete' || m.type === 'note.purge')
      this.qc.setQueryData<NoteListItem[]>(
        recentKey(),
        list.filter((n) => n.id !== id),
      );
    else if (m.type === 'note.title' || m.type === 'note.body' || m.type === 'note.create') {
      const tree = this.cachedTree();
      const head = tree?.notes.find((n) => n.id === id);
      if (!head) return;
      const where = folderPath(tree?.folders ?? [], head.folderId).join(' / ') || null;
      this.qc.setQueryData<NoteListItem[]>(recentKey(), [
        { ...head, updatedAt: at, where },
        ...list.filter((n) => n.id !== id),
      ]);
    }
  }

  /** A note linked to a task shows in the task's panel at once. */
  private placeInTask(taskId: string, noteId: string): void {
    const key = taskNotesKey(taskId);
    const list = this.qc.getQueryData<NoteListItem[]>(key);
    if (!list || list.some((n) => n.id === noteId)) return;
    const tree = this.cachedTree();
    const head = tree?.notes.find((n) => n.id === noteId);
    const view = this.qc.getQueryData<NoteView>(noteKey(noteId));
    const base: NoteHeader | undefined =
      head ??
      (view
        ? {
            id: view.id,
            folderId: view.folderId,
            title: view.title,
            first: view.title ? '' : firstLine(view.html),
            position: view.position,
            updatedAt: view.updatedAt,
            links: view.linked.length,
          }
        : undefined);
    if (!base) return;
    const where = folderPath(tree?.folders ?? ([] as NotebookFolder[]), base.folderId).join(' / ') || null;
    this.qc.setQueryData<NoteListItem[]>(key, [...list, { ...base, where }]);
  }

  private dropFromTasks(noteId: string): void {
    for (const [key, list] of this.qc.getQueriesData<NoteListItem[]>({ queryKey: ['notebook', 'task'] }))
      if (list?.some((n) => n.id === noteId))
        this.qc.setQueryData<NoteListItem[]>(
          key,
          list.filter((n) => n.id !== noteId),
        );
  }

  private dropFromTrash(id: string): void {
    const list = this.qc.getQueryData<TrashItem[]>(trashKey());
    if (list)
      this.qc.setQueryData<TrashItem[]>(
        trashKey(),
        list.filter((x) => x.id !== id),
      );
    const tree = this.cachedTree();
    if (tree && list?.some((x) => x.id === id))
      this.qc.setQueryData<NotebookResponse>(notebookKey(), {
        ...tree,
        trashCount: Math.max(0, tree.trashCount - 1),
      });
  }
}

function revoke(url: string): void {
  if (url.startsWith('blob:') && typeof URL !== 'undefined' && URL.revokeObjectURL) URL.revokeObjectURL(url);
}
