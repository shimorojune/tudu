import { flushSync } from 'react-dom';
import { useEffect, useState } from 'react';
import { prefersReducedMotion } from './hooks';

/** What the person chose. `system` follows the computer. */
export type ThemeChoice = 'light' | 'dark' | 'system';
/** What is painted. */
export type Theme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'tudu.theme';
const CROSS_FADE_MS = 280;

export function isThemeChoice(v: unknown): v is ThemeChoice {
  return v === 'light' || v === 'dark' || v === 'system';
}

export function systemTheme(): Theme {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

/** Which theme to paint for a choice. */
export function resolveTheme(choice: ThemeChoice | undefined): Theme {
  return choice === 'system' || !choice ? systemTheme() : choice;
}

export function readThemeChoice(): ThemeChoice {
  try {
    const v = localStorage.getItem(THEME_STORAGE_KEY);
    return isThemeChoice(v) ? v : 'system';
  } catch {
    return 'system';
  }
}

function storeThemeChoice(choice: ThemeChoice): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, choice);
  } catch {
    /* private mode or storage blocked: the choice lives for this page only */
  }
}

/** Paint a theme on the document: the `dark` class and the browser's own chrome. */
export function paintTheme(theme: Theme): void {
  const root = document.documentElement;
  root.classList.toggle('dark', theme === 'dark');
  root.style.colorScheme = theme;
}

/**
 * Change the theme with one soft cross-fade of the whole window (280ms) instead of a hard flip.
 * Falls back to an instant change without view transitions or with reduced motion.
 */
export function fadeTheme(apply: () => void): void {
  const root = document.documentElement;
  const vt = (
    document as Document & { startViewTransition?: (cb: () => void) => { finished: Promise<void> } }
  ).startViewTransition;
  if (!vt || prefersReducedMotion()) {
    apply();
    return;
  }
  root.classList.add('tp-vt-theme');
  const t = vt.call(document, () => flushSync(apply));
  const done = () => root.classList.remove('tp-vt-theme');
  t.finished.then(done, done);
}

type Listener = (choice: ThemeChoice) => void;
const listeners = new Set<Listener>();
/** Picks made in this page only; a choice taken up from another window is not a pick here. */
const pickListeners = new Set<Listener>();
let current: ThemeChoice | null = null;

function choice(): ThemeChoice {
  if (current === null) current = readThemeChoice();
  return current;
}

/** Set the theme choice: paints it (with the cross-fade), remembers it, tells every `useTheme`. */
export function setThemeChoice(next: ThemeChoice): void {
  current = next;
  storeThemeChoice(next);
  fadeTheme(() => paintTheme(resolveTheme(next)));
  listeners.forEach((l) => l(next));
  pickListeners.forEach((l) => l(next));
}

/**
 * Take up the choice as stored now, when another window of the same site changed it (another tab, or the macOS
 * app's other window: the floating Quick Add shares its storage with the desk). Painted at once, no cross-fade.
 */
export function syncThemeChoice(): void {
  const next = readThemeChoice();
  if (next === choice()) return;
  current = next;
  paintTheme(resolveTheme(next));
  listeners.forEach((l) => l(next));
}

function onStorage(e: StorageEvent): void {
  // A null key is storage cleared.
  if (e.key === THEME_STORAGE_KEY || e.key === null) syncThemeChoice();
}

/** Hear every theme pick (Light, Dark or System), wherever it was made. Returns the way to stop listening. */
export function onThemeChoice(l: (choice: ThemeChoice) => void): () => void {
  pickListeners.add(l);
  return () => pickListeners.delete(l);
}

/** Keep the painted theme in step with the system while the choice is `system`. */
function watchSystem(): () => void {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {};
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  const on = () => {
    if (choice() === 'system') paintTheme(systemTheme());
  };
  mq.addEventListener?.('change', on);
  return () => mq.removeEventListener?.('change', on);
}

/** The theme choice and a setter, shared by every caller. The painted theme follows the system when `system`. */
export function useTheme(): { choice: ThemeChoice; theme: Theme; setTheme: (c: ThemeChoice) => void } {
  const [c, setC] = useState<ThemeChoice>(() => choice());
  const [sys, setSys] = useState<Theme>(() => systemTheme());
  useEffect(() => {
    listeners.add(setC);
    const stop = watchSystem();
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    const onSys = () => setSys(systemTheme());
    mq?.addEventListener?.('change', onSys);
    window.addEventListener('storage', onStorage);
    // A pick in another window since this page first read the choice.
    syncThemeChoice();
    paintTheme(resolveTheme(choice()));
    return () => {
      listeners.delete(setC);
      window.removeEventListener('storage', onStorage);
      stop();
      mq?.removeEventListener?.('change', onSys);
    };
  }, []);
  return { choice: c, theme: c === 'system' ? sys : c, setTheme: setThemeChoice };
}

/** For tests: forget the cached choice. */
export function resetThemeForTests(): void {
  current = null;
  listeners.clear();
  pickListeners.clear();
}

export { CROSS_FADE_MS };

/** Settings › Appearance › Less motion, remembered per browser like the theme. */
export const MOTION_STORAGE_KEY = 'tudu.motion';

export function readLessMotion(): boolean {
  try {
    return localStorage.getItem(MOTION_STORAGE_KEY) === 'less';
  } catch {
    return false;
  }
}

/** Put the switch on the page: `data-motion="less"` turns every motion rule into its reduced form. */
export function paintMotion(less: boolean): void {
  const root = document.documentElement;
  if (less) root.dataset.motion = 'less';
  else delete root.dataset.motion;
}

const motionListeners = new Set<(on: boolean) => void>();

export function setLessMotion(on: boolean): void {
  try {
    if (on) localStorage.setItem(MOTION_STORAGE_KEY, 'less');
    else localStorage.removeItem(MOTION_STORAGE_KEY);
  } catch {
    /* storage blocked: it lasts for this page */
  }
  paintMotion(on);
  motionListeners.forEach((l) => l(on));
}

/** The Less motion switch, shared by every caller. */
export function useLessMotion(): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(readLessMotion);
  useEffect(() => {
    motionListeners.add(setOn);
    paintMotion(readLessMotion());
    return () => {
      motionListeners.delete(setOn);
    };
  }, []);
  return [on, setLessMotion];
}
