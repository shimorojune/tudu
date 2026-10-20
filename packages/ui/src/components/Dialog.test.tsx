import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Dialog } from './Dialog';

function Page({ onClose }: { onClose: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open
      </button>
      <Dialog
        open={open}
        onClose={() => {
          onClose();
          setOpen(false);
        }}
        title="Create a space"
        sub="A short line under the title."
        footer={<button type="button">Create</button>}
      >
        <input aria-label="Name" />
      </Dialog>
    </>
  );
}

function setup() {
  const user = userEvent.setup();
  const onClose = vi.fn();
  render(<Page onClose={onClose} />);
  return { user, onClose, trigger: screen.getByRole('button', { name: 'Open' }) };
}

describe('Dialog', () => {
  it('C00-U15 opens as a dialog and moves focus inside it', async () => {
    const { user, trigger } = setup();
    expect(screen.queryByRole('dialog')).toBeNull();

    await user.click(trigger);
    const dialog = screen.getByRole('dialog', { name: 'Create a space' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(document.querySelector('.tp-dlg-veil')).not.toBeNull();
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
  });

  it('C00-U15 Escape closes it and focus returns to the trigger', async () => {
    const { user, onClose, trigger } = setup();
    await user.click(trigger);
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it('C00-U15 a click on the veil closes it', async () => {
    const { user, onClose, trigger } = setup();
    await user.click(trigger);

    await user.click(document.querySelector('.tp-dlg-veil')!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('C00-U15 Escape in a field leaves the field first; the next Escape closes', async () => {
    const { user, onClose, trigger } = setup();
    await user.click(trigger);
    const input = screen.getByRole('textbox', { name: 'Name' });
    await user.click(input);
    expect(input).toHaveFocus();

    await user.keyboard('{Escape}');
    expect(input).not.toHaveFocus();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
