import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { NoteWindow } from './NoteWindow';

const RECENT = [
  { id: 'agenda', title: 'Offsite agenda draft', where: 'Northwind / Planning / Offsite', edited: '4m' },
  { id: 'sunday', title: '', first: 'Sunday scribbles', where: 'Notebook', edited: 'Yesterday' },
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

  it('C22-U17 pin and fill the screen show only on the Mac; ↗ only on the web', async () => {
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
    expect(container.querySelector('.tp-nb-grip')).not.toBeNull();
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
    expect(screen.getByRole('button', { name: 'Open in its own window' })).toBeInTheDocument();
    expect(container.querySelector('.tp-nb-grip')).toBeNull();
  });
});
