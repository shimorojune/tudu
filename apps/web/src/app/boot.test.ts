/// <reference types="node" />
import '@testing-library/jest-dom/vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { keepAppearance } from './appearance';
import { BOOT_LEAVE_MS, bootShown, dismissBoot, resetBoot } from './boot';
import { desktop, resetDesktop } from './desktop';
import { notesHref } from './updates';
import { resetThemeForTests, setLessMotion, setThemeChoice, THEME_STORAGE_KEY } from '@tudu/ui';

const here = dirname(fileURLToPath(import.meta.url));
const read = (path: string) => readFileSync(resolve(here, '../../../..', path), 'utf8');
const WEB = read('apps/web/index.html');
const LOADER = read('apps/desktop/shell/index.html');
const LOADER_CSS = read('apps/desktop/shell/launch.css');

/** What sits between two markers, one trimmed line at a time (the two files indent it differently). */
function between(text: string, open: string, close: string): string {
  const a = text.indexOf(open);
  const b = text.indexOf(close, a);
  expect(a, open).toBeGreaterThanOrEqual(0);
  expect(b, close).toBeGreaterThan(a);
  return text
    .slice(a + open.length, b)
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .join('\n');
}

/** The page's own head script (the theme, Less motion and the launch mark), run as the browser would. */
function runHeadScript(look?: unknown, path = '/'): void {
  const open = WEB.indexOf('<script>') + '<script>'.length;
  const script = WEB.slice(open, WEB.indexOf('</script>', open));
  window.history.replaceState(null, '', path);
  (window as Window & { __TUDU_LOOK__?: unknown }).__TUDU_LOOK__ = look;
  new Function(script)();
}

const root = document.documentElement;

beforeEach(() => {
  // jsdom has no matchMedia; the head script asks it for System.
  window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia;
  resetBoot();
  root.className = '';
  root.removeAttribute('data-boot');
  root.removeAttribute('data-motion');
  root.removeAttribute('style');
  localStorage.clear();
  document.body.innerHTML = '';
});
afterEach(() => {
  vi.useRealTimers();
  delete (window as Window & { __TUDU_LOOK__?: unknown }).__TUDU_LOOK__;
  window.history.replaceState(null, '', '/');
});

describe('C11-U19 the launch mark is the same in the Mac app’s loader and on the web', () => {
  it('C11-U19 the launch styles in index.html are launch.css, line for line', () => {
    expect(between(WEB, '/* launch */', '/* /launch */')).toBe(
      between(LOADER_CSS, '/* launch */', '/* /launch */'),
    );
  });

  it('C11-U19 the mark’s markup is the same on both pages, and the loader links the styles', () => {
    expect(between(WEB, '<!-- launch -->', '<!-- /launch -->')).toBe(
      between(LOADER, '<!-- launch -->', '<!-- /launch -->'),
    );
    expect(LOADER).toContain('href="launch.css"');
    expect(LOADER).toMatch(/<script src="look.js"><\/script>[\s\S]*<link rel="stylesheet" href="launch.css"/);
    // The loader's offline words sit under the mark, in the same box.
    expect(LOADER).toMatch(
      /<div id="boot"[\s\S]*<!-- \/launch -->[\s\S]*id="offline"[\s\S]*<\/div>\s*<\/div>/,
    );
  });
});

describe('C11-U20 the head script sets the launch up before the first paint', () => {
  it('C11-U20 on the web (no app look): the mark waits its 300ms, nothing is held', () => {
    runHeadScript(undefined);
    expect(root.dataset.boot).toBeUndefined();
    expect(root.style.getPropertyValue('--tl-slow-at')).toBe('');
  });

  it('C11-U20 from the Mac app’s loader: under 300ms since launch waits; past it carries on held', () => {
    vi.useFakeTimers({ now: 1_000_000 });
    runHeadScript({ theme: 'light', lessMotion: false, launchedAt: 1_000_000 - 120 });
    expect(root.dataset.boot).toBeUndefined();
    expect(root.style.getPropertyValue('--tl-slow-at')).toBe('5880ms');

    runHeadScript({ theme: 'light', lessMotion: false, launchedAt: 1_000_000 - 1_500 });
    expect(root.dataset.boot).toBe('held');
    // Still opening Tudu… counts from the launch, not from this page.
    expect(root.style.getPropertyValue('--tl-slow-at')).toBe('4500ms');
  });

  it('C11-U20 a reload long after the launch is a fresh start, not held', () => {
    vi.useFakeTimers({ now: 10_000_000 });
    runHeadScript({ theme: 'dark', lessMotion: false, launchedAt: 10_000_000 - 3_600_000 });
    expect(root.dataset.boot).toBeUndefined();
  });

  it('C11-U20 the app’s small windows never show it; Less motion and the theme come from storage', () => {
    runHeadScript(undefined, '/quick-add');
    expect(root.dataset.boot).toBe('off');
    root.removeAttribute('data-boot');
    runHeadScript(undefined, '/note-window');
    expect(root.dataset.boot).toBe('off');

    root.removeAttribute('data-boot');
    localStorage.setItem('tudu.motion', 'less');
    localStorage.setItem('tudu.theme', 'dark');
    runHeadScript(undefined, '/');
    expect(root.dataset.motion).toBe('less');
    expect(root).toHaveClass('dark');
    expect(root.dataset.boot).toBeUndefined();
  });
});

