import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DayProgress, REWARD_MS } from './DayProgress';

describe('DayProgress', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('reads "2 of 7 crossed off" and fills the ring in proportion', () => {
    const { container } = render(<DayProgress done={2} total={7} size={36} />);
    const prog = screen.getByRole('img', { name: '2 of 7 crossed off' });
    expect(prog).toHaveClass('tp-root', 'tp-prog');
    expect(prog).not.toHaveClass('tp-all');
    expect(prog).not.toHaveClass('tp-party');
    expect(prog).not.toHaveClass('tp-compact');
    expect(container.querySelector('.tp-prog-ring')).toHaveStyle({ width: '36px', height: '36px' });

    // the geometry: a 36px ring has a 16px radius; the arc is a dash as long as the circle, offset by what is left
    const ring = container.querySelector('.tp-prog-ring > svg:first-child');
    expect(ring).toHaveAttribute('viewBox', '0 0 36 36');
    const track = container.querySelector<SVGCircleElement>('.tp-prog-track');
    const arc = container.querySelector<SVGCircleElement>('.tp-prog-arc');
    expect(track).toHaveAttribute('r', '16');
    expect(arc).toHaveAttribute('r', '16');
    const c = 2 * Math.PI * 16;
    expect(parseFloat(arc!.style.strokeDasharray)).toBeCloseTo(c, 5);
    expect(parseFloat(arc!.style.strokeDashoffset)).toBeCloseTo(c * (1 - 2 / 7), 5);

    // the ink tick waits inside the ring, and the labels share one cell: the current one is tp-on
    expect(container.querySelector('.tp-prog-tick path')).toHaveAttribute(
      'd',
      expect.stringMatching(/^M3\.65 14\.05/),
    );
    expect(container.querySelector('.tp-prog-tick')).toHaveStyle({ width: '20.16px', height: '20.16px' }); // 56% of the ring
    const stack = container.querySelector('.tp-prog-t.tp-prog-stack.tp-prog-fit');
    expect(stack).toHaveAttribute('aria-hidden', 'true');
    const [now, finished] = Array.from(stack!.children);
    expect(now).toHaveClass('tp-on');
    expect(now).toHaveTextContent('2 of 7');
    expect(now).toHaveTextContent('crossed off');
    expect(finished).not.toHaveClass('tp-on');
    expect(finished).toHaveTextContent('All crossed off');
    expect(finished).toHaveTextContent('That’s the day');
    expect(container.querySelector('.tp-prog-sparks')).toBeNull();
  });

  it('says "All crossed off" when done equals total; a day that loads done shows the tick without sparks', () => {
    const { container, rerender } = render(<DayProgress done={7} total={7} />);
    const prog = screen.getByRole('img', { name: 'All 7 crossed off' });
    expect(prog).toHaveClass('tp-all');
    expect(prog).not.toHaveClass('tp-party');
    expect(container.querySelector('.tp-prog-sparks')).toBeNull();
    const [now, finished] = Array.from(container.querySelector('.tp-prog-stack')!.children);
    expect(finished).toHaveClass('tp-on');
    expect(now).not.toHaveClass('tp-on');
    expect(
      parseFloat(container.querySelector<SVGCircleElement>('.tp-prog-arc')!.style.strokeDashoffset),
    ).toBe(0);

    rerender(<DayProgress done={7} total={7} doneNote="That’s the week" />);
    expect(finished).toHaveTextContent('That’s the week');

    // more done than total is clamped; no total is an empty ring
    rerender(<DayProgress done={9} total={7} />);
    expect(screen.getByRole('img', { name: 'All 7 crossed off' })).toBeInTheDocument();
    rerender(<DayProgress />);
    expect(screen.getByRole('img', { name: '0 of 0 crossed off' })).not.toHaveClass('tp-all');
  });

  it('finishing the day plays the reward once: eight sparks and the tick draw, gone after 1400ms', () => {
    vi.useFakeTimers();
    const { container, rerender } = render(<DayProgress done={6} total={7} />);
    expect(REWARD_MS).toBe(1400);
    expect(container.querySelector('.tp-prog-sparks')).toBeNull();

    rerender(<DayProgress done={7} total={7} />);
    const prog = screen.getByRole('img', { name: 'All 7 crossed off' });
    expect(prog).toHaveClass('tp-all', 'tp-party');
    const sparks = container.querySelectorAll('.tp-prog-sparks i');
    expect(sparks).toHaveLength(8);
    expect(sparks[0]).toHaveStyle({ '--a': '22deg' });
    expect(sparks[7]).toHaveStyle({ '--a': '337deg' });
    expect(container.querySelector('.tp-prog-sparks')).toHaveAttribute('aria-hidden', 'true');

    act(() => {
      vi.advanceTimersByTime(REWARD_MS - 1);
    });
    expect(prog).toHaveClass('tp-party');
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(prog).not.toHaveClass('tp-party');
    expect(prog).toHaveClass('tp-all');
    expect(container.querySelector('.tp-prog-sparks')).toBeNull();

    // staying done plays nothing more; undoing and finishing again plays it again
    rerender(<DayProgress done={7} total={7} doneNote="Done" />);
    expect(prog).not.toHaveClass('tp-party');
    rerender(<DayProgress done={6} total={7} />);
    expect(prog).not.toHaveClass('tp-all');
    rerender(<DayProgress done={7} total={7} />);
    expect(prog).toHaveClass('tp-party');
    expect(container.querySelectorAll('.tp-prog-sparks i')).toHaveLength(8);
  });

  it('compact reads "2/7", then "All done"', () => {
    const { container, rerender } = render(<DayProgress done={2} total={7} compact size={30} />);
    expect(screen.getByRole('img', { name: '2 of 7 crossed off' })).toHaveClass('tp-compact');
    expect(container.querySelector('.tp-prog-ring')).toHaveStyle({ width: '30px' });
    const stack = container.querySelector('.tp-prog-n.tp-prog-stack.tp-prog-fit');
    expect(stack).not.toBeNull();
    expect(screen.getByText('2/7')).toHaveClass('tp-on');
    expect(screen.getByText('All done')).not.toHaveClass('tp-on');

    rerender(<DayProgress done={7} total={7} compact size={30} />);
    expect(screen.getByRole('img', { name: 'All 7 crossed off' })).toHaveClass('tp-all');
    expect(screen.getByText('7/7')).not.toHaveClass('tp-on');
    expect(screen.getByText('All done')).toHaveClass('tp-on');
  });
});
