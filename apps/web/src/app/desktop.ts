import type { Track } from '@tudu/core';
import type { QuickAddSeed } from './dayView';

/**
 * The macOS app, as the page sees it. In the app the page is Tudu on the web inside a Tauri window, and this bridge
 * asks the app (its own commands) for what a browser tab cannot do: the dock badge, outside links in the default
 * browser, files saved to Downloads, the floating window, updates. On the web there is no bridge and every caller
 * keeps its browser behaviour. End-to-end tests install a fake (window.__tuduDesktopFake) before the page loads.
 */
export interface UpdateReady {
  version: string;
  notes: string;
  date: string | null;
}

/** Where the app's updater stands (`update_status`, and the `update:status` event on every change). */
export interface UpdateStatus {
  checks: number;
  /** When the last check finished. */
  lastCheck: string | null;
  lastResult: 'none' | 'ready' | 'error' | null;
  /** The last check was Check now's: only then does its error show. */
  lastManual: boolean;
  ready: UpdateReady | null;
  error: string | null;
  /**
   * What failed: the feed (`check`), the download, or its safety check (`signature`, which retrying can't fix). Null
   * from an app before this.
   */
  errorKind?: UpdateErrorKind | null;
  /** The version whose download or safety check failed. */
  errorVersion?: string | null;
  downloads: number;
  checking: boolean;
  downloading: { version: string; received: number; total: number | null } | null;
}

export type UpdateErrorKind = 'check' | 'download' | 'signature';

export interface AppInfo {
  track: Track;
  name: string;
  version: string;
  shortcut: string;
  /** The note window's shortcut (⌥⌘N), only while the app has it registered; none from an older app. */
  noteShortcut?: string;
}

export type DesktopWindow = 'main' | 'floating' | 'menubar' | 'note';

/** Where a resize of the note window starts: an edge or a corner. */
export type ResizeEdge = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw';


/** The note window (chunk 22): what it was last asked to show, and whether it is pinned or fills the screen. */
export interface NoteWindowState {
  pinned: boolean;
  expanded: boolean;
  /** A note (or a blank one, linked to a task); every ask has its own nonce. */
  ask: { id: string | null; linkTo: string | null; nonce: number } | null;
}

/** Open at login, as macOS has it: `approval` waits for your OK in Login Items, `refused` is macOS saying no. */
export type LoginState = 'off' | 'on' | 'approval' | 'refused';

/** Show Tudu in the Dock: only while the window is open, or always. */
export type DockMode = 'open' | 'always';

export interface ThisMac {
  openAtLogin: LoginState;
  dock: DockMode;
}

export interface DesktopBridge {
  /** Which of the app's windows this page is in. */
  window: DesktopWindow;
  info(): Promise<AppInfo>;
  setSignedIn(signedIn: boolean): void;
  setBadge(count: number): void;
  openExternal(url: string): Promise<void>;
  /** Writes the file to Downloads; answers where it landed. */
  saveDownload(name: string, bytes: Uint8Array): Promise<string>;
  /** From the floating window or the menu bar's sheet: the desk, on a page. */
  showMain(path?: string): void;
  hideFloating(): void;
  /** From the sheet: the desk on a task (its space's Today with the panel open); the sheet hides. */
  openTask(path: string): void;
  /** From the sheet: the desk with Send feedback open. */
  feedback(): void;
  /** From the sheet: the floating bar, as the summon brings it. */
  summon(): void;
  /** Make a task in the note window: the floating bar comes up filled in with these words (the desk stays put). */
  summonWith(seed: QuickAddSeed): void;
  /** The floating page as it comes up: the words it was summoned with, once; null for a plain summon. */
  quickAddSeed(): Promise<QuickAddSeed | null>;
  hideMenubar(): void;
  quit(): void;
  /**
   * The note window on a note, or on a blank one (linked to a task): it floats over every app, the desk stays put.
   * Rejects when the app is too old to have one.
   */
  openNote(id: string | null, linkTo?: string | null): Promise<void>;
  /** From the note window: what it should show, and how it sits. */
  noteState(): Promise<NoteWindowState>;
  setNotePinned(on: boolean): Promise<boolean>;
  setNoteExpanded(on: boolean): Promise<boolean>;
  /** Open in your Notebook: the desk on the note (or the Notebook), and the note window hides. */
  openInNotebook(id: string | null): void;
  hideNote(): void;
  /** The note window follows the pointer by its bar. */
  startDragging(): void;
  /**
   * Resizing the note window from an edge or corner (macOS has no native drag for them): `beginResize` as the
   * pointer goes down, then `resizeTo` with how far it has moved since, in points.
   */
  beginResize(): void;
  resizeTo(edge: ResizeEdge, dx: number, dy: number): void;
  /**
   * Checks the feed; a newer version is downloaded and verified before it is answered. `manual`: Check now, so a
   * failure shows.
   */
  checkUpdate(manual?: boolean): Promise<UpdateReady | null>;
  /** Where the updater stands; null from an app too old to say (no Check now there). */
  updateStatus(): Promise<UpdateStatus | null>;
  /** Installs the downloaded version and relaunches; fails when it could not. */
  installUpdate(): Promise<void>;
  /** Settings › This Mac as it stands, read fresh from macOS. */
  thisMac(): Promise<ThisMac>;
  /** Registers or unregisters the login item; answers where macOS left it. */
  setOpenAtLogin(on: boolean): Promise<LoginState>;
  /** System Settings › General › Login Items. */
  openLoginItems(): void;
  setDock(mode: DockMode): void;
  /** Settings › Appearance and Less motion, kept by the app for its windows; an app from before this does nothing. */
  setAppearance(look: Appearance): void;
  /**
   * `go` (the desk is asked to show a page, or `feedback` for the form), `floating:shown` (the summon),
   * `menubar:shown` and `menubar:hidden` (the tick's click, and the sheet put away), `update:ready` (a check,
   * whoever asked for it, downloaded a newer version) and `update:status` (the updater's state changed).
   */
  on(event: DesktopEvent, fn: (payload: unknown) => void): () => void;
}

