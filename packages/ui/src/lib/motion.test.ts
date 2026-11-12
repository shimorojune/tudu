import { afterEach, describe, expect, it, vi } from 'vitest';
import { closeRow, foldGap } from './motion';

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

  it('C02-U38 closeRow folds a padded line all the way: its padding closes with its height, so nothing is left to pop at the end', () => {
    vi.useFakeTimers();
    const line = document.createElement('p');
    line.style.padding = '10px 18px 14px';
    document.body.append(line);
    line.getBoundingClientRect = () => ({ height: 42 }) as DOMRect;
    const done = vi.fn();
    closeRow(line, done);
    vi.advanceTimersByTime(120);
    expect(line.style.boxSizing).toBe('border-box');
    const mid = parseFloat(line.style.height);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(42);
    // the padding keeps its share of the height on the way down, 10 and 14 of 42
    expect(parseFloat(line.style.paddingTop)).toBeCloseTo((mid * 10) / 42, 3);
    expect(parseFloat(line.style.paddingBottom)).toBeCloseTo((mid * 14) / 42, 3);
    expect(line.style.paddingLeft).toBe('18px');
    expect(done).not.toHaveBeenCalled();
    vi.advanceTimersByTime(200);
    expect(parseFloat(line.style.height)).toBe(0);
    expect(parseFloat(line.style.paddingTop)).toBe(0);
    expect(parseFloat(line.style.paddingBottom)).toBe(0);
    expect(done).toHaveBeenCalledTimes(1);

    // a row with no padding of its own folds as before, its padding untouched
    const row = document.createElement('li');
    document.body.append(row);
    row.getBoundingClientRect = () => ({ height: 53 }) as DOMRect;
    closeRow(row, vi.fn());
    vi.advanceTimersByTime(400);
    expect(row.style.height).toBe('0px');
    expect(row.style.paddingTop).toBe('');
    line.remove();
    row.remove();
  });
});
