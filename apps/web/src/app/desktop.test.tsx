import type { SpaceSummary } from '@tudu/core';
import { showToast, TopBar } from '@tudu/ui';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { switchSpaces } from './AppShell';
import { desktop, resetDesktop, type DesktopFake } from './desktop';
import { interceptLinks, linkKind, openOutside } from './links';
import { appEntry, inboxTotal, CHECK_EVERY_MS, restartToUpdate, startUpdates, UpdateStore } from './updates';

vi.mock('@tudu/ui', async (orig) => ({ ...(await orig<Record<string, unknown>>()), showToast: vi.fn() }));

const space = (id: string, kind: 'personal' | 'team', toAnswer = 0, unread = 0): SpaceSummary => ({
  id,
  kind,
  name: id,
  color: null,
  role: 'admin',
  slug: id,
  prefix: id.toUpperCase().slice(0, 2),
  members: 1,
  inbox: { toAnswer, unread },
});

function fake(over: Partial<DesktopFake> = {}): DesktopFake {
  const f: DesktopFake = { calls: [], ...over };
  window.__tuduDesktopFake = f;
  resetDesktop();
  return f;
}

beforeEach(() => {
  delete window.__tuduDesktopFake;
  delete window.__TAURI_INTERNALS__;
  resetDesktop();
  vi.mocked(showToast).mockClear();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('C11-U03 the bridge to the macOS app', () => {
  it('is found from the Tauri internals, never on the web; the fake stands in for tests', async () => {
    expect(desktop()).toBeNull();

    const invoke = vi.fn(async (cmd: string, _args?: unknown, _opts?: unknown) =>
      cmd === 'app_info' ? { name: 'Tudu' } : null,
    );
    window.__TAURI_INTERNALS__ = { invoke, metadata: { currentWindow: { label: 'floating' } } };
    resetDesktop();
    const d = desktop()!;
    expect(d.window).toBe('floating');
    await d.info();
    d.setBadge(3);
    d.setSignedIn(true);
    d.hideFloating();
    d.showMain('/sign-in');
    await d.openExternal('https://jira.example.com/browse/NW-1');
    await d.checkUpdate();
    await d.saveDownload('Q3 plan.pdf', new Uint8Array([1, 2]));
    expect(invoke.mock.calls.map((c) => c[0])).toEqual([
      'app_info',
      'set_badge',
      'set_signed_in',
      'hide_floating',
      'show_main',
      'open_external',
      'update_check',
      'save_download',
    ]);
    expect(invoke.mock.calls[1]![1]).toEqual({ count: 3 });
    expect(invoke.mock.calls[4]![1]).toEqual({ path: '/sign-in' });
    // The file goes as the body, its name in a header.
    expect(invoke.mock.calls[7]![2]).toEqual({ headers: { 'x-name': 'Q3%20plan.pdf' } });

    const f = fake({ window: 'main', update: { version: '0.38.0', notes: '', date: null } });
    const b = desktop()!;
    expect(b.window).toBe('main');
    expect(await b.checkUpdate()).toEqual({ version: '0.38.0', notes: '', date: null });
    b.setBadge(2);
    expect(f.calls).toEqual([
      { name: 'checkUpdate', args: [] },
      { name: 'setBadge', args: [2] },
    ]);
  });

  it('outside links go through the opener in the app and stay plain links on the web', () => {
    const page = 'http://localhost:5173/me';
    const api = 'http://localhost:3456';
    expect(linkKind('/northwind/inbox', page, api)).toBe('inside');
    expect(linkKind('http://localhost:5173/join/abc', page, api)).toBe('inside');
    expect(linkKind('http://localhost:3456/api/files/f1', page, api)).toBe('file');
    expect(linkKind('https://jira.example.com/browse/NW-1', page, api)).toBe('outside');
    expect(linkKind('mailto:meera@example.com', page, api)).toBe('outside');
    expect(linkKind('javascript:alert(1)', page, api)).toBeNull();

    // On the web: a new tab.
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    openOutside('https://jira.example.com/browse/NW-1');
    expect(open).toHaveBeenCalledWith(
      'https://jira.example.com/browse/NW-1',
      '_blank',
      'noopener,noreferrer',
    );
    // In the app: the default browser.
    const f = fake();
    openOutside('https://jira.example.com/browse/NW-2');
    expect(f.calls).toEqual([{ name: 'openExternal', args: ['https://jira.example.com/browse/NW-2'] }]);
    expect(open).toHaveBeenCalledTimes(1);
    open.mockRestore();

    // A clicked link in the app.
    const stop = interceptLinks(desktop()!);
    document.body.innerHTML =
      '<a id="out" href="https://example.com/x" target="_blank">x</a><a id="in" href="/me/week">w</a>';
    const out = new MouseEvent('click', { bubbles: true, cancelable: true });
    document.getElementById('out')!.dispatchEvent(out);
    expect(out.defaultPrevented).toBe(true);
    expect(f.calls.at(-1)).toEqual({ name: 'openExternal', args: ['https://example.com/x'] });
    const inside = new MouseEvent('click', { bubbles: true, cancelable: true });
    document.getElementById('in')!.dispatchEvent(inside);
    expect(inside.defaultPrevented).toBe(false);
    stop();
  });

  it('an attachment chip saves and toasts Saved to Downloads. in the app; on the web it opens in a tab', async () => {
    const f = fake();
    const fetchMock = vi.fn(async () => new Response(new Uint8Array([1, 2, 3])));
    vi.stubGlobal('fetch', fetchMock);
    const stop = interceptLinks(desktop()!);
    document.body.innerHTML =
      '<a class="tp-att" target="_blank" href="http://localhost:3456/api/files/f1" data-name="Q3 plan.pdf">Q3 plan.pdf</a>';
    const click = new MouseEvent('click', { bubbles: true, cancelable: true });
    document.querySelector('a')!.dispatchEvent(click);
    expect(click.defaultPrevented).toBe(true);
    await vi.waitFor(() => expect(showToast).toHaveBeenCalledWith('Saved to Downloads.'));
    expect(fetchMock).toHaveBeenCalledWith('http://localhost:3456/api/files/f1', { credentials: 'include' });
    expect(f.calls.at(-1)).toEqual({ name: 'saveDownload', args: ['Q3 plan.pdf', 3] });
    // A chip as the editor draws it: the name, then its size beside it.
    document.body.innerHTML =
      '<a class="tp-att" href="http://localhost:3456/api/files/f2"><span class="tp-att-i"></span>notes.txt<span class="tp-att-s">2 KB</span></a>';
    document.querySelector('a')!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await vi.waitFor(() => expect(f.calls.at(-1)).toEqual({ name: 'saveDownload', args: ['notes.txt', 3] }));
    stop();

    // On the web nothing intercepts the chip: it is a plain link to a new tab.
    document.body.innerHTML =
      '<a class="tp-att" target="_blank" href="http://localhost:3456/api/files/f1">x</a>';
    const web = new MouseEvent('click', { bubbles: true, cancelable: true });
    document.querySelector('a')!.dispatchEvent(web);
    expect(web.defaultPrevented).toBe(false);
  });
});

describe('C11-U04 updates', () => {
  const READY = {
    version: '0.38.0',
    notes: '### Features\n\n* the floating bar',
    date: '2026-10-30T09:00:00Z',
  };

  it('checks on launch and every four hours, never two at once, and keeps the ready version', async () => {
    vi.useFakeTimers();
    const store = new UpdateStore(null);
    let answer: (v: typeof READY | null) => void = () => {};
    const checkUpdate = vi.fn(() => new Promise<typeof READY | null>((r) => (answer = r)));
    const stop = startUpdates({ checkUpdate }, store);
    expect(checkUpdate).toHaveBeenCalledTimes(1);
    // Still downloading when the next check is due: no second one.
    await vi.advanceTimersByTimeAsync(CHECK_EVERY_MS);
    expect(checkUpdate).toHaveBeenCalledTimes(1);
    await act(async () => answer(READY));
    expect(store.get()).toEqual({ ready: READY, unread: true, hidden: false });
    await vi.advanceTimersByTimeAsync(CHECK_EVERY_MS);
    expect(checkUpdate).toHaveBeenCalledTimes(2);
    stop();
    await vi.advanceTimersByTimeAsync(CHECK_EVERY_MS * 2);
    expect(checkUpdate).toHaveBeenCalledTimes(2);
  });

  it('a failed check shows nothing and the next one tries again', async () => {
    vi.useFakeTimers();
    const store = new UpdateStore(null);
    const checkUpdate = vi.fn().mockRejectedValueOnce(new Error('down')).mockResolvedValueOnce(READY);
    const stop = startUpdates({ checkUpdate }, store);
    await vi.advanceTimersByTimeAsync(0);
    expect(store.get().ready).toBeNull();
    await vi.advanceTimersByTimeAsync(CHECK_EVERY_MS);
    expect(store.get().ready).toEqual(READY);
    stop();
  });

  it('read is remembered per version; the item for every space', () => {
    const mem = new Map<string, string>();
    const storage = {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => mem.set(k, v),
    };
    const store = new UpdateStore(storage);
    store.setReady(READY);
    expect(store.get().unread).toBe(true);
    store.markRead('0.38.0');
    expect(store.get().unread).toBe(false);
    // A new launch reads it back; a newer version is new again.
    const again = new UpdateStore(storage);
    again.setReady(READY);
    expect(again.get().unread).toBe(false);
    again.setReady({ ...READY, version: '0.39.0' });
    expect(again.get().unread).toBe(true);

    // The Inbox row: mark unread, delete (hidden, so not counted) and Undo, kept per version.
    again.setReady(READY);
    again.markUnread('0.38.0');
    expect(again.get()).toMatchObject({ unread: true, hidden: false });
    again.hide('0.38.0');
    expect(again.get()).toMatchObject({ unread: false, hidden: true });
    expect(new UpdateStore(storage).isRead('0.38.0')).toBe(false);
    again.hide('0.38.0', false);
    expect(again.get()).toMatchObject({ unread: true, hidden: false });

    const now = new Date('2026-10-30T09:05:00Z');
    const e = appEntry(READY, true, now);
    expect(e).toMatchObject({
      id: 'app-0.38.0',
      kind: 'app',
      unread: true,
      text: 'is ready: version 0.38.0',
      quote: '<p><strong>Features</strong></p><ul><li>the floating bar</li></ul>',
    });
    expect(e.who).toBeUndefined();
    expect(appEntry(READY, false, now, 'Tudu Staging').who?.name).toBe('Tudu Staging');
  });

  it('Restart relaunches; a failed relaunch toasts what to do', async () => {
    const installUpdate = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('no'));
    await restartToUpdate({ installUpdate }, 'Tudu');
    expect(showToast).not.toHaveBeenCalled();
    await expect(restartToUpdate({ installUpdate }, 'Tudu Staging')).rejects.toThrow();
    expect(showToast).toHaveBeenCalledWith('Couldn’t restart. Quit and open Tudu Staging again to finish.');
  });
});

describe('C11-U06 the chrome and the dock badge', () => {
  it('the top bar is the drag region only in the app', () => {
    const { container, rerender } = render(<TopBar onSearch={() => {}} onNewTask={() => {}} />);
    expect(container.querySelector('[data-tauri-drag-region]')).toBeNull();
    rerender(<TopBar onSearch={() => {}} onNewTask={() => {}} dragRegion />);
    expect(container.querySelector('header')!.hasAttribute('data-tauri-drag-region')).toBe(true);
    expect(container.querySelector('.tp-tb-sp')!.hasAttribute('data-tauri-drag-region')).toBe(true);
    // Buttons stay buttons: never a drag region.
    expect(screen.getByRole('button', { name: 'New task' }).hasAttribute('data-tauri-drag-region')).toBe(
      false,
    );
    fireEvent.click(screen.getByRole('button', { name: 'New task' }));
  });

  it('C08-U22 the badge is the one Inbox total, the version once, and clears at zero', () => {
    const spaces = [space('me', 'personal'), space('nw', 'team', 1, 2), space('ac', 'team', 0, 1)];
    // The server's total wins: it has invites and notices, which belong to no space.
    expect(inboxTotal({ spaces, inbox: { toAnswer: 1, unread: 5 } }, false)).toBe(6);
    expect(inboxTotal({ spaces, inbox: { toAnswer: 1, unread: 5 } }, true)).toBe(7);
    // Without it, the spaces are added up; the version counts once however many team spaces there are.
    expect(inboxTotal({ spaces }, false)).toBe(4);
    expect(inboxTotal({ spaces }, true)).toBe(5);
    expect(inboxTotal({ spaces: [space('me', 'personal')] }, true)).toBe(1);
    expect(inboxTotal({ spaces: [space('me', 'personal'), space('nw', 'team')] }, false)).toBe(0);
    // The switcher keeps each space's own count, without the version.
    expect(switchSpaces(spaces).map((s) => s.count)).toEqual([undefined, 3, 1]);
  });
});
