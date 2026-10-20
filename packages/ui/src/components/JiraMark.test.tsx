import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { JiraMark } from './JiraMark';

describe('JiraMark', () => {
  it('draws the two-tone mark at the given height, decorative unless it is labelled', () => {
    const { container, rerender } = render(<JiraMark size={28} className="tp-nav-jd" />);
    const svg = container.querySelector('svg.tp-jm');
    expect(svg).not.toBeNull();
    expect(svg).toHaveClass('tp-nav-jd');
    expect(svg).toHaveAttribute('height', '28');
    expect(Number(svg!.getAttribute('width'))).toBeCloseTo((28 * 214.09) / 224, 3);
    expect(svg).toHaveAttribute('viewBox', '2.59 0 214.09101008 224');
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg).toHaveAttribute('focusable', 'false');
    expect(svg).not.toHaveAttribute('role');
    const paths = svg!.querySelectorAll('path');
    expect(paths).toHaveLength(3);
    expect(paths[0]).toHaveAttribute('fill', '#2684ff');

    rerender(<JiraMark label="Jira" />);
    const named = screen.getByRole('img', { name: 'Jira' });
    expect(named).toHaveAttribute('height', '14');
    expect(named).not.toHaveAttribute('aria-hidden');
  });

  it('gives every copy its own gradient ids, so many can share a page', () => {
    const { container } = render(
      <>
        <JiraMark />
        <JiraMark size={18} />
      </>,
    );
    const ids = Array.from(container.querySelectorAll('linearGradient')).map((g) => g.id);
    expect(ids).toHaveLength(4);
    expect(new Set(ids).size).toBe(4);
    for (const svg of Array.from(container.querySelectorAll('svg'))) {
      const [a, b] = Array.from(svg.querySelectorAll('linearGradient')).map((g) => g.id);
      expect(a).toMatch(/^tp-jm[a-zA-Z0-9]+a$/);
      expect(b).toMatch(/^tp-jm[a-zA-Z0-9]+b$/);
      const fills = Array.from(svg.querySelectorAll('path')).map((p) => p.getAttribute('fill'));
      expect(fills).toEqual(['#2684ff', `url(#${a})`, `url(#${b})`]);
      const stops = Array.from(svg.querySelectorAll('stop')).map((s) => s.getAttribute('stop-color'));
      expect(stops).toEqual(['#0052cc', '#2684ff', '#0052cc', '#2684ff']);
    }
  });
});
