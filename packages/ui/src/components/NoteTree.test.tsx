import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HOLD_MS, NoteTree, SPRING_MS, type NoteFolderItem } from './NoteTree';
import { ToastHost } from './Toast';

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

// Dragging rows: pointer events, with the page's hit-testing and boxes stubbed (jsdom has no layout).
const rowOf = (kind: 'note' | 'folder', id: string) =>
  document.querySelector<HTMLElement>(`[data-nb-kind="${kind}"][data-nb-id="${id}"]:not(.tp-nb-fempty)`)!;
const rootOf = () => document.querySelector<HTMLElement>('[data-nb-kind="root"]')!;
const ghost = () => document.querySelector('.tp-nb-ghost');
let under: Element | null = null;
function over(el: Element | null, box?: { top: number; height: number }) {
  under = el;
  if (el && box)
    el.getBoundingClientRect = () =>
      ({
        top: box.top,
        bottom: box.top + box.height,
        height: box.height,
        left: 0,
        right: 200,
        width: 200,
        x: 0,
        y: box.top,
      }) as DOMRect;
}
beforeEach(() => {
  under = null;
  document.elementFromPoint = () => under;
});
const press = (el: Element, pointerType = 'mouse', x = 10, y = 10) =>
  fireEvent.pointerDown(el, { pointerType, button: 0, clientX: x, clientY: y });
const to = (x: number, y: number) => fireEvent.pointerMove(document, { clientX: x, clientY: y });
const letGo = () => fireEvent.pointerUp(document);

describe('C22-U40 a mouse drag', () => {
  it('C22-U40 lifts after 4 px, not before, and drops a note into a folder', () => {
    const onMoveNote = vi.fn();
    setup({ onMoveNote });
    press(rowOf('note', 'sunday'));
    to(13, 10);
    expect(ghost()).toBeNull();
    to(15, 10);
    expect(ghost()).toHaveTextContent('Sunday scribbles');
    expect(rowOf('note', 'sunday')).toHaveClass('tp-nb-dragging');
    over(rowOf('folder', 'home'));
    to(20, 40);
    expect(rowOf('folder', 'home')).toHaveClass('tp-nb-drop-into');
    letGo();
    expect(onMoveNote).toHaveBeenCalledWith('sunday', 'home', undefined);
  });
});

describe('C22-U41 a click is still a click', () => {
  it('C22-U41 a click with no movement picks the note; the click after a drag does not', async () => {
    const { user, onPick } = setup({ onMoveNote: vi.fn() });
    await user.click(screen.getByRole('button', { name: /Gift ideas/ }));
    expect(onPick).toHaveBeenCalledTimes(1);
    press(rowOf('note', 'gifts'));
    to(30, 10);
    letGo();
    fireEvent.click(screen.getByRole('button', { name: /Gift ideas/ }));
    expect(onPick).toHaveBeenCalledTimes(1);
  });
});

describe('C22-U42 touch', () => {
  afterEach(() => vi.useRealTimers());
  it('C22-U42 a 380 ms hold lifts; moving 9 px first cancels and nothing moves', () => {
    vi.useFakeTimers();
    const onMoveNote = vi.fn();
    setup({ onMoveNote });
    press(rowOf('note', 'sunday'), 'touch');
    expect(rowOf('note', 'sunday')).toHaveClass('tp-nb-pressing');
    act(() => vi.advanceTimersByTime(HOLD_MS - 10));
    expect(ghost()).toBeNull();
    act(() => vi.advanceTimersByTime(20));
    expect(ghost()).toHaveClass('tp-nb-ghost-touch');
    over(rowOf('folder', 'home'));
    to(10, 60);
    letGo();
    expect(onMoveNote).toHaveBeenCalledWith('sunday', 'home', undefined);

    onMoveNote.mockClear();
    act(() => vi.advanceTimersByTime(1000));
    press(rowOf('note', 'sunday'), 'touch');
    to(10, 19);
    act(() => vi.advanceTimersByTime(HOLD_MS + 50));
    expect(ghost()).toBeNull();
    letGo();
    expect(onMoveNote).not.toHaveBeenCalled();
  });
});

