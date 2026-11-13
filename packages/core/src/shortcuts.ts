/**
 * Keyboard shortcuts (issues #57 and #60): what a key press is, how it is written, what may be set, and which space a
 * number goes to. Shared by the web app, Settings and the Mac app's bridge (which stores accelerators).
 */

export type Mod = 'ctrl' | 'alt' | 'shift' | 'meta';

/** A key with its modifiers. `key` is the physical key: `N`, `0`, `Space`, `F5`, `↑`. */
export interface Combo {
  mods: Mod[];
  key: string;
}

/** From anywhere (Mac app only): `newTask`, `newNote`. In Tudu: `allSpaces`, and `space` (modifiers plus 1 to 9). */
export type ShortcutId = 'newTask' | 'newNote' | 'allSpaces' | 'space';

/** Every shortcut; `null` is Off. The `space` combo's `key` is `#`, standing for 1 to 9. */
export type Bindings = Record<ShortcutId, Combo | null>;

export type KeyPlatform = 'mac' | 'other';

export const GLOBAL_SHORTCUTS: ShortcutId[] = ['newTask', 'newNote'];
export const APP_SHORTCUTS: ShortcutId[] = ['allSpaces', 'space'];

export const SHORTCUT_NAMES: Record<ShortcutId, string> = {
  newTask: 'New task',
  newNote: 'New note',
  allSpaces: 'All spaces',
  space: 'A space',
};

/** The digit the `space` combo stands for. */
export const SPACE_KEY = '#';

/** Modifiers in the order macOS writes them: ⌃ ⌥ ⇧ ⌘. */
const ORDER: Mod[] = ['ctrl', 'alt', 'shift', 'meta'];
const MAC_GLYPH: Record<Mod, string> = { ctrl: '⌃', alt: '⌥', shift: '⇧', meta: '⌘' };
const WORD: Record<Mod, string> = { ctrl: 'Ctrl', alt: 'Alt', shift: 'Shift', meta: 'Win' };
const ARIA: Record<Mod, string> = { ctrl: 'Control', alt: 'Alt', shift: 'Shift', meta: 'Meta' };

function sorted(mods: Mod[]): Mod[] {
  return ORDER.filter((m) => mods.includes(m));
}

export function combo(mods: Mod[], key: string): Combo {
  return { mods: sorted(mods), key };
}

/** The usual keys. Browsers outside macOS keep Ctrl+digits for their tabs, so the space keys use Alt there. */
export function defaultBindings(platform: KeyPlatform): Bindings {
  const app: Mod = platform === 'mac' ? 'ctrl' : 'alt';
  return {
    newTask: combo(['shift', 'meta'], 'N'),
    newNote: combo(['alt', 'meta'], 'N'),
    allSpaces: combo([app], '0'),
    space: combo([app], SPACE_KEY),
  };
}

const NAMED: Record<string, string> = {
  Space: 'Space',
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  Enter: '↩',
  Minus: '-',
  Equal: '=',
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  Semicolon: ';',
  Quote: "'",
  Comma: ',',
  Period: '.',
  Slash: '/',
  Backquote: '`',
};

/** The physical key a `KeyboardEvent.code` names, so another keyboard layout still gets the same key. */
export function keyFromCode(code: string): string | null {
  let m = /^Key([A-Z])$/.exec(code);
  if (m) return m[1]!;
  m = /^(?:Digit|Numpad)(\d)$/.exec(code);
  if (m) return m[1]!;
  if (/^F([1-9]|1\d|20)$/.test(code)) return code;
  return NAMED[code] ?? null;
}

export interface KeyLike {
  code: string;
  key?: string;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
}

/** The modifiers held during an event, in macOS order. */
export function heldMods(e: KeyLike): Mod[] {
  const out: Mod[] = [];
  if (e.ctrlKey) out.push('ctrl');
  if (e.altKey) out.push('alt');
  if (e.shiftKey) out.push('shift');
  if (e.metaKey) out.push('meta');
  return out;
}

/** The combo a key press makes, or null while only modifiers (or an unknown key) are down. */
export function comboFromEvent(e: KeyLike): Combo | null {
  const key = keyFromCode(e.code);
  return key ? combo(heldMods(e), key) : null;
}

export function sameCombo(a: Combo | null | undefined, b: Combo | null | undefined): boolean {
  if (!a || !b) return false;
  return a.key === b.key && sorted(a.mods).join() === sorted(b.mods).join();
}

function isDigit(key: string): boolean {
  return /^[0-9]$/.test(key);
}

/** One label per key cap: `['⇧', '⌘', 'N']` on a Mac, `['Ctrl', 'Shift', 'N']` elsewhere. */
export function caps(c: Combo, platform: KeyPlatform, digit?: string): string[] {
  const mods = sorted(c.mods).map((m) => (platform === 'mac' ? MAC_GLYPH[m] : WORD[m]));
  return [...mods, c.key === SPACE_KEY ? (digit ?? '1') : c.key];
}

