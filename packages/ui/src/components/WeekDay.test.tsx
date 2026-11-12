import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { stopFlight } from '../lib/reorder';
import { parseRules, readStylesheet } from '../test-utils/stylesheet';
import { TaskList, type TaskItem } from './TaskList';
import { WeekDay, WeekTiles } from './WeekDay';

const rules = parseRules(readStylesheet('components.css'));

describe('WeekDay', () => {
  it('C05-U01 a tile shows its eyebrow, day, date and count, in the tones of today, a past day and the Backlog', () => {
    const { container, rerender } = render(
      <WeekDay
        variant="tile"
        day="Sunday"
        date="18 Oct"
        eyebrow="Today"
        today
        count="2 of 7"
        label="Today, Sunday 18 October"
      >
        <TaskList tasks={[{ key: 'a', title: 'Pay the electricity bill' }]} brief compact label="Sunday" />
      </WeekDay>,
    );
    const tile = screen.getByRole('region', { name: 'Today, Sunday 18 October' });
    expect(tile).toHaveClass('tp-sheet', 'tp-wd-tile', 'tp-wd-today');
    expect(tile.querySelector('.tp-wd-eb')).toHaveTextContent('Today');
    expect(tile.querySelector('.tp-wd-eb')).not.toHaveClass('tp-eb-quiet');
    expect(tile.querySelector('.tp-wd-day')).toHaveTextContent('Sunday');
    expect(tile.querySelector('.tp-wd-date')).toHaveTextContent('18 Oct');
    expect(tile.querySelector('.tp-wd-count')).toHaveTextContent('2 of 7');
    expect(tile.querySelector('.tp-wd-head')?.tagName).toBe('DIV');
    expect(screen.getByRole('list', { name: 'Sunday' })).toBeInTheDocument();

    rerender(
      <WeekDay variant="tile" day="Saturday" date="17 Oct" eyebrow="Yesterday" past count="4 of 4">
        <TaskList tasks={[]} brief compact label="Saturday" />
      </WeekDay>,
    );
    const past = container.querySelector('.tp-wd')!;
    expect(past).toHaveClass('tp-wd-past');
    expect(past.querySelector('.tp-wd-eb')).toHaveClass('tp-eb-quiet');

    rerender(
      <WeekDay
        variant="tile"
        day="Backlog"
        eyebrow="No date"
        quiet
        empty
        emptyText="Nothing waiting"
        label="Backlog"
      >
        <TaskList tasks={[]} brief compact label="Backlog" />
      </WeekDay>,
    );
    const backlog = screen.getByRole('region', { name: 'Backlog' });
    expect(backlog).toHaveClass('tp-wd-quiet');
    expect(backlog.querySelector('.tp-wd-none')).toHaveTextContent('Nothing waiting');
    expect(backlog.querySelector('.tp-wd-count')).toHaveTextContent('');
    // the empty list is still there, as a place to drop a task
    expect(screen.getByRole('list', { name: 'Backlog' })).toBeInTheDocument();
  });

  it('C05-U01 an empty day says Nothing planned and a tile’s list scrolls inside it (stylesheet)', () => {
    render(<WeekDay variant="tile" day="Saturday" date="24 Oct" eyebrow="In 6 days" empty />);
    expect(screen.getByText('Nothing planned')).toHaveClass('tp-wd-none');
    const body = rules.find((r) => r.selector === '.tp-wd-tile > .tp-wd-body')!;
    expect(body.declarations['overflow-y']).toBe('auto');
    expect(body.declarations['min-height']).toBe('0');
    const tile = rules.find((r) => r.selector === '.tp-wd-tile')!;
    expect(tile.declarations.overflow).toBe('hidden');
  });

  it('C05-U02 a section’s header is a button that folds the list open and shut, turns the chevron and reports the change', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    const { container } = render(
      <WeekDay
        day="Monday"
        date="19 Oct"
        eyebrow="Tomorrow"
        count="3 tasks"
        preview="Meera’s demo · Call the bank"
        defaultOpen={false}
        onToggle={onToggle}
      >
        <TaskList tasks={[{ key: 'a', title: 'Meera’s demo' }]} brief compact label="Monday" />
      </WeekDay>,
    );
    const sec = container.querySelector('.tp-wd')!;
    expect(sec).toHaveClass('tp-wd-sec');
    expect(sec).not.toHaveClass('tp-open');
    const head = screen.getByRole('button', { name: /Tomorrow.*Monday.*19 Oct.*3 tasks/ });
    expect(head).toHaveAttribute('aria-expanded', 'false');
    const peek = sec.querySelector('.tp-wd-peek')!;
    expect(peek).toHaveTextContent('Meera’s demo · Call the bank');
    expect(peek).not.toHaveClass('tp-hide');
    expect(sec.querySelector('.tp-wd-chev')).not.toBeNull();

    await user.click(head);
    expect(sec).toHaveClass('tp-open');
    expect(head).toHaveAttribute('aria-expanded', 'true');
    expect(peek).toHaveClass('tp-hide');
    expect(peek).toHaveAttribute('aria-hidden', 'true');
    expect(onToggle).toHaveBeenLastCalledWith(true);
    // the chevron turns a quarter when open (stylesheet)
    expect(rules.find((r) => r.selector === '.tp-wd-sec.tp-open .tp-wd-chev')!.declarations.transform).toBe(
      'rotate(90deg)',
    );

    await user.click(head);
    expect(sec).not.toHaveClass('tp-open');
    expect(onToggle).toHaveBeenLastCalledWith(false);
  });

  it('C05-U02 a controlled section follows its open prop', () => {
    const { container, rerender } = render(
      <WeekDay day="Monday" open={false}>
        <p>list</p>
      </WeekDay>,
    );
    expect(container.querySelector('.tp-wd')).not.toHaveClass('tp-open');
    rerender(
      <WeekDay day="Monday" open>
        <p>list</p>
      </WeekDay>,
    );
    expect(container.querySelector('.tp-wd')).toHaveClass('tp-open');
  });

  it('C05-U03 the folded body is inert while shut; empty text and the fold’s motion', () => {
    const { container, rerender } = render(
      <WeekDay day="Saturday" date="24 Oct" empty open={false}>
        <TaskList tasks={[]} brief compact label="Saturday" />
      </WeekDay>,
    );
    const fold = container.querySelector('.tp-wd-fold')!;
    expect(fold).toHaveAttribute('inert');
    // shut, the preview says what the body would: nothing planned
    expect(container.querySelector('.tp-wd-peek')).toHaveTextContent('Nothing planned');
    rerender(
      <WeekDay day="Saturday" date="24 Oct" empty open>
        <TaskList tasks={[]} brief compact label="Saturday" />
      </WeekDay>,
    );
    expect(container.querySelector('.tp-wd-fold')).not.toHaveAttribute('inert');
    expect(container.querySelector('.tp-wd-none')).toHaveTextContent('Nothing planned');

    rerender(<WeekDay day="Backlog" quiet empty emptyText="Nothing waiting" open={false} preview="" />);
    expect(container.querySelector('.tp-wd-peek')).toHaveTextContent('Nothing waiting');

    // the fold moves by its real height on dur-fold with ease-settle, and not at all under reduced motion
    const grid = rules.find((r) => r.selector === '.tp-wd-fold')!;
    expect(grid.declarations['grid-template-rows']).toBe('0fr');
    expect(grid.declarations.transition).toMatch(/grid-template-rows var\(--dur-fold\) var\(--ease-settle\)/);
    expect(
      rules.find((r) => r.selector === '.tp-wd-sec.tp-open > .tp-wd-fold')!.declarations[
        'grid-template-rows'
      ],
    ).toBe('1fr');
    const reduced = rules.find(
      (r) =>
        r.context.some((c) => c.includes('prefers-reduced-motion')) && r.selector.includes('.tp-wd-fold'),
    )!;
    expect(reduced.declarations.transition).toBe('none');
  });

  it('C05-U04 WeekTiles lays the tiles out in a grid of four, or the columns asked for', () => {
    const { container, rerender } = render(
      <WeekTiles>
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
          <WeekDay key={d} variant="tile" day={d} />
        ))}
        <WeekDay variant="tile" day="Backlog" quiet />
      </WeekTiles>,
    );
    const grid = container.querySelector('.tp-wk-tiles')!;
    expect(grid.querySelectorAll('.tp-wd-tile')).toHaveLength(8);
    expect(grid.getAttribute('style')).toBeNull();
    const rule = rules.find((r) => r.selector === '.tp-wk-tiles')!;
    expect(rule.declarations['grid-template-columns']).toBe('repeat(var(--wk-cols, 4), minmax(0, 1fr))');
    expect(rule.declarations['grid-auto-rows']).toBe('minmax(0, 1fr)');
    expect(rule.declarations['min-height']).toBe('0');
    rerender(
      <WeekTiles columns={2}>
        <WeekDay variant="tile" day="Mon" />
      </WeekTiles>,
    );
    expect(container.querySelector<HTMLElement>('.tp-wk-tiles')!.style.getPropertyValue('--wk-cols')).toBe(
      '2',
    );
  });
});

