import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseRules, readStylesheet, rulesWhere } from '../test-utils/stylesheet';
import {
  CROSS_FADE_MS,
  THEME_STORAGE_KEY,
  currentThemeChoice,
  onLessMotion,
  onThemeChange,
  onThemeChoice,
  setLessMotion,
  readThemeChoice,
  resetThemeForTests,
  resolveTheme,
  setThemeChoice,
  syncThemeChoice,
  systemTheme,
  useTheme,
} from './theme';

type Change = (e: MediaQueryListEvent) => void;

// A matchMedia that tests can steer: the OS colour scheme, reduced motion, and a `change` event for the scheme.
let systemDark = false;
let reduceMotion = false;
const schemeListeners = new Set<Change>();
const realMatchMedia = window.matchMedia;

function fakeMatchMedia(query: string): MediaQueryList {
  const scheme = query.includes('prefers-color-scheme: dark');
  const motion = query.includes('prefers-reduced-motion: reduce');
  return {
    media: query,
    onchange: null,
    get matches() {
      return scheme ? systemDark : motion ? reduceMotion : false;
    },
    addEventListener: (_type: string, cb: Change) => {
      if (scheme) schemeListeners.add(cb);
    },
    removeEventListener: (_type: string, cb: Change) => {
      schemeListeners.delete(cb);
    },
    addListener() {},
    removeListener() {},
    dispatchEvent: () => false,
  } as unknown as MediaQueryList;
}

function setSystemDark(dark: boolean): void {
  systemDark = dark;
  const e = { matches: dark, media: '(prefers-color-scheme: dark)' } as MediaQueryListEvent;
  schemeListeners.forEach((cb) => cb(e));
}

const html = document.documentElement;

/** Give the document a startViewTransition for one test (jsdom has none). */
function mockViewTransition(impl: (cb: () => void) => { finished: Promise<void> }): void {
  Object.defineProperty(document, 'startViewTransition', { value: impl, configurable: true, writable: true });
}

beforeEach(() => {
  resetThemeForTests();
  localStorage.clear();
  systemDark = false;
  reduceMotion = false;
  schemeListeners.clear();
  window.matchMedia = fakeMatchMedia;
  html.className = '';
  html.style.colorScheme = '';
});

afterEach(() => {
  window.matchMedia = realMatchMedia;
  Reflect.deleteProperty(document, 'startViewTransition');
  resetThemeForTests();
});