/** `⇧⌘N` on a Mac, `Ctrl+Shift+N` elsewhere. */
export function formatCombo(c: Combo, platform: KeyPlatform, digit?: string): string {
  return caps(c, platform, digit).join(platform === 'mac' ? '' : '+');
}

/** As `aria-keyshortcuts` writes it: `Shift+Meta+N`. */
export function ariaCombo(c: Combo, digit?: string): string {
  return [...sorted(c.mods).map((m) => ARIA[m]), c.key === SPACE_KEY ? (digit ?? '1') : c.key].join('+');
}

/** How a screen reader hears it: `Shift Command N`. */
export function spokenCombo(c: Combo, platform: KeyPlatform): string {
  const words: Record<Mod, string> =
    platform === 'mac'
      ? { ctrl: 'Control', alt: 'Option', shift: 'Shift', meta: 'Command' }
      : { ctrl: 'Control', alt: 'Alt', shift: 'Shift', meta: 'Windows' };
  if (c.key === SPACE_KEY) return [...sorted(c.mods).map((m) => words[m]), '1 to 9'].join(' ');
  return [...sorted(c.mods).map((m) => words[m]), c.key].join(' ');
}

const ACCEL_MOD: Record<Mod, string> = { ctrl: 'Control', alt: 'Alt', shift: 'Shift', meta: 'Super' };
const ACCEL_KEY: Record<string, string> = {
  Space: 'Space',
  '↑': 'ArrowUp',
  '↓': 'ArrowDown',
  '←': 'ArrowLeft',
  '→': 'ArrowRight',
  '↩': 'Enter',
  '-': 'Minus',
  '=': 'Equal',
  '[': 'BracketLeft',
  ']': 'BracketRight',
  '\\': 'Backslash',
  ';': 'Semicolon',
  "'": 'Quote',
  ',': 'Comma',
  '.': 'Period',
  '/': 'Slash',
  '`': 'Backquote',
};

/** The global-shortcut plugin's form: `Shift+Super+KeyN`. */
export function toAccelerator(c: Combo): string {
  const k = /^[A-Z]$/.test(c.key)
    ? `Key${c.key}`
    : isDigit(c.key)
      ? `Digit${c.key}`
      : (ACCEL_KEY[c.key] ?? c.key);
  return [...sorted(c.mods).map((m) => ACCEL_MOD[m]), k].join('+');
}

/** Back from an accelerator (`CommandOrControl+Shift+N` included), or null when it is not one. */
export function fromAccelerator(accel: string, platform: KeyPlatform = 'mac'): Combo | null {
  const parts = accel.split('+').filter(Boolean);
  const last = parts.pop();
  if (!last) return null;
  const mods: Mod[] = [];
  for (const p of parts) {
    const w = p.toLowerCase();
    if (w === 'shift') mods.push('shift');
    else if (w === 'alt' || w === 'option') mods.push('alt');
    else if (w === 'control' || w === 'ctrl') mods.push('ctrl');
    else if (w === 'super' || w === 'cmd' || w === 'command' || w === 'meta') mods.push('meta');
    else if (w === 'commandorcontrol' || w === 'cmdorctrl') mods.push(platform === 'mac' ? 'meta' : 'ctrl');
    else return null;
  }
  let key: string | null;
  if (/^[A-Za-z]$/.test(last)) key = last.toUpperCase();
  else if (isDigit(last)) key = last;
  else {
    key = keyFromCode(last);
    if (!key) {
      const back = Object.entries(ACCEL_KEY).find(([, v]) => v === last);
      key = back ? back[0] : null;
    }
  }
  return key ? combo(mods, key) : null;
}

/** Keys Tudu or the system keep. On a Mac these are the ⌘ ones; elsewhere the Ctrl and Alt ones. */
const RESERVED: Record<KeyPlatform, Record<string, string>> = {
  mac: {
    '⌘Q': '⌘Q quits Tudu.',
    '⌘W': '⌘W closes the window.',
    '⌘H': '⌘H hides Tudu.',
    '⌘M': '⌘M minimises the window.',
    '⌘C': '⌘C copies.',
    '⌘V': '⌘V pastes.',
    '⌘X': '⌘X cuts.',
    '⌘Z': '⌘Z undoes.',
    '⇧⌘Z': '⇧⌘Z redoes.',
    '⌘A': '⌘A selects everything.',
    '⌘,': '⌘, opens Settings.',
    '⌘Space': 'macOS keeps ⌘Space for Spotlight.',
    '⌘Tab': 'macOS keeps ⌘Tab for switching apps.',
  },
  other: {
    'Ctrl+C': 'Ctrl+C copies.',
    'Ctrl+V': 'Ctrl+V pastes.',
    'Ctrl+X': 'Ctrl+X cuts.',
    'Ctrl+Z': 'Ctrl+Z undoes.',
    'Ctrl+A': 'Ctrl+A selects everything.',
    'Ctrl+W': 'Ctrl+W closes the tab.',
    'Alt+F4': 'Alt+F4 closes the window.',
  },
};