export type DesktopEvent =
  | 'go'
  | 'floating:shown'
  | 'menubar:shown'
  | 'menubar:hidden'
  | 'update:ready'
  | 'update:status'
  | 'note:open';

/** The look the app builds its windows with. */
export interface Appearance {
  theme: 'light' | 'dark' | 'system';
  lessMotion: boolean;
}

/** What the sheet asks the desk to show for Send feedback, in place of a page. */
export const FEEDBACK_GO = 'feedback';
/** What the sheet's ⋯ › Check for updates… asks the desk to show: Settings › This Mac over the page it is on. */
export const UPDATES_GO = 'updates';

/** What a test installs to stand in for the app; every call is recorded in `calls`. */
export interface DesktopFake {
  window?: DesktopWindow;
  info?: Partial<AppInfo>;
  /** What checks answer; null for up to date. */
  update?: UpdateReady | null;
  failCheck?: boolean;
  refuseRestart?: boolean;
  /** An app older than update_status: no Check now. */
  noStatus?: boolean;
  /** A check's steps (checking, each download step, the end) this far apart, so a test sees them; 0 by default. */
  stepMs?: number;
  /** The updater as the fake app has it; checks keep it. */
  status?: Partial<UpdateStatus>;
  /** Settings › This Mac as the fake app has it; the switch answers `loginAnswer` when set. */
  thisMac?: Partial<ThisMac>;
  loginAnswer?: LoginState;
  /** The note window as the fake app has it. */
  note?: Partial<NoteWindowState>;
  /** An app from before the note window: open_note is refused. */
  refuseOpenNote?: boolean;
  /** What a failed check failed at (`failCheck`): the feed by default. */
  errorKind?: UpdateErrorKind;
  /** The floating bar's waiting seed (summonWith keeps it, quickAddSeed takes it). */
  seed?: QuickAddSeed | null;
  calls: Array<{ name: string; args: unknown[] }>;
  listeners?: Record<string, Array<(payload: unknown) => void>>;
}

declare global {
  interface Window {
    __TAURI_INTERNALS__?: {
      invoke: (
        cmd: string,
        args?: unknown,
        options?: { headers?: Record<string, string> },
      ) => Promise<unknown>;
      metadata?: { currentWindow?: { label?: string } };
    };
    __tuduDesktopFake?: DesktopFake;
  }
}

function fakeStatus(f: DesktopFake): UpdateStatus {
  return {
    checks: 0,
    lastCheck: null,
    lastResult: null,
    lastManual: false,
    ready: null,
    error: null,
    downloads: 0,
    checking: false,
    downloading: null,
    ...f.status,
  };
}

