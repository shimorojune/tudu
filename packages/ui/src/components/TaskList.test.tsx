import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { stopFlight } from '../lib/reorder';
import { parseRules, readStylesheet, rulesWhere } from '../test-utils/stylesheet';
import { Chip } from './Chip';
import { SpaceFilter } from './SpaceFilter';
import { TaskList, type TaskItem, type TaskListProps } from './TaskList';
import { ToastHost } from './Toast';

const rules = parseRules(readStylesheet('components.css'));
const ROW = 52;

const THREE: TaskItem[] = [
  { key: 'a', id: 'ME-1', title: 'Pay the electricity bill' },
  { key: 'b', id: 'ME-2', title: 'Call Sam at 3pm' },
  { key: 'c', id: 'ME-3', title: 'Book car service' },
];

/** jsdom has no layout: give each row of each list a 52px slot, lists side by side 700px apart. */
function layout() {
  document.querySelectorAll<HTMLElement>('.tp-list').forEach((list, li) => {
    const left = li * 700;
    const rows = Array.from(list.children).filter((n) => n.hasAttribute('data-reorder')) as HTMLElement[];
    list.getBoundingClientRect = () => rect(left, 100, 600, Math.max(rows.length * ROW, 0));
    rows.forEach((row, i) => {
      row.getBoundingClientRect = () => rect(left, 100 + i * ROW, 600, ROW);
    });
  });
}
function rect(left: number, top: number, width: number, height: number): DOMRect {
  return {
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
    toJSON() {},
  } as DOMRect;
}

function pointer(target: Element | Window, type: string, x: number, y: number, pointerType = 'mouse') {
  const ev = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 });
  Object.defineProperty(ev, 'pointerType', { value: pointerType });
  Object.defineProperty(ev, 'pointerId', { value: 1 });
  act(() => {
    target.dispatchEvent(ev);
  });
}

/** A list that keeps its tasks in state, the way the day page does through the store. */
function Day(props: Partial<TaskListProps> & { initial?: TaskItem[] }) {
  const [tasks, setTasks] = useState(props.initial ?? THREE);
  const [flash, setFlash] = useState<string | undefined>(undefined);
  return (
    <TaskList
      addLabel="Write the next thing…"
      {...props}
      tasks={tasks}
      flashKey={flash}
      onReorder={(next, moved) => {
        setTasks(next);
        props.onReorder?.(next, moved);
      }}
      // The page opens Quick Add here; its task comes back the way Quick Add's does: last, through flashKey.
      onAddOpen={() => {
        const key = `new-${tasks.length}`;
        setTasks((l) => [...l, { key, title: 'Water the plants' }]);
        setFlash(key);
        props.onAddOpen?.();
      }}
    />
  );
}

/** A page whose store answers a task later, as React Query does (it batches with setTimeout); `refuse` never does. */
function LateDay(props: { refuse?: boolean; tick?: number }) {
  const [tasks, setTasks] = useState(THREE);
  return (
    <TaskList
      tasks={tasks}
      onReorder={(next) => {
        if (!props.refuse) setTimeout(() => setTasks(next), 0);
      }}
    />
  );
}

/** Drags "Pay the electricity bill" (first) down onto the third row and lets go there. */
function dropFirstOnThird() {
  pointer(screen.getByText('Pay the electricity bill'), 'pointerdown', 50, 120);
  pointer(window, 'pointermove', 50, 125);
  pointer(window, 'pointermove', 50, 120 + 2 * ROW + 10);
  pointer(window, 'pointerup', 50, 120 + 2 * ROW + 10);
}
const itemOf = (key: string) => document.querySelector<HTMLElement>(`.tp-item[data-key="${key}"]`)!;

const titles = () =>
  screen
    .getAllByRole('listitem')
    .map((li) => li.querySelector('.tp-strike')?.textContent)
    .filter(Boolean);

afterEach(() => {
  stopFlight();
  vi.useRealTimers();
  document.documentElement.classList.remove('tp-is-dragging');
  delete document.documentElement.dataset.motion;
});

/** Two days that trade rows through state, the way the pages do through the store. `refuse`: the move never lands. */
function TwoDays({ refuse }: { refuse?: boolean }) {
  const [sunday, setSunday] = useState(THREE);
  const [monday, setMonday] = useState<TaskItem[]>([{ key: 'd', title: 'Dentist at 4pm' }]);
  return (
    <>
      <TaskList tasks={sunday} group="days" label="Sunday" />
      <TaskList
        tasks={monday}
        group="days"
        label="Monday"
        onReceive={(key, at) => {
          const task = sunday.find((t) => t.key === key);
          if (refuse || !task) return;
          setSunday((l) => l.filter((t) => t.key !== key));
          setMonday((l) => [...l.slice(0, at), task, ...l.slice(at)]);
        }}
      />
    </>
  );
}

