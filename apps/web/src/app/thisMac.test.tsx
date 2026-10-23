import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { desktop, resetDesktop, type DesktopFake } from './desktop';
import { sectionFor, useThisMac } from './settings';

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
});
afterEach(() => {
  delete window.__tuduDesktopFake;
  resetDesktop();
});

describe('C16-U05 Settings › This Mac and the bridge', () => {
  it('the commands go to the app with their arguments', async () => {
    const invoke = vi.fn(async (cmd: string, _args?: unknown) =>
      cmd === 'this_mac'
        ? { openAtLogin: 'approval', dock: 'always' }
        : cmd === 'set_open_at_login'
          ? 'on'
          : null,
    );
    window.__TAURI_INTERNALS__ = { invoke };
    resetDesktop();
    const d = desktop()!;
    expect(await d.thisMac()).toEqual({ openAtLogin: 'approval', dock: 'always' });
    expect(await d.setOpenAtLogin(true)).toBe('on');
    d.openLoginItems();
    d.setDock('open');
    expect(invoke.mock.calls.map((c) => [c[0], c[1]])).toEqual([
      ['this_mac', undefined],
      ['set_open_at_login', { on: true }],
      ['open_login_items', undefined],
      ['set_dock', { dock: 'open' }],
    ]);
  });

  it('the section exists only in the app', () => {
    const team = { kind: 'team' as const };
    expect(sectionFor('mac', team)).toBe('account');
    fake();
    expect(sectionFor('mac', team)).toBe('mac');
  });

  it('reads the app as Settings opens; the switch shows at once, then as macOS answers', async () => {
    expect(renderHook(() => useThisMac()).result.current).toBeUndefined();

    const f = fake({ thisMac: { openAtLogin: 'off', dock: 'open' }, loginAnswer: 'approval' });
    const { result } = renderHook(() => useThisMac());
    await waitFor(() => expect(result.current?.openAtLogin).toBe('off'));
    expect(result.current?.dock).toBe('open');

    act(() => result.current!.onOpenAtLogin!(true));
    await waitFor(() => expect(result.current?.openAtLogin).toBe('approval'));
    act(() => result.current!.onLoginItems!());
    act(() => result.current!.onDock!('always'));
    expect(result.current?.dock).toBe('always');
    expect(f.calls.map((c) => c.name)).toEqual(['thisMac', 'setOpenAtLogin', 'openLoginItems', 'setDock']);

    f.loginAnswer = 'refused';
    act(() => result.current!.onOpenAtLogin!(false));
    await waitFor(() => expect(result.current?.openAtLogin).toBe('refused'));
  });
});
