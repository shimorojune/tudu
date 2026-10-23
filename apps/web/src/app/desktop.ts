import type { Track } from '@tudu/core';

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

export interface AppInfo {
  track: Track;
  name: string;
  version: string;
  shortcut: string;
}

export type DesktopWindow = 'main' | 'floating' | 'menubar';

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
  hideMenubar(): void;
  quit(): void;
  /** Checks the feed; a newer version is downloaded and verified before it is answered. */
  checkUpdate(): Promise<UpdateReady | null>;
  /** Installs the downloaded version and relaunches; fails when it could not. */
  installUpdate(): Promise<void>;
  /**
   * `go` (the desk is asked to show a page, or `feedback` for the form), `floating:shown` (the summon),
   * `menubar:shown` and `menubar:hidden` (the tick's click, and the sheet put away), and `update:ready` (a check,
   * whoever asked for it, downloaded a newer version).
   */
  on(event: DesktopEvent, fn: (payload: unknown) => void): () => void;
}

export type DesktopEvent = 'go' | 'floating:shown' | 'menubar:shown' | 'menubar:hidden' | 'update:ready';

/** What the sheet asks the desk to show for Send feedback, in place of a page. */
export const FEEDBACK_GO = 'feedback';

/** What a test installs to stand in for the app; every call is recorded in `calls`. */
export interface DesktopFake {
  window?: DesktopWindow;
  info?: Partial<AppInfo>;
  /** What checks answer; null for up to date. */
  update?: UpdateReady | null;
  failCheck?: boolean;
  refuseRestart?: boolean;
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
    hideMenubar: () => call('hideMenubar'),
    quit: () => call('quit'),
    checkUpdate: async () => {
      call('checkUpdate');
      if (f.failCheck) throw new Error('The feed could not be reached.');
      return f.update ?? null;
    },
    installUpdate: async () => {
      call('installUpdate');
      if (f.refuseRestart) throw new Error('Could not restart.');
    },
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
  const label: DesktopWindow = at === 'floating' || at === 'menubar' ? at : 'main';
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
    hideMenubar: () => quiet(invoke('hide_menubar')),
    quit: () => quiet(invoke('quit')),
    checkUpdate: () => invoke<UpdateReady | null>('update_check'),
    installUpdate: () => invoke('update_install'),
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
