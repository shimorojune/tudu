import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DayHeader } from './DayHeader';
import { REWARD_MS } from './DayProgress';
import { TaskList, type TaskItem } from './TaskList';

/** The day as the page builds it: the header's ring counts the list's crossed-off rows. */
function Day() {
  const [tasks, setTasks] = useState<TaskItem[]>([
    { key: 'a', title: 'Pay the electricity bill' },
    { key: 'b', title: 'Call Sam at 3pm' },
    { key: 'c', title: 'Book car service' },
  ]);
  const done = tasks.filter((t) => t.done).length;
  return (
    <>
      <DayHeader
        day="Sunday"
        date="18 October"
        eyebrow="Today · Week 42"
        isToday
        done={done}
        total={tasks.length}
      />
      <TaskList
        tasks={tasks}
        onToggleTask={(t, v) => setTasks((l) => l.map((x) => (x.key === t.key ? { ...x, done: v } : x)))}
      />
    </>
  );
}

afterEach(() => vi.useRealTimers());

describe('the day’s ring', () => {
  it('C02-U17 fills with the count and plays the reward once, when the last task is crossed off', () => {
    vi.useFakeTimers();
    const { container } = render(<Day />);
    const ring = () => container.querySelector('.tp-prog')!;
    expect(screen.getByRole('img', { name: '0 of 3 crossed off' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Cross off: Pay the electricity bill' }));
    expect(screen.getByRole('img', { name: '1 of 3 crossed off' })).not.toHaveClass('tp-party');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Cross off: Call Sam at 3pm' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Cross off: Book car service' }));
    expect(screen.getByRole('img', { name: 'All 3 crossed off' })).toHaveClass('tp-all', 'tp-party');
    expect(container.querySelectorAll('.tp-prog-sparks i')).toHaveLength(8);
    act(() => {
      vi.advanceTimersByTime(REWARD_MS);
    });
    expect(ring()).not.toHaveClass('tp-party');
    // uncrossing a task plays nothing; the ring opens again
    fireEvent.click(screen.getByRole('checkbox', { name: 'Cross off: Call Sam at 3pm' }));
    expect(screen.getByRole('img', { name: '2 of 3 crossed off' })).not.toHaveClass('tp-party');
  });
});