describe('C11-U21 the mark gives way to the app', () => {
  function page(): { boot: HTMLElement; app: HTMLElement } {
    document.body.innerHTML = '<div id="boot" class="tl-boot"></div><div id="root"></div>';
    return { boot: document.getElementById('boot')!, app: document.getElementById('root')! };
  }

  it('C11-U21 shown: it leaves with its fade and the app arrives; gone on animationend', () => {
    const { boot, app } = page();
    dismissBoot(document, 900);
    expect(boot).toHaveClass('tl-leaving');
    expect(app).toHaveClass('tl-arrive');
    expect(document.getElementById('boot')).not.toBeNull();
    boot.dispatchEvent(new Event('animationend', { bubbles: true }));
    expect(document.getElementById('boot')).toBeNull();
    expect(app).not.toHaveClass('tl-arrive');
  });

  it('C11-U21 an animationend from inside the mark is not its own; the backstop removes it by 400ms', () => {
    vi.useFakeTimers();
    const { boot } = page();
    boot.innerHTML = '<span class="tl-hop"></span>';
    dismissBoot(document, 900);
    boot.firstElementChild!.dispatchEvent(new Event('animationend', { bubbles: true }));
    expect(document.getElementById('boot')).not.toBeNull();
    vi.advanceTimersByTime(BOOT_LEAVE_MS);
    expect(document.getElementById('boot')).toBeNull();
  });

  it('C11-U21 never shown (under 300ms): removed at once, no fade; held counts as shown', () => {
    const { boot, app } = page();
    dismissBoot(document, 120);
    expect(document.getElementById('boot')).toBeNull();
    expect(boot).not.toHaveClass('tl-leaving');
    expect(app).not.toHaveClass('tl-arrive');

    expect(bootShown(false, 299)).toBe(false);
    expect(bootShown(false, 300)).toBe(true);
    expect(bootShown(true, 0)).toBe(true);
    resetBoot();
    root.dataset.boot = 'held';
    const again = page();
    dismissBoot(document, 50);
    expect(again.boot).toHaveClass('tl-leaving');
  });

  it('C11-U21 only the first dismissal does anything', () => {
    const { boot } = page();
    dismissBoot(document, 900);
    boot.classList.remove('tl-leaving');
    dismissBoot(document, 900);
    expect(boot).not.toHaveClass('tl-leaving');
  });
});

describe('C11-U23 the desk tells the Mac app the look', () => {
  beforeEach(() => resetThemeForTests());
  afterEach(() => {
    setLessMotion(false);
    resetThemeForTests();
  });

  it('C11-U23 on load, on a pick, on a pick taken up from another window and on Less motion; until it stops', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'light');
    const setAppearance = vi.fn();
    const stop = keepAppearance({ setAppearance });
    expect(setAppearance).toHaveBeenLastCalledWith({ theme: 'light', lessMotion: false });

    setThemeChoice('dark');
    expect(setAppearance).toHaveBeenLastCalledWith({ theme: 'dark', lessMotion: false });

    setLessMotion(true);
    expect(setAppearance).toHaveBeenLastCalledWith({ theme: 'dark', lessMotion: true });

    setThemeChoice('system');
    expect(setAppearance).toHaveBeenLastCalledWith({ theme: 'system', lessMotion: true });
    expect(setAppearance).toHaveBeenCalledTimes(4);

    stop();
    setThemeChoice('light');
    expect(setAppearance).toHaveBeenCalledTimes(4);
  });

  it('C11-U23 the real bridge asks set_appearance; an app without it ignores the call, no error', async () => {
    const asked: Array<[string, unknown]> = [];
    window.__TAURI_INTERNALS__ = {
      invoke: (cmd: string, args?: unknown) => {
        asked.push([cmd, args]);
        return cmd === 'set_appearance'
          ? Promise.reject(new Error('command set_appearance not found'))
          : Promise.resolve(null);
      },
    };
    resetDesktop();
    expect(() => desktop()!.setAppearance({ theme: 'dark', lessMotion: true })).not.toThrow();
    await new Promise((r) => setTimeout(r, 0));
    expect(asked).toContainEqual(['set_appearance', { theme: 'dark', lessMotion: true }]);
    delete window.__TAURI_INTERNALS__;
    resetDesktop();
  });
});

describe('C11-U25 What’s new opens the version’s release', () => {
  it('C11-U25 production its tag, staging the staging release, Tudu Test nothing', () => {
    const ready = { version: '0.38.0' };
    expect(notesHref({ track: 'production' }, ready)).toBe(
      'https://github.com/shimorojune/tudu/releases/tag/tudu-0.38.0',
    );
    expect(notesHref({ track: 'staging' }, { version: '0.38.1-staging.40' })).toBe(
      'https://github.com/shimorojune/tudu/releases#release-staging',
    );
    expect(notesHref({ track: 'test' }, ready)).toBeNull();
    expect(notesHref(null, ready)).toBeNull();
    expect(notesHref({ track: 'production' }, null)).toBeNull();
  });
});
