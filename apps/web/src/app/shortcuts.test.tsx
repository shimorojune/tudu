import { combo, defaultBindings } from '@tudu/core';
import type { SwitchSpace } from '@tudu/ui';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { layerOpen, spaceKey } from './AppShell';
import { resetDesktop, type DesktopFake } from './desktop';
import {
  bindingsOf,
  loadGlobal,
  resetShortcuts,
  setShortcut,
  SHORTCUTS_KEY,
  spaceHint,
  useShortcutSettings,
} from './shortcuts';
import { renderHook, act, waitFor } from '@testing-library/react';

const mac = defaultBindings('mac');

function fake(extra: Partial<DesktopFake> = {}): DesktopFake {
  const f: DesktopFake = { calls: [], ...extra };
  window.__tuduDesktopFake = f;
  resetDesktop();
  resetShortcuts();
  return f;
}

beforeEach(() => {
  // A Mac's browser: the space keys use ⌃.
  vi.spyOn(navigator, 'platform', 'get').mockReturnValue('MacIntel');
  localStorage.clear();
  delete window.__tuduDesktopFake;
  resetDesktop();
  resetShortcuts();
});

afterEach(() => {
  delete window.__tuduDesktopFake;
  resetDesktop();
  resetShortcuts();
  vi.restoreAllMocks();
});

describe('SK-U12 the shortcuts store', () => {
  it('SK-U12 storage missing, broken or throwing gives the usual keys; a change survives a reload', async () => {
    const { result } = renderHook(() => useShortcutSettings(false));
    expect(result.current.bindings.allSpaces).toEqual(mac.allSpaces);
    // The web has no From anywhere keys, so they clash with nothing.
    expect(result.current.bindings.newTask).toBeNull();
    expect(result.current.global).toBeUndefined();

    localStorage.setItem(SHORTCUTS_KEY, '{nope');
    resetShortcuts();
    expect(renderHook(() => useShortcutSettings(false)).result.current.bindings.space).toEqual(mac.space);

    await act(async () => {
      expect(await setShortcut('allSpaces', combo(['alt', 'meta'], '0'))).toBeNull();
    });
    resetShortcuts();
    const again = renderHook(() => useShortcutSettings(false)).result.current;
    expect(again.bindings.allSpaces).toEqual(combo(['alt', 'meta'], '0'));
    await act(async () => void (await setShortcut('space', null)));
    resetShortcuts();
    expect(renderHook(() => useShortcutSettings(false)).result.current.bindings.space).toBeNull();

    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('full');
    });
    expect(await setShortcut('allSpaces', combo(['ctrl'], '9'))).toBe(
      'Couldn’t save that on this computer. Still ⌥⌘0. Try again.',
    );
  });

  it('SK-U12 in the Mac app the From anywhere rows go through the app: loading, then its keys; a refusal is its line', async () => {
    const f = fake({ taken: ['Alt+Space'] });
    const { result } = renderHook(() => useShortcutSettings(true));
    expect(result.current.global).toBe('loading');
    await waitFor(() => expect(result.current.global).toBe('ready'));
    expect(f.calls.some((c) => c.name === 'shortcuts')).toBe(true);
    expect(result.current.bindings.newTask).toEqual(mac.newTask);

    let answer: string | null = null;
    await act(async () => {
      answer = await setShortcut('newTask', combo(['ctrl', 'alt'], 'T'));
    });
    expect(answer).toBeNull();
    expect(f.calls.at(-1)).toEqual({ name: 'setShortcut', args: ['newTask', 'Control+Alt+KeyT'] });
    expect(result.current.bindings.newTask).toEqual(combo(['ctrl', 'alt'], 'T'));

    await act(async () => {
      answer = await setShortcut('newTask', combo(['alt'], 'Space'));
    });
    expect(answer).toBe('macOS or another app already uses ⌥Space. Still ⌃⌥T.');
    expect(result.current.bindings.newTask).toEqual(combo(['ctrl', 'alt'], 'T'));

    // Off, from the app's answer.
    await act(async () => void (await setShortcut('newNote', null)));
    expect(result.current.bindings.newNote).toBeNull();
  });

  it('SK-U12 an app that can’t answer shows the error; Try again asks again', async () => {
    const f = fake({ noShortcuts: true });
    const { result } = renderHook(() => useShortcutSettings(true));
    await waitFor(() => expect(result.current.global).toBe('error'));
    f.noShortcuts = false;
    await act(async () => void (await loadGlobal()));
    expect(result.current.global).toBe('ready');
  });

  it('SK-U12 a stopped shortcut shows the app’s line as its problem', async () => {
    fake({
      shortcuts: [
        { id: 'newTask', accelerator: 'Shift+Super+KeyN', label: '⇧⌘N', registered: true },
        {
          id: 'newNote',
          accelerator: 'Alt+Super+KeyN',
          label: '⌥⌘N',
          registered: false,
          error: 'Another app took ⌥⌘N, so it isn’t working. Pick other keys.',
        },
      ],
    });
    const { result } = renderHook(() => useShortcutSettings(true));
    await waitFor(() => expect(result.current.global).toBe('ready'));
    expect(result.current.problems).toEqual({
      newNote: 'Another app took ⌥⌘N, so it isn’t working. Pick other keys.',
    });
  });

  it('SK-U12 hints for the space list: 0 is All spaces, then 1 to 9; off shows none', () => {
    expect(spaceHint(mac, 'mac', 0)).toEqual({ hint: '⌃0', keyShortcuts: 'Control+0' });
    expect(spaceHint(mac, 'mac', 3)).toEqual({ hint: '⌃3', keyShortcuts: 'Control+3' });
    expect(spaceHint(mac, 'mac', 10)).toBeNull();
    expect(spaceHint({ ...mac, space: null }, 'mac', 1)).toBeNull();
    const other = defaultBindings('other');
    expect(spaceHint(other, 'other', 2)?.hint).toBe('Alt+2');
    expect(bindingsOf({ platform: 'mac', app: mac, global: null }).newNote).toBeNull();
  });
});

