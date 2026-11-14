import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { rowMenuModel, type RowMenuContext } from '../lib/rowMenu';
import { RowMenu, RowSheet, ROW_MENU_LEAVE_MS } from './RowMenu';
import { TaskList, type TaskItem, type TaskListProps } from './TaskList';
import { ToastHost } from './Toast';

const TODAY = '2026-11-15';
const TASKS: TaskItem[] = [
  { key: 'a', id: 'ME-1', title: 'Pay the electricity bill' },
  { key: 'b', id: 'ME-2', title: 'Call Sam at 3pm', project: { name: 'Home', color: '#a60' } },
  { key: 'c', id: 'ME-3', title: 'Book car service', done: true },
];
const PROJECTS = [
  { id: 'p1', name: 'Northwind', color: '#2f5d8a' },
  { id: 'p2', name: 'Home', color: '#a60' },
];
const ALL: RowMenuContext['can'] = {
  open: true,
  toggle: true,
  move: true,
  due: true,
  project: true,
  link: true,
  delete: true,
};

function less(on: boolean) {
  if (on) document.documentElement.dataset.motion = 'less';
  else delete document.documentElement.dataset.motion;
}

beforeEach(() => less(true));
afterEach(() => {
  cleanup();
  less(false);
  vi.useRealTimers();
});

function menus() {
  return document.querySelectorAll('.tp-ctx:not(.tp-ctx-sub)');
}
function rowEl(title: string) {
  return screen.getByText(title).closest<HTMLElement>('[data-reorder]')!;
}
function rightClick(el: Element, x = 120, y = 140) {
  fireEvent.contextMenu(el, { clientX: x, clientY: y, button: 2 });
}

function Day(props: Partial<TaskListProps> & { initial?: TaskItem[]; log?: (s: string) => void }) {
  const [tasks, setTasks] = useState(props.initial ?? TASKS);
  const log = props.log ?? (() => {});
  return (
    <>
      <TaskList
        tasks={tasks}
        calendar={{ today: TODAY, selected: TODAY }}
        linkFor={(t) => (t.id ? `https://tudu.app/t/${t.id}` : undefined)}
        onToggleTask={(t, v) => {
          log(`toggle ${t.key} ${v}`);
          setTasks((l) => l.map((x) => (x.key === t.key ? { ...x, done: v } : x)));
        }}
        onMoveTask={(t, to) => {
          log(`move ${t.key} ${to}`);
          setTasks((l) => l.filter((x) => x.key !== t.key));
        }}
        onDueChange={(t, d) => log(`due ${t.key} ${d}`)}
        onOpenTask={(t) => log(`open ${t.key}`)}
        menu={{
          projects: () => PROJECTS,
          onSetProject: (t, id) => log(`project ${t.key} ${id}`),
          onDelete: (t) => {
            log(`delete ${t.key}`);
            setTasks((l) => l.filter((x) => x.key !== t.key));
          },
          onRestore: (t) => {
            log(`restore ${t.key}`);
            setTasks((l) => [t, ...l]);
          },
        }}
        {...props}
      />
      <ToastHost />
    </>
  );
}

