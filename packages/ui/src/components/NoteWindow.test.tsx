import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { NoteWindow } from './NoteWindow';

const RECENT = [
  { id: 'agenda', title: 'Offsite agenda draft', where: 'Northwind / Planning / Offsite', edited: '4m' },
  { id: 'sunday', title: '', first: 'Sunday scribbles', where: 'Not in a folder', edited: 'Yesterday' },
];
const TREE = {
  folders: [
    {
      id: 'nw',
      name: 'Northwind',
      folders: [],
      notes: [{ id: 'interviews', title: 'Onboarding interview notes' }],
    },
  ],
  notes: [],
  defaultOpen: { nw: true },
};

describe('C22-U17 the note window', () => {
  it('C22-U17 opens on a blank note; Recent and All notes switch the rail', async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    const onNew = vi.fn();
    render(
      <NoteWindow active="new" recent={RECENT} tree={TREE} onPick={onPick} onNew={onNew}>
        <p>the note</p>
      </NoteWindow>,
    );
    const bar = screen.getByRole('banner');
    expect(bar).toHaveTextContent('New note');
    const list = screen.getByRole('listbox', { name: 'New note or a recent note' });
    expect(within(list).getByRole('option', { name: 'New note' })).toHaveAttribute('aria-selected', 'true');
    expect(within(list).getByRole('option', { name: /Sunday scribbles/ })).toBeInTheDocument();
    await user.click(within(list).getByRole('option', { name: /Offsite agenda draft/ }));
    expect(onPick).toHaveBeenCalledWith('agenda');
    await user.click(screen.getByRole('button', { name: 'All notes' }));
    expect(screen.queryByRole('listbox', { name: 'New note or a recent note' })).toBeNull();
    expect(screen.getByRole('searchbox', { name: 'Find a note' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Onboarding interview notes' }));
    expect(onPick).toHaveBeenLastCalledWith('interviews');
    // The rail can be hidden.
    await user.click(screen.getByRole('button', { name: 'Hide the list' }));
    expect(screen.getByRole('button', { name: 'Show your notes' })).toBeInTheDocument();
  });

  it('C22-U17 pin and fill the screen show only on the Mac; the Tudu mark on both', async () => {
    const user = userEvent.setup();
    const onPin = vi.fn();
    const onExpand = vi.fn();
    const { rerender, container } = render(
      <NoteWindow active="new" onPin={onPin} onExpand={onExpand} onOpenApp={() => {}} onClose={() => {}} />,
    );
    await user.click(screen.getByRole('button', { name: 'Keep on top of other windows' }));
    expect(onPin).toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Fill the screen' }));
    expect(onExpand).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Open in your Notebook' })).toBeInTheDocument();
    rerender(
      <NoteWindow active="new" pinned expanded onPin={onPin} onExpand={onExpand} onOpenApp={() => {}} />,
    );
    expect(screen.getByRole('button', { name: 'Pinned on top · click to unpin' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Back to its size' })).toBeInTheDocument();
    expect(container.querySelector('.tp-nb-win')).toHaveClass('tp-nb-pinned', 'tp-nb-max');

    rerender(<NoteWindow variant="web" active="new" onOpenApp={() => {}} onClose={() => {}} />);
    expect(screen.queryByRole('button', { name: /on top/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Fill the screen' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Open in your Notebook' })).toBeInTheDocument();
  });
});

describe('C22-U60 the note window resizes from every edge and corner', () => {
  const EDGES = ['n', 'e', 's', 'w', 'ne', 'nw', 'sw', 'se'];
  for (const variant of ['mac', 'web'] as const)
    it(`C22-U60 ${variant}: the grip and seven edge handles, each says its direction`, () => {
      const onResizeStart = vi.fn();
      const { container } = render(<NoteWindow variant={variant} active="new" onResizeStart={onResizeStart} />);
      expect(container.querySelector('.tp-nb-grip')).not.toBeNull();
      expect(container.querySelectorAll('.tp-nb-edge')).toHaveLength(7);
      for (const d of EDGES) {
        const h = container.querySelector(`[data-edge="${d}"]`)!;
        expect(h).toHaveAttribute('aria-hidden', 'true');
        fireEvent.pointerDown(h);
        expect(onResizeStart).toHaveBeenLastCalledWith(expect.anything(), d);
      }
      expect(onResizeStart).toHaveBeenCalledTimes(8);
    });

  it('C22-U60 no handles while it fills the screen, or without onResizeStart', () => {
    const { container, rerender } = render(<NoteWindow active="new" expanded onResizeStart={() => {}} />);
    expect(container.querySelector('[data-edge]')).toBeNull();
    rerender(<NoteWindow variant="web" active="new" />);
    expect(container.querySelector('[data-edge]')).toBeNull();
  });
});

describe('C22-U61 the browser note window', () => {
  it('C22-U61 the Tudu mark opens it in your Notebook (no ↗); the bar shows where to drag', () => {
    const onOpenApp = vi.fn();
    render(<NoteWindow variant="web" active="new" onOpenApp={onOpenApp} />);
    const open = screen.getByRole('button', { name: 'Open in your Notebook' });
    expect(open).toHaveClass('tp-nb-opentudu');
    expect(open.querySelector('.tp-logo')).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'Open in its own window' })).toBeNull();
    fireEvent.click(open);
    expect(onOpenApp).toHaveBeenCalledOnce();
    expect(screen.getByRole('banner').querySelector('.tp-nb-win-grab')).toHaveAttribute('aria-hidden', 'true');
  });
});
