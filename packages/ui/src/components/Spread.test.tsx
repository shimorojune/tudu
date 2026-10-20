import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseRules, readStylesheet, rulesWhere } from '../test-utils/stylesheet';
import { SPREAD_MS, Spread, SpreadPage } from './Spread';

const rules = parseRules(readStylesheet('components.css'));

function Two({ open }: { open: boolean }) {
  return (
    <Spread open={open}>
      <SpreadPage>
        <p>Sunday</p>
      </SpreadPage>
      <SpreadPage second>
        <p>Monday</p>
      </SpreadPage>
    </Spread>
  );
}

afterEach(() => vi.useRealTimers());

describe('Spread', () => {
  it('C02-U16 opening mounts the second page, then moves both in one step; closing unmounts after the move', () => {
    vi.useFakeTimers();
    const { container, rerender } = render(<Two open={false} />);
    const [first, second] = Array.from(container.querySelectorAll('.tp-spread-page'));
    expect(screen.queryByText('Monday')).toBeNull();
    expect(second).toHaveAttribute('aria-hidden', 'true');

    rerender(<Two open />);
    // mounted at zero width first, both pages moving
    expect(screen.getByText('Monday')).toBeInTheDocument();
    expect(first).toHaveClass('tp-moving');
    expect(second).toHaveClass('tp-moving');
    expect(first).not.toHaveClass('tp-on');
    act(() => {
      vi.advanceTimersByTime(40); // two frames
    });
    // one step: both pages take their new widths in the same frame
    expect(first).toHaveClass('tp-on');
    expect(second).toHaveClass('tp-on');
    expect(container.querySelector('.tp-spread')).toHaveClass('tp-spread-two');
    act(() => {
      vi.advanceTimersByTime(SPREAD_MS);
    });
    expect(first).not.toHaveClass('tp-moving');

    rerender(<Two open={false} />);
    expect(first).not.toHaveClass('tp-on');
    expect(screen.getByText('Monday')).toBeInTheDocument(); // still there while it slides away
    act(() => {
      vi.advanceTimersByTime(SPREAD_MS);
    });
    expect(screen.queryByText('Monday')).toBeNull();

    // the move is dur-spread with ease-settle; reduced motion switches without moving and fades the page in
    const page = rulesWhere(rules, (sel) => sel === '.tp-spread-page')[0]!;
    expect(page.declarations.transition).toContain('width var(--dur-spread) var(--ease-settle)');
    const reduced = rules.find(
      (r) => r.selector === '.tp-spread-inner' && r.context.some((c) => c.includes('prefers-reduced-motion')),
    )!;
    expect(reduced.declarations.transition).toBe('opacity 120ms linear');
  });

  it('settles even where frames never run (a tab in the background)', () => {
    vi.useFakeTimers();
    const raf = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 0);
    const { container, rerender } = render(<Two open={false} />);
    rerender(<Two open />);
    act(() => {
      vi.advanceTimersByTime(SPREAD_MS);
    });
    expect(container.querySelector('.tp-spread')).toHaveClass('tp-spread-two');
    raf.mockRestore();
  });
});
