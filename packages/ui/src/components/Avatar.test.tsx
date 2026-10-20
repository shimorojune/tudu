import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Avatar } from './Avatar';

describe('Avatar', () => {
  it('C00-U31 shows the initials, names the person and takes a colour and size', () => {
    const { rerender } = render(<Avatar initials="RR" name="Rohit Raj" />);
    const avatar = screen.getByRole('img', { name: 'Rohit Raj' });
    expect(avatar).toHaveTextContent('RR'); // the fallback is the initials: there is no picture
    expect(avatar).toHaveAttribute('title', 'Rohit Raj');
    expect(avatar).toHaveClass('tp-root', 'tp-avatar');
    expect(avatar).not.toHaveClass('tp-sm');
    expect(avatar.style.background).toBe(''); // ink by default, from the stylesheet

    rerender(<Avatar initials="AB" name="Ada Byron" color="#2f5fa8" size="sm" />);
    expect(avatar).toHaveTextContent('AB');
    expect(avatar).toHaveAccessibleName('Ada Byron');
    expect(avatar).toHaveClass('tp-sm');
    expect(avatar).toHaveStyle({ backgroundColor: '#2f5fa8' });
  });
});
