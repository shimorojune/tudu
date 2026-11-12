import { afterEach, describe, expect, it, vi } from 'vitest';
import { foldGap } from './motion';

describe('motion', () => {
  afterEach(() => {
    vi.useRealTimers();
    delete document.documentElement.dataset.motion;
  });

  it('C02-U37 foldGap starts a row one gap lower and eases it shut in 240ms, cleans up, can be finished at once, and does nothing under less motion', () => {
    vi.useFakeTimers();
    const row = document.createElement('div');
    foldGap(row, 'marginTop', 52);
    expect(row.style.marginTop).toBe('52px');
    vi.advanceTimersByTime(120);
    const mid = parseFloat(row.style.marginTop);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(52);
    vi.advanceTimersByTime(200);
    expect(row.style.marginTop).toBe('');

    // the last row left: the list's bottom edge folds instead
    const list = document.createElement('div');
    const stop = foldGap(list, 'paddingBottom', 40);
    expect(list.style.paddingBottom).toBe('40px');
    stop();
    expect(list.style.paddingBottom).toBe('');
    vi.advanceTimersByTime(400);
    expect(list.style.paddingBottom).toBe('');

    document.documentElement.dataset.motion = 'less';
    foldGap(row, 'marginTop', 52);
    expect(row.style.marginTop).toBe('');
  });
});
