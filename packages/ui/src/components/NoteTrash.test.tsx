import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { NoteTrash, type NoteTrashItem } from './NoteTrash';

const ITEMS: NoteTrashItem[] = [
  { id: 'gifts', kind: 'note', title: 'Gift ideas', where: 'Home', left: '29 days left' },
  {
    id: 'old',
    kind: 'folder',
    title: 'Old offsite ideas',
    where: 'Northwind',
    left: '12 days left',
    notes: 2,
  },
  { id: 'asdf', kind: 'note', title: '', first: 'asdf', where: null, left: '2 days left' },
];

const row = (name: string) => screen.getByText(name).closest('.tp-nb-trrow') as HTMLElement;

describe('C22-U19 Trash', () => {
  it('C22-U19 rows show where they came from and days left; Put back calls onRestore', async () => {
    const user = userEvent.setup();
    const onRestore = vi.fn();
    render(<NoteTrash items={ITEMS} onRestore={onRestore} />);
    expect(row('Gift ideas')).toHaveTextContent('From Home');
    expect(row('Gift ideas')).toHaveTextContent('29 days left');
    expect(row('Old offsite ideas')).toHaveTextContent('From Northwind · 2 notes');
    expect(row('asdf')).toHaveTextContent('Not in a folder');
    expect(screen.getByText(/4 notes · each one is deleted 30 days after you trash it/)).toBeInTheDocument();
    await user.click(within(row('Gift ideas')).getByRole('button', { name: 'Put back' }));
    await waitFor(() => expect(onRestore).toHaveBeenCalledWith(ITEMS[0]));
  });

  it('C22-U19 Delete now and Empty Trash ask first', async () => {
    const user = userEvent.setup();
    const onPurge = vi.fn();
    const onEmpty = vi.fn();
    render(<NoteTrash items={ITEMS} onPurge={onPurge} onEmpty={onEmpty} />);
    await user.click(within(row('Gift ideas')).getByRole('button', { name: 'Delete now' }));
    const ask = await screen.findByRole('dialog', { name: 'Delete “Gift ideas” now?' });
    expect(onPurge).not.toHaveBeenCalled();
    await user.click(within(ask).getByRole('button', { name: 'Delete now' }));
    await waitFor(() => expect(onPurge).toHaveBeenCalledWith(ITEMS[0]));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await user.click(screen.getByRole('button', { name: 'Empty Trash' }));
    const all = await screen.findByRole('dialog', { name: 'Empty Trash?' });
    expect(all).toHaveTextContent('All 4 notes in Trash go for good');
    expect(onEmpty).not.toHaveBeenCalled();
    await user.click(within(all).getByRole('button', { name: 'Empty Trash' }));
    expect(onEmpty).toHaveBeenCalled();
  });

  it('C22-U19 empty says Nothing in Trash.', () => {
    render(<NoteTrash items={[]} />);
    expect(screen.getByText('Nothing in Trash.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Empty Trash' })).toBeNull();
  });
});
