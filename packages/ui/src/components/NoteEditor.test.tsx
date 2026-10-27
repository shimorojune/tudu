import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { NotebookFolder } from '@tudu/core';
import { readStylesheet } from '../test-utils/stylesheet';
import { NoteEditor, bubbleSpot, type NoteEditorNote } from './NoteEditor';

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

describe('C22-U24 Make a task opens New task, it makes nothing itself', () => {
  it('C22-U24 the selection is handed over as selected; no link, move or delete happens', async () => {
    const { user, onMakeTask, onLink, onMove, onDelete, container } = setup();
    const text = await waitFor(() => {
      const p = container.querySelector('.tp-rte-area p');
      expect(p?.firstChild).toBeTruthy();
      return p!.firstChild!;
    });
    select(text, 0, 21);
    const words = window.getSelection()!.toString().trim();
    await user.click(screen.getByRole('button', { name: 'Make a task' }));
    expect(onMakeTask).toHaveBeenCalledWith(words);
    expect(onLink).not.toHaveBeenCalled();
    expect(onMove).not.toHaveBeenCalled();
    expect(onDelete).not.toHaveBeenCalled();
  });

  it('C22-U24 the formatting bar sits at the foot of the note pane: the words fill it', () => {
    const css = readStylesheet('components.css').replace(/\s+/g, ' ');
    expect(css).toContain('.tp-nb-body { display: flex; flex-direction: column; }');
    expect(css).toContain('.tp-nb-body > .tp-rte-notes { flex: 1 0 auto; }');
    expect(css).toContain('.tp-nb-body .tp-rte-notes .tp-rte-area { flex: 1 0 auto; }');
  });
});

describe('C22-U31 the Make a task bubble sits on whole pixels', () => {
  it('C22-U31 centred on the selection, its foot on the line, rounded, and kept 8px inside the pane', () => {
    expect(bubbleSpot(200.5, 120.3, 117, 32, 600)).toEqual({ left: 142, top: 88 });
    // near the left or right edge, or the top, it stays 8px inside
    expect(bubbleSpot(20, 120, 117, 32, 600)).toEqual({ left: 8, top: 88 });
    expect(bubbleSpot(590.4, 120, 117, 32, 600)).toEqual({ left: 475, top: 88 });
    expect(bubbleSpot(300, 20, 117, 32, 600)).toEqual({ left: 242, top: 8 });
  });

  it('C22-U31 the shown bubble gets whole-pixel left and top before it paints', async () => {
    const width = vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(function (
      this: HTMLElement,
    ) {
      return this.classList.contains('tp-nb-bubble') ? 117 : 600;
    });
    const height = vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (
      this: HTMLElement,
    ) {
      return this.classList.contains('tp-nb-bubble') ? 32 : 400;
    });
    try {
      const { container } = setup();
      const text = await waitFor(() => {
        const p = container.querySelector('.tp-rte-area p');
        expect(p?.firstChild).toBeTruthy();
        return p!.firstChild!;
      });
      select(text, 0, 21);
      const bubble = container.querySelector<HTMLElement>('.tp-nb-bubble')!;
      expect(bubble).toBeTruthy();
      expect(bubble.style.left).toMatch(/^\d+px$/);
      expect(bubble.style.top).toMatch(/^\d+px$/);
    } finally {
      width.mockRestore();
      height.mockRestore();
    }
  });

  it('C22-U31 no half-width shift, and nothing stays transformed once it has risen', () => {
    const css = readStylesheet('components.css').replace(/\s+/g, ' ');
    const rule = css.match(/\.tp-nb-bubble \{[^}]*\}/)![0];
    expect(rule).not.toContain('translate(-50%');
    expect(rule).toContain('animation: tp-nb-bubble-in var(--dur-menu) var(--ease-arrive) backwards;');
    expect(css).toContain('@keyframes tp-nb-bubble-in { from { opacity: 0; transform: translateY(4px); } }');
  });
});

describe('C22-U49 a new note nobody has written in', () => {
  it('C22-U49 keeps ⋯ in place but hidden, out of reach, and shows the same one once it is kept', async () => {
    const { rerender } = setup({ note: { ...NOTE, draft: true } });
    const more = document.querySelector('.tp-nb-more')!;
    expect(more).toHaveClass('tp-nb-more-hide');
    expect(more).toHaveAttribute('aria-hidden', 'true');
    expect(more).toHaveAttribute('inert');
    // jsdom has no `inert`, so Tab can't be checked here; C22-E43 checks it is out of reach in a browser.
    expect(screen.queryByRole('button', { name: 'More' })).toBeNull();
    rerender(<NoteEditor note={{ ...NOTE, draft: false }} folders={FOLDERS} tasks={[]} />);
    // The same node, in the same spot: nothing beside it moves.
    expect(document.querySelector('.tp-nb-more')).toBe(more);
    expect(more).not.toHaveClass('tp-nb-more-hide');
    expect(more).not.toHaveAttribute('inert');
    expect(screen.getByRole('button', { name: 'More' })).toBeInTheDocument();
  });
});

describe('C22-U50 the crumb', () => {
  it('C22-U50 a note in no folder reads Notebook', () => {
    setup({ note: { ...NOTE, folderId: null, path: [] } });
    expect(document.querySelector('.tp-nb-crumb')).toHaveTextContent(/^Notebook$/);
  });
});
