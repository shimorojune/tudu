import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { TimeBlock } from '@tudu/core';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { TimeChoice } from './TimeChoice';

function Block({ isToday, now, start = null }: { isToday?: boolean; now?: Date; start?: TimeBlock | null }) {
  const [v, setV] = useState<TimeBlock | null>(start);
  return (
    <>
      <TimeChoice kind="block" value={v} onChange={setV} isToday={isToday} now={now} />
      <output data-testid="v">{v ? `${v.start}-${v.end}` : 'none'}</output>
    </>
  );
}
const val = () => screen.getByTestId('v').textContent;
const msg = () => document.querySelector('.tp-tc-msg') as HTMLElement;

describe('TimeChoice', () => {
  it('TT-U07 Add a time fills the next full hour for an hour; end before start keeps the old end, red edge, words fold open; × clears', async () => {
    const user = userEvent.setup();
    render(<Block isToday now={new Date(2026, 9, 18, 14, 10)} />);
    await user.click(screen.getByRole('button', { name: 'Add a time' }));
    expect(val()).toBe('15:00-16:00');
    expect(screen.getAllByRole('spinbutton', { name: 'Hour' })[0]).toHaveFocus();
    const end = screen.getByRole('group', { name: /^Ends at/ });
    end.querySelector<HTMLElement>('[data-seg="h"]')!.focus();
    await user.keyboard('{ArrowDown}');
    expect(val()).toBe('15:00-16:00');
    expect(end).toHaveClass('tp-bad');
    expect(msg()).toHaveClass('tp-in');
    expect(msg()).toHaveTextContent('It has to end after it starts');
    await user.keyboard('{ArrowUp}');
    expect(val()).toBe('15:00-17:00');
    expect(msg()).not.toHaveClass('tp-in');
    await user.click(screen.getByRole('button', { name: 'Remove time' }));
    expect(val()).toBe('none');
    expect(screen.getByRole('button', { name: 'Add a time' })).toBeInTheDocument();
  });

  it('TT-U07 another day starts at 9 AM; moving the start keeps the length', async () => {
    const user = userEvent.setup();
    render(<Block />);
    await user.click(screen.getByRole('button', { name: 'Add a time' }));
    expect(val()).toBe('09:00-10:00');
    await user.keyboard('{ArrowUp}');
    expect(val()).toBe('10:00-11:00');
  });

  it('TT-U08 a time gone by today says so; another day never; the line folds, not removed, when quiet', () => {
    const now = new Date(2026, 9, 18, 16, 30);
    const { rerender } = render(
      <TimeChoice kind="block" value={{ start: '15:00', end: '16:00' }} isToday now={now} />,
    );
    expect(msg()).toHaveClass('tp-in');
    expect(msg()).toHaveTextContent('That’s already over today');
    rerender(<TimeChoice kind="due" value="16:00" isToday now={now} />);
    expect(msg()).toHaveTextContent('That time has passed today');
    rerender(<TimeChoice kind="due" value="16:00" now={now} />);
    expect(msg()).toBeInTheDocument();
    expect(msg()).not.toHaveClass('tp-in');
  });

  it('TT-U07 Due: one field, Due at', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<TimeChoice kind="due" value={null} onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: 'Add a time' }));
    expect(onChange).toHaveBeenCalledWith('09:00');
  });
});
