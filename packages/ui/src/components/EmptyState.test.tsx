import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { EmptyState } from './EmptyState';

describe('EmptyState', () => {
  it('C00-U31 shows the mark, the title, the body and one ink action', async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    const { container } = render(
      <EmptyState title="Nothing for today." action="New task" onAction={onAction}>
        Add something, or enjoy the quiet.
      </EmptyState>,
    );
    const root = container.querySelector('.tp-empty') as HTMLElement;
    expect(root).toHaveAttribute('data-tone', 'default');
    expect(root).not.toHaveClass('tp-empty-error');
    expect(root.querySelector('.tp-empty-mark .tp-logo-mark')).not.toBeNull(); // the logo is the mark
    expect(screen.getByText('Nothing for today.')).toHaveClass('tp-empty-t');
    expect(screen.getByText('Add something, or enjoy the quiet.')).toHaveClass('tp-empty-b');
    const button = screen.getByRole('button', { name: 'New task' });
    expect(button).toHaveClass('tp-btn-primary');
    expect(button.querySelector('svg')).not.toBeNull(); // the plus icon
    await user.click(button);
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it('C00-U31 error, plain, icon and no-mark variants', () => {
    const { container, rerender } = render(
      <EmptyState
        title="Jira is not answering."
        tone="error"
        action="Try again"
        loading
        loadingLabel="Trying"
      />,
    );
    const root = container.querySelector('.tp-empty') as HTMLElement;
    expect(root).toHaveClass('tp-empty-error');
    expect(root).toHaveAttribute('data-tone', 'error');
    expect(root.querySelector('.tp-empty-mark .tp-logo-mark')).toBeNull(); // the error icon replaces the logo
    expect(root.querySelector('.tp-empty-mark svg')).not.toBeNull();
    const button = screen.getByRole('button');
    expect(button).toHaveClass('tp-btn-secondary');
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button).toHaveTextContent('Trying');

    rerender(<EmptyState title="No tasks match." action="Show all projects" plain />);
    expect(screen.getByRole('button', { name: 'Show all projects' })).toHaveClass('tp-btn-secondary');
    expect(screen.getByRole('button').querySelector('svg')).toBeNull(); // a way back has no icon

    rerender(<EmptyState title="Inbox zero." icon="inbox" />);
    expect(root.querySelector('.tp-empty-icon svg')).not.toBeNull();
    expect(screen.queryByRole('button')).toBeNull();

    rerender(<EmptyState title="Quiet." mark={false} />);
    expect(root.querySelector('.tp-empty-mark')).toBeNull();
    expect(root.querySelector('.tp-empty-b')).toBeNull();
  });
});
