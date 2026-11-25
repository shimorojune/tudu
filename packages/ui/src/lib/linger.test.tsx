import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { edgeShift, Linger } from './linger';

/** jsdom has no layout: the pop's box is whatever the test says it measured. */
function measured(left: number, width = 248) {
  return vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    const at = this.classList.contains('pop') ? left + (parseFloat(this.style.marginLeft) || 0) : 0;
    const w = this.classList.contains('pop') ? width : 0;
    return {
      left: at,
      right: at + w,
      top: 0,
      bottom: 0,
      width: w,
      height: 0,
      x: at,
      y: 0,
      toJSON: () => ({}),
    };
  });
}

const pop = (c: HTMLElement) => c.querySelector<HTMLElement>('.pop')!;
let width: number;
beforeEach(() => {
  width = window.innerWidth;
  window.innerWidth = 640;
});
afterEach(() => {
  window.innerWidth = width;
  vi.restoreAllMocks();
});

describe('C00-U38 a pop stays 12px inside the window (#117)', () => {
  it('C00-U38 how far it slides: left past the right edge, right before the left one, never when it fits', () => {
    expect(edgeShift(529, 777, 640)).toBe(-149);
    expect(edgeShift(200, 448, 640)).toBe(0);
    expect(edgeShift(4, 252, 640)).toBe(8);
    // Exactly 12px from either edge is inside.
    expect(edgeShift(12, 628, 640)).toBe(0);
    // Wider than the window: it starts inside, whatever runs off the right.
    expect(edgeShift(100, 900, 640)).toBe(-88);
  });

  it('C00-U38 in a 640px window, a 248px pop at left 529 slides back until its right edge is at 628', () => {
    measured(529);
    const { container } = render(
      <Linger open className="pop">
        <div>menu</div>
      </Linger>,
    );
    expect(pop(container).style.marginLeft).toBe('-149px');
    expect(pop(container).style.marginRight).toBe('149px');
    // The pop-in is put back after measuring at rest.
    expect(pop(container).style.animation).toBe('');
  });

  it('C00-U38 at left 200 it doesn’t move; at left 4 it slides right by 8', () => {
    measured(200);
    const a = render(
      <Linger open className="pop">
        <div>menu</div>
      </Linger>,
    );
    expect(pop(a.container).style.marginLeft).toBe('');
    a.unmount();
    vi.restoreAllMocks();
    measured(4);
    const b = render(
      <Linger open className="pop">
        <div>menu</div>
      </Linger>,
    );
    expect(pop(b.container).style.marginLeft).toBe('8px');
    expect(pop(b.container).style.marginRight).toBe('-8px');
  });

  it('C00-U38 a box set in from the pop by its own margin is measured from where it shows', () => {
    // The # menu: the pop starts at the field (left 4) and its menu sits at the caret, 300px in.
    measured(4, 548);
    const { container } = render(
      <Linger open className="pop">
        <div style={{ marginLeft: 300 }}>menu</div>
      </Linger>,
    );
    // Right edge 552 is inside 628 and the menu itself starts at 304: nothing to do.
    expect(pop(container).style.marginLeft).toBe('');
  });

  it('C00-U38 it is measured when it opens and when fitKey changes, not while it stays open; reopening measures again', () => {
    const spy = measured(529);
    const calls = () =>
      spy.mock.instances.filter((el) => (el as HTMLElement).classList.contains('pop')).length;
    const ui = (open: boolean, key: number, words: string) => (
      <Linger open={open} fitKey={key} className="pop">
        <div>{words}</div>
      </Linger>
    );
    const { container, rerender } = render(ui(true, 1, 'a'));
    expect(calls()).toBe(1);
    expect(pop(container).style.marginLeft).toBe('-149px');
    // Typing on after the same #: new content, the same place.
    rerender(ui(true, 1, 'ab'));
    rerender(ui(true, 1, 'abc'));
    expect(calls()).toBe(1);
    expect(pop(container).style.marginLeft).toBe('-149px');
    // Another #: measured afresh, from its unshifted place.
    vi.restoreAllMocks();
    const again = measured(300);
    rerender(ui(true, 2, 'x'));
    expect(again.mock.instances.some((el) => (el as HTMLElement).classList.contains('pop'))).toBe(true);
    expect(pop(container).style.marginLeft).toBe('');
    // Closed (it lingers, leaving) and opened again where it runs off: slid back again.
    rerender(ui(false, 2, 'x'));
    vi.restoreAllMocks();
    measured(529);
    rerender(ui(true, 2, 'x'));
    expect(pop(container).style.marginLeft).toBe('-149px');
  });
});
