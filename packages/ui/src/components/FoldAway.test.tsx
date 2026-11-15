import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseRules, readStylesheet } from '../test-utils/stylesheet';
import { FILL_FADE_MS, FoldAway } from './FoldAway';

const rules = parseRules(readStylesheet('components.css'));

afterEach(() => vi.useRealTimers());

describe('FoldAway', () => {
  it('C06-U10 the empty words stay to fold away as a task lands, then go; they come back late, after the gap shuts', () => {
    vi.useFakeTimers();
    const words = (show: boolean) => (
      <FoldAway show={show}>
        <p>Nothing waiting.</p>
      </FoldAway>
    );
    const { container, rerender } = render(words(true));
    // first paint never moves
    expect(container.querySelector('.tp-fold')).not.toHaveClass('tp-fold-in');

    rerender(words(false));
    // still there, folding, hidden from screen readers
    const leaving = container.querySelector('.tp-fold')!;
    expect(leaving).toHaveAttribute('aria-hidden', 'true');
    expect(leaving).toHaveTextContent('Nothing waiting.');
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(screen.queryByText('Nothing waiting.')).toBeNull();

    rerender(words(true));
    expect(container.querySelector('.tp-fold')).toHaveClass('tp-fold-in');
    const late = rules.find((r) => r.selector === '.tp-fold.tp-fold-in' && !r.context.length)!;
    expect(late.declarations.animation).toContain('240ms');
    const less = parseRules(readStylesheet('less-motion.css')).find((r) =>
      r.selector.includes('.tp-fold.tp-fold-in'),
    )!;
    expect(less.declarations['animation-delay']).toBe('0ms');
  });

  it('C02-U58 filled words stay put over the list and fade when a task lands, then go; reduced motion swaps at once', () => {
    vi.useFakeTimers();
    const words = (show: boolean) => (
      <FoldAway show={show} fill>
        <p>Nothing waiting.</p>
      </FoldAway>
    );
    const { container, rerender } = render(words(true));
    expect(container.querySelector('.tp-fold')).toHaveClass('tp-fold-fill');
    rerender(words(false));
    const leaving = container.querySelector('.tp-fold')!;
    expect(leaving).toHaveClass('tp-fold-fade');
    expect(leaving).toHaveAttribute('aria-hidden', 'true');
    act(() => {
      vi.advanceTimersByTime(FILL_FADE_MS - 20);
    });
    expect(screen.getByText('Nothing waiting.')).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(40);
    });
    expect(screen.queryByText('Nothing waiting.')).toBeNull();
    const fade = rules.find((r) => r.selector === '.tp-fold-fill.tp-fold-fade' && !r.context.length)!;
    expect(fade.declarations).toMatchObject({ position: 'absolute', 'pointer-events': 'none' });
    expect(fade.declarations.animation).toContain('240ms');
    const less = parseRules(readStylesheet('less-motion.css')).find((r) =>
      r.selector.includes('.tp-fold-fill.tp-fold-fade'),
    )!;
    expect(less.declarations.animation).toBe('none');
  });
});
