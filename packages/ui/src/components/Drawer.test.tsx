import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState, type ReactNode } from 'react';
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

    // Focus moves out without a press (a press outside closes it: C00-U37).
    screen.getByRole('button', { name: 'Outside' }).focus();
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

  it('C00-U32 focus moves into the panel when it opens and returns to the opener when it closes', async () => {
    function Page() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Open task
          </button>
          <Drawer open={open} onClose={() => setOpen(false)} label="Task">
            <button type="button">Inside</button>
          </Drawer>
        </>
      );
    }
    const user = userEvent.setup();
    render(<Page />);
    const opener = screen.getByRole('button', { name: 'Open task' });

    await user.click(opener);
    expect(screen.getByRole('dialog', { name: 'Task' })).toHaveFocus();

    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(opener).toHaveFocus());
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

  describe('C00-U37 a modeless drawer closes on a press outside it', () => {
    function outside(extra: Partial<DrawerProps> = {}, inside?: ReactNode) {
      const user = userEvent.setup();
      const onClose = vi.fn();
      render(
        <div>
          <button type="button">Outside</button>
          <button type="button" className="tp-jirabtn">
            Jira
          </button>
          <button type="button" data-nav="app:Jira">
            Jira row
          </button>
          <button type="button" data-nav="today">
            Today
          </button>
          <div className="tp-toast-host">
            <button type="button">Undo</button>
          </div>
          <div className="tp-nb-float">
            <button type="button">Note</button>
          </div>
          <Drawer open onClose={onClose} label="Jira" modal={false} {...extra}>
            <button type="button">Inside</button>
            {inside}
          </Drawer>
        </div>,
      );
      return { user, onClose, press: (name: string) => user.click(screen.getByRole('button', { name })) };
    }

    it('a press on the page closes it; one inside does not', async () => {
      const { onClose, press } = outside();
      await press('Inside');
      expect(onClose).not.toHaveBeenCalled();
      await press('Outside');
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('another sidebar row is outside', async () => {
      const { onClose, press } = outside();
      await press('Today');
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('not outside: a toast, the floating note, and the two Jira toggles', async () => {
      const { onClose, press } = outside();
      for (const name of ['Undo', 'Note', 'Jira', 'Jira row']) await press(name);
      expect(onClose).not.toHaveBeenCalled();
    });

    it('a panel holding [data-keep-open] stays', async () => {
      const { onClose, press } = outside({}, <form data-keep-open="" aria-label="Checking" />);
      await press('Outside');
      expect(onClose).not.toHaveBeenCalled();
    });

    it('focus moving away without a press does not close it', async () => {
      const { user, onClose } = outside();
      await user.click(screen.getByRole('button', { name: 'Inside' }));
      await user.tab({ shift: true });
      screen.getByRole('button', { name: 'Outside' }).focus();
      expect(onClose).not.toHaveBeenCalled();
    });

    it('closeOnOutside={false} keeps it open', async () => {
      const { onClose, press } = outside({ closeOnOutside: false });
      await press('Outside');
      expect(onClose).not.toHaveBeenCalled();
    });

    it('a modal drawer is unchanged: only its veil closes it', async () => {
      const { user, onClose, veil } = setup();
      await user.click(veil() as HTMLElement);
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });
});