describe('SK-U13 the space keys', () => {
  const LIST: SwitchSpace[] = [
    { id: 'all', name: 'All spaces', all: true },
    { id: 'me', name: 'Personal' },
    { id: 'nw', name: 'Northwind' },
  ];
  const key = (code: string, mods: Partial<KeyboardEventInit> = {}) =>
    new KeyboardEvent('keydown', { code, cancelable: true, ...mods });
  const at = (here = 'me') => ({ keys: { app: mac }, spaceList: LIST, here, pickSpace: vi.fn() });

  beforeEach(() => {
    vi.spyOn(navigator, 'platform', 'get').mockReturnValue('MacIntel');
    document.body.innerHTML = '';
    // jsdom lays nothing out: every element counts as shown.
    vi.spyOn(Element.prototype, 'getClientRects').mockReturnValue([{}] as unknown as DOMRectList);
  });

  it('SK-U13 ⌃0 and ⌃2 go to All spaces and the second space; nothing is typed', () => {
    const a = at();
    const e = key('Digit0', { ctrlKey: true });
    spaceKey(e, a);
    expect(a.pickSpace).toHaveBeenCalledWith(LIST[0]);
    expect(e.defaultPrevented).toBe(true);
    spaceKey(key('Digit2', { ctrlKey: true }), a);
    expect(a.pickSpace).toHaveBeenLastCalledWith(LIST[2]);
  });

  it('SK-U13 the current space’s key, a number past the list, repeats and other keys do nothing', () => {
    const a = at('nw');
    spaceKey(key('Digit2', { ctrlKey: true }), a);
    const past = key('Digit5', { ctrlKey: true });
    spaceKey(past, a);
    // Still the space keys: nothing typed, nothing opened.
    expect(past.defaultPrevented).toBe(true);
    spaceKey(key('Digit1', { ctrlKey: true, repeat: true }), a);
    const other = key('Digit1', { metaKey: true });
    spaceKey(other, a);
    expect(other.defaultPrevented).toBe(false);
    expect(a.pickSpace).not.toHaveBeenCalled();
  });

  it('SK-U13 under a dialog, a menu or a listbox they wait; the open space list picks its row', () => {
    const a = at();
    document.body.innerHTML = '<div role="dialog"></div>';
    expect(layerOpen()).toBe(true);
    const e = key('Digit2', { ctrlKey: true });
    spaceKey(e, a);
    expect(e.defaultPrevented).toBe(false);
    expect(a.pickSpace).not.toHaveBeenCalled();

    document.body.innerHTML =
      '<div class="tp-sswl" role="menu"><button role="menuitemradio"></button><button role="menuitemradio"></button><button role="menuitemradio" id="nw"></button></div>';
    expect(layerOpen()).toBe(false);
    const clicked = vi.fn();
    document.getElementById('nw')!.addEventListener('click', clicked);
    spaceKey(key('Digit2', { ctrlKey: true }), a);
    expect(clicked).toHaveBeenCalledOnce();
    expect(a.pickSpace).not.toHaveBeenCalled();
  });

  it('SK-U13 off: the space keys do nothing', () => {
    const a = { ...at(), keys: { app: { ...mac, space: null } } };
    const e = key('Digit2', { ctrlKey: true });
    spaceKey(e, a);
    expect(e.defaultPrevented).toBe(false);
  });
});