describe('theme', () => {
  it('C00-U02 light, dark and system resolve to the right theme', () => {
    expect(resolveTheme('light')).toBe('light');
    expect(resolveTheme('dark')).toBe('dark');
    expect(resolveTheme('system')).toBe('light');
    expect(resolveTheme(undefined)).toBe('light');
    systemDark = true;
    expect(systemTheme()).toBe('dark');
    expect(resolveTheme('system')).toBe('dark');
    expect(resolveTheme('light')).toBe('light');
  });

  it('C00-U02 the choice paints the dark class and colour-scheme on <html>', () => {
    const { result } = renderHook(() => useTheme());
    expect(result.current.choice).toBe('system'); // nothing stored yet
    expect(result.current.theme).toBe('light');
    expect(html).not.toHaveClass('dark');
    expect(html.style.colorScheme).toBe('light');

    act(() => result.current.setTheme('dark'));
    expect(result.current.choice).toBe('dark');
    expect(result.current.theme).toBe('dark');
    expect(html).toHaveClass('dark');
    expect(html.style.colorScheme).toBe('dark');

    act(() => result.current.setTheme('light'));
    expect(result.current.theme).toBe('light');
    expect(html).not.toHaveClass('dark');
    expect(html.style.colorScheme).toBe('light');

    act(() => setSystemDark(true)); // the OS goes dark while the choice is light: nothing is painted yet
    expect(html).not.toHaveClass('dark');
    act(() => result.current.setTheme('system'));
    expect(result.current.choice).toBe('system');
    expect(result.current.theme).toBe('dark');
    expect(html).toHaveClass('dark');
    expect(html.style.colorScheme).toBe('dark');
  });

  it('C00-U02 system follows a media-query change; a fixed choice does not', () => {
    const { result } = renderHook(() => useTheme());
    expect(html).not.toHaveClass('dark');

    act(() => setSystemDark(true));
    expect(result.current.theme).toBe('dark');
    expect(html).toHaveClass('dark');
    expect(html.style.colorScheme).toBe('dark');

    act(() => setSystemDark(false));
    expect(result.current.theme).toBe('light');
    expect(html).not.toHaveClass('dark');

    act(() => result.current.setTheme('light'));
    act(() => setSystemDark(true));
    expect(result.current.theme).toBe('light');
    expect(html).not.toHaveClass('dark');
    expect(html.style.colorScheme).toBe('light');
  });

  it('C00-U03 changing the theme cross-fades: the class is on during the view transition and gone when it ends', async () => {
    let finish!: () => void;
    const finished = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const start = vi.fn((cb: () => void) => {
      cb();
      return { finished };
    });
    mockViewTransition(start);

    setThemeChoice('dark');
    expect(start).toHaveBeenCalledTimes(1);
    expect(html).toHaveClass('tp-vt-theme');
    expect(html).toHaveClass('dark'); // painted inside the transition's callback
    expect(html.style.colorScheme).toBe('dark');

    finish();
    await finished;
    expect(html).not.toHaveClass('tp-vt-theme');
    expect(html).toHaveClass('dark');
  });

  it('C00-U03 the cross-fade is 280ms, in code and in the stylesheet', () => {
    // The class is removed when the view transition reports `finished`; the transition itself runs for 280ms.
    expect(CROSS_FADE_MS).toBe(280);
    const rules = rulesWhere(parseRules(readStylesheet('components.css')), (s) =>
      s.startsWith('.tp-vt-theme::view-transition'),
    );
    expect(rules.length).toBeGreaterThan(0);
    for (const r of rules) expect(r.declarations['animation-duration'], r.selector).toBe('280ms');
  });

  it('C00-U03 without view transitions or with reduced motion the change is instant and leaves no class behind', () => {
    // jsdom has no startViewTransition
    setThemeChoice('dark');
    expect(html).toHaveClass('dark');
    expect(html).not.toHaveClass('tp-vt-theme');

    const start = vi.fn((cb: () => void) => {
      cb();
      return { finished: Promise.resolve() };
    });
    mockViewTransition(start);
    reduceMotion = true;
    setThemeChoice('light');
    expect(start).not.toHaveBeenCalled();
    expect(html).not.toHaveClass('dark');
    expect(html).not.toHaveClass('tp-vt-theme');
  });

  it('C00-U03 the choice is stored and survives a reload', () => {
    setThemeChoice('dark');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    expect(THEME_STORAGE_KEY).toBe('tudu.theme');

    // A reload: module state is gone and the document is fresh, only storage remains.
    resetThemeForTests();
    html.className = '';
    html.style.colorScheme = '';
    expect(readThemeChoice()).toBe('dark');
    const { result } = renderHook(() => useTheme());
    expect(result.current.choice).toBe('dark');
    expect(result.current.theme).toBe('dark');
    expect(html).toHaveClass('dark');
    expect(html.style.colorScheme).toBe('dark');

    // Garbage in storage falls back to system.
    localStorage.setItem(THEME_STORAGE_KEY, 'sepia');
    resetThemeForTests();
    expect(readThemeChoice()).toBe('system');
  });

  it('C11-U09 a pick in another window (a storage event) repaints this one and tells every useTheme', () => {
    setThemeChoice('light');
    const { result } = renderHook(() => useTheme());
    expect(result.current.choice).toBe('light');
    const picks = vi.fn();
    onThemeChoice(picks);

    localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: THEME_STORAGE_KEY, newValue: 'dark' }));
    });
    expect(result.current.choice).toBe('dark');
    expect(result.current.theme).toBe('dark');
    expect(html).toHaveClass('dark');
    expect(html.style.colorScheme).toBe('dark');
    // Picked in the other window, not here: Getting started's tick is that window's.
    expect(picks).not.toHaveBeenCalled();

    // Another key is not the theme.
    localStorage.setItem(THEME_STORAGE_KEY, 'light');
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: 'tudu.motion', newValue: 'less' }));
    });
    expect(result.current.choice).toBe('dark');

    // Storage cleared elsewhere: back to System.
    localStorage.clear();
    systemDark = false;
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: null }));
    });
    expect(result.current.choice).toBe('system');
    expect(html).not.toHaveClass('dark');
  });

  it('C11-U09 a page that read the choice earlier takes up the stored one on mount and on a sync', () => {
    setThemeChoice('light'); // read once, long ago
    localStorage.setItem(THEME_STORAGE_KEY, 'dark'); // picked in another window, no event heard
    const { result } = renderHook(() => useTheme());
    expect(result.current.choice).toBe('dark');
    expect(html).toHaveClass('dark');

    localStorage.setItem(THEME_STORAGE_KEY, 'system');
    systemDark = false;
    act(() => syncThemeChoice());
    expect(result.current.choice).toBe('system');
    expect(result.current.theme).toBe('light');
    expect(html).not.toHaveClass('dark');
  });

  it('C11-U22 onThemeChange hears a pick here and one taken up from another window, once each, until it stops', () => {
    const changes = vi.fn();
    const stop = onThemeChange(changes);

    setThemeChoice('dark');
    expect(changes).toHaveBeenCalledTimes(1);
    expect(changes).toHaveBeenLastCalledWith('dark');
    expect(currentThemeChoice()).toBe('dark');

    // Picked in another window: taken up here and heard once.
    localStorage.setItem(THEME_STORAGE_KEY, 'light');
    syncThemeChoice();
    expect(changes).toHaveBeenCalledTimes(2);
    expect(changes).toHaveBeenLastCalledWith('light');
    // A sync with nothing new says nothing.
    syncThemeChoice();
    expect(changes).toHaveBeenCalledTimes(2);

    stop();
    setThemeChoice('system');
    expect(changes).toHaveBeenCalledTimes(2);
    expect(currentThemeChoice()).toBe('system');
  });

  it('C11-U22 onLessMotion hears the switch until it stops', () => {
    const heard = vi.fn();
    const stop = onLessMotion(heard);
    setLessMotion(true);
    expect(heard).toHaveBeenLastCalledWith(true);
    stop();
    setLessMotion(false);
    expect(heard).toHaveBeenCalledTimes(1);
  });
});
