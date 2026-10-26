import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { NoteTree, type NoteFolderItem } from './NoteTree';

const note = (id: string, title: string, first = '') => ({ id, title, first });
const FOLDERS: NoteFolderItem[] = [
  {
    id: 'nw',
    name: 'Northwind',
    notes: [note('interviews', 'Onboarding interview notes')],
    folders: [
      {
        id: 'plan',
        name: 'Planning',
        notes: [note('braindump', 'Q4 planning braindump')],
        folders: [
          { id: 'off', name: 'Offsite', notes: [note('agenda', 'Offsite agenda draft')], folders: [] },
        ],
      },
    ],
  },
  { id: 'home', name: 'Home', notes: [note('gifts', 'Gift ideas')], folders: [] },
];
const LOOSE = [note('sunday', '', 'Sunday scribbles')];

function setup(extra: Partial<Parameters<typeof NoteTree>[0]> = {}) {
  const props = {
    onRenameFolder: vi.fn(() => null),
    onDeleteFolder: vi.fn(),
    onCreateFolder: vi.fn(() => null),
    onNewNote: vi.fn(),
    onPick: vi.fn(),
    ...extra,
  };
  render(
    <NoteTree
      folders={FOLDERS}
      notes={LOOSE}
      defaultOpen={{ nw: true, plan: true, off: true }}
      trashCount={3}
      {...props}
    />,
  );
  return { user: userEvent.setup(), ...props };
}

const folderRow = (name: string) =>
  screen.getByRole('button', { name: new RegExp(`^${name}\\s*\\d*$`) }).parentElement!;

describe('C22-U12 a folder row', () => {
  it('C22-U12 offers New folder above the third level only, and New note everywhere', () => {
    setup();
    expect(
      within(folderRow('Northwind')).getByRole('button', { name: 'New folder in Northwind' }),
    ).toBeInTheDocument();
    expect(
      within(folderRow('Planning')).getByRole('button', { name: 'New folder in Planning' }),
    ).toBeInTheDocument();
    const off = folderRow('Offsite');
    expect(within(off).queryByRole('button', { name: 'New folder in Offsite' })).toBeNull();
    expect(within(off).getByRole('button', { name: 'New note in Offsite' })).toBeInTheDocument();
  });

  it('C22-U12 ⋯ Rename edits in place: Enter saves, Esc keeps the old name', async () => {
    const { user, onRenameFolder } = setup();
    await user.click(within(folderRow('Home')).getByRole('button', { name: 'More' }));
    await user.click(screen.getByRole('menuitem', { name: 'Rename' }));
    const field = screen.getByRole('textbox', { name: 'Folder name' });
    expect(field).toHaveValue('Home');
    await user.clear(field);
    await user.type(field, 'House{Enter}');
    expect(onRenameFolder).toHaveBeenCalledWith(expect.objectContaining({ id: 'home' }), 'House');
    expect(screen.queryByRole('textbox', { name: 'Folder name' })).toBeNull();

    // A double-click on the name does the same; Esc goes back without a word.
    await user.dblClick(screen.getByRole('button', { name: /^Home/ }));
    const again = screen.getByRole('textbox', { name: 'Folder name' });
    await user.type(again, 'X{Escape}');
    expect(onRenameFolder).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: /^Home/ })).toBeInTheDocument();
  });

  it('C22-U12 a name another folder there has shows the line under the field and stays', async () => {
    const { user } = setup({ onRenameFolder: vi.fn(() => 'You already have a folder called Northwind.') });
    await user.dblClick(screen.getByRole('button', { name: /^Home/ }));
    const field = screen.getByRole('textbox', { name: 'Folder name' });
    await user.clear(field);
    await user.type(field, 'Northwind{Enter}');
    expect(screen.getByRole('alert')).toHaveTextContent('You already have a folder called Northwind.');
    expect(field).toHaveAttribute('aria-invalid', 'true');
  });

  it('C22-U12 Delete asks first and only then calls onDeleteFolder', async () => {
    const { user, onDeleteFolder } = setup();
    await user.click(within(folderRow('Northwind')).getByRole('button', { name: 'More' }));
    await user.click(screen.getByRole('menuitem', { name: 'Delete' }));
    const dialog = await screen.findByRole('dialog', { name: 'Delete “Northwind”?' });
    expect(dialog).toHaveTextContent('The folder and its 3 notes go to Trash for 30 days');
    expect(onDeleteFolder).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));
    expect(onDeleteFolder).toHaveBeenCalledWith(expect.objectContaining({ id: 'nw' }));
  });

  it('C22-U12 New folder names a folder in place', async () => {
    const { user, onCreateFolder } = setup();
    await user.click(within(folderRow('Northwind')).getByRole('button', { name: 'New folder in Northwind' }));
    await user.type(screen.getByRole('textbox', { name: 'Folder name' }), 'Hiring{Enter}');
    expect(onCreateFolder).toHaveBeenCalledWith('nw', 'Hiring');
  });
});

describe('C22-U13 Find a note', () => {
  it('C22-U13 narrows the tree and opens the folders holding a match', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: /^Home/ }));
    await user.type(screen.getByRole('searchbox', { name: 'Find a note' }), 'gift');
    expect(screen.getByRole('button', { name: 'Gift ideas' })).toBeVisible();
    expect(screen.getByRole('button', { name: /^Home/ })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.queryByRole('button', { name: 'Onboarding interview notes' })).toBeNull();
    // An untitled note is found by its first line.
    await user.clear(screen.getByRole('searchbox', { name: 'Find a note' }));
    await user.type(screen.getByRole('searchbox', { name: 'Find a note' }), 'sunday');
    expect(screen.getByRole('button', { name: 'Sunday scribbles' })).toBeInTheDocument();
  });

  it('C22-U13 no match says so', async () => {
    const { user } = setup();
    await user.type(screen.getByRole('searchbox', { name: 'Find a note' }), 'teapot');
    await waitFor(() =>
      expect(screen.getByText(/No note matches/)).toHaveTextContent('No note matches “teapot”.'),
    );
  });
});