/** Drag a Sunday row (by its title, at its slot's y) onto the end of Monday and let go. */
function dropOnMonday(title = 'Call Sam at 3pm', y = 175) {
  pointer(screen.getByText(title), 'pointerdown', 50, y);
  pointer(window, 'pointermove', 60, y + 10);
  pointer(window, 'pointermove', 760, 100 + ROW + 10);
  pointer(window, 'pointerup', 760, 100 + ROW + 10);
}

const rowOf = (list: HTMLElement, key: string) => list.querySelector<HTMLElement>(`[data-key="${key}"]`);
const pass = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms);
  });

describe('TaskList', () => {
  it('C02-U07 renders the rows in order; Alt with an arrow key moves one and reports the new order', async () => {
    const user = userEvent.setup();
    const onReorder = vi.fn();
    render(<Day onReorder={onReorder} onOpenTask={() => {}} />);
    expect(screen.getByRole('list', { name: 'Tasks' })).toBeInTheDocument();
    expect(titles()).toEqual(['Pay the electricity bill', 'Call Sam at 3pm', 'Book car service']);
    screen.getByRole('button', { name: 'Pay the electricity bill' }).focus();
    await user.keyboard('{Alt>}{ArrowDown}{/Alt}');
    expect(onReorder).toHaveBeenLastCalledWith([THREE[1], THREE[0], THREE[2]], { key: 'a', from: 0, to: 1 });
    expect(titles()).toEqual(['Call Sam at 3pm', 'Pay the electricity bill', 'Book car service']);
    expect(screen.getByRole('button', { name: 'Pay the electricity bill' })).toHaveFocus();
    expect(screen.getByRole('status')).toHaveTextContent('Moved to place 2 of 3');
    await user.keyboard('{Alt>}{ArrowUp}{/Alt}');
    expect(titles()[0]).toBe('Pay the electricity bill');
  });

  it('C02-U08 a pointer drag starts after 4px, lifts the row, opens the gap, drops, and swallows the ending click', () => {
    const onReorder = vi.fn();
    const onOpenTask = vi.fn();
    const { container } = render(<Day onReorder={onReorder} onOpenTask={onOpenTask} />);
    layout();
    const first = screen.getByText('Pay the electricity bill');
    const item = first.closest('.tp-item')!;
    pointer(first, 'pointerdown', 50, 120);
    pointer(window, 'pointermove', 50, 123);
    expect(item).not.toHaveClass('tp-dragging'); // 3px: still a click
    pointer(window, 'pointermove', 50, 125);
    expect(item).toHaveClass('tp-dragging');
    expect(document.documentElement).toHaveClass('tp-is-dragging');
    // over the third row: the others glide up to open its gap
    pointer(window, 'pointermove', 50, 120 + 2 * ROW + 10);
    const rows = container.querySelectorAll<HTMLElement>('.tp-item');
    expect(rows[1]!.style.transform).toBe(`translateY(${-ROW}px)`);
    expect(rows[2]!.style.transform).toBe(`translateY(${-ROW}px)`);
    expect((item as HTMLElement).style.transform).toContain('rotate(-0.6deg)');
    pointer(window, 'pointerup', 50, 120 + 2 * ROW + 10);
    expect(onReorder).toHaveBeenCalledWith([THREE[1], THREE[2], THREE[0]], { key: 'a', from: 0, to: 2 });
    expect(document.documentElement).not.toHaveClass('tp-is-dragging');
    fireEvent.click(screen.getByText('Pay the electricity bill'));
    expect(onOpenTask).not.toHaveBeenCalled();
    // the lifted slip and the settle are the stylesheet's
    expect(
      rulesWhere(rules, (s) => s === '.tp-item.tp-dragging .tp-row')[0]!.declarations['box-shadow'],
    ).toBe('var(--shadow-pop)');
  });

  it('C02-U09 on touch a quick swipe does not lift a row; press and hold does', () => {
    vi.useFakeTimers();
    render(<Day />);
    layout();
    const title = screen.getByText('Call Sam at 3pm');
    const item = title.closest('.tp-item')!;
    pointer(title, 'pointerdown', 50, 175, 'touch');
    pointer(window, 'pointermove', 50, 190, 'touch');
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(item).not.toHaveClass('tp-dragging');
    pointer(window, 'pointerup', 50, 190, 'touch');

    pointer(title, 'pointerdown', 50, 175, 'touch');
    act(() => {
      vi.advanceTimersByTime(319);
    });
    expect(item).not.toHaveClass('tp-dragging');
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(item).toHaveClass('tp-dragging');
    pointer(window, 'pointerup', 50, 175, 'touch');
    // let the swallowed click after the drop pass
    act(() => {
      vi.advanceTimersByTime(100);
    });
  });

  it('NI-U02 the last line opens Quick Add; the task it makes arrives last with the wash; no handler, no line', async () => {
    const user = userEvent.setup();
    const onAddOpen = vi.fn();
    const { unmount } = render(<Day onAddOpen={onAddOpen} />);
    await user.click(screen.getByRole('button', { name: 'Write the next thing…' }));
    expect(onAddOpen).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(titles().at(-1)).toBe('Water the plants');
    expect(screen.getByText('Water the plants').closest('.tp-item')).toHaveClass('tp-new');
    expect(rulesWhere(rules, (s) => s === '.tp-item.tp-new .tp-row')[0]!.declarations.animation).toContain(
      'tp-row-wash 1200ms',
    );
    unmount();
    render(<TaskList tasks={THREE} addLabel="Write the next thing…" />);
    expect(screen.queryByRole('button', { name: 'Write the next thing…' })).toBeNull();
  });

  it('NI-U03 no slot to write between rows, on any list; a list that ends without the line has no rule under its last row', async () => {
    const user = userEvent.setup();
    const { container, unmount } = render(<Day />);
    await user.hover(screen.getByText('Call Sam at 3pm'));
    expect(screen.queryByRole('button', { name: 'Add a task here' })).toBeNull();
    expect(container.querySelector('.tp-ins, .tp-insrow')).toBeNull();
    expect(rulesWhere(rules, (s) => s.includes('.tp-ins'))).toHaveLength(0);
    unmount();
    const last = rulesWhere(rules, (s) => s.includes(':not(:has(> .tp-addtask))'))[0]!;
    expect(last.selector).toContain('.tp-item:last-child');
    expect(last.declarations['border-bottom-color']).toBe('transparent');
    // with the line the last row keeps its rule; without it the selector matches the last row
    const { container: withLine } = render(<Day />);
    expect(withLine.querySelector(':scope > .tp-root > .tp-addtask')).not.toBeNull();
    cleanup();
    const { container: bare } = render(<TaskList tasks={THREE} />);
    expect(
      bare.querySelector('.tp-root:not(:has(> .tp-addtask)) > .tp-list > .tp-item:last-child .tp-row'),
    ).not.toBeNull();
  });

  it('C02-U12 two lists in a group accept each other’s rows and report the move', () => {
    vi.useFakeTimers();
    const onReceive = vi.fn();
    render(
      <>
        <TaskList tasks={THREE} group="days" label="Sunday" />
        <TaskList
          tasks={[{ key: 'd', title: 'Dentist at 4pm' }]}
          group="days"
          label="Monday"
          onReceive={onReceive}
        />
      </>,
    );
    layout();
    const monday = screen.getByRole('list', { name: 'Monday' });
    const title = screen.getByText('Call Sam at 3pm');
    pointer(title, 'pointerdown', 50, 175);
    pointer(window, 'pointermove', 60, 185);
    expect(document.querySelector('.tp-drag-ghost')).not.toBeNull();
    // over Monday, below its one row: a faint wash and an ink line where it will land
    pointer(window, 'pointermove', 760, 100 + ROW + 10);
    expect(monday).toHaveClass('tp-drop-on');
    expect(monday.querySelector('.tp-drop-line')).not.toBeNull();
    pointer(window, 'pointerup', 760, 100 + ROW + 10);
    expect(onReceive).toHaveBeenCalledWith('b', 1);
    // the lifted copy outlives the drag while it glides in; the wash and the line fade
    expect(document.querySelector('.tp-drag-ghost')).toHaveClass('tp-flying');
    expect(monday).toHaveClass('tp-drop-off');
    pass(700);
    expect(monday).not.toHaveClass('tp-drop-on');
    expect(monday.querySelector('.tp-drop-line')).toBeNull();
    expect(document.querySelector('.tp-drag-ghost')).toBeNull();
  });

  it('C02-U29 a row dropped on another list: the lifted copy stays and flies, the move is reported once, the new row waits hidden under it', () => {
    vi.useFakeTimers();
    render(<TwoDays />);
    layout();
    dropOnMonday();
    const monday = screen.getByRole('list', { name: 'Monday' });
    const ghosts = document.querySelectorAll('.tp-drag-ghost');
    expect(ghosts).toHaveLength(1);
    expect(ghosts[0]).toHaveClass('tp-flying');
    // by attribute, not role: the hidden row is out of the accessibility tree until the copy lands
    expect([...monday.querySelectorAll('[data-reorder]')].map((li) => li.getAttribute('data-key'))).toEqual([
      'd',
      'b',
    ]);
    expect(rowOf(monday, 'b')!.style.visibility).toBe('hidden');
    expect(rowOf(screen.getByRole('list', { name: 'Sunday' }), 'b')).toBeNull();
    expect(document.documentElement).not.toHaveClass('tp-is-dragging');
  });

  it('C02-U30 after the glide the copy is gone, the row shows with the wash, and no row keeps an inline style from the move', () => {
    vi.useFakeTimers();
    render(<TwoDays />);
    layout();
    dropOnMonday();
    pass(400);
    const monday = screen.getByRole('list', { name: 'Monday' });
    expect(document.querySelector('.tp-drag-ghost')).toBeNull();
    expect(rowOf(monday, 'b')!.style.visibility).toBe('');
    expect(rowOf(monday, 'b')).toHaveClass('tp-dropped');
    for (const row of document.querySelectorAll<HTMLElement>('[data-reorder]')) {
      expect(row.style.transform).toBe('');
      expect(row.style.marginTop).toBe('');
      expect(row.style.visibility).toBe('');
    }
    for (const list of screen.getAllByRole('list')) expect(list.style.paddingBottom).toBe('');
  });

  it('C02-U31 the list it left folds its gap: the row that moved up starts one row lower and eases shut; rows above never move', () => {
    vi.useFakeTimers();
    render(<TwoDays />);
    layout();
    dropOnMonday();
    const sunday = screen.getByRole('list', { name: 'Sunday' });
    expect(rowOf(sunday, 'c')!.style.marginTop).toBe(`${ROW}px`);
    expect(rowOf(sunday, 'a')!.style.marginTop).toBe('');
    pass(120);
    const mid = parseFloat(rowOf(sunday, 'c')!.style.marginTop);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(ROW);
    expect(rowOf(sunday, 'a')!.style.marginTop).toBe('');
    pass(200);
    expect(rowOf(sunday, 'c')!.style.marginTop).toBe('');
  });

  it('C02-U32 when the last row leaves, the fold is on the list’s bottom edge, not on a row', () => {
    vi.useFakeTimers();
    render(<TwoDays />);
    layout();
    dropOnMonday('Book car service', 230);
    const sunday = screen.getByRole('list', { name: 'Sunday' });
    expect(sunday.style.paddingBottom).toBe(`${ROW}px`);
    for (const key of ['a', 'b']) expect(rowOf(sunday, key)!.style.marginTop).toBe('');
    pass(300);
    expect(sunday.style.paddingBottom).toBe('');
  });

  it('C02-U33 on a drop the ink line and the wash fade for 120ms; leaving the list mid-drag clears them at once', () => {
    vi.useFakeTimers();
    render(<TwoDays />);
    layout();
    const monday = screen.getByRole('list', { name: 'Monday' });
    // over Monday, then out between the two lists: gone at once
    pointer(screen.getByText('Call Sam at 3pm'), 'pointerdown', 50, 175);
    pointer(window, 'pointermove', 60, 185);
    pointer(window, 'pointermove', 760, 100 + ROW + 10);
    expect(monday).toHaveClass('tp-drop-on');
    pointer(window, 'pointermove', 650, 100 + ROW + 10);
    expect(monday).not.toHaveClass('tp-drop-on');
    expect(monday).not.toHaveClass('tp-drop-off');
    expect(monday.querySelector('.tp-drop-line')).toBeNull();
    // back over Monday and let go: they fade
    pointer(window, 'pointermove', 760, 100 + ROW + 10);
    pointer(window, 'pointerup', 760, 100 + ROW + 10);
    expect(monday).toHaveClass('tp-drop-on', 'tp-drop-off');
    expect(monday.querySelector('.tp-drop-line')).not.toBeNull();
    pass(119);
    expect(monday.querySelector('.tp-drop-line')).not.toBeNull();
    pass(2);
    expect(monday).not.toHaveClass('tp-drop-on');
    expect(monday).not.toHaveClass('tp-drop-off');
    expect(monday.querySelector('.tp-drop-line')).toBeNull();
    const fade = rulesWhere(rules, (sel) => sel.includes('.tp-drop-off'));
    expect(fade.length).toBeGreaterThan(0);
    for (const r of fade) expect(Object.values(r.declarations).join(' ')).toContain('120ms');
  });

  it('C02-U34 less motion: no flying copy and no fold; the row is in its new list at once, with the wash', () => {
    vi.useFakeTimers();
    document.documentElement.dataset.motion = 'less';
    render(<TwoDays />);
    layout();
    dropOnMonday();
    const monday = screen.getByRole('list', { name: 'Monday' });
    const sunday = screen.getByRole('list', { name: 'Sunday' });
    expect(document.querySelector('.tp-drag-ghost')).toBeNull();
    expect(monday).not.toHaveClass('tp-drop-on');
    expect(monday.querySelector('.tp-drop-line')).toBeNull();
    expect(rowOf(monday, 'b')!.style.visibility).toBe('');
    expect(rowOf(monday, 'b')).toHaveClass('tp-new');
    expect(rowOf(sunday, 'c')!.style.marginTop).toBe('');
  });

  it('C02-U35 a drag started during the glide lands the first row at once: one copy on the page, the row shown, the gap shut', () => {
    vi.useFakeTimers();
    render(<TwoDays />);
    layout();
    dropOnMonday();
    const monday = screen.getByRole('list', { name: 'Monday' });
    const sunday = screen.getByRole('list', { name: 'Sunday' });
    expect(rowOf(monday, 'b')!.style.visibility).toBe('hidden');
    pointer(screen.getByText('Pay the electricity bill'), 'pointerdown', 50, 125);
    pointer(window, 'pointermove', 60, 135);
    const ghosts = document.querySelectorAll('.tp-drag-ghost');
    expect(ghosts).toHaveLength(1);
    expect(ghosts[0]).not.toHaveClass('tp-flying');
    expect(ghosts[0]).toHaveTextContent('Pay the electricity bill');
    expect(rowOf(monday, 'b')!.style.visibility).toBe('');
    expect(rowOf(sunday, 'c')!.style.marginTop).toBe('');
    pointer(window, 'pointerup', 60, 135);
    fireEvent.click(document.body);
  });

  it('C02-U62 a drop holds every row where the drag left it until the page renders the new order, then settles', () => {
    vi.useFakeTimers();
    const { rerender } = render(<LateDay />);
    layout();
    dropFirstOnThird();
    // released, but the store has not answered: no frame shows the old order
    expect(titles()).toEqual(THREE.map((t) => t.title));
    expect(itemOf('a').style.transform).toBe(`translateY(${2 * ROW + 10}px)`);
    expect(itemOf('b').style.transform).toBe(`translateY(${-ROW}px)`);
    expect(itemOf('c').style.transform).toBe(`translateY(${-ROW}px)`);
    expect(itemOf('b')).toHaveClass('tp-shift');
    // a render that still has the old order leaves the hold alone
    rerender(<LateDay tick={1} />);
    expect(itemOf('a').style.transform).toBe(`translateY(${2 * ROW + 10}px)`);
    expect(itemOf('b').style.transform).toBe(`translateY(${-ROW}px)`);
    // the new order lands: the held rows let go in the same pass and the row settles from where it was let go
    act(() => {
      vi.advanceTimersByTime(0);
    });
    expect(titles()).toEqual([THREE[1]!.title, THREE[2]!.title, THREE[0]!.title]);
    expect(itemOf('b').style.transform).toBe('');
    expect(itemOf('c').style.transform).toBe('');
    expect(itemOf('b')).not.toHaveClass('tp-shift');
    expect(itemOf('a')).not.toHaveClass('tp-dragging');
    expect(itemOf('a')).toHaveClass('tp-settling');
  });

  it('C02-U63 a move the page never renders lets go after 400ms and the row glides back to its old slot', () => {
    vi.useFakeTimers();
    render(<LateDay refuse />);
    layout();
    dropFirstOnThird();
    act(() => {
      vi.advanceTimersByTime(399);
    });
    expect(itemOf('a').style.transform).toBe(`translateY(${2 * ROW + 10}px)`);
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(titles()).toEqual(THREE.map((t) => t.title));
    expect(itemOf('a').style.transform).toBe('');
    expect(itemOf('b').style.transform).toBe('');
    expect(itemOf('a')).toHaveClass('tp-settling');
  });

  it('C02-U64 a drag started during a hold ends the hold at once, so it measures settled rows', () => {
    vi.useFakeTimers();
    render(<LateDay refuse />);
    layout();
    dropFirstOnThird();
    expect(itemOf('a').style.transform).not.toBe('');
    act(() => {
      vi.advanceTimersByTime(100);
    });
    pointer(screen.getByText('Call Sam at 3pm'), 'pointerdown', 50, 120 + ROW + 10);
    pointer(window, 'pointermove', 50, 120 + ROW + 16);
    expect(itemOf('a').style.transform).toBe('');
    expect(itemOf('a')).not.toHaveClass('tp-dragging');
    expect(itemOf('a')).not.toHaveClass('tp-settling');
    expect(itemOf('c')).toHaveClass('tp-shift');
    expect(document.querySelectorAll('.tp-dragging')).toHaveLength(1);
    pointer(window, 'pointerup', 50, 120 + ROW + 16);
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(document.querySelectorAll('.tp-dragging, .tp-shift')).toHaveLength(0);
  });

  it('C02-U36 a move that never lands, or a page that goes away mid-glide, still clears the copy', () => {
    vi.useFakeTimers();
    const refused = render(<TwoDays refuse />);
    layout();
    dropOnMonday();
    expect(document.querySelector('.tp-drag-ghost')).toHaveClass('tp-flying');
    pass(599);
    expect(document.querySelector('.tp-drag-ghost')).not.toBeNull();
    pass(2);
    expect(document.querySelector('.tp-drag-ghost')).toBeNull();
    refused.unmount();

    const gone = render(<TwoDays />);
    layout();
    dropOnMonday();
    expect(document.querySelector('.tp-drag-ghost')).toHaveClass('tp-flying');
    gone.unmount();
    expect(() => pass(1000)).not.toThrow();
    expect(document.querySelector('.tp-drag-ghost')).toBeNull();
  });

  it('C05-U08 brief compact rows in a week group trade between lists; a locked list refuses the drop but gives its rows', () => {
    const onReceive = vi.fn();
    const onMoveTask = vi.fn();
    render(
      <>
        <TaskList tasks={THREE} group="week" brief compact label="Sunday" locked onMoveTask={onMoveTask} />
        <TaskList
          tasks={[{ key: 'd', title: 'Dentist at 4pm' }]}
          group="week"
          brief
          compact
          label="Monday"
          onReceive={onReceive}
        />
      </>,
    );
    layout();
    const sunday = screen.getByRole('list', { name: 'Sunday' });
    const monday = screen.getByRole('list', { name: 'Monday' });
    // brief: no ID in the byline
    expect(sunday.querySelector('.tp-sg-id')).toBeNull();
    // out of the locked list, into Monday at the end
    pointer(screen.getByText('Call Sam at 3pm'), 'pointerdown', 50, 175);
    pointer(window, 'pointermove', 60, 185);
    pointer(window, 'pointermove', 760, 100 + ROW + 10);
    expect(monday).toHaveClass('tp-drop-on');
    pointer(window, 'pointerup', 760, 100 + ROW + 10);
    expect(onReceive).toHaveBeenCalledWith('b', 1);
    // a straight sideways drag starts too, since the tiles sit side by side
    pointer(screen.getByText('Book car service'), 'pointerdown', 50, 230);
    pointer(window, 'pointermove', 56, 230);
    expect(document.querySelector('.tp-drag-ghost')).not.toBeNull();
    pointer(window, 'pointermove', 760, 100 + ROW * 2 + 10);
    pointer(window, 'pointerup', 760, 100 + ROW * 2 + 10);
    expect(onReceive).toHaveBeenLastCalledWith('c', 1);
    // into the locked list: it never tints and nothing lands
    pointer(screen.getByText('Dentist at 4pm'), 'pointerdown', 750, 125);
    pointer(window, 'pointermove', 760, 135);
    pointer(window, 'pointermove', 60, 100 + ROW * 3 + 10);
    expect(sunday).not.toHaveClass('tp-drop-on');
    expect(sunday.querySelector('.tp-drop-line')).toBeNull();
    pointer(window, 'pointerup', 60, 100 + ROW * 3 + 10);
    expect(onReceive).toHaveBeenCalledTimes(2);
    expect(document.querySelector('.tp-drag-ghost')).toBeNull();
    // the click that ends a drag is swallowed; spend it so the next test's first click is not
    fireEvent.click(document.body);
  });

  it('C05-U09 the Backlog’s rows carry the quiet calendar button; picking a day there moves the task out', async () => {
    const user = userEvent.setup();
    const onMoveTask = vi.fn();
    render(
      <>
        <ToastHost />
        <TaskList
          tasks={[{ key: 'b1', title: 'Renew passport' }]}
          group="week"
          brief
          compact
          undated
          planButton
          label="Backlog"
          calendar={{ today: '2026-10-18', marks: {} }}
          onMoveTask={onMoveTask}
        />
      </>,
    );
    await user.click(screen.getByRole('button', { name: 'Plan it for a day: Renew passport' }));
    await user.click(screen.getByRole('button', { name: 'Tomorrow' }));
    await waitFor(() =>
      expect(onMoveTask).toHaveBeenCalledWith(expect.objectContaining({ key: 'b1' }), '2026-10-19', null),
    );
    expect(screen.getByText('Moved to Tomorrow')).toBeInTheDocument();
  });

  it('C02-U13 flashKey opens the gap of a row added from outside; locateKey scrolls to it and flashes it', () => {
    vi.useFakeTimers();
    const { rerender } = render(<TaskList tasks={THREE} />);
    const more = [...THREE, { key: 'q', title: 'From Quick Add' }];
    rerender(<TaskList tasks={more} flashKey="q" />);
    expect(screen.getByText('From Quick Add').closest('.tp-item')).toHaveClass('tp-new');
    act(() => {
      vi.advanceTimersByTime(1400);
    });
    expect(screen.getByText('From Quick Add').closest('.tp-item')).not.toHaveClass('tp-new');

    rerender(<TaskList tasks={more} flashKey="q" locateKey="ME-2" onOpenTask={() => {}} />);
    act(() => {
      vi.advanceTimersByTime(240);
    });
    const row = screen.getByText('Call Sam at 3pm').closest('.tp-item')!;
    expect(row).toHaveClass('tp-locate');
    expect(within(row as HTMLElement).getByRole('button', { name: 'Call Sam at 3pm' })).toHaveFocus();
  });

  it('C06-U02 leaveDone: a ticked row waits a beat, folds away with Crossed off and Undo, and Undo puts it back', async () => {
    vi.useFakeTimers();
    const onLeave = vi.fn();
    const onUnleave = vi.fn();
    const onToggleTask = vi.fn();
    render(
      <>
        <ToastHost />
        <TaskList
          tasks={THREE}
          leaveDone
          onLeave={onLeave}
          onUnleave={onUnleave}
          onToggleTask={onToggleTask}
        />
      </>,
    );
    const box = screen.getByRole('checkbox', { name: 'Cross off: Call Sam at 3pm' });
    fireEvent.click(box);
    // ticked at once, still here, nothing sent yet
    expect(box).toHaveAttribute('aria-checked', 'true');
    expect(onLeave).not.toHaveBeenCalled();
    expect(onToggleTask).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(899);
    });
    expect(onLeave).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1 + 300);
    });
    expect(onLeave).toHaveBeenCalledWith(expect.objectContaining({ key: 'b' }), true);
    expect(screen.getByText('Crossed off')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(onUnleave).toHaveBeenCalledWith(expect.objectContaining({ key: 'b' }), true, 1);
    expect(screen.getByText('Call Sam at 3pm').closest('.tp-item')).toHaveClass('tp-new');
  });

  it('C06-U02 ticked back within the beat, the row never leaves and nothing is sent', () => {
    vi.useFakeTimers();
    const onLeave = vi.fn();
    const onToggleTask = vi.fn();
    render(<TaskList tasks={THREE} leaveDone onLeave={onLeave} onToggleTask={onToggleTask} />);
    const box = screen.getByRole('checkbox', { name: 'Cross off: Call Sam at 3pm' });
    fireEvent.click(box);
    act(() => {
      vi.advanceTimersByTime(400);
    });
    fireEvent.click(box);
    expect(box).toHaveAttribute('aria-checked', 'false');
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(onLeave).not.toHaveBeenCalled();
    expect(onToggleTask).not.toHaveBeenCalled();
  });

  it('C06-U03 leaveUndone: in the Crossed off list an unticked row folds away with Back in the Backlog; a static list has no grip', () => {
    vi.useFakeTimers();
    const onLeave = vi.fn();
    const done = THREE.map((t) => ({ ...t, done: true }));
    const { container } = render(
      <>
        <ToastHost />
        <TaskList tasks={done} static leaveUndone unleaveToast="Back in the Backlog" onLeave={onLeave} />
      </>,
    );
    expect(container.querySelector('.tp-grip')).toBeNull();
    const box = screen.getByRole('checkbox', { name: 'Cross off: Book car service' });
    fireEvent.click(box);
    expect(box).toHaveAttribute('aria-checked', 'false');
    act(() => {
      vi.advanceTimersByTime(1200);
    });
    expect(onLeave).toHaveBeenCalledWith(expect.objectContaining({ key: 'c' }), false);
    expect(screen.getByText('Back in the Backlog')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument();
  });

  it('C06-U04 filter: only the project’s rows show, and the writing line still opens Quick Add', async () => {
    const user = userEvent.setup();
    const onAddOpen = vi.fn();
    const PF = { name: 'Platform', color: '#5b7553' };
    const tasks: TaskItem[] = [
      { key: 'a', id: 'ME-1', title: 'Pay the electricity bill', project: PF },
      { key: 'b', id: 'ME-2', title: 'Call Sam at 3pm' },
      { key: 'c', id: 'ME-3', title: 'Book car service', project: PF },
    ];
    const { container } = render(
      <TaskList
        tasks={tasks}
        filter="Platform"
        addLabel="Add to the Backlog…"
        onAddOpen={onAddOpen}
        undated
      />,
    );
    expect(screen.getAllByRole('listitem').map((r) => r.textContent)).toEqual([
      expect.stringContaining('Pay the electricity bill'),
      expect.stringContaining('Book car service'),
    ]);
    expect(container.querySelector('.tp-ins')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Add to the Backlog…' }));
    expect(onAddOpen).toHaveBeenCalledTimes(1);
  });
  it('C02-U27 linkFor gives each row its link: the ID chip copies that task’s page', () => {
    render(<TaskList tasks={THREE} linkFor={(t) => (t.id ? `https://tudu.test/t/${t.id}` : undefined)} />);
    expect(screen.getByRole('button', { name: 'Copy link to ME-2' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Copy task ID/ })).toBeNull();
  });

  it('C21-U10 filterSpace shows one space and turns off trading rows; Chip and SpaceFilter wear the tiles', async () => {
    const user = userEvent.setup();
    const NW = { id: 'nw', name: 'Northwind', color: '#3d5a80', initials: 'N' };
    const ME = { id: 'me', name: 'Personal', personal: true };
    const tasks = [
      { key: 'a', title: 'Call the bank', inSpace: ME },
      { key: 'b', title: 'Ship the pilot', inSpace: NW },
      { key: 'c', title: 'Review the deck', inSpace: NW },
    ];
    const onSignal = vi.fn();
    const { rerender } = render(<TaskList tasks={tasks} onSignal={onSignal} onAddOpen={() => undefined} />);
    expect(screen.getAllByRole('button', { name: /^Space · / })).toHaveLength(3);
    await user.click(screen.getAllByRole('button', { name: 'Space · Northwind. Show only Northwind' })[0]!);
    expect(onSignal).toHaveBeenCalledWith(tasks[1], 'space');
    rerender(<TaskList tasks={tasks} filterSpace="nw" onAddOpen={() => undefined} />);
    expect(screen.queryByText('Call the bank')).toBeNull();
    expect(screen.getByText('Ship the pilot')).toBeInTheDocument();
    expect(screen.getByText('Review the deck')).toBeInTheDocument();
    expect(document.querySelector('.tp-ins')).toBeNull();

    rerender(<Chip label="Northwind" space={NW} onClear={() => {}} />);
    const chip = document.querySelector('.tp-chip')!;
    expect(chip).toHaveClass('tp-chip-space');
    expect(chip.querySelector('.tp-dot')).toBeNull();
    expect(chip.querySelector('span > .tp-chip-tile')).not.toBeNull();
    rerender(<SpaceFilter spaces={[{ ...NW }]} value={null} allTile />);
    expect(
      screen.getByRole('button', { name: 'Space: all spaces' }).querySelector('.tp-stile-all'),
    ).not.toBeNull();
  });
});

