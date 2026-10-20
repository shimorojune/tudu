import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Tooltip, TOOLTIP_DELAY_MS, type TooltipSide } from './Tooltip';

// jsdom has no layout. For the side tests, give the viewport a size and put the trigger in the middle of it,
// so every side has room and floating-ui keeps the side we asked for instead of flipping away from an edge.
function placeInTheMiddle(el: Element) {
  Object.defineProperty(document.documentElement, 'clientWidth', { configurable: true, get: () => 1024 });
  Object.defineProperty(document.documentElement, 'clientHeight', { configurable: true, get: () => 768 });
  const r = { x: 500, y: 380, width: 40, height: 20 };
  el.getBoundingClientRect = () =>
    ({ ...r, top: r.y, left: r.x, right: r.x + r.width, bottom: r.y + r.height, toJSON: () => r }) as DOMRect;
}

function setup(side?: TooltipSide, opts: Parameters<typeof userEvent.setup>[0] = {}) {
  const user = userEvent.setup(opts);
  render(
    <Tooltip label="Settings" side={side}>
      <button type="button">Gear</button>
    </Tooltip>,
  );
  return { user, trigger: screen.getByRole('button', { name: 'Gear' }) };
}

describe('Tooltip', () => {
  afterEach(() => {
    vi.useRealTimers();
    Reflect.deleteProperty(document.documentElement, 'clientWidth');
    Reflect.deleteProperty(document.documentElement, 'clientHeight');
  });

  it('C00-U14 opens after 380ms of hover, not before, and closes when the pointer leaves', async () => {
    vi.useFakeTimers();
    const { user, trigger } = setup(undefined, { advanceTimers: vi.advanceTimersByTime });
    expect(TOOLTIP_DELAY_MS).toBe(380);

    await user.hover(trigger);
    act(() => {
      vi.advanceTimersByTime(TOOLTIP_DELAY_MS - 1);
    });
    expect(screen.queryByRole('tooltip')).toBeNull();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.getByRole('tooltip')).toHaveTextContent('Settings');

    await user.unhover(trigger);
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('C00-U14 opens at once on keyboard focus and closes on blur', async () => {
    const { user, trigger } = setup();
    expect(screen.queryByRole('tooltip')).toBeNull();

    await user.tab();
    expect(trigger).toHaveFocus();
    expect(screen.getByRole('tooltip')).toHaveTextContent('Settings');

    await user.tab();
    expect(trigger).not.toHaveFocus();
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it.each<[TooltipSide | undefined, string, string]>([
    [undefined, 'left', 'center'],
    ['right', 'right', 'center'],
    ['bottom', 'bottom', 'center'],
    ['top', 'top', 'center'],
    ['bottom-end', 'bottom', 'end'],
  ])('C00-U14 honours side %s as data-side %s, data-align %s', async (side, dataSide, dataAlign) => {
    const { user, trigger } = setup(side);
    placeInTheMiddle(trigger);

    await user.tab();
    const pop = screen.getByRole('tooltip').closest('.tp-tip-pop');
    expect(pop).not.toBeNull();
    await waitFor(() => {
      expect(pop).toHaveAttribute('data-side', dataSide);
      expect(pop).toHaveAttribute('data-align', dataAlign);
    });
  });
});
