import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PersonDot } from './PersonDot';

describe('PersonDot', () => {
  it('shows the initials on their colour, sized, with the full name as its tooltip', () => {
    const { container, rerender } = render(
      <PersonDot person={{ name: 'Ada Byron', initials: 'AB', color: '#2f5fa8' }} />,
    );
    const dot = container.querySelector('.tp-pdot');
    expect(dot).not.toBeNull();
    expect(dot).toHaveTextContent('AB');
    expect(dot).toHaveAttribute('title', 'Ada Byron');
    expect(dot).toHaveStyle({ width: '20px', height: '20px', backgroundColor: '#2f5fa8', fontSize: '8px' });

    rerender(<PersonDot person={{ name: 'Nobody' }} size={36} className="tp-x" />);
    expect(dot).toHaveTextContent('?');
    expect(dot).toHaveClass('tp-pdot', 'tp-x');
    expect(dot).toHaveStyle({ width: '36px', height: '36px', fontSize: '15px' });
    expect((dot as HTMLElement).style.background).toBe(''); // ink by default, from the stylesheet
  });
});