/** Two week tiles that trade rows through state; a tile with nothing on it is `empty`. */
function TwoTiles() {
  const [sunday, setSunday] = useState<TaskItem[]>([{ key: 'a', title: 'Pay the electricity bill' }]);
  const [monday, setMonday] = useState<TaskItem[]>([]);
  return (
    <>
      <WeekDay variant="tile" day="Sunday" empty={!sunday.length}>
        <TaskList tasks={sunday} group="week" brief compact label="Sunday" />
      </WeekDay>
      <WeekDay variant="tile" day="Monday" empty={!monday.length}>
        <TaskList
          tasks={monday}
          group="week"
          brief
          compact
          label="Monday"
          onReceive={(key) => {
            setMonday(sunday.filter((t) => t.key === key));
            setSunday((l) => l.filter((t) => t.key !== key));
          }}
        />
      </WeekDay>
    </>
  );
}

function pointer(target: Element | Window, type: string, x: number, y: number) {
  const ev = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 });
  Object.defineProperty(ev, 'pointerType', { value: 'mouse' });
  Object.defineProperty(ev, 'pointerId', { value: 1 });
  act(() => {
    target.dispatchEvent(ev);
  });
}

describe('WeekDay around a drop', () => {
  afterEach(() => {
    stopFlight();
    vi.useRealTimers();
    document.documentElement.classList.remove('tp-is-dragging');
  });

  it('C05-U16 a task dropped on an empty tile: its empty line stays to fold away, then goes; the tile it emptied shows its line only after the fold; no drop, no fold', () => {
    vi.useFakeTimers();
    const { unmount } = render(<TwoTiles />);
    // jsdom has no layout: Sunday's list at the left, Monday's 700px to the right
    document.querySelectorAll<HTMLElement>('.tp-list').forEach((list, i) => {
      const box = (top: number, height: number) =>
        ({ left: i * 700, right: i * 700 + 300, top, bottom: top + height, width: 300, height }) as DOMRect;
      list.getBoundingClientRect = () => box(100, list.children.length * 52);
      Array.from(list.children).forEach((row, n) => {
        (row as HTMLElement).getBoundingClientRect = () => box(100 + n * 52, 52);
      });
    });
    const sunday = screen.getByRole('region', { name: 'Sunday' });
    const monday = screen.getByRole('region', { name: 'Monday' });
    expect(monday.querySelector('.tp-wd-none')).toHaveTextContent('Nothing planned');
    expect(sunday.querySelector('.tp-wd-none')).toBeNull();

    pointer(screen.getByText('Pay the electricity bill'), 'pointerdown', 50, 125);
    pointer(window, 'pointermove', 60, 125);
    pointer(window, 'pointermove', 760, 110);
    pointer(window, 'pointerup', 760, 110);
    expect(screen.getByRole('list', { name: 'Monday' }).querySelector('[data-key="a"]')).not.toBeNull();
    // Monday: the line is still there, on its way out and hidden from screen readers
    const leaving = monday.querySelector('.tp-wd-none')!;
    expect(leaving).toHaveAttribute('aria-hidden', 'true');
    expect(leaving).not.toHaveClass('tp-wd-none-in');
    // Sunday: its line comes in late, after the gap has folded
    expect(sunday.querySelector('.tp-wd-none')).toHaveClass('tp-wd-none-in');
    const late = rules.find((r) => r.selector === '.tp-wd-none.tp-wd-none-in')!;
    expect(late.declarations.animation).toContain('240ms');
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(monday.querySelector('.tp-wd-none')).toBeNull();
    fireEvent.click(document.body);
    unmount();

    // with no drop behind it (a task added, the week turned) the line just comes and goes
    stopFlight();
    const plain = render(<WeekDay variant="tile" day="Tuesday" empty />);
    expect(plain.container.querySelector('.tp-wd-none')).not.toHaveClass('tp-wd-none-in');
    plain.rerender(<WeekDay variant="tile" day="Tuesday" />);
    expect(plain.container.querySelector('.tp-wd-none')).toBeNull();
    plain.rerender(<WeekDay variant="tile" day="Tuesday" empty />);
    expect(plain.container.querySelector('.tp-wd-none')).not.toHaveClass('tp-wd-none-in');
  });
});
