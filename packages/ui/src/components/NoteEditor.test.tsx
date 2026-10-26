import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { NotebookFolder } from '@tudu/core';
import { NoteEditor, type NoteEditorNote } from './NoteEditor';

const FOLDERS: NotebookFolder[] = [
  { id: 'nw', parentId: null, name: 'Northwind', position: 1 },
  { id: 'plan', parentId: 'nw', name: 'Planning', position: 1 },
  { id: 'off', parentId: 'plan', name: 'Offsite', position: 1 },
];
const NOTE: NoteEditorNote = {
  id: 'interviews',
  title: 'Onboarding interview notes',
  html: '<p>Same thing came up four times.</p>',
  folderId: 'nw',
  path: ['Northwind'],
  linked: [
    {
      key: 't38',
      id: 'NW-38',
      title: 'Write up what we learned',
      space: { name: 'Northwind', color: '#3d5a80' },
    },
  ],
  edited: '1h',
  words: 6,
};

function setup(extra: Partial<Parameters<typeof NoteEditor>[0]> = {}) {
  const props = {
    onMove: vi.fn(),
    onDelete: vi.fn(),
    onLink: vi.fn(),
    onUnlink: vi.fn(),
    onMakeTask: vi.fn(),
    ...extra,
  };
  const r = render(
    <NoteEditor
      note={NOTE}
      folders={FOLDERS}
      tasks={[
        { key: 't38', id: 'NW-38', title: 'Write up what we learned' },
        { key: 't62', id: 'ME-62', title: 'Call the bank about the card' },
      ]}
      {...props}
    />,
  );
  return { user: userEvent.setup(), ...props, ...r };
}

describe('C22-U14 the note’s ⋯', () => {
  it('C22-U14 has Move and Delete only; Move picks a folder and calls onMove', async () => {
    const { user, onMove } = setup();
    await user.click(screen.getByRole('button', { name: 'More' }));
    const menu = screen.getByRole('menu', { name: 'Note options' });
    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map((i) => i.textContent),
    ).toEqual(['Move', 'Delete']);
    await user.click(within(menu).getByRole('menuitem', { name: 'Move' }));
    const picker = screen.getByRole('dialog', { name: 'Move to a folder' });
    const here = within(picker)
      .getAllByRole('option')
      .find((o) => o.textContent?.startsWith('Northwind'))!;
    expect(here).toHaveTextContent('Here');
    expect(here).toHaveAttribute('aria-disabled', 'true');
    await user.click(here);
    expect(onMove).not.toHaveBeenCalled();
    await user.click(within(picker).getByRole('option', { name: /Offsite/ }));
    expect(onMove).toHaveBeenCalledWith('off', 'Offsite');
  });

  it('C22-U14 Delete opens the confirmation and only calls onDelete after Delete', async () => {
    const { user, onDelete, container } = setup();
    await user.click(screen.getByRole('button', { name: 'More' }));
    await user.click(screen.getByRole('menuitem', { name: 'Delete' }));
    const dialog = await screen.findByRole('dialog', { name: 'Delete “Onboarding interview notes”?' });
    expect(dialog).toHaveTextContent('Its links to tasks come back with it.');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(onDelete).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await user.click(screen.getByRole('button', { name: 'More' }));
    await user.click(screen.getByRole('menuitem', { name: 'Delete' }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Delete' }));
    // The note leaves the page first.
    expect(container.querySelector('.tp-nb-ed')).toHaveClass('tp-nb-ed-going');
    await waitFor(() => expect(onDelete).toHaveBeenCalledTimes(1));
  });
});

function select(el: Node, from: number, to: number) {
  const range = document.createRange();
  range.setStart(el, from);
  range.setEnd(el, to);
  const sel = window.getSelection()!;
  sel.removeAllRanges();
  sel.addRange(range);
  act(() => {
    document.dispatchEvent(new Event('selectionchange'));
  });
}

describe('C22-U15 Make a task from words', () => {
  it('C22-U15 selecting words shows Make a task; it calls onMakeTask with the words', async () => {
    const { user, onMakeTask, container } = setup();
    const text = await waitFor(() => {
      const p = container.querySelector('.tp-rte-area p');
      expect(p?.firstChild).toBeTruthy();
      return p!.firstChild!;
    });
    select(text, 0, 15);
    await user.click(screen.getByRole('button', { name: 'Make a task' }));
    expect(onMakeTask).toHaveBeenCalledWith('Same thing came');
    expect(screen.queryByRole('button', { name: 'Make a task' })).toBeNull();
  });

  it('C22-U15 a selection outside the note shows nothing', () => {
    setup();
    const outside = document.createElement('p');
    outside.textContent = 'Somewhere else entirely';
    document.body.appendChild(outside);
    select(outside.firstChild!, 0, 9);
    expect(screen.queryByRole('button', { name: 'Make a task' })).toBeNull();
    outside.remove();
  });
});

const linkButton = (c: HTMLElement) => c.querySelector<HTMLElement>('.tp-nb-addlink')!;

describe('C22-U16 popovers', () => {
  it('C22-U16 a click off one, on the title or in the words, or Esc closes it; each leaves with the leaving class', async () => {
    const { user, container } = setup();
    await user.click(screen.getByRole('button', { name: 'More' }));
    expect(screen.getByRole('menu', { name: 'Note options' })).toBeInTheDocument();
    await user.click(screen.getByRole('textbox', { name: 'Note title' }));
    expect(container.querySelector('.tp-nb-pop')).toHaveClass('tp-nb-pop-leaving');
    await waitFor(() => expect(screen.queryByRole('menu', { name: 'Note options' })).toBeNull());

    await user.click(linkButton(container));
    expect(screen.getByRole('dialog', { name: 'Link a task' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(container.querySelector('.tp-nb-pop')).toHaveClass('tp-nb-pop-leaving');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Link a task' })).toBeNull());

    await user.click(screen.getByRole('button', { name: 'More' }));
    await user.click(screen.getByRole('menuitem', { name: 'Move' }));
    expect(screen.getByRole('dialog', { name: 'Move to a folder' })).toBeInTheDocument();
    // Opening Link closes Move.
    await user.click(linkButton(container));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Move to a folder' })).toBeNull());
    const link = screen.getByRole('dialog', { name: 'Link a task' });
    // Tasks already linked say so.
    expect(within(link).getByRole('option', { name: /NW-38/ })).toHaveTextContent('Linked');
    await user.click(container.querySelector('.tp-rte-area')!);
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Link a task' })).toBeNull());
  });
});
