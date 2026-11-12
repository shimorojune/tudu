import {
  ariaCombo,
  defaultBindings,
  formatCombo,
  fromAccelerator,
  readBindings,
  toAccelerator,
  type Bindings,
  type Combo,
  type KeyPlatform,
  type ShortcutId,
} from '@tudu/core';
import type { SettingsShortcuts } from '@tudu/ui';
import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { desktop, type GlobalShortcutRow } from './desktop';

/**
 * Settings › Shortcuts, kept per computer. The In Tudu keys (All spaces, the space numbers) live in this browser's
 * storage; the Mac app's From anywhere keys (New task, New note) live in the app, which registers them with macOS
 * before any page loads, so the page only asks for them and hands changes over.
 */
export const SHORTCUTS_KEY = 'tudu.shortcuts';

type AppId = 'allSpaces' | 'space';
type GlobalId = GlobalShortcutRow['id'];

export type AppBindings = Pick<Bindings, AppId>;

/** The Mac on a Mac (and always in the Mac app); Windows, Linux and the rest read as words. */
export function keyPlatform(): KeyPlatform {
  if (desktop()) return 'mac';
  if (typeof navigator === 'undefined') return 'mac';
  return /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent) ? 'mac' : 'other';
}

function readApp(platform: KeyPlatform): AppBindings {
  let raw: unknown;
  try {
    const s = localStorage.getItem(SHORTCUTS_KEY);
    raw = s ? JSON.parse(s) : null;
  } catch {
    raw = null;
  }
  const b = readBindings(raw, platform);
  return { allSpaces: b.allSpaces, space: b.space };
}

interface GlobalState {
  status: 'loading' | 'ready' | 'error';
  rows: GlobalShortcutRow[];
}

interface Snapshot {
  platform: KeyPlatform;
  app: AppBindings;
  /** The Mac app's rows; null on the web. */
  global: GlobalState | null;
}

const listeners = new Set<() => void>();
let snap: Snapshot | null = null;

function current(): Snapshot {
  if (!snap) {
    const platform = keyPlatform();
    snap = { platform, app: readApp(platform), global: desktop() ? { status: 'loading', rows: [] } : null };
  }
  return snap;
}

function put(next: Partial<Snapshot>) {
  snap = { ...current(), ...next };
  for (const l of listeners) l();
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Another tab changed the In Tudu keys. */
if (typeof window !== 'undefined')
  window.addEventListener('storage', (e) => {
    if (e.key === SHORTCUTS_KEY && snap) put({ app: readApp(snap.platform) });
  });

/** Asks the Mac app for its From anywhere shortcuts (it checks them with macOS first). */
export async function loadGlobal(): Promise<void> {
  const d = desktop();
  if (!d) return;
  const was = current().global;
  if (!was || was.status !== 'ready') put({ global: { status: 'loading', rows: was?.rows ?? [] } });
  try {
    const rows = await d.shortcuts();
    put({ global: { status: 'ready', rows } });
  } catch {
    put({ global: { status: 'error', rows: [] } });
  }
}

let watching = false;
function watchGlobal() {
  const d = desktop();
  if (!d || watching) return;
  watching = true;
  d.on('shortcuts:changed', (rows) => {
    if (Array.isArray(rows)) put({ global: { status: 'ready', rows: rows as GlobalShortcutRow[] } });
  });
}

function globalCombo(rows: GlobalShortcutRow[], id: GlobalId): Combo | null {
  const a = rows.find((r) => r.id === id)?.accelerator;
  return a ? fromAccelerator(a) : null;
}

/** Every binding as it stands: the From anywhere ones only in the Mac app (null elsewhere, so they clash with nothing). */
export function bindingsOf(s: Snapshot): Bindings {
  const usual = defaultBindings(s.platform);
  const g = s.global;
  return {
    newTask: !g ? null : g.status === 'ready' ? globalCombo(g.rows, 'newTask') : usual.newTask,
    newNote: !g ? null : g.status === 'ready' ? globalCombo(g.rows, 'newNote') : usual.newNote,
    allSpaces: s.app.allSpaces,
    space: s.app.space,
  };
}

/** The In Tudu keys, for the space keys and the space list's hints. */
export function useAppShortcuts(): { platform: KeyPlatform; app: AppBindings } {
  const s = useSyncExternalStore(subscribe, current, current);
  return { platform: s.platform, app: s.app };
}

function still(c: Combo | null, platform: KeyPlatform, id: ShortcutId): string {
  if (!c) return 'It stays off.';
  return id === 'space'
    ? `Still ${formatCombo(c, platform, '1')} to ${formatCombo(c, platform, '9')}.`
    : `Still ${formatCombo(c, platform)}.`;
}

/** Keeps a change; answers the line to show when it couldn't. */
export async function setShortcut(id: ShortcutId, next: Combo | null): Promise<string | null> {
  const s = current();
  if (id === 'allSpaces' || id === 'space') {
    const app = { ...s.app, [id]: next };
    try {
      localStorage.setItem(SHORTCUTS_KEY, JSON.stringify(app));
    } catch {
      const where = desktop() ? 'this Mac' : 'this computer';
      return `Couldn’t save that on ${where}. ${still(s.app[id], s.platform, id)} Try again.`;
    }
    put({ app });
    return null;
  }
  const d = desktop();
  if (!d) return null;
  try {
    const rows = await d.setShortcut(id, next ? toAccelerator(next) : null);
    put({ global: { status: 'ready', rows } });
    return null;
  } catch (e) {
    return typeof e === 'string' ? e : e instanceof Error ? e.message : 'Couldn’t change that. Try again.';
  }
}

/** Settings › Shortcuts: the rows and what changing one does. Asks the Mac app afresh each time it opens. */
export function useShortcutSettings(open: boolean): SettingsShortcuts {
  const s = useSyncExternalStore(subscribe, current, current);
  useEffect(() => {
    watchGlobal();
    if (open) void loadGlobal();
  }, [open]);
  const retry = useCallback(() => void loadGlobal(), []);
  const problems: Partial<Record<ShortcutId, string>> = {};
  for (const r of s.global?.rows ?? []) if (r.error) problems[r.id] = r.error;
  return {
    platform: s.platform,
    bindings: bindingsOf(s),
    usual: defaultBindings(s.platform),
    global: s.global?.status,
    problems,
    onSet: setShortcut,
    onRetry: retry,
  };
}

/** The space list's hint for the place `n` (0 is All spaces): `⌃2`, and the same as aria-keyshortcuts. */
export function spaceHint(
  app: AppBindings,
  platform: KeyPlatform,
  n: number,
): { hint: string; keyShortcuts: string } | null {
  if (n === 0)
    return app.allSpaces
      ? { hint: formatCombo(app.allSpaces, platform), keyShortcuts: ariaCombo(app.allSpaces) }
      : null;
  if (n < 1 || n > 9 || !app.space) return null;
  const digit = String(n);
  return { hint: formatCombo(app.space, platform, digit), keyShortcuts: ariaCombo(app.space, digit) };
}

/** Tests only: forget what was read. */
export function resetShortcuts(): void {
  snap = null;
  watching = false;
}