export type ShortcutProblem =
  | { kind: 'modifier' }
  | { kind: 'digit' }
  | { kind: 'reserved'; what: string }
  | { kind: 'taken'; by: ShortcutId; keys: string };

/**
 * Whether `next` may be set for `id`, given the others. For `space`, `next.key` is the digit pressed (any of 0 to 9)
 * and only the modifiers are kept. Returns null when it may.
 */
export function checkShortcut(
  id: ShortcutId,
  next: Combo,
  all: Bindings,
  platform: KeyPlatform,
): ShortcutProblem | null {
  const strong = next.mods.some((m) => m !== 'shift');
  if (!strong) return { kind: 'modifier' };
  if (id === 'space') {
    if (!isDigit(next.key)) return { kind: 'digit' };
    for (const other of ['newTask', 'newNote', 'allSpaces'] as ShortcutId[]) {
      const c = all[other];
      if (c && /^[1-9]$/.test(c.key) && sameCombo(combo(c.mods, SPACE_KEY), combo(next.mods, SPACE_KEY)))
        return { kind: 'taken', by: other, keys: formatCombo(c, platform) };
    }
    return null;
  }
  const text = formatCombo(next, platform);
  const reserved = RESERVED[platform][text];
  if (reserved) return { kind: 'reserved', what: reserved };
  for (const other of Object.keys(all) as ShortcutId[]) {
    if (other === id) continue;
    const c = all[other];
    if (!c) continue;
    if (other === 'space') {
      if (/^[1-9]$/.test(next.key) && sameCombo(combo(c.mods, SPACE_KEY), combo(next.mods, SPACE_KEY)))
        return { kind: 'taken', by: 'space', keys: text };
    } else if (sameCombo(c, next)) return { kind: 'taken', by: other, keys: text };
  }
  return null;
}

/** The line under the row's name for a refusal. */
export function problemText(p: ShortcutProblem, platform: KeyPlatform): string {
  switch (p.kind) {
    case 'modifier':
      return platform === 'mac'
        ? 'Add ⌘, ⌃ or ⌥, so it can’t go off while you type.'
        : 'Add Ctrl or Alt, so it can’t go off while you type.';
    case 'digit':
      return `Press it with a number, like ${platform === 'mac' ? '⌃1' : 'Alt+1'}.`;
    case 'reserved':
      return `${p.what} Pick other keys.`;
    case 'taken':
      return p.by === 'space'
        ? `${p.keys} already goes to a space. Pick other keys.`
        : `${p.keys} is ${SHORTCUT_NAMES[p.by]}. Pick other keys.`;
  }
}

/** Which shortcut an in-app key press is: All spaces, or a space by its number (1 to 9). */
export function matchAppShortcut(
  e: KeyLike,
  all: Pick<Bindings, 'allSpaces' | 'space'>,
): { to: 'all' } | { to: 'space'; n: number } | null {
  const c = comboFromEvent(e);
  if (!c) return null;
  if (sameCombo(c, all.allSpaces)) return { to: 'all' };
  if (all.space && /^[1-9]$/.test(c.key) && sameCombo(combo(c.mods, SPACE_KEY), all.space))
    return { to: 'space', n: Number(c.key) };
  return null;
}

/**
 * The space a number goes to, in the switcher's order: 0 (or All spaces' own keys) is All spaces when it is there,
 * 1 is the first space after it, up to 9.
 */
export function spaceForNumber<S extends { all?: boolean }>(list: S[], n: number): S | null {
  if (n === 0) return list.find((s) => s.all) ?? null;
  if (n < 1 || n > 9) return null;
  return list.filter((s) => !s.all)[n - 1] ?? null;
}

/** Bindings read back from storage: anything missing or broken falls back to the usual keys. */
export function readBindings(raw: unknown, platform: KeyPlatform): Bindings {
  const out = defaultBindings(platform);
  if (!raw || typeof raw !== 'object') return out;
  for (const id of Object.keys(out) as ShortcutId[]) {
    const v = (raw as Record<string, unknown>)[id];
    if (v === null) out[id] = null;
    else if (v && typeof v === 'object') {
      const { mods, key } = v as { mods?: unknown; key?: unknown };
      if (
        Array.isArray(mods) &&
        mods.every((m) => ORDER.includes(m as Mod)) &&
        typeof key === 'string' &&
        key.length > 0
      )
        out[id] = combo(mods as Mod[], key);
    }
  }
  return out;
}
