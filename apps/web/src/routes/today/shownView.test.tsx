import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DayView } from '../../app/dayView';
import { SWITCH_MS, useShownView } from './shownView';

afterEach(() => vi.useRealTimers());

describe('useShownView', () => {
  it('C02-U46 one ↔ backlog at once; two → backlog shows one for 260ms first; a quick second pick cancels the wait', () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ v }: { v: DayView }) => useShownView(v), {
      initialProps: { v: 'one' as DayView },
    });
    rerender({ v: 'backlog' });
    expect(result.current).toBe('backlog');
    rerender({ v: 'one' });
    expect(result.current).toBe('one');

    rerender({ v: 'two' });
    expect(result.current).toBe('two');
    rerender({ v: 'backlog' });
    expect(result.current).toBe('one');
    act(() => {
      vi.advanceTimersByTime(SWITCH_MS - 10);
    });
    expect(result.current).toBe('one');
    act(() => {
      vi.advanceTimersByTime(10);
    });
    expect(result.current).toBe('backlog');
    expect(SWITCH_MS).toBe(260);

    // backlog → two, then straight back to backlog: only the last pick stands, and no timer from the first fires
    rerender({ v: 'two' });
    expect(result.current).toBe('one');
    rerender({ v: 'backlog' });
    expect(result.current).toBe('backlog');
    act(() => {
      vi.advanceTimersByTime(SWITCH_MS * 2);
    });
    expect(result.current).toBe('backlog');
  });
});
