import { DEFAULT_HOURS, type WorkHours } from '@tudu/core';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DayPick } from './DayPick';
import { HoursField, tidyTime } from './HoursField';
import { Settings } from './Settings';
import { WorkHoursSection, type SettingsNudges } from './WorkHoursSection';

const ME = { name: 'Rohit Raj', email: 'rohit@x.y', initials: 'RR' };
const NW = { name: 'Northwind', color: '#3d5a80', members: 19, role: 'admin' as const };

const nudges = (over: Partial<SettingsNudges> = {}): SettingsNudges => ({
  on: false,
  every: 60,
  permission: 'unknown',
  next: 'Next at 11:00',
  paused: null,
  test: 'idle',
  example: '09:00, 10:00, 11:00',
  ...over,
});

describe('WH-U09 DayPick', () => {
  it('WH-U09 seven toggles named in full; a click gives the new set; arrows move along the week', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<DayPick days={[1, 2, 3, 4, 5]} onChange={onChange} />);
    const group = screen.getByRole('group', { name: 'Days' });
    const days = within(group).getAllByRole('button');
    expect(days.map((d) => d.getAttribute('aria-label'))).toEqual([
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday',
      'Sunday',
    ]);
    expect(days[0]).toHaveAttribute('aria-pressed', 'true');
    expect(days[5]).toHaveAttribute('aria-pressed', 'false');
    await user.click(days[5]!);
    expect(onChange).toHaveBeenLastCalledWith([1, 2, 3, 4, 5, 6]);
    await user.click(days[0]!);
    expect(onChange).toHaveBeenLastCalledWith([2, 3, 4, 5]);
    days[6]!.focus();
    fireEvent.keyDown(days[6]!, { key: 'ArrowRight' });
    expect(days[0]).toHaveFocus();
  });
});

describe('WH-U10 HoursField', () => {
  it('WH-U10 24-hour times as typed; a change only once the field holds a real time; bad marks the end', async () => {
    expect(tidyTime('9')).toBe('09:00');
    expect(tidyTime('930')).toBe('09:30');
    expect(tidyTime('17.45')).toBe('17:45');
    expect(tidyTime('25')).toBeNull();
    expect(tidyTime('9am')).toBeNull();
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { rerender } = render(<HoursField start="09:00" end="18:00" onChange={onChange} />);
    const end = screen.getByRole('textbox', { name: 'Every day ends at' });
    await user.clear(end);
    await user.type(end, '7pm');
    await user.tab();
    expect(onChange).not.toHaveBeenCalled();
    expect(end).toHaveAttribute('aria-invalid', 'true');
    await user.clear(end);
    await user.type(end, '1730{Enter}');
    expect(onChange).toHaveBeenLastCalledWith({ start: '09:00', end: '17:30' });
    rerender(<HoursField start="18:00" end="09:00" bad onChange={onChange} />);
    expect(screen.getByRole('textbox', { name: 'Every day ends at' })).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    expect(screen.getByRole('textbox', { name: 'Every day starts at' })).not.toHaveAttribute('aria-invalid');
  });
});

describe('WH-U11 Settings › Working hours', () => {
  it('WH-U11 the row comes after Appearance with the hours line; the section saves as you change it', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <Settings me={ME} space={NW} still section="hours" workHours={{ hours: DEFAULT_HOURS, onChange }} />,
    );
    const nav = screen.getByRole('navigation', { name: 'Settings' });
    const labels = within(nav)
      .getAllByRole('button')
      .map((b) => b.querySelector('.tp-snav-l')?.textContent);
    expect(labels.slice(0, 3)).toEqual(['Account', 'Appearance', 'Working hours']);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Working hours');
    await user.click(screen.getByRole('button', { name: 'Saturday' }));
    expect(onChange).toHaveBeenLastCalledWith({
      same: true,
      days: [1, 2, 3, 4, 5, 6].map((day) => ({ day, start: '09:00', end: '18:00' })),
    });
  });

  it('WH-U11 on a phone the list carries the hours line under Working hours', () => {
    render(
      <Settings
        me={ME}
        space={NW}
        still
        layout="phone"
        view="list"
        workHours={{ hours: DEFAULT_HOURS, onChange: vi.fn() }}
      />,
    );
    const nav = screen.getByRole('navigation', { name: 'Settings' });
    expect(within(nav).getByText('Mon to Fri, 09:00 to 18:00')).toBeInTheDocument();
  });

  it('WH-U11 loading shimmers the final shape; an end before the start is refused; a failed save says so', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { container, rerender } = render(<WorkHoursSection hours={{ hours: null, onChange }} />);
    expect(container.querySelector('.tp-wh-ld')).toHaveAttribute('aria-busy', 'true');
    // The same boxes before and after: the days and both fields are already there.
    expect(within(screen.getByRole('group', { name: 'Days' })).getAllByRole('button')).toHaveLength(7);
    expect(screen.getAllByRole('textbox')).toHaveLength(2);
    rerender(<WorkHoursSection hours={{ hours: DEFAULT_HOURS, onChange }} />);
    expect(container.querySelector('.tp-wh-ld')).toBeNull();
    expect(container.querySelector('.tp-wh-shown')).not.toBeNull();

    const start = screen.getByRole('textbox', { name: 'Every day starts at' });
    await user.clear(start);
    await user.type(start, '19:00{Enter}');
    expect(screen.getByText('The end needs to be after the start.')).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();

    rerender(<></>);
    rerender(<WorkHoursSection hours={{ hours: DEFAULT_HOURS, onChange, saveError: true }} />);
    expect(
      screen.getByText('Couldn’t save. Tudu will try again when you’re back online.'),
    ).toBeInTheDocument();
  });

  it('WH-U11 per day and back keeps Monday’s hours; no days at all is refused', async () => {
    const user = userEvent.setup();
    let hours: WorkHours = DEFAULT_HOURS;
    const onChange = vi.fn((h: WorkHours) => {
      hours = h;
      rerender(<WorkHoursSection hours={{ hours, onChange }} />);
    });
    const { rerender } = render(<WorkHoursSection hours={{ hours, onChange }} />);
    await user.click(screen.getByRole('button', { name: 'Set hours per day' }));
    expect(hours.same).toBe(false);
    const fri = screen.getByRole('textbox', { name: 'Friday ends at' });
    await user.clear(fri);
    await user.type(fri, '14:00{Enter}');
    expect(hours.days.find((d) => d.day === 5)).toEqual({ day: 5, start: '09:00', end: '14:00' });
    const mon = screen.getByRole('textbox', { name: 'Monday starts at' });
    await user.clear(mon);
    await user.type(mon, '08:30{Enter}');
    await user.click(screen.getByRole('button', { name: 'Same hours every day' }));
    expect(hours).toEqual({
      same: true,
      days: [1, 2, 3, 4, 5].map((day) => ({ day, start: '08:30', end: '18:00' })),
    });
    const calls = onChange.mock.calls.length;
    for (const d of ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'])
      await user.click(screen.getByRole('button', { name: d }));
    expect(screen.getByText('Pick at least one day.')).toBeInTheDocument();
    expect(onChange.mock.calls.length).toBe(calls + 4);
  });
});

