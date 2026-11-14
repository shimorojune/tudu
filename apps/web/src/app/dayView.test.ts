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
});
