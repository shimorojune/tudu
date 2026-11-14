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

function Beside({ backlog, two }: { backlog: boolean; two: boolean }) {
  return (
    <Spread side="start" open={backlog}>
      <SpreadPage>
        <Spread open={two}>
          <SpreadPage>
            <p>Sunday</p>
          </SpreadPage>
          <SpreadPage second>
            <p>Monday</p>
          </SpreadPage>
        </Spread>
      </SpreadPage>
      <SpreadPage second>
        <p>Backlog</p>
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

  it('C02-U42 side="start": the second page opens before the first, with the same mount, frames and unmount', () => {
    vi.useFakeTimers();
    const { container, rerender } = render(<Beside backlog={false} two={false} />);
    const outer = container.querySelector('.tp-spread')!;
    expect(outer).toHaveClass('tp-spread-start');
    expect(screen.queryByText('Backlog')).toBeNull();
    rerender(<Beside backlog two={false} />);
    const second = outer.querySelector(':scope > .tp-spread-second')!;
    expect(screen.getByText('Backlog')).toBeInTheDocument();
    expect(second).toHaveClass('tp-moving');
    expect(second).not.toHaveClass('tp-on');
    act(() => {
      vi.advanceTimersByTime(40);
    });
    expect(second).toHaveClass('tp-on');
    expect(outer).toHaveClass('tp-spread-two');
    rerender(<Beside backlog={false} two={false} />);
    expect(screen.getByText('Backlog')).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(SPREAD_MS);
    });
    expect(screen.queryByText('Backlog')).toBeNull();

    // the row reverses so the page sits on the left; its gap is on its right; the clip is on the day's side
    const css = (sel: string) => rulesWhere(rules, (x) => x === sel)[0]?.declarations ?? {};
    expect(css('.tp-spread-start')['flex-direction']).toBe('row-reverse');
    expect(css('.tp-spread-start > .tp-spread-second.tp-on')['margin-right']).toBe('var(--spread-gap)');
    expect(css('.tp-spread-start > .tp-spread-second.tp-on')['margin-left']).toBe('0');
    expect(css('.tp-spread-start > .tp-spread-second')['justify-content']).toBe('flex-start');
    expect(css('.tp-spread-start > .tp-spread-second.tp-moving')['clip-path']).toBe(
      'inset(-48px 0 -48px -48px)',
    );
  });

  it('C02-U43 nested: the inner Spread keeps the full width while the outer is closed and opens on its own', () => {
    vi.useFakeTimers();
    const { container, rerender } = render(<Beside backlog={false} two={false} />);
    const [outer, inner] = Array.from(container.querySelectorAll('.tp-spread'));
    expect(outer!.contains(inner!)).toBe(true);
    rerender(<Beside backlog two={false} />);
    act(() => {
      vi.advanceTimersByTime(SPREAD_MS);
    });
    // opening the outer one leaves the inner one closed
    expect(inner).not.toHaveClass('tp-spread-two');
    expect(screen.queryByText('Monday')).toBeNull();
    rerender(<Beside backlog={false} two />);
    act(() => {
      vi.advanceTimersByTime(SPREAD_MS);
    });
    expect(inner).toHaveClass('tp-spread-two');
    expect(outer).not.toHaveClass('tp-spread-two');
    const full = rulesWhere(
      rules,
      (x) => x === '.tp-spread-start > .tp-spread-first:not(.tp-on):has(> .tp-spread)',
    )[0]!;
    expect(full.declarations.width).toBe('100cqw');
    expect(rulesWhere(rules, (x) => x === '.tp-spread-page > .tp-spread')[0]!.declarations['max-width']).toBe(
      'none',
    );
  });
});