describe('WH-U12 Nudges in the Mac app', () => {
  it('WH-U12 off shows the switch alone; on and allowed unfolds How often, Pause and Send now', async () => {
    const user = userEvent.setup();
    const onSwitch = vi.fn();
    const { container, rerender } = render(
      <WorkHoursSection hours={{ hours: DEFAULT_HOURS }} nudges={nudges({ onSwitch })} />,
    );
    const folds = container.querySelectorAll('.tp-wh-fold');
    expect([...folds].every((f) => !f.classList.contains('tp-open'))).toBe(true);
    await user.click(screen.getByRole('switch', { name: 'Nudge me in my hours' }));
    expect(onSwitch).toHaveBeenCalledWith(true);
    rerender(
      <WorkHoursSection
        hours={{ hours: DEFAULT_HOURS }}
        nudges={nudges({ on: true, permission: 'allowed' })}
      />,
    );
    expect(container.querySelectorAll('.tp-wh-fold.tp-open')).toHaveLength(1);
    expect(screen.getByText('Next at 11:00')).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'How often' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pause for today' })).toBeInTheDocument();
  });

  it('WH-U12 asking; macOS has them off (+ the guide and Open Notification settings); paused (+ Resume)', async () => {
    const user = userEvent.setup();
    const onOpenSettings = vi.fn();
    const { container, rerender } = render(
      <WorkHoursSection
        hours={{ hours: DEFAULT_HOURS }}
        nudges={nudges({ on: true, permission: 'asking' })}
      />,
    );
    expect(screen.getByText('Allow Tudu in the box macOS just showed.')).toBeInTheDocument();
    rerender(
      <WorkHoursSection
        hours={{ hours: DEFAULT_HOURS }}
        nudges={nudges({ on: true, permission: 'denied', onOpenSettings })}
      />,
    );
    expect(screen.getByText('macOS has Tudu’s notifications off.')).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Nudge me in my hours' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(screen.getByRole('list', { name: 'How to allow Tudu' })).toBeInTheDocument();
    expect(container.querySelectorAll('.tp-wh-fold.tp-open')).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Open Notification settings' }));
    expect(onOpenSettings).toHaveBeenCalled();
    const onResume = vi.fn();
    rerender(
      <WorkHoursSection
        hours={{ hours: DEFAULT_HOURS }}
        nudges={nudges({ on: true, permission: 'allowed', paused: 'Paused until Wednesday 09:00', onResume })}
      />,
    );
    expect(screen.getByText('Paused until Wednesday 09:00')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Resume' }));
    expect(onResume).toHaveBeenCalled();
  });

  it('WH-U12 Send now: sending, sent, failed', () => {
    const on = { on: true, permission: 'allowed' as const };
    const { rerender } = render(
      <WorkHoursSection hours={{ hours: DEFAULT_HOURS }} nudges={nudges({ ...on, test: 'sending' })} />,
    );
    expect(screen.getByText('Sending…')).toBeInTheDocument();
    rerender(<WorkHoursSection hours={{ hours: DEFAULT_HOURS }} nudges={nudges({ ...on, test: 'sent' })} />);
    expect(screen.getByText('Sent. It shows at the top right of your screen.')).toBeInTheDocument();
    rerender(
      <WorkHoursSection hours={{ hours: DEFAULT_HOURS }} nudges={nudges({ ...on, test: 'failed' })} />,
    );
    expect(
      screen.getByText('Couldn’t read today, so nothing was sent. Try again in a moment.'),
    ).toBeInTheDocument();
  });
});

describe('WH-U13 the web and phones', () => {
  it('WH-U13 without nudges the section says where they come from; the phone has no per-day link', () => {
    render(<WorkHoursSection hours={{ hours: DEFAULT_HOURS }} phone />);
    expect(
      screen.getByText('Nudges come from the Tudu app on a Mac. Your hours here are the ones it uses.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('switch', { name: 'Nudge me in my hours' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Set hours per day' })).toBeNull();
  });
});
