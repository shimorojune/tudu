import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ICONS, Icon } from './icons';

describe('Icon', () => {
  it('C00-U31 draws the named Lucide icon at its size and stroke, hidden from screen readers', () => {
    const { container, rerender } = render(<Icon name="x" />);
    let svg = container.querySelector('svg') as SVGElement;
    expect(svg).toHaveAttribute('width', '16');
    expect(svg).toHaveAttribute('height', '16');
    expect(svg).toHaveAttribute('stroke-width', '2');
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg).toHaveAttribute('focusable', 'false');
    expect(svg.getAttribute('class')).toContain('lucide-x');

    rerender(<Icon name="error" size={13} stroke={2.2} className="tp-x" />);
    svg = container.querySelector('svg') as SVGElement; // another icon is another element
    expect(svg).toHaveAttribute('width', '13');
    expect(svg).toHaveAttribute('height', '13');
    expect(svg).toHaveAttribute('stroke-width', '2.2');
    expect(svg.getAttribute('class')).toContain('tp-x');
    expect(svg.getAttribute('class')).toContain('lucide-circle-alert');
  });

  it('C00-U31 the icon names the design system uses are all there', () => {
    for (const name of [
      'today',
      'week',
      'backlog',
      'inbox',
      'plus',
      'x',
      'more',
      'search',
      'error',
      'warning',
      'success',
      'refresh',
    ]) {
      expect(ICONS, name).toHaveProperty(name);
    }
    const { container } = render(
      <>
        {(Object.keys(ICONS) as Array<keyof typeof ICONS>).map((name) => (
          <Icon key={name} name={name} />
        ))}
      </>,
    );
    expect(container.querySelectorAll('svg')).toHaveLength(Object.keys(ICONS).length);
  });
});
