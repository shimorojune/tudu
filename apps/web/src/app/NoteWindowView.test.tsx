import '@testing-library/jest-dom/vitest';
import { QueryClientProvider } from '@tanstack/react-query';
import type { NotebookResponse } from '@tudu/core';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastHost } from '@tudu/ui';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { leaveWindow, notebookStore, showInWindow } from './notebook';
import { NoteWindowView } from './NoteWindowView';
import { queryClient } from './session';

// The window's list and its handlers, without the editor behind them.
vi.mock('./noteEditing', () => ({ useNoteEditor: () => ({ loading: true, compact: true }) }));

const at = '2026-11-12T08:00:00Z';
const TREE: NotebookResponse = {
  folders: [
    { id: 'nw', parentId: null, name: 'Northwind', position: 1 },
    { id: 'home', parentId: null, name: 'Home', position: 2 },
  ],
  notes: [
    {
      id: 'interviews',
      folderId: 'nw',
      title: 'Interview notes',
      first: '',
      position: 1,
      updatedAt: at,
      links: 0,
    },
    { id: 'gifts', folderId: 'home', title: 'Gift ideas', first: '', position: 1, updatedAt: at, links: 0 },
    {
      id: 'sunday',
      folderId: null,
      title: 'Sunday scribbles',
      first: '',
      position: 1,
      updatedAt: at,
      links: 0,
    },
  ],
  trashCount: 0,
};

let tree: NotebookResponse;
let fail = false;
const row = (name: string) =>
  screen.getByRole('button', { name: new RegExp(`^${name}\\s*\\d*$`) }).parentElement!;

async function open(noteId: string | null = null) {
  showInWindow(noteId);
  const user = userEvent.setup();
  render(
    <QueryClientProvider client={queryClient}>
      <NoteWindowView variant="web" onClose={() => {}} openPath={() => {}} />
      <ToastHost />
    </QueryClientProvider>,
  );
  await user.click(screen.getByRole('button', { name: 'All notes' }));
  return user;
}

beforeEach(() => {
  queryClient.clear();
  tree = TREE;
  fail = false;
  vi.spyOn(notebookStore, 'treeQuery').mockImplementation(
    () =>
      ({
        queryKey: ['test-tree'],
        retry: false,
        queryFn: async () => {
          if (fail) throw new Error('offline');
          return tree;
        },
      }) as never,
  );
  vi.spyOn(notebookStore, 'recentQuery').mockReturnValue({
    queryKey: ['test-recent'],
    queryFn: async () => [],
  } as never);
  vi.spyOn(notebookStore, 'noteQuery').mockImplementation(
    (id: string) => ({ queryKey: ['test-note', id], queryFn: async () => null }) as never,
  );
  vi.spyOn(notebookStore, 'cachedTree').mockImplementation(() => tree);
  vi.spyOn(notebookStore, 'close').mockImplementation(() => {});
});
afterEach(() => {
  leaveWindow();
  cleanup();
  vi.restoreAllMocks();
});

describe('C22-U115 the note window’s All notes works on your Notebook', () => {
  it('C22-U115 New folder goes to the store; a name already used comes back as the line', async () => {
    const create = vi
      .spyOn(notebookStore, 'createFolder')
      .mockReturnValueOnce({ error: 'You already have a folder called Home.' })
      .mockReturnValue({ id: 'new' });
    const user = await open();
    await user.click(await screen.findByRole('button', { name: 'New note or folder' }));
    await user.click(screen.getByRole('menuitem', { name: 'New folder' }));
    const field = screen.getByRole('textbox', { name: 'Folder name' });
    await user.type(field, 'Home{Enter}');
    expect(create).toHaveBeenCalledWith(null, 'Home');
    expect(screen.getByRole('alert')).toHaveTextContent('You already have a folder called Home.');
    await user.type(field, ' two{Enter}');
    expect(create).toHaveBeenLastCalledWith(null, 'Home two');
    expect(screen.queryByRole('textbox', { name: 'Folder name' })).toBeNull();
  });

  it('C22-U115 New note in a folder opens a blank note filed there; Rename reaches the store', async () => {
    const draft = vi.spyOn(notebookStore, 'draft').mockReturnValue('d1');
    const rename = vi.spyOn(notebookStore, 'renameFolder').mockReturnValue(null);
    const user = await open('sunday');
    await user.click(
      within(await waitFor(() => row('Home'))).getByRole('button', { name: 'New note in Home' }),
    );
    expect(draft).toHaveBeenCalledWith({ linkTo: undefined, folderId: 'home' });
    await user.click(within(row('Home')).getByRole('button', { name: 'More' }));
    await user.click(screen.getByRole('menuitem', { name: 'Rename' }));
    const field = screen.getByRole('textbox', { name: 'Folder name' });
    await user.clear(field);
    await user.type(field, 'House{Enter}');
    expect(rename).toHaveBeenCalledWith('home', 'House');
  });

  it('C22-U115 notes that didn’t load say so; Try again reads them again', async () => {
    fail = true;
    const user = await open();
    expect(await screen.findByText('Your notes didn’t load.')).toBeInTheDocument();
    fail = false;
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('button', { name: /^Home/ })).toBeInTheDocument();
  });
});

describe('C22-U116 deleting a folder from the note window', () => {
  const remove = () =>
    vi.spyOn(notebookStore, 'deleteFolder').mockImplementation((id: string) => {
      tree = {
        ...tree,
        folders: tree.folders.filter((f) => f.id !== id),
        notes: tree.notes.filter((n) => n.folderId !== id),
      };
    });
  const deleteHome = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(within(await waitFor(() => row('Home'))).getByRole('button', { name: 'More' }));
    await user.click(screen.getByRole('menuitem', { name: 'Delete' }));
    const dialog = await screen.findByRole('dialog', { name: 'Delete “Home”?' });
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));
    // The dialog shows Deleted, then leaves; the page takes clicks again once it has.
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull(), { timeout: 4000 });
  };

  it('C22-U116 the toast names it and its notes, and Undo puts it back; a note elsewhere stays open', async () => {
    const del = remove();
    const restore = vi.spyOn(notebookStore, 'restoreFolder').mockImplementation(() => {});
    const draft = vi.spyOn(notebookStore, 'draft');
    const user = await open('sunday');
    await deleteHome(user);
    expect(del).toHaveBeenCalledWith('home');
    const toast = await screen.findByText('Moved “Home” and its note to Trash.');
    expect(draft).not.toHaveBeenCalled();
    await user.click(within(toast.parentElement!).getByRole('button', { name: 'Undo' }));
    expect(restore).toHaveBeenCalledWith('home');
  });

  it('C22-U116 when the open note went with it, the window shows a blank note', async () => {
    remove();
    const draft = vi.spyOn(notebookStore, 'draft').mockReturnValue('d2');
    const user = await open('gifts');
    await deleteHome(user);
    await waitFor(() => expect(draft).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('banner')).toHaveTextContent('New note');
  });
});

describe('C22-U117 a blank note made in a folder', () => {
  it('C22-U117 is drafted in that folder, and still goes away if you leave it untouched', () => {
    const draft = vi.spyOn(notebookStore, 'draft').mockReturnValue('d3');
    const close = vi.spyOn(notebookStore, 'close').mockImplementation(() => {});
    showInWindow(null, undefined, 'nw');
    expect(draft).toHaveBeenCalledWith({ linkTo: undefined, folderId: 'nw' });
    leaveWindow();
    expect(close).toHaveBeenCalledWith('d3');
  });
});
