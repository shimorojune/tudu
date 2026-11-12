import { scrambleText } from '@tudu/core';
import { useCallback, useState, useSyncExternalStore, type FocusEvent } from 'react';
import { fadeTheme } from './theme';

/**
 * Scramble my text (#67), the switch in the avatar menu under Theme. While it's on, every word that is the person's
 * own is drawn jumbled (`useMine`), their pictures are blocks (`html[data-scrambled]` in the CSS), and a Scrambled pill
 * sits in every window's top bar. Per device, like the theme: kept in localStorage, and every window of the app (the
 * desk, the note window, the menu bar sheet, Quick Add) follows within one `storage` event. Nothing saved changes.
 */
export const SCRAMBLE_STORAGE_KEY = 'tudu.scramble';

export interface ScrambleState {
  on: boolean;
  /** The random key the words jumble under, made when it's switched on. Never leaves the device. */
  key: string;
}

type FieldFocus = FocusEvent<HTMLElement>;

const OFF: ScrambleState = { on: false, key: '' };

function newKey(): string {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** The mode as stored now; off when nothing is, or storage can't be read. */
export function readScramble(): ScrambleState {
  try {
    const key = localStorage.getItem(SCRAMBLE_STORAGE_KEY);
    return key && /^[0-9a-f]{32}$/.test(key) ? { on: true, key } : OFF;
  } catch {
    return OFF;
  }
}

let current: ScrambleState | null = null;
const listeners = new Set<() => void>();

function state(): ScrambleState {
  if (current === null) {
    current = readScramble();
    paintScramble(current.on);
  }
  return current;
}

/** `<html data-scrambled>` while it's on: the CSS turns the person's pictures into blocks. */
function paintScramble(on: boolean): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (on) root.dataset.scrambled = '';
  else delete root.dataset.scrambled;
}

function apply(next: ScrambleState): void {
  current = next;
  paintScramble(next.on);
  listeners.forEach((l) => l());
}

/**
 * Switch it on (with a new key) or off. The words crossfade through a soft blur (the theme's view transition), nothing
 * moves: a jumbled word has the same letters' count and kinds. With reduced motion it's instant.
 */
export function setScramble(on: boolean): void {
  if (on === state().on) return;
  const next = on ? { on: true, key: newKey() } : OFF;
  try {
    if (next.on) localStorage.setItem(SCRAMBLE_STORAGE_KEY, next.key);
    else localStorage.removeItem(SCRAMBLE_STORAGE_KEY);
  } catch {
    /* private window or storage blocked: it lasts for this visit */
  }
  const root = typeof document !== 'undefined' ? document.documentElement : null;
  root?.classList.add('tp-vt-scramble');
  fadeTheme(() => apply(next));
  // fadeTheme applies at once without view transitions; the class only shapes the transition's pseudo-elements.
  setTimeout(() => root?.classList.remove('tp-vt-scramble'), 400);
}

/** Take up the mode as stored now, when another window of the app switched it. Instant, no crossfade. */
export function syncScramble(): void {
  const next = readScramble();
  const was = state();
  if (next.on === was.on && next.key === was.key) return;
  apply(next);
}

function onStorage(e: StorageEvent): void {
  if (e.key === SCRAMBLE_STORAGE_KEY || e.key === null) syncScramble();
}

function subscribe(l: () => void): () => void {
  if (listeners.size === 0 && typeof window !== 'undefined') window.addEventListener('storage', onStorage);
  listeners.add(l);
  return () => {
    listeners.delete(l);
    if (listeners.size === 0 && typeof window !== 'undefined')
      window.removeEventListener('storage', onStorage);
  };
}

/** The mode and its key, shared by every caller; re-renders when it's switched here or in another window. */
export function useScramble(): ScrambleState {
  return useSyncExternalStore(subscribe, state, () => OFF);
}

/**
 * How to draw the person's own words: as they are when the mode is off, jumbled when it's on. Every plain-string
 * render of user text goes through it; Tudu's own labels don't. The Send feedback form deliberately doesn't use it.
 */
export function useMine(): (text: string | null | undefined) => string {
  const { on, key } = useScramble();
  return useCallback((text) => (on && text ? scrambleText(text, key) : (text ?? '')), [on, key]);
}

/**
 * A field that shows saved user text: jumbled while it doesn't have focus, the real words from focus on, so typing
 * stays possible and nothing jumbled is ever saved. Spread `bind` on the field (it keeps any handlers of its own
 * through `onFocus`/`onBlur` passed in).
 */
export function useMineField(
  value: string,
  own: { onFocus?: (e: FieldFocus) => void; onBlur?: (e: FieldFocus) => void } = {},
): {
  value: string;
  /** Whether the field now shows jumbled words (so it should not be edited as they are). */
  scrambled: boolean;
  bind: {
    onFocus: (e: FieldFocus) => void;
    onBlur: (e: FieldFocus) => void;
  };
} {
  const mine = useMine();
  const { on } = useScramble();
  const [focused, setFocused] = useState(false);
  const scrambled = on && !focused;
  return {
    value: scrambled ? mine(value) : value,
    scrambled,
    bind: {
      onFocus: (e) => {
        setFocused(true);
        own.onFocus?.(e);
      },
      onBlur: (e) => {
        setFocused(false);
        own.onBlur?.(e);
      },
    },
  };
}

/**
 * A copy of rich text (HTML) with every word jumbled: text nodes, and the names a file chip shows in its title. Tags,
 * marks, links, lists and checkboxes keep their shape, so the copy draws the same lines. Done on a detached document;
 * nothing in it runs.
 */
export function scrambleHtml(html: string, key: string): string {
  if (!html || typeof DOMParser === 'undefined') return html;
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode())
    (n as Text).data = scrambleText((n as Text).data, key);
  for (const el of doc.body.querySelectorAll('[title], [data-name], [alt]'))
    for (const a of ['title', 'data-name', 'alt']) {
      const v = el.getAttribute(a);
      if (v) el.setAttribute(a, scrambleText(v, key));
    }
  return doc.body.innerHTML;
}

/** For tests: forget the cached mode. */
export function resetScrambleForTests(): void {
  current = null;
  listeners.clear();
  if (typeof window !== 'undefined') window.removeEventListener('storage', onStorage);
  paintScramble(false);
}
