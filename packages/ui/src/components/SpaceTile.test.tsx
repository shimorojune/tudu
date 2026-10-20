import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SpaceTile } from './SpaceTile';

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
});