describe('RowMenu', () => {
  it('RM-U04 opens at the point, flips at the window’s edges, and reads as a menu', () => {
    Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get: () => 232 });
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get: () => 300 });
    try {
      const entries = rowMenuModel(
        { id: 'ME-1' },
        { today: TODAY, day: TODAY, projects: PROJECTS, can: ALL },
      );
      const { unmount } = render(
        <RowMenu entries={entries} x={100} y={100} onPick={() => {}} onClose={() => {}} />,
      );
      const m = screen.getByRole('menu', { name: 'Task actions' });
      expect(m.style.left).toBe('102px');
      expect(m.style.top).toBe('102px');
      expect(m.style.transformOrigin).toBe('top left');
      expect(m.parentElement).toBe(document.body);
      unmount();
      render(
        <RowMenu
          entries={entries}
          x={window.innerWidth - 20}
          y={window.innerHeight - 20}
          onPick={() => {}}
          onClose={() => {}}
        />,
      );
      const f = screen.getByRole('menu', { name: 'Task actions' });
      expect(f.style.transformOrigin).toBe('bottom right');
      expect(parseFloat(f.style.left)).toBe(window.innerWidth - 20 - 232 - 2);
      // The ticks are radio items with their state.
      fireEvent.click(within(f).getByRole('menuitem', { name: /Move to/ }));
      const sub = screen.getByRole('menu', { name: 'Move to' });
      expect(within(sub).getByRole('menuitemradio', { name: 'Today' })).toHaveAttribute(
        'aria-checked',
        'true',
      );
      expect(within(sub).getByRole('menuitemradio', { name: 'Tomorrow' })).toHaveAttribute(
        'aria-checked',
        'false',
      );
    } finally {
      delete (HTMLElement.prototype as { offsetWidth?: number }).offsetWidth;
      delete (HTMLElement.prototype as { offsetHeight?: number }).offsetHeight;
    }
  });

  it('RM-U05 hover opens a submenu after a beat; the keyboard walks it; Esc closes', () => {
    vi.useFakeTimers();
    const onPick = vi.fn();
    const onClose = vi.fn();
    const entries = rowMenuModel({ id: 'ME-1' }, { today: TODAY, day: TODAY, projects: PROJECTS, can: ALL });
    // A browser refuses focus to a hidden element: the menu takes it only once it is placed and shown.
    const hiddenFocus: string[] = [];
    const real = HTMLElement.prototype.focus;
    HTMLElement.prototype.focus = function (this: HTMLElement, o?: FocusOptions) {
      if (this.closest<HTMLElement>('.tp-ctx')?.style.visibility === 'hidden')
        hiddenFocus.push(this.textContent ?? '');
      return real.call(this, o);
    };
    try {
      render(<RowMenu entries={entries} x={10} y={10} keyboard onPick={onPick} onClose={onClose} />);
    } finally {
      HTMLElement.prototype.focus = real;
    }
    expect(hiddenFocus).toEqual([]);
    const main = screen.getByRole('menu', { name: 'Task actions' });
    expect(document.activeElement).toHaveTextContent('Open');
    fireEvent.mouseEnter(within(main).getByRole('menuitem', { name: /Due date/ }));
    expect(screen.queryByRole('menu', { name: 'Due date' })).toBeNull();
    act(() => vi.advanceTimersByTime(60));
    expect(screen.getByRole('menu', { name: 'Due date' })).toBeInTheDocument();
    // Keys: down, down, down onto Move to, → opens it with its first item focused, ← goes back.
    fireEvent.keyDown(main, { key: 'ArrowDown' });
    fireEvent.keyDown(main, { key: 'ArrowDown' });
    expect(document.activeElement).toHaveTextContent('Move to');
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowRight' });
    const move = screen.getByRole('menu', { name: 'Move to' });
    expect(document.activeElement).toHaveTextContent('Today');
    fireEvent.keyDown(move, { key: 'ArrowDown' });
    expect(document.activeElement).toHaveTextContent('Tomorrow');
    fireEvent.click(document.activeElement!);
    expect(onClose).toHaveBeenCalledWith('pick');
    expect(onPick).toHaveBeenCalledWith({ k: 'move', to: '2026-11-16' });
  });

  it('RM-U06 closes on Esc, a left click outside, scroll, resize and blur; a right press alone leaves it', () => {
    const entries = rowMenuModel({}, { today: TODAY, day: TODAY, can: { open: true } });
    for (const go of [
      () => fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' }),
      () => fireEvent.pointerDown(document.body, { button: 0 }),
      () => fireEvent.scroll(window),
      () => fireEvent(window, new Event('resize')),
      () => fireEvent(window, new Event('blur')),
    ]) {
      const onClose = vi.fn();
      const { unmount } = render(
        <RowMenu entries={entries} x={0} y={0} onPick={() => {}} onClose={onClose} />,
      );
      fireEvent.pointerDown(document.body, { button: 2 });
      expect(onClose).not.toHaveBeenCalled();
      go();
      expect(onClose).toHaveBeenCalledTimes(1);
      unmount();
    }
  });
});

