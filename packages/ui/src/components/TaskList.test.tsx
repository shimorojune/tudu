import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseRules, readStylesheet, rulesWhere } from '../test-utils/stylesheet';
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
  let n = 0;
  return (
    <TaskList
      addLabel="Write the next thing…"
      {...props}
      tasks={tasks}
      onReorder={(next, moved) => {
        setTasks(next);
        props.onReorder?.(next, moved);
      }}
      onAdd={(text, before) => {
        const key = `new-${text}-${n++}`;
        setTasks((l) => {
          const at = before ? l.findIndex((t) => t.key === before) : l.length;
          const out = [...l];
          out.splice(at, 0, { key, title: text });
          return out;
        });
        props.onAdd?.(text, before);
        return key;
      }}
    />
  );
}

const titles = () =>
  screen
    .getAllByRole('listitem')
    .map((li) => li.querySelector('.tp-strike')?.textContent)
    .filter(Boolean);

afterEach(() => {
  vi.useRealTimers();
  document.documentElement.classList.remove('tp-is-dragging');
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

  it('C02-U10 a task written on the last line opens its gap with the wash, and the line stays open', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    render(<Day onAdd={onAdd} />);
    await user.click(screen.getByRole('button', { name: 'Write the next thing…' }));
    await user.type(screen.getByRole('textbox', { name: 'New task' }), 'Water the plants{Enter}');
    expect(onAdd).toHaveBeenCalledWith('Water the plants', undefined);
    expect(titles().at(-1)).toBe('Water the plants');
    expect(screen.getByText('Water the plants').closest('.tp-item')).toHaveClass('tp-new');
    const line = screen.getByRole('textbox', { name: 'New task' });
    expect(line).toHaveValue('');
    expect(line).toHaveFocus();
    expect(rulesWhere(rules, (s) => s === '.tp-item.tp-new .tp-row')[0]!.declarations.animation).toContain(
      'tp-row-wash 1200ms',
    );
  });

  it('C02-U11 the "+" between rows writes a task in that slot; it waits for a pause and hides while dragging', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    const { unmount } = render(<Day onAdd={onAdd} />);
    const plus = screen.getAllByRole('button', { name: 'Add a task here' });
    expect(plus).toHaveLength(2); // between the three rows, not above the first
    await user.click(plus[1]!);
    await user.type(screen.getByRole('textbox', { name: 'New task' }), 'Slot me in{Enter}');
    expect(onAdd).toHaveBeenCalledWith('Slot me in', 'c');
    expect(titles()).toEqual([
      'Pay the electricity bill',
      'Call Sam at 3pm',
      'Slot me in',
      'Book car service',
    ]);
    // the line stays open just below the new task
    const ins = document.querySelector('.tp-insrow')!;
    expect(ins.nextElementSibling).toHaveAttribute('data-key', 'c');
    const hover = rulesWhere(rules, (s) => s === '.tp-ins:hover')[0]!;
    expect(hover.declarations['transition-delay']).toBe('120ms');
    expect(rulesWhere(rules, (s) => s.includes('.tp-is-dragging .tp-ins'))[0]!.declarations.display).toBe(
      'none',
    );
    unmount();
    // phones and filtered lists have no "+"
    render(<Day compact />);
    expect(screen.queryByRole('button', { name: 'Add a task here' })).toBeNull();
    cleanup();
    render(
      <Day
        filter="Home"
        initial={THREE.map((t) => ({ ...t, project: { name: 'Home', color: '#8a5a00' } }))}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Add a task here' })).toBeNull();
  });

  it('C02-U12 two lists in a group accept each other’s rows and report the move', () => {
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
    expect(monday).not.toHaveClass('tp-drop-on');
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
});