describe('TaskList fillEmpty', () => {
  it('C02-U57 empty, the list fills its sheet’s body (whole-sheet drops, a wash that covers it); with tasks or without the prop it does not', () => {
    const list = () => screen.getByRole('list', { name: 'Backlog' });
    const { rerender } = render(<TaskList tasks={[]} label="Backlog" group="days" fillEmpty />);
    expect(list()).toHaveClass('tp-list-fill');
    rerender(<TaskList tasks={[{ key: 'a', title: 'Call Sam' }]} label="Backlog" group="days" fillEmpty />);
    expect(list()).not.toHaveClass('tp-list-fill');
    rerender(<TaskList tasks={[]} label="Backlog" group="days" />);
    expect(list()).not.toHaveClass('tp-list-fill');
    const css = parseRules(readStylesheet('components.css'));
    const fill = css.find((r) => r.selector === '.tp-list.tp-list-fill' && !r.context.length)!;
    expect(fill.declarations).toMatchObject({ position: 'absolute', inset: '0 12px' });
    const body = css.find(
      (r) => r.selector.startsWith('.tp-sheet-body:has(') && r.selector.includes('.tp-list-fill'),
    )!;
    expect(body.declarations).toMatchObject({
      position: 'relative',
      display: 'flex',
      'flex-direction': 'column',
    });
    expect(css.find((r) => r.selector === '.tp-drop-line.tp-drop-line-off')!.declarations.display).toBe(
      'none',
    );
  });
});
