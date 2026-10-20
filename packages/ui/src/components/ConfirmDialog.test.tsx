import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfirmDialog, type ConfirmDialogProps } from './ConfirmDialog';

function setup(extra: Partial<ConfirmDialogProps> = {}) {
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  const onClose = vi.fn();
  const onConfirm = vi.fn(() => Promise.resolve());
  const onDone = vi.fn();
  render(
    <ConfirmDialog
      open
      onClose={onClose}
      onConfirm={onConfirm}
      onDone={onDone}
      title="Leave Northwind?"
      confirmLabel="Leave Northwind"
      {...extra}
    >
      You will lose access to its tasks.
    </ConfirmDialog>,
  );
  const confirm = screen.getByRole('button', { name: 'Leave Northwind' });
  const cancel = screen.getByRole('button', { name: 'Cancel' });
  return { user, onClose, onConfirm, onDone, confirm, cancel };
}

describe('ConfirmDialog', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('C00-U16 the ink button carries the action name; Cancel closes without confirming', async () => {
    const { user, onClose, onConfirm, confirm, cancel } = setup();
    expect(screen.getByRole('dialog', { name: 'Leave Northwind?' })).toBeInTheDocument();
    expect(confirm).toHaveClass('tp-btn-primary');
    expect(confirm).not.toHaveClass('tp-btn-danger');
    expect(confirm).toBeEnabled();

    await user.click(cancel);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('C00-U16 confirming runs the action, shows Done, then calls onDone 420ms later', async () => {
    let finish!: () => void;
    const slow = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    const { user, onClose, onDone, confirm } = setup({ onConfirm: slow, busyLabel: 'Leaving', doneLabel: 'Left' });

    await user.click(confirm);
    expect(slow).toHaveBeenCalledTimes(1);
    expect(confirm).toHaveAttribute('data-mode', 'busy');
    expect(confirm).toHaveTextContent('Leaving');

    await act(async () => finish());
    expect(confirm).toHaveAttribute('data-mode', 'done');
    expect(confirm).toHaveTextContent('Left');
    expect(onDone).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(419);
    });
    expect(onDone).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('C00-U16 without onDone, Done falls back to onClose', async () => {
    const { user, onClose, confirm } = setup({ onDone: undefined });
    await user.click(confirm);
    await act(async () => {});
    expect(confirm).toHaveAttribute('data-mode', 'done');
    act(() => {
      vi.advanceTimersByTime(420);
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('C00-U17 type-to-confirm enables the button only when the text matches exactly', async () => {
    const { user, onConfirm, confirm } = setup({ typeToConfirm: 'Northwind' });
    const input = screen.getByRole('textbox', { name: 'Type Northwind to confirm' });
    expect(confirm).toBeDisabled();

    await user.type(input, 'Northwin');
    expect(confirm).toBeDisabled();
    await user.type(input, 'd');
    expect(confirm).toBeEnabled();

    await user.clear(input);
    await user.type(input, 'northwind');
    expect(confirm).toBeDisabled();

    await user.clear(input);
    await user.type(input, '  Northwind ');
    expect(confirm).toBeEnabled();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('C00-U17 a wrong text cannot confirm, even with Enter; the right one can', async () => {
    const { user, onConfirm, confirm } = setup({ typeToConfirm: 'Northwind' });
    const input = screen.getByRole('textbox', { name: 'Type Northwind to confirm' });

    await user.type(input, 'North{Enter}');
    expect(onConfirm).not.toHaveBeenCalled();

    await user.type(input, 'wind{Enter}');
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(confirm).toHaveAttribute('data-mode', 'busy');
  });
});