function fakeBridge(f: DesktopFake): DesktopBridge {
  const call = (name: string, ...args: unknown[]) => f.calls.push({ name, args });
  f.listeners ??= {};
  return {
    window: f.window ?? 'main',
    info: async () => ({ track: 'test', name: 'Tudu Test', version: '0.37.0', shortcut: '⌘⇧N', ...f.info }),
    setSignedIn: (v) => call('setSignedIn', v),
    setBadge: (n) => call('setBadge', n),
    openExternal: async (url) => {
      call('openExternal', url);
    },
    saveDownload: async (name, bytes) => {
      call('saveDownload', name, bytes.byteLength);
      return `/Users/you/Downloads/${name}`;
    },
    showMain: (path) => call('showMain', path ?? null),
    hideFloating: () => call('hideFloating'),
    openTask: (path) => call('openTask', path),
    feedback: () => call('feedback'),
    summon: () => call('summon'),
    summonWith: (seed) => {
      call('summonWith', seed);
      f.seed = seed;
    },
    quickAddSeed: async () => {
      const s = f.seed ?? null;
      f.seed = null;
      return s;
    },
    hideMenubar: () => call('hideMenubar'),
    quit: () => call('quit'),
    openNote: async (id, linkTo) => {
      call('openNote', id, linkTo ?? null);
      if (f.refuseOpenNote) throw new Error('Command open_note not found');
    },
    noteState: async () => ({ pinned: false, expanded: false, ask: null, ...f.note }),
    setNotePinned: async (on) => {
      call('setNotePinned', on);
      f.note = { ...f.note, pinned: on };
      return on;
    },
    setNoteExpanded: async (on) => {
      call('setNoteExpanded', on);
      f.note = { ...f.note, expanded: on };
      return on;
    },
    openInNotebook: (id) => call('openInNotebook', id),
    hideNote: () => call('hideNote'),
    startDragging: () => call('startDragging'),
    beginResize: () => call('beginResize'),
    resizeTo: (edge, dx, dy) => call('resizeTo', edge, dx, dy),
    checkUpdate: async (manual) => {
      call('checkUpdate', ...(manual ? [true] : []));
      // A fake app old or new: the status steps through as the real one's do, then the answer.
      const step = (s: Partial<UpdateStatus>) => {
        f.status = { ...fakeStatus(f), ...s };
        for (const l of f.listeners!['update:status'] ?? []) l(f.status);
      };
      const wait = () => new Promise((r) => setTimeout(r, f.stepMs ?? 0));
      const end = (s: Partial<UpdateStatus>) =>
        step({
          ...s,
          checking: false,
          downloading: null,
          lastManual: !!manual,
          checks: fakeStatus(f).checks + 1,
          lastCheck: new Date().toISOString(),
        });
      if (!f.noStatus) step({ checking: true });
      await wait();
      if (f.failCheck) {
        const kind = f.errorKind ?? 'check';
        const version = kind === 'check' ? null : (f.update?.version ?? null);
        if (!f.noStatus)
          end({
            lastResult: 'error',
            error: 'The feed could not be reached.',
            errorKind: kind,
            errorVersion: version,
          });
        throw new Error('The feed could not be reached.');
      }
      const u = f.update ?? null;
      if (u && !f.noStatus && fakeStatus(f).ready?.version !== u.version)
        for (const received of [0, 0.25, 0.5, 0.75, 1]) {
          step({ downloading: { version: u.version, received: received * 1000, total: 1000 } });
          await wait();
        }
      if (!f.noStatus)
        end(u ? { lastResult: 'ready', ready: u, error: null } : { lastResult: 'none', error: null });
      return u;
    },
    updateStatus: async () => {
      call('updateStatus');
      return f.noStatus ? null : fakeStatus(f);
    },
    installUpdate: async () => {
      call('installUpdate');
      if (f.refuseRestart) throw new Error('Could not restart.');
    },
    thisMac: async () => {
      call('thisMac');
      return { openAtLogin: 'off', dock: 'open', ...f.thisMac };
    },
    setOpenAtLogin: async (on) => {
      call('setOpenAtLogin', on);
      const answer = f.loginAnswer ?? (on ? 'on' : 'off');
      f.thisMac = { ...f.thisMac, openAtLogin: answer === 'refused' ? 'off' : answer };
      return answer;
    },
    openLoginItems: () => call('openLoginItems'),
    setDock: (mode) => {
      call('setDock', mode);
      f.thisMac = { ...f.thisMac, dock: mode };
    },
    setAppearance: (look) => call('setAppearance', look),
    on: (event, fn) => {
      (f.listeners![event] ??= []).push(fn);
      return () => {
        f.listeners![event] = (f.listeners![event] ?? []).filter((x) => x !== fn);
      };
    },
  };
}