describe('TaskList row menu', () => {
  it('RM-U07 right-click opens it on the row; another row or the same row moves it', () => {
    render(<Day />);
    rightClick(rowEl('Pay the electricity bill'));
    expect(menus()).toHaveLength(1);
    expect(rowEl('Pay the electricity bill')).toHaveClass('tp-ctx-on');
    rightClick(rowEl('Call Sam at 3pm'), 300, 200);
    expect(menus()).toHaveLength(1);
    expect(rowEl('Pay the electricity bill')).not.toHaveClass('tp-ctx-on');
    expect(rowEl('Call Sam at 3pm')).toHaveClass('tp-ctx-on');
    expect(screen.getByRole('menu', { name: 'Actions for Call Sam at 3pm' })).toBeInTheDocument();
    rightClick(rowEl('Call Sam at 3pm'), 40, 220);
    expect(menus()).toHaveLength(1);
    expect((menus()[0] as HTMLElement).style.left).toBe('42px');
    // Shift+F10 opens it on the row with Open focused; the browser's own keyboard contextmenu after it keeps that one.
    const title = rowEl('Pay the electricity bill').querySelector<HTMLElement>('.tp-title > .tp-strike')!;
    fireEvent.keyDown(title, { key: 'F10', shiftKey: true });
    expect(screen.getByRole('menu', { name: 'Actions for Pay the electricity bill' })).toBeInTheDocument();
    expect(document.activeElement).toHaveTextContent('Open');
    fireEvent.contextMenu(title, { button: 0 });
    expect(menus()).toHaveLength(1);
    expect(document.activeElement).toHaveAttribute('role', 'menuitem');
    expect(document.activeElement).toHaveTextContent('Open');
  });

  it('RM-U08 a menu fading out never closes the one that replaced it', () => {
    less(false);
    vi.useFakeTimers();
    render(<Day />);
    rightClick(rowEl('Pay the electricity bill'));
    // A left click elsewhere starts the fade; a right-click on a row opens the next one meanwhile.
    fireEvent.pointerDown(document.body, { button: 0 });
    rightClick(rowEl('Call Sam at 3pm'));
    act(() => vi.advanceTimersByTime(ROW_MENU_LEAVE_MS * 3));
    expect(screen.getByRole('menu', { name: 'Actions for Call Sam at 3pm' })).toBeInTheDocument();
    expect(rowEl('Call Sam at 3pm')).toHaveClass('tp-ctx-on');
  });

  it('RM-U09 text being written and the paper keep the system menu; no `menu`, no Tudu menu', () => {
    const { unmount } = render(<Day addLabel="Write the next thing…" addKey={1} />);
    const input = screen.getByRole('textbox');
    const ev = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    input.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(false);
    expect(menus()).toHaveLength(0);
    const list = screen.getByRole('list');
    const ev2 = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    list.dispatchEvent(ev2);
    expect(ev2.defaultPrevented).toBe(false);
    unmount();
    render(<Day menu={undefined} />);
    const ev3 = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    rowEl('Book car service').dispatchEvent(ev3);
    expect(ev3.defaultPrevented).toBe(false);
    expect(menus()).toHaveLength(0);
  });

  it('RM-U10 each action reaches the list: open, done, move with Undo, due, project, delete with Undo', async () => {
    const log: string[] = [];
    render(<Day log={(s) => log.push(s)} />);
    const pick = (row: string, ...path: string[]) => {
      rightClick(rowEl(row));
      for (const name of path) {
        const items = document.querySelectorAll<HTMLElement>('.tp-ctx [role^="menuitem"]');
        const hit = Array.from(items).find((b) => b.querySelector('.tp-ctx-l')?.textContent === name)!;
        fireEvent.click(hit);
      }
    };
    pick('Pay the electricity bill', 'Open');
    pick('Pay the electricity bill', 'Mark as done');
    pick('Book car service', 'Mark as not done');
    pick('Call Sam at 3pm', 'Due date', 'Tomorrow');
    pick('Call Sam at 3pm', 'Project', 'Northwind');
    pick('Call Sam at 3pm', 'Project', 'No project');
    expect(log).toEqual([
      'open a',
      'toggle a true',
      'toggle c false',
      'due b 2026-11-16',
      'project b p1',
      'project b null',
    ]);
    pick('Call Sam at 3pm', 'Move to', 'Tomorrow');
    expect(log.at(-1)).toBe('move b 2026-11-16');
    expect(await screen.findByText(/Moved to tomorrow/i)).toBeInTheDocument();
    pick('Pay the electricity bill', 'Delete task');
    expect(log.at(-1)).toBe('delete a');
    expect(screen.queryByText('Pay the electricity bill')).toBeNull();
    expect(await screen.findByText('Task deleted')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(log.at(-1)).toBe('restore a');
    expect(screen.getByText('Pay the electricity bill')).toBeInTheDocument();
    // Where it is already: picking it does nothing.
    log.length = 0;
    pick('Book car service', 'Move to', 'Today');
    expect(log).toEqual([]);
  });

  it('RM-U11 Copy link and Copy task ID copy and say so; a refused copy says that', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<Day />);
    rightClick(rowEl('Call Sam at 3pm'));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Copy link' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('https://tudu.app/t/ME-2'));
    expect(await screen.findByText('Link copied')).toBeInTheDocument();
    rightClick(rowEl('Call Sam at 3pm'));
    fireEvent.click(screen.getByRole('menuitem', { name: /Copy task ID/ }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('ME-2'));
    expect(await screen.findByText('Copied ME-2')).toBeInTheDocument();
    writeText.mockRejectedValue(new Error('denied'));
    rightClick(rowEl('Call Sam at 3pm'));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Copy link' }));
    expect(await screen.findByText('Couldn’t copy the link. Try again.')).toBeInTheDocument();
  });

  it('RM-U12 Pick a day… and Pick a date… open the row’s own date picker', () => {
    render(<Day />);
    rightClick(rowEl('Call Sam at 3pm'));
    fireEvent.click(screen.getByRole('menuitem', { name: /Move to/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Pick a day…' }));
    expect(screen.getByRole('dialog', { name: 'Move it' })).toBeInTheDocument();
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    rightClick(rowEl('Call Sam at 3pm'));
    fireEvent.click(screen.getByRole('menuitem', { name: /Due date/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Pick a date…' }));
    expect(screen.getByRole('dialog', { name: 'Due date' })).toBeInTheDocument();
  });

  it('RM-U13 touch: hold, then let go without moving opens the sheet; moving first is a drag', () => {
    vi.useFakeTimers();
    render(<Day />);
    const row = rowEl('Call Sam at 3pm');
    const title = within(row).getByText('Call Sam at 3pm');
    const touch = (target: Element | Window, type: string, x: number, y: number) => {
      const ev = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 });
      Object.defineProperty(ev, 'pointerType', { value: 'touch' });
      act(() => {
        target.dispatchEvent(ev);
      });
    };
    // Moving 9px before the hold ends: no sheet.
    touch(title, 'pointerdown', 50, 50);
    touch(window, 'pointermove', 50, 59);
    act(() => vi.advanceTimersByTime(400));
    touch(window, 'pointerup', 50, 59);
    expect(screen.queryByRole('dialog', { name: /Task actions/ })).toBeNull();
    // Holding still, then letting go: the sheet.
    touch(title, 'pointerdown', 50, 50);
    act(() => vi.advanceTimersByTime(400));
    touch(window, 'pointerup', 50, 51);
    expect(screen.getByRole('dialog', { name: 'Task actions: Call Sam at 3pm' })).toBeInTheDocument();
    // The click after letting go is swallowed for a moment only.
    act(() => vi.advanceTimersByTime(100));
  });

  it('RM-U14 the sheet offers the menu’s actions; Project opens its page; the veil closes it', () => {
    const onPick = vi.fn();
    const onClose = vi.fn();
    const entries = rowMenuModel(
      { id: 'ME-2', project: { name: 'Home' } },
      { today: TODAY, day: TODAY, projects: PROJECTS, can: ALL },
    );
    render(
      <RowSheet
        entries={entries}
        title="Call Sam at 3pm"
        byline="ME-2 · Home"
        onPick={onPick}
        onClose={onClose}
      />,
    );
    const sheet = screen.getByRole('dialog', { name: 'Task actions: Call Sam at 3pm' });
    for (const name of ['Mark as done', 'Open', 'Copy link', 'Copy task ID', 'Delete task'])
      expect(within(sheet).getByRole('button', { name: new RegExp(name) })).toBeInTheDocument();
    expect(within(sheet).getByRole('button', { name: 'Today', pressed: true })).toBeDisabled();
    fireEvent.click(within(sheet).getByRole('button', { name: /^Project/ }));
    expect(sheet.querySelector('.tp-ctxs-track')).toHaveClass('tp-ctxs-on2');
    fireEvent.click(within(sheet).getByRole('button', { name: 'Northwind' }));
    expect(onClose).toHaveBeenCalled();
    expect(onPick).toHaveBeenCalledWith({ k: 'project', id: 'p1' });
    cleanup();
    const close2 = vi.fn();
    render(<RowSheet entries={entries} title="x" onPick={() => {}} onClose={close2} />);
    fireEvent.click(document.querySelector('.tp-sswsheet-veil')!);
    expect(close2).toHaveBeenCalled();
  });

  it('RM-U15 an empty list has no rows to open a menu on', () => {
    render(<Day initial={[]} />);
    const ev = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    screen.getByRole('list').dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(false);
    expect(menus()).toHaveLength(0);
  });
});
