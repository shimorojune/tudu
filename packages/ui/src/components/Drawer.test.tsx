import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Drawer, type DrawerProps } from './Drawer';

function setup(extra: Partial<DrawerProps> = {}) {
  const user = userEvent.setup();
  const onClose = vi.fn();
  const { container } = render(
    <div>
      <button type="button">Outside</button>
      <Drawer open onClose={onClose} label="Task" {...extra}>
        <button type="button">Inside</button>
      </Drawer>
    </div>,
  );
  return { user, onClose, container, veil: () => document.querySelector('.tp-drawer-veil') };
}

describe('Drawer', () => {
  it('C00-U32 modal: a veil, a dialog, focus inside; Escape closes it', async () => {
    const { user, onClose, veil } = setup();
    expect(veil()).not.toBeNull();
    const panel = screen.getByRole('dialog', { name: 'Task' });
    expect(panel).toHaveClass('tp-drawer', 'tp-sheet');
    expect(panel).toHaveFocus();
    expect(document.querySelector('.tp-drawer-wrap')).not.toHaveClass('tp-modeless', 'tp-full');

    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('C00-U32 modal: Escape in a field leaves the field first', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <Drawer open onClose={onClose} label="Task">
        <input aria-label="Notes" />
      </Drawer>,
    );
    const input = screen.getByRole('textbox', { name: 'Notes' });
    await user.click(input);
    expect(input).toHaveFocus();

    await user.keyboard('{Escape}');
    expect(input).not.toHaveFocus();
    expect(onClose).not.toHaveBeenCalled();

    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('C00-U32 modeless: no veil, and Escape closes only from inside the panel', async () => {
    const { user, onClose, veil } = setup({ modal: false });
    expect(veil()).toBeNull();
    expect(document.querySelector('.tp-drawer-wrap')).toHaveClass('tp-modeless');
    const panel = screen.getByRole('dialog', { name: 'Task' });
    expect(panel).toHaveFocus();

    await user.click(screen.getByRole('button', { name: 'Outside' }));
    expect(screen.getByRole('button', { name: 'Outside' })).toHaveFocus();
    expect(onClose).not.toHaveBeenCalled();
    await user.keyboard('{Escape}');
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'Task' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Inside' }));
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('C00-U32 fullscreen: no veil and the wrapper is the full page', () => {
    const { veil } = setup({ fullscreen: true });
    expect(veil()).toBeNull();
    expect(document.querySelector('.tp-drawer-wrap')).toHaveClass('tp-full');
    expect(document.querySelector('.tp-drawer-wrap')).not.toHaveClass('tp-modeless');
    expect(screen.getByRole('dialog', { name: 'Task' })).toHaveFocus();
  });

  it('C00-U32 width sets the panel width variable; closed renders nothing', () => {
    const { rerender, container } = render(
      <Drawer open label="Task" width={460}>
        Jira
      </Drawer>,
    );
    expect(screen.getByRole('dialog', { name: 'Task' })).toHaveStyle({ '--drawer-w': '460px' });
    rerender(
      <Drawer open={false} label="Task" width={460}>
        Jira
      </Drawer>,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