function tauriBridge(t: NonNullable<Window['__TAURI_INTERNALS__']>): DesktopBridge {
  const invoke = <T>(cmd: string, args?: Record<string, unknown>) => t.invoke(cmd, args) as Promise<T>;
  const quiet = (p: Promise<unknown>) => void p.catch(() => {});
  const at = t.metadata?.currentWindow?.label;
  const label: DesktopWindow = at === 'floating' || at === 'menubar' || at === 'note' ? at : 'main';
  const win = () => import('@tauri-apps/api/window').then((w) => w.getCurrentWindow());
  return {
    window: label,
    info: () => invoke<AppInfo>('app_info'),
    setSignedIn: (signedIn) => quiet(invoke('set_signed_in', { signedIn })),
    setBadge: (count) => quiet(invoke('set_badge', { count })),
    openExternal: (url) => invoke('open_external', { url }),
    saveDownload: (name, bytes) =>
      t.invoke('save_download', bytes, {
        headers: { 'x-name': encodeURIComponent(name) },
      }) as Promise<string>,
    showMain: (path) => quiet(invoke('show_main', { path: path ?? null })),
    hideFloating: () => quiet(invoke('hide_floating')),
    openTask: (path) => quiet(invoke('show_main', { path })),
    feedback: () => quiet(invoke('show_main', { path: FEEDBACK_GO })),
    summon: () => quiet(invoke('summon')),
    summonWith: (seed) => quiet(invoke('summon_with', { seed })),
    quickAddSeed: () => invoke<QuickAddSeed | null>('quick_add_seed').catch(() => null),
    hideMenubar: () => quiet(invoke('hide_menubar')),
    quit: () => quiet(invoke('quit')),
    openNote: (id, linkTo) => invoke<void>('open_note', { id, linkTo: linkTo ?? null }),
    noteState: () => invoke<NoteWindowState>('note_state'),
    setNotePinned: (on) => invoke<boolean>('set_note_pinned', { on }),
    setNoteExpanded: (on) => invoke<boolean>('set_note_expanded', { on }),
    openInNotebook: (id) => quiet(invoke('open_in_notebook', { id })),
    hideNote: () => quiet(invoke('hide_note')),
    startDragging: () => quiet(win().then((w) => w.startDragging())),
    beginResize: () => quiet(invoke('note_resize_begin')),
    resizeTo: (edge, dx, dy) => quiet(invoke('note_resize_to', { edge, dx, dy })),
    // Not asked for: the page's own check, which keeps to the app's 30-minute floor (an older app ignores `auto`).
    checkUpdate: (manual) => invoke<UpdateReady | null>('update_check', { manual: !!manual, auto: !manual }),
    // An app before this command refuses it: no Check now there.
    updateStatus: () => invoke<UpdateStatus>('update_status').catch(() => null),
    installUpdate: () => invoke('update_install'),
    thisMac: () => invoke<ThisMac>('this_mac'),
    setOpenAtLogin: (on) => invoke<LoginState>('set_open_at_login', { on }),
    openLoginItems: () => quiet(invoke('open_login_items')),
    setDock: (dock) => quiet(invoke('set_dock', { dock })),
    setAppearance: (look) =>
      quiet(invoke('set_appearance', { theme: look.theme, lessMotion: look.lessMotion })),
    on: (event, fn) => {
      let stop: (() => void) | null = null;
      let gone = false;
      void import('@tauri-apps/api/event').then(({ listen }) =>
        listen(event === 'go' ? 'tudu:go' : event, (e) => fn(e.payload)).then((un) => {
          if (gone) un();
          else stop = un;
        }),
      );
      return () => {
        gone = true;
        stop?.();
      };
    },
  };
}

let cached: DesktopBridge | null | undefined;

/** The app's bridge, or null on the web. */
export function desktop(): DesktopBridge | null {
  if (cached !== undefined) return cached;
  if (typeof window === 'undefined') return (cached = null);
  if (window.__tuduDesktopFake) return (cached = fakeBridge(window.__tuduDesktopFake));
  if (window.__TAURI_INTERNALS__) return (cached = tauriBridge(window.__TAURI_INTERNALS__));
  return (cached = null);
}

/** Tests only: forget the bridge so the next call looks again. */
export function resetDesktop(): void {
  cached = undefined;
}

/** True inside the macOS app. */
export const inApp = (): boolean => desktop() !== null;
