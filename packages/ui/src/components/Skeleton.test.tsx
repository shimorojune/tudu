import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Skeleton, TaskListSkeleton } from './Skeleton';

describe('Skeleton', () => {
  it('C00-U31 a bar takes its width and height and is hidden from screen readers', () => {
    const { container, rerender } = render(<Skeleton />);
    const bar = container.querySelector('.tp-skel') as HTMLElement;
    expect(bar).toHaveClass('tp-root', 'tp-skel');
    expect(bar).toHaveAttribute('aria-hidden', 'true');
    expect(bar.style.width).toBe('100%');
    expect(bar.style.height).toBe('12px');

    rerender(<Skeleton width={120} height={8} className="x" />);
    expect(bar.style.width).toBe('120px');
    expect(bar.style.height).toBe('8px');
    expect(bar).toHaveClass('x');

    rerender(<Skeleton width="40%" />);
    expect(bar.style.width).toBe('40%');
  });

  it('C00-U31 the task list skeleton is rows of bars and says it is loading', () => {
    const { container } = render(<TaskListSkeleton rows={3} compact />);
    const list = screen.getByLabelText('Loading tasks');
    expect(list).toHaveAttribute('aria-busy', 'true');
    expect(list).toHaveClass('tp-skl', 'tp-compact');
    expect(container.querySelectorAll('.tp-skl-row')).toHaveLength(3);
    expect(container.querySelectorAll('.tp-skl-row .tp-skl-box')).toHaveLength(3);
    expect(container.querySelectorAll('.tp-skl-lines .tp-skel')).toHaveLength(6);
  });
});
