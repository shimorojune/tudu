import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  localStorage.clear();
  vi.resetModules();
});

describe('dayView', () => {
  it('C02-U45 the remembered view: backlog reads back as backlog, anything else as one day; setDayView stores it', async () => {
    localStorage.setItem('tudu.view', 'backlog');
    let m = await import('./dayView');
    const { renderHook } = await import('@testing-library/react');
    expect(renderHook(() => m.useDayView()).result.current).toBe('backlog');

    vi.resetModules();
    localStorage.setItem('tudu.view', 'week');
    m = await import('./dayView');
    expect(renderHook(() => m.useDayView()).result.current).toBe('one');

    m.setDayView('backlog');
    expect(localStorage.getItem('tudu.view')).toBe('backlog');
    m.setDayView('two');
    expect(localStorage.getItem('tudu.view')).toBe('two');
  });

  it('C02-U60 C02-U61 openQuickAdd with a day: null (the Backlog) or a day is a seed; an event or nothing is not', async () => {
    const m = await import('./dayView');
    const { renderHook, act } = await import('@testing-library/react');
    const seed = renderHook(() => m.useQuickAddSeed());
    const open = renderHook(() => m.useQuickAddOpen());
    act(() => m.openQuickAdd({ day: null }));
    expect(open.result.current).toBe(true);
    expect(seed.result.current).toMatchObject({ day: null, nonce: 1 });
    act(() => m.openQuickAdd({ day: '2026-10-19' }));
    expect(seed.result.current).toMatchObject({ day: '2026-10-19', nonce: 2 });
    // a click handler's event, or no seed: Quick Add opens as it is
    act(() => m.openQuickAdd({ day: 5 } as unknown as Parameters<typeof m.openQuickAdd>[0]));
    act(() => m.openQuickAdd());
    expect(seed.result.current).toMatchObject({ nonce: 2 });
  });
});
