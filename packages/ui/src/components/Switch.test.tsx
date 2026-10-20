import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Switch } from './Switch';

describe('Switch', () => {
  it('C00-U23 toggles by click and keyboard', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Switch label="Dark mode" onChange={onChange} />);
    const sw = screen.getByRole('switch', { name: 'Dark mode' });
    expect(sw).toHaveAttribute('aria-checked', 'false');
    expect(sw).not.toHaveClass('tp-on');

    await user.click(sw);
    expect(sw).toHaveAttribute('aria-checked', 'true');
    expect(sw).toHaveClass('tp-on');
    expect(onChange).toHaveBeenLastCalledWith(true);

    expect(sw).toHaveFocus();
    await user.keyboard(' ');
    expect(sw).toHaveAttribute('aria-checked', 'false');
    expect(sw).not.toHaveClass('tp-on');
    expect(onChange).toHaveBeenLastCalledWith(false);

    await user.keyboard('{Enter}');
    expect(sw).toHaveAttribute('aria-checked', 'true');
    expect(onChange).toHaveBeenLastCalledWith(true);
    expect(onChange).toHaveBeenCalledTimes(3);

    // reachable with Tab
    sw.blur();
    await user.tab();
    expect(sw).toHaveFocus();
  });

  it('C00-U23 controlled and disabled', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { rerender } = render(<Switch label="Sync" checked={false} onChange={onChange} />);
    const sw = screen.getByRole('switch', { name: 'Sync' });
    await user.click(sw);
    expect(onChange).toHaveBeenCalledWith(true);
    expect(sw).toHaveAttribute('aria-checked', 'false'); // until the owner says so
    rerender(<Switch label="Sync" checked onChange={onChange} />);
    expect(sw).toHaveAttribute('aria-checked', 'true');

    rerender(<Switch label="Sync" checked disabled onChange={onChange} />);
    expect(sw).toBeDisabled();
    await user.click(sw);
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});
