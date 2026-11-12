import { describe, expect, it } from 'vitest';
import { placePop } from './NoteParts';

const VIEW = { w: 1200, h: 800 };
const SIZE = { w: 180, h: 80 };
const at = (left: number, top: number) => ({ left, top, right: left + 26, bottom: top + 26 });

describe('C22-U106 placePop', () => {
  it('C22-U106 with room below it sits under the button, right edges in line', () => {
    expect(placePop(at(260, 300), SIZE, VIEW)).toEqual({ left: 286 - 180, top: 326 + 6, up: false });
  });

  it('C22-U106 with no room below and room above it opens upward', () => {
    expect(placePop(at(260, 760), SIZE, VIEW)).toEqual({ left: 106, top: 760 - 6 - 80, up: true });
  });

  it('C22-U106 with no room either way it stays below, kept 8px inside the window', () => {
    const p = placePop(at(260, 40), { w: 180, h: 120 }, { w: 1200, h: 150 });
    expect(p.up).toBe(false);
    expect(p.top).toBe(150 - 8 - 120);
  });

  it('C22-U106 near the left edge it is kept 8px inside the window', () => {
    expect(placePop(at(40, 300), SIZE, VIEW).left).toBe(8);
  });

  it('C22-U106 near the right edge it is kept 8px inside the window', () => {
    expect(placePop(at(1190, 300), SIZE, VIEW).left).toBe(1200 - 8 - 180);
  });
});