describe('C22-U43 between notes', () => {
  it('C22-U43 the upper half drops before a note, the lower half after it', () => {
    const onMoveNote = vi.fn();
    setup({ onMoveNote });
    press(rowOf('note', 'gifts'));
    to(30, 10);
    over(rowOf('note', 'interviews'), { top: 100, height: 20 });
    to(30, 104);
    expect(rowOf('note', 'interviews')).toHaveClass('tp-nb-drop-before');
    letGo();
    expect(onMoveNote).toHaveBeenLastCalledWith('gifts', 'nw', 0);

    press(rowOf('note', 'gifts'));
    to(30, 30);
    over(rowOf('note', 'interviews'), { top: 100, height: 20 });
    to(30, 116);
    letGo();
    expect(onMoveNote).toHaveBeenLastCalledWith('gifts', 'nw', 1);
  });
});

describe('C22-U44 letting go of nothing', () => {
  it('C22-U44 Esc and a drop on nothing move nothing, and the card goes', async () => {
    const onMoveNote = vi.fn();
    setup({ onMoveNote });
    press(rowOf('note', 'sunday'));
    to(30, 10);
    over(rowOf('folder', 'home'));
    to(30, 40);
    fireEvent.keyDown(document, { key: 'Escape' });
    press(rowOf('note', 'sunday'));
    to(30, 10);
    over(null);
    to(500, 900);
    letGo();
    expect(onMoveNote).not.toHaveBeenCalled();
    await waitFor(() => expect(ghost()).toBeNull());
  });
});

describe('C22-U45 too deep', () => {
  it('C22-U45 a folder over a third-level folder says Too deep and is refused with a toast', () => {
    const onMoveFolder = vi.fn();
    setup({ onMoveFolder });
    const toasts = render(<ToastHost />);
    press(rowOf('folder', 'home'));
    to(30, 10);
    over(rowOf('folder', 'off'));
    to(30, 80);
    expect(within(rowOf('folder', 'off')).getByText('Too deep')).toBeInTheDocument();
    letGo();
    expect(onMoveFolder).not.toHaveBeenCalled();
    expect(document.querySelector('.tp-toast')).toHaveTextContent('Folders go three levels deep.');
    toasts.unmount();
  });
});

describe('C22-U46 spring-open', () => {
  afterEach(() => vi.useRealTimers());
  it('C22-U46 holding over a closed folder opens it', () => {
    vi.useFakeTimers();
    setup({ onMoveNote: vi.fn() });
    expect(screen.queryByText('Gift ideas')).toBeNull();
    press(rowOf('note', 'sunday'));
    to(30, 10);
    over(rowOf('folder', 'home'));
    to(30, 40);
    act(() => vi.advanceTimersByTime(SPRING_MS - 50));
    expect(screen.queryByText('Gift ideas')).toBeNull();
    act(() => vi.advanceTimersByTime(100));
    expect(screen.getByText('Gift ideas')).toBeInTheDocument();
  });
});

describe('C22-U47 notes in no folder', () => {
  it('C22-U47 have no heading and sit after a hairline, only when there are folders', () => {
    setup();
    expect(screen.queryByText(/Not in a folder|Unfiled/)).toBeNull();
    expect(document.querySelector('.tp-nb-loose-sep')).not.toBeNull();
    cleanup();
    render(<NoteTree folders={[]} notes={LOOSE} />);
    expect(document.querySelector('.tp-nb-loose-sep')).toBeNull();
  });

  it('C22-U47 with none there, dragging a filed note offers the top level, and dropping there unfiles it', () => {
    const onMoveNote = vi.fn();
    render(<NoteTree folders={FOLDERS} notes={[]} defaultOpen={{ home: true }} onMoveNote={onMoveNote} />);
    expect(screen.queryByText('Drop here to take it out of its folder')).toBeNull();
    press(rowOf('note', 'gifts'));
    to(30, 10);
    expect(screen.getByText('Drop here to take it out of its folder')).toBeInTheDocument();
    over(rootOf());
    to(30, 200);
    letGo();
    expect(onMoveNote).toHaveBeenCalledWith('gifts', null, undefined);
  });
});

describe('C22-U48 while finding', () => {
  it('C22-U48 rows do not lift while Find a note narrows the tree', async () => {
    const { user } = setup({ onMoveNote: vi.fn() });
    await user.type(screen.getByPlaceholderText('Find a note'), 'gift');
    press(rowOf('note', 'gifts'));
    to(40, 10);
    expect(ghost()).toBeNull();
  });
});
