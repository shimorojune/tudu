import { fireEvent, render, screen, within } from '@testing-library/react';
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
      const { container } = render(
        <NoteWindow variant={variant} active="new" onResizeStart={onResizeStart} />,
      );
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
    expect(screen.getByRole('banner').querySelector('.tp-nb-win-grab')).toHaveAttribute(
      'aria-hidden',
      'true',
    );
  });
});

describe('C22-U114 All notes in the note window makes and changes things', () => {
  const DEEP = {
    folders: [
      {
        id: 'nw',
        name: 'Northwind',
        notes: [{ id: 'interviews', title: 'Onboarding interview notes' }],
        folders: [
          {
            id: 'plan',
            name: 'Planning',
            notes: [],
            folders: [{ id: 'off', name: 'Offsite', notes: [], folders: [] }],
          },
        ],
      },
    ],
    notes: [],
    defaultOpen: { nw: true, plan: true },
  };
  const row = (name: string) =>
    screen.getByRole('button', { name: new RegExp(`^${name}\\s*\\d*$`) }).parentElement!;
  const open = async (extra: Partial<Parameters<typeof NoteWindow>[0]> = {}) => {
    const user = userEvent.setup();
    const on = {
      onNewNote: vi.fn(),
      onCreateFolder: vi.fn(() => null),
      onRenameFolder: vi.fn(() => null),
      onDeleteFolder: vi.fn(),
    };
    render(<NoteWindow active="new" recent={RECENT} tree={DEEP} {...on} {...extra} />);
    await user.click(screen.getByRole('button', { name: 'All notes' }));
    return { user, ...on };
  };

  it('C22-U114 a folder’s buttons reach the handlers with that folder', async () => {
    const { user, onNewNote, onCreateFolder, onRenameFolder, onDeleteFolder } = await open();
    await user.click(within(row('Northwind')).getByRole('button', { name: 'New note in Northwind' }));
    expect(onNewNote).toHaveBeenCalledWith(expect.objectContaining({ id: 'nw' }));
    await user.click(within(row('Northwind')).getByRole('button', { name: 'New folder in Northwind' }));
    await user.type(screen.getByRole('textbox', { name: 'Folder name' }), 'Hiring{Enter}');
    expect(onCreateFolder).toHaveBeenCalledWith('nw', 'Hiring');
    // The third level makes notes, not folders.
    expect(within(row('Offsite')).queryByRole('button', { name: 'New folder in Offsite' })).toBeNull();
    await user.click(within(row('Planning')).getByRole('button', { name: 'More' }));
    await user.click(screen.getByRole('menuitem', { name: 'Rename' }));
    const field = screen.getByRole('textbox', { name: 'Folder name' });
    await user.clear(field);
    await user.type(field, 'Plans{Enter}');
    expect(onRenameFolder).toHaveBeenCalledWith(expect.objectContaining({ id: 'plan' }), 'Plans');
    await user.click(within(row('Offsite')).getByRole('button', { name: 'More' }));
    await user.click(screen.getByRole('menuitem', { name: 'Delete' }));
    const dialog = await screen.findByRole('dialog', { name: 'Delete “Offsite”?' });
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));
    expect(onDeleteFolder).toHaveBeenCalledWith(expect.objectContaining({ id: 'off' }));
  });

  it('C22-U114 notes that didn’t load say so, and Try again asks again', async () => {
    const onTreeRetry = vi.fn();
    const { user } = await open({ treeError: true, onTreeRetry });
    expect(screen.getByRole('alert')).toHaveTextContent('Your notes didn’t load.');
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onTreeRetry).toHaveBeenCalledTimes(1);
  });

  it('C22-U17 without handlers All notes only opens notes: no New, no ⋯', async () => {
    const user = userEvent.setup();
    render(<NoteWindow active="new" recent={RECENT} tree={DEEP} onPick={() => {}} />);
    await user.click(screen.getByRole('button', { name: 'All notes' }));
    expect(screen.queryByRole('button', { name: 'New note or folder' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'More' })).toBeNull();
    expect(screen.queryByRole('button', { name: /^New (note|folder) in/ })).toBeNull();
  });
});
