import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DATEPOP_LEAVE_MS, DatePop } from './DatePop';

/** A pill at a place on screen, and a pop of a given size (jsdom has no layout). */
const anchors: HTMLElement[] = [];
function anchorAt(top: number, left = 300): HTMLElement {
  const a = document.createElement('button');
  anchors.push(a);
  a.textContent = 'From Sat';
  document.body.appendChild(a);
  a.getBoundingClientRect = () =>
    ({ top, left, bottom: top + 20, right: left + 70, width: 70, height: 20, x: left, y: top }) as DOMRect;
  return a;
}

function sized(w: number, h: number) {
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(w);
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(h);
}

afterEach(() => {
  cleanup();
  anchors.splice(0).forEach((a) => a.remove());
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('DatePop', () => {
  it('C02-U15 sits beside its pill, flips up near the bottom, and eases out on Esc, a click away and a scroll', () => {
    vi.useFakeTimers();
    sized(280, 320);
    Object.defineProperty(window, 'innerHeight', { value: 900, configurable: true });
    Object.defineProperty(window, 'innerWidth', { value: 1440, configurable: true });
    const onClose = vi.fn();

    const low = anchorAt(100);
    const { unmount } = render(
      <DatePop anchor={low} onClose={onClose} heading="Carried over from Saturday">
        <button type="button">Today</button>
      </DatePop>,
    );
    const pop = screen.getByRole('dialog', { name: 'Carried over from Saturday' });
    expect(pop).toHaveStyle({ left: '294px', top: '126px' }); // 6px left of the pill, 6px under it
    expect(pop).not.toHaveClass('tp-up');
    expect(screen.getByRole('button', { name: 'Today' })).toHaveFocus();
    // Esc eases it out, then it goes, and focus returns to the pill
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(pop).toHaveClass('tp-pop-leaving');
    expect(onClose).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(DATEPOP_LEAVE_MS);
    });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(low).toHaveFocus();
    unmount();

    // near the bottom of the window it opens upward
    const high = anchorAt(800);
    const second = render(<DatePop anchor={high} onClose={onClose} heading="Move it" />);
    const up = screen.getByRole('dialog', { name: 'Move it' });
    expect(up).toHaveClass('tp-up');
    expect(up).toHaveStyle({ top: `${800 - 6 - 320}px` });
    // a click away eases it out
    fireEvent.pointerDown(document.body);
    expect(up).toHaveClass('tp-pop-leaving');
    second.unmount();

    // a scroll of the page under it eases it out too; a click inside does not
    const third = render(
      <DatePop anchor={anchorAt(100)} onClose={onClose} heading="Due date">
        <button type="button">Fri</button>
      </DatePop>,
    );
    const due = screen.getByRole('dialog', { name: 'Due date' });
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Fri' }));
    expect(due).not.toHaveClass('tp-pop-leaving');
    fireEvent.scroll(window);
    expect(due).toHaveClass('tp-pop-leaving');
    third.unmount();
  });

  it('hangs to the left of its button with align end, and never runs off the right edge', () => {
    sized(280, 320);
    Object.defineProperty(window, 'innerWidth', { value: 800, configurable: true });
    render(
      <DatePop anchor={anchorAt(100, 760)} onClose={() => {}} heading="Plan it for a day" align="end" />,
    );
    const pop = screen.getByRole('dialog', { name: 'Plan it for a day' });
    expect(pop).toHaveClass('tp-end');
    expect(pop).toHaveStyle({ left: `${800 - 280 - 8}px` });
  });
});
