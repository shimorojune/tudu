import { dueDistance, relativeDayLabel, type IsoDate } from '@tudu/core';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MiniCalendar, type MiniCalendarProps } from './MiniCalendar';

const TODAY: IsoDate = '2026-10-18'; // a Sunday; 1 October 2026 is a Thursday

function setup(extra: Partial<MiniCalendarProps> = {}) {
  const user = userEvent.setup();
  const onPick = vi.fn();
  render(
    <MiniCalendar month="2026-10" today={TODAY} marks={{ '2026-10-19': 3 }} onPick={onPick} {...extra} />,
  );
  const grid = () => screen.getByRole('grid');
  const days = () => Array.from(grid().querySelectorAll<HTMLButtonElement>('button.tp-cal-d'));
  const day = (d: number) => {
    const el = grid().querySelector<HTMLButtonElement>(`button[data-day="${d}"]`);
    if (!el) throw new Error(`no day ${d}`);
    return el;
  };
  // Cells between the seven weekday labels and the first day button.
  const leadingBlanks = () => {
    const cells = Array.from(grid().children).slice(7);
    return cells.findIndex((c) => c.tagName === 'BUTTON');
  };
  return { user, onPick, grid, days, day, leadingBlanks };
}

describe('MiniCalendar', () => {
  it('C00-U26 shows the month with its days laid out Monday first', () => {
    const { grid, days, leadingBlanks } = setup();
    expect(screen.getByText('October 2026')).toBeInTheDocument();
    expect(grid()).toHaveAccessibleName('October 2026');
    expect(screen.getByRole('group', { name: 'Pick a day' })).toBeInTheDocument();

    const dow = Array.from(grid().querySelectorAll('.tp-cal-dow')).map((el) => el.textContent);
    expect(dow).toEqual(['M', 'T', 'W', 'T', 'F', 'S', 'S']);
    expect(days()).toHaveLength(31);
    expect(days().map((b) => b.textContent)).toEqual(Array.from({ length: 31 }, (_, i) => String(i + 1)));
    expect(leadingBlanks()).toBe(3);
    expect(days()[0]).toHaveAttribute('data-date', '2026-10-01');
  });

  it('C00-U26 rings today and dots the days with tasks', () => {
    const { day, days } = setup({ marks: { '2026-10-19': 3, '2026-10-21': 1 } });
    expect(day(18)).toHaveClass('tp-today');
    expect(days().filter((b) => b.classList.contains('tp-today'))).toHaveLength(1);

    expect(day(19)).toHaveAccessibleName('19 October, 3 tasks');
    expect(day(19).querySelector('i')).not.toBeNull();
    expect(day(21)).toHaveAccessibleName('21 October, 1 task');
    expect(day(20)).toHaveAccessibleName('20 October');
    expect(day(20).querySelector('i')).toBeNull();
    expect(days().filter((b) => b.querySelector('i'))).toHaveLength(2);
  });

  it('C00-U27 previous and next month change the heading and keep the Monday-first grid', async () => {
    const { user, days, leadingBlanks } = setup();
    const next = screen.getByRole('button', { name: 'Next month' });
    const prev = screen.getByRole('button', { name: 'Previous month' });

    await user.click(next);
    expect(screen.getByText('November 2026')).toBeInTheDocument();
    expect(days()).toHaveLength(30);
    expect(leadingBlanks()).toBe(6); // 1 November 2026 is a Sunday
    expect(screen.queryByText('October 2026')).toBeNull();

    await user.click(prev);
    await user.click(prev);
    expect(screen.getByText('September 2026')).toBeInTheDocument();
    expect(days()).toHaveLength(30);
    expect(leadingBlanks()).toBe(1); // 1 September 2026 is a Tuesday

    for (let i = 0; i < 4; i++) await user.click(next);
    expect(screen.getByText('January 2027')).toBeInTheDocument();
    expect(days()).toHaveLength(31);
    expect(leadingBlanks()).toBe(4); // 1 January 2027 is a Friday
    expect(screen.getByRole('grid').querySelectorAll('.tp-cal-dow')).toHaveLength(7);
  });

  it('C00-U27 arrow keys move the focused day and Enter picks it', async () => {
    const { user, onPick, day } = setup();
    act(() => day(5).focus());
    expect(day(5)).toHaveFocus();

    await user.keyboard('{ArrowRight}');
    await waitFor(() => expect(day(6)).toHaveFocus());
    await user.keyboard('{ArrowDown}');
    await waitFor(() => expect(day(13)).toHaveFocus());
    await user.keyboard('{ArrowLeft}');
    await waitFor(() => expect(day(12)).toHaveFocus());
    await user.keyboard('{ArrowUp}');
    await waitFor(() => expect(day(5)).toHaveFocus());
    expect(onPick).not.toHaveBeenCalled();

    await user.keyboard('{Enter}');
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick).toHaveBeenCalledWith('2026-10-05');
    expect(day(5)).toHaveClass('tp-sel');
  });

  it('C00-U27 only one day is in the tab order at a time', () => {
    const { days, day } = setup({ defaultSelected: '2026-10-18' });
    expect(days().filter((b) => b.tabIndex === 0)).toEqual([day(18)]);
  });

  it('C00-U28 clicking a day calls onPick with the ISO date and fills it', async () => {
    const { user, onPick, day, days } = setup();
    await user.click(day(20));
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick).toHaveBeenCalledWith('2026-10-20');
    expect(day(20)).toHaveClass('tp-sel');
    expect(day(20)).toHaveAttribute('aria-pressed', 'true');
    expect(days().filter((b) => b.classList.contains('tp-sel'))).toHaveLength(1);

    await user.click(day(3));
    expect(onPick).toHaveBeenLastCalledWith('2026-10-03');
    expect(day(20)).not.toHaveClass('tp-sel');
    expect(day(3)).toHaveClass('tp-sel');
  });

  it('C00-U28 the footer Today button picks today and jumps back to its month', async () => {
    const { user, onPick, day } = setup();
    await user.click(screen.getByRole('button', { name: 'Next month' }));
    expect(screen.getByText('November 2026')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Today' }));
    expect(onPick).toHaveBeenCalledWith(TODAY);
    expect(screen.getByText('October 2026')).toBeInTheDocument();
    expect(day(18)).toHaveClass('tp-sel', 'tp-today');
  });

  it('C00-U28 onClear with clearLabel shows the clear action', async () => {
    const user = userEvent.setup();
    const onClear = vi.fn();
    const onPick = vi.fn();
    const { rerender } = render(
      <MiniCalendar month="2026-10" today={TODAY} onPick={onPick} onClear={onClear} />,
    );
    expect(screen.queryByText('Remove due date')).toBeNull();

    rerender(
      <MiniCalendar
        month="2026-10"
        today={TODAY}
        onPick={onPick}
        onClear={onClear}
        clearLabel="Remove due date"
      />,
    );
    const clear = screen.getByRole('button', { name: 'Remove due date' });
    expect(clear).toHaveClass('tp-cal-clear');
    await user.click(clear);
    expect(onClear).toHaveBeenCalledTimes(1);
    expect(onPick).not.toHaveBeenCalled();
  });

  it('C00-U29 hovering a day says tomorrow, in 4 days or 2 days ago', async () => {
    const hint = (d: IsoDate) => ({
      text: relativeDayLabel(d, TODAY).toLowerCase(),
      tone: dueDistance(d, TODAY).tone,
    });
    const { user, day, grid } = setup({ hint, hintEmpty: 'Hover a day' });
    const line = screen.getByTestId('calendar-hint');
    expect(line).toHaveTextContent('Hover a day');
    expect(line).toHaveClass('tp-cal-hint');

    await user.hover(day(19));
    expect(line).toHaveTextContent('tomorrow');
    expect(line).not.toHaveClass('tp-od');
    expect(line).not.toHaveClass('tp-now');

    await user.hover(day(22));
    expect(line).toHaveTextContent('in 4 days');

    await user.hover(day(16));
    expect(line).toHaveTextContent('2 days ago');
    expect(line).toHaveClass('tp-od');

    await user.hover(day(18));
    expect(line).toHaveTextContent('today');
    expect(line).toHaveClass('tp-now');
    expect(line).not.toHaveClass('tp-od');

    await user.unhover(grid());
    expect(line).toHaveTextContent('Hover a day');
  });

  it('C00-U29 a string hint works too, and the hint follows the selected day', async () => {
    const { user, day } = setup({ hint: (d) => `Due ${d}`, defaultSelected: '2026-10-20' });
    const line = screen.getByTestId('calendar-hint');
    expect(line).toHaveTextContent('Due 2026-10-20');

    await user.hover(day(21));
    expect(line).toHaveTextContent('Due 2026-10-21');
    expect(within(screen.getByRole('grid')).getByRole('button', { pressed: true })).toBe(day(20));
  });
});
