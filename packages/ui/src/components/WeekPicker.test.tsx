import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { WeekPicker, weekRowLabel, weekRowsOf, type WeekPickerProps } from './WeekPicker';

const TODAY = '2026-10-18'; // a Sunday, in the week of Monday 12 October

function setup(extra: Partial<WeekPickerProps> = {}) {
  const user = userEvent.setup();
  const onPick = vi.fn();
  render(
    <WeekPicker
      today={TODAY}
      selected="2026-10-12"
      marks={{ '2026-10-19': 3, '2026-10-01': 1 }}
      onPick={onPick}
      {...extra}
    />,
  );
  const group = () => screen.getByRole('group', { name: 'Pick a week' });
  const rows = () => within(group()).getAllByRole('button', { name: /^Week \d+,/ });
  return { user, onPick, group, rows };
}

describe('WeekPicker', () => {
  it('C05-U05 a month of week rows with numbers, days, dots and this week marked; the months turn', async () => {
    const { user, group, rows } = setup();
    expect(group()).toHaveClass('tp-cal', 'tp-wkp');
    expect(within(group()).getByText('October 2026')).toBeInTheDocument();
    // October 2026 starts on a Thursday: the week of Monday 28 September leads, five rows in all
    const names = rows().map((r) => r.getAttribute('aria-label'));
    expect(names).toEqual([
      'Week 40, 28 Sep – 4 Oct',
      'Week 41, 5 – 11 October',
      'Week 42, 12 – 18 October',
      'Week 43, 19 – 25 October',
      'Week 44, 26 Oct – 1 Nov',
    ]);
    const first = rows()[0]!;
    expect(first.querySelector('.tp-wkp-no')).toHaveTextContent('40');
    const days = first.querySelectorAll('.tp-wkp-d');
    expect(days).toHaveLength(7);
    expect(days[0]).toHaveTextContent('28');
    expect(days[0]).toHaveClass('tp-out'); // September
    expect(days[3]).not.toHaveClass('tp-out'); // 1 October
    expect(days[3]!.querySelector('i')).not.toBeNull(); // a dot: 1 October has a task
    expect(days[0]!.querySelector('i')).toBeNull();
    const thisWeek = rows()[2]!;
    expect(thisWeek).toHaveClass('tp-now', 'tp-sel');
    expect(thisWeek).toHaveAttribute('aria-pressed', 'true');
    expect(thisWeek.querySelectorAll('.tp-wkp-d')[6]).toHaveClass('tp-today');
    expect(rows()[3]!.querySelectorAll('.tp-wkp-d')[0]!.querySelector('i')).not.toBeNull(); // Monday 19 has tasks

    await user.click(within(group()).getByRole('button', { name: 'Next month' }));
    expect(within(group()).getByText('November 2026')).toBeInTheDocument();
    expect(rows()[0]).toHaveAttribute('aria-label', 'Week 44, 26 Oct – 1 Nov');
    await user.click(within(group()).getByRole('button', { name: 'Previous month' }));
    await user.click(within(group()).getByRole('button', { name: 'Previous month' }));
    expect(within(group()).getByText('September 2026')).toBeInTheDocument();
  });

  it('C05-U05 the hint names the week under the pointer, else the chosen one, else asks', async () => {
    const { user, rows } = setup();
    const hint = screen.getByTestId('week-hint');
    expect(hint).toHaveTextContent('Week 42 · 12 – 18 October');
    await user.hover(rows()[3]!);
    expect(hint).toHaveTextContent('Week 43 · 19 – 25 October');
    await user.unhover(rows()[3]!);
    expect(hint).toHaveTextContent('Week 42 · 12 – 18 October');
    act(() => rows()[4]!.focus());
    expect(hint).toHaveTextContent('Week 44 · 26 Oct – 1 Nov');
  });

  it('C05-U05 with nothing chosen the hint asks, and This week picks and shows this week', async () => {
    const { user, onPick, group } = setup({ selected: undefined });
    expect(screen.getByTestId('week-hint')).toHaveTextContent('Pick a week');
    await user.click(within(group()).getByRole('button', { name: 'Next month' }));
    await user.click(within(group()).getByRole('button', { name: 'This week' }));
    expect(onPick).toHaveBeenCalledWith('2026-10-12');
    expect(within(group()).getByText('October 2026')).toBeInTheDocument();
  });

  it('C05-U06 picking a row reports its Monday; the chosen week is pressed; labels cross months', async () => {
    const { user, onPick, rows } = setup();
    await user.click(rows()[3]!);
    expect(onPick).toHaveBeenCalledWith('2026-10-19');
    await user.click(rows()[0]!);
    expect(onPick).toHaveBeenLastCalledWith('2026-09-28');
    expect(rows().filter((r) => r.getAttribute('aria-pressed') === 'true')).toHaveLength(1);
    expect(weekRowLabel('2026-09-28')).toBe('28 Sep – 4 Oct');
    expect(weekRowLabel('2026-12-28')).toBe('28 Dec – 3 Jan');
    expect(weekRowLabel('2026-10-19')).toBe('19 – 25 October');
    // a month that starts on a Monday has four or five rows, never a sixth of another month
    expect(weekRowsOf(2027, 2).map((r) => r.monday)).toEqual([
      '2027-02-01',
      '2027-02-08',
      '2027-02-15',
      '2027-02-22',
    ]);
    expect(weekRowsOf(2026, 8)).toHaveLength(6); // August 2026 starts on a Saturday and ends on a Monday
  });
});
