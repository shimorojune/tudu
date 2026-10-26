import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { declarationsFor, parseRules, readStylesheet } from '../test-utils/stylesheet';
import { SpaceTile } from './SpaceTile';

const rules = parseRules(readStylesheet('components.css'));

describe('SpaceTile', () => {
  it('is a rounded square with the first letter on the colour; a label names it', () => {
    const { container, rerender } = render(
      <SpaceTile space={{ name: 'Northwind', color: '#2f5fa8' }} size={40} />,
    );
    const tile = container.querySelector('.tp-stile');
    expect(tile).not.toBeNull();
    expect(tile).toHaveTextContent('N');
    expect(tile).not.toHaveClass('tp-stile-me');
    expect(tile).toHaveAttribute('aria-hidden', 'true');
    expect(tile).not.toHaveAttribute('role');
    // the corner radius is 30% of the size, so it reads as a space, never as a person
    expect(tile).toHaveStyle({
      width: '40px',
      height: '40px',
      borderRadius: '12px',
      backgroundColor: '#2f5fa8',
      fontSize: '18px',
    });

    rerender(<SpaceTile space={{ name: 'Northwind', initials: 'NW', color: '#2f5fa8' }} label="Northwind" />);
    const named = screen.getByRole('img', { name: 'Northwind' });
    expect(named).toHaveTextContent('NW');
    expect(named).not.toHaveAttribute('aria-hidden');
    expect(named).toHaveStyle({ width: '36px', borderRadius: '11px' });
  });

  it('personal is a paper tile with a person icon', () => {
    const { container } = render(<SpaceTile space={{ name: 'Personal', personal: true }} size={40} />);
    const tile = container.querySelector('.tp-stile');
    expect(tile).toHaveClass('tp-stile-me');
    expect(tile!.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    expect(tile!.querySelector('svg')).toHaveAttribute('width', '20');
    expect(tile).not.toHaveTextContent('P');
    expect((tile as HTMLElement).style.background).toBe('');
    expect(tile).toHaveStyle({ fontSize: '14px' });
  });

  it('C21-U12 All spaces is the ink tile with stacked sheets; initials are centred SVG text; Personal small grows its icon', () => {
    const { container, rerender } = render(<SpaceTile space={{ all: true, name: 'All spaces' }} size={28} />);
    const tile = container.querySelector('.tp-stile') as HTMLElement;
    expect(tile).toHaveClass('tp-stile-all');
    expect(tile.style.background).toBe('');
    // lucide Layers, sized to whole pixels: 28 - 2 * round(28 * .22)
    expect(tile.querySelector('svg')).toHaveAttribute('width', '16');
    // light: the softer ink on card; dark keeps the cream tile
    expect(declarationsFor(rules, tile)).toMatchObject({
      background: 'var(--foreground-2)',
      color: 'var(--card)',
    });
    const dark = document.createElement('div');
    dark.className = 'dark';
    dark.appendChild(tile.cloneNode(true));
    expect(declarationsFor(rules, dark.firstElementChild!)).toMatchObject({
      background: 'var(--foreground)',
      color: 'var(--background)',
    });

    rerender(<SpaceTile space={{ name: 'Pilot Farm', initials: 'PF', color: '#5b7553' }} size={28} />);
    const text = container.querySelector('.tp-stile-txt text')!;
    expect(text).toHaveTextContent('PF');
    expect(text).toHaveAttribute('x', '50%');
    expect(text).toHaveAttribute('y', '50%');
    expect(text).toHaveAttribute('dy', '.355em');
    expect(text).toHaveAttribute('text-anchor', 'middle');

    rerender(<SpaceTile space={{ name: 'Personal', personal: true }} size={13} />);
    const icon = container.querySelector('.tp-stile svg')!;
    expect(icon).toHaveAttribute('width', '9');
    expect(icon).toHaveAttribute('stroke-width', '2.4');
  });

  it('STB-U01 the personal and all icons fill the tile height, so a small tile hangs off the text baseline', () => {
    for (const space of [
      { name: 'Personal', personal: true },
      { name: 'All spaces', all: true },
    ]) {
      const { container, unmount } = render(<SpaceTile space={space} size={14} />);
      const icon = container.querySelector('.tp-stile > svg')!;
      expect(icon).not.toBeNull();
      expect(declarationsFor(rules, icon)).toMatchObject({ height: '100%' });
      unmount();
    }
  });
});
