import { describe, expect, it } from 'vitest';
import { MIN_POSITION_GAP, POSITION_STEP, placeAt, positionBetween, renumber, tooClose } from './positions';

describe('C02-U21 fractional positions', () => {
  it('C02-U21 puts a task between two, first, last, or alone', () => {
    expect(positionBetween(1024, 2048)).toBe(1536);
    expect(positionBetween(null, 1024)).toBe(1024 - POSITION_STEP);
    expect(positionBetween(2048, null)).toBe(2048 + POSITION_STEP);
    expect(positionBetween(null, null)).toBe(POSITION_STEP);
    expect(placeAt([1024, 2048, 3072], 0)).toEqual({ position: 0 });
    expect(placeAt([1024, 2048, 3072], 1)).toEqual({ position: 1536 });
    expect(placeAt([1024, 2048, 3072], 3)).toEqual({ position: 4096 });
    expect(placeAt([], 0)).toEqual({ position: POSITION_STEP });
    expect(placeAt([1024], 9)).toEqual({ position: 2048 });
  });

  it('C02-U21 renumbers the whole list when two neighbours get too close', () => {
    let lo = 1024;
    const hi = 2048;
    // keep dropping into the same slot until it can no longer be split
    for (let i = 0; i < 60 && !tooClose(lo, hi); i++) lo = positionBetween(lo, hi);
    expect(tooClose(lo, hi)).toBe(true);
    expect(hi - lo).toBeLessThan(MIN_POSITION_GAP * 2);
    const placed = placeAt([lo, hi], 1);
    expect(placed.renumbered).toEqual([1024, 2048, 3072]);
    expect(placed.position).toBe(2048);
    expect(renumber(4)).toEqual([1024, 2048, 3072, 4096]);
  });
});
