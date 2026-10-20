import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseRules, readStylesheet, rulesWhere } from '../test-utils/stylesheet';
import { TaskRow, COPY_FLASH_MS, type TaskRowProps } from './TaskRow';
import { ToastHost } from './Toast';

const rules = parseRules(readStylesheet('components.css'));

/** A row whose crossed-off state lives in the test, as the list keeps it. */
function Row(props: Partial<TaskRowProps> & { start?: boolean }) {
  const [done, setDone] = useState(!!props.start);
  return (
    <TaskRow
      title="Pay the electricity bill"
      id="ME-58"
      {...props}
      done={done}
      onToggle={(v) => {
        setDone(v);
        props.onToggle?.(v);
      }}
    />
  );
}

afterEach(() => vi.useRealTimers());

describe('TaskRow', () => {
  it('C02-U01 shows the checkbox, the title and a byline with the ID last; a bare row stays one line', () => {
    const { container, rerender } = render(
      <TaskRow
        title="Sync with Meera"
        id="ME-41"
        carried={{ label: 'Sat', tip: 'Carried over from Saturday' }}
      />,
    );
    expect(screen.getByRole('checkbox', { name: 'Cross off: Sync with Meera' })).toHaveAttribute(
      'aria-checked',
      'false',
    );
    expect(screen.getByText('Sync with Meera')).toHaveClass('tp-strike');
    const byline = container.querySelector('.tp-byline')!;
    const items = Array.from(byline.querySelectorAll('button'));
    expect(items.map((b) => b.textContent)).toEqual(['From Sat', 'ME-41']);
    expect(items.at(-1)).toHaveClass('tp-sg-id', 'tp-mono');
    expect(within(byline as HTMLElement).getAllByText('·')).toHaveLength(1);

    // a task the server has not numbered yet, with nothing else to say, has no byline at all
    rerender(<TaskRow title="Just written" />);
    expect(container.querySelector('.tp-byline')).toBeNull();
    expect(container.querySelectorAll('.tp-row')).toHaveLength(1);
  });

  it('C02-U02 crossing off sets aria-checked, strikes after the tick and sparkles once; uncrossing plays nothing', () => {
    vi.useFakeTimers();
    const onToggle = vi.fn();
    const { container } = render(<Row onToggle={onToggle} />);
    const box = screen.getByRole('checkbox', { name: 'Cross off: Pay the electricity bill' });
    const spark = screen.getByTestId('sparkle');
    fireEvent.click(box);
    expect(onToggle).toHaveBeenLastCalledWith(true);
    expect(box).toHaveAttribute('aria-checked', 'true');
    expect(container.querySelector('.tp-row')).toHaveClass('tp-done');
    expect(spark).toHaveClass('tp-go');
    // the strike fades in 120ms after the tick starts
    const strike = rulesWhere(rules, (s) => s === '.tp-strike')[0]!;
    expect(strike.declarations.transition).toMatch(
      /text-decoration-color var\(--dur-tick\) var\(--ease-change\) 120ms/,
    );
    expect(
      rulesWhere(rules, (s) => s === '.tp-done .tp-strike')[0]!.declarations['text-decoration-line'],
    ).toBe('line-through');
    act(() => {
      vi.advanceTimersByTime(900);
    });
    expect(spark).not.toHaveClass('tp-go');
    fireEvent.click(box);
    expect(onToggle).toHaveBeenLastCalledWith(false);
    expect(box).toHaveAttribute('aria-checked', 'false');
    expect(spark).not.toHaveClass('tp-go');
  });

  it('C02-U03 a click anywhere on the row opens it; the checkbox and byline items do not', async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    const onSignal = vi.fn();
    const { container } = render(<Row onOpen={onOpen} onSignal={onSignal} comments={2} />);
    await user.click(container.querySelector('.tp-main')!);
    await user.click(screen.getByText('Pay the electricity bill'));
    expect(onOpen).toHaveBeenCalledTimes(2);
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: '2 comments. Open comments' }));
    expect(onOpen).toHaveBeenCalledTimes(2);
    expect(onSignal).toHaveBeenCalledWith('comments');
    // with the keyboard: Tab to the title and press Enter
    screen.getByRole('button', { name: 'Pay the electricity bill' }).focus();
    await user.keyboard('{Enter}');
    expect(onOpen).toHaveBeenCalledTimes(3);
    expect(container.querySelector('.tp-row')).toHaveClass('tp-openable');
  });

  it('C02-U04 clicking the ID copies it, flashes in place and says "Copied ME-58"', () => {
    vi.useFakeTimers();
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const onOpen = vi.fn();
    render(
      <>
        <Row onOpen={onOpen} />
        <ToastHost />
      </>,
    );
    const id = screen.getByRole('button', { name: 'Copy task ID ME-58' });
    fireEvent.click(id);
    expect(writeText).toHaveBeenCalledWith('ME-58');
    expect(id).toHaveClass('tp-flash');
    expect(id).toHaveTextContent('ME-58'); // the words never change, so nothing shifts
    expect(screen.getByText('Copied ME-58')).toBeInTheDocument();
    expect(onOpen).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(COPY_FLASH_MS);
    });
    expect(id).not.toHaveClass('tp-flash');
  });

  it('C02-U05 the carried pill reads "From Sat", turns red when slipping, and its picker keeps or moves the task', async () => {
    const user = userEvent.setup();
    const onPlan = vi.fn();
    const calendar = { today: '2026-10-18', selected: '2026-10-18' };
    const { rerender } = render(
      <TaskRow
        title="Sync with Meera"
        id="ME-41"
        carried={{ label: 'Sat', tip: 'Carried over from Saturday' }}
        calendar={calendar}
        planned="2026-10-18"
        onPlan={onPlan}
      />,
    );
    const pill = screen.getByRole('button', { name: 'Carried over from Saturday. Change the date' });
    expect(pill).toHaveTextContent('From Sat');
    expect(pill).not.toHaveClass('tp-od');
    await user.click(pill);
    const pop = screen.getByRole('dialog', { name: 'Carried over from Saturday' });
    expect(pill).toHaveAttribute('aria-expanded', 'true');
    // Today is the day it is on: picking it keeps it here
    await user.click(within(pop).getByRole('button', { name: /^Today/ }));
    expect(onPlan).toHaveBeenLastCalledWith('2026-10-18');
    await user.click(pill);
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: /^Tomorrow/ }));
    expect(onPlan).toHaveBeenLastCalledWith('2026-10-19');

    rerender(
      <TaskRow
        title="Sync with Meera"
        carried={{ label: 'Fri', tip: 'Carried over from Friday', slipping: true }}
        calendar={calendar}
      />,
    );
    expect(screen.getByRole('button', { name: /Carried over from Friday/ })).toHaveClass('tp-od');
    // crossed off, the pill no longer opens a picker
    rerender(<TaskRow title="Sync with Meera" done carried={{ label: 'Sat' }} calendar={calendar} />);
    expect(screen.getByRole('button', { name: /Carried over from Sat/ })).not.toHaveAttribute(
      'aria-haspopup',
    );
  });

  it('C02-U06 titles clamp to two lines (three on phones) and keep the full text in the title attribute', () => {
    const long =
      'Write up what we learned from the onboarding interviews with the five pilot customers and share it with the team';
    const { container, rerender } = render(<TaskRow title={long} />);
    expect(container.querySelector('.tp-title')).not.toHaveClass('tp-l3');
    expect(screen.getByText(long)).toHaveAttribute('title', long);
    expect(rulesWhere(rules, (s) => s === '.tp-title')[0]!.declarations['-webkit-line-clamp']).toBe('2');
    expect(rulesWhere(rules, (s) => s === '.tp-title.tp-l3')[0]!.declarations['-webkit-line-clamp']).toBe(
      '3',
    );
    rerender(<TaskRow title={long} compact />);
    expect(container.querySelector('.tp-title')).toHaveClass('tp-l3');
    expect(container.querySelector('.tp-row')).toHaveClass('tp-compact');
  });

  it('writes the title in place: Enter saves, Esc puts the old words back, an emptied title keeps them', async () => {
    const user = userEvent.setup();
    const onRename = vi.fn();
    const onEditEnd = vi.fn();
    const { rerender } = render(
      <TaskRow title="Call Sam" editing onRename={onRename} onEditEnd={onEditEnd} />,
    );
    const field = screen.getByRole('textbox', { name: 'Task title' });
    expect(field).toHaveFocus();
    await user.type(field, ' at 3pm{Enter}');
    expect(onRename).toHaveBeenCalledWith('Call Sam at 3pm');
    expect(onEditEnd).toHaveBeenCalledTimes(1);

    rerender(<TaskRow title="Call Sam" editing={false} onRename={onRename} onEditEnd={onEditEnd} />);
    rerender(<TaskRow title="Call Sam" editing onRename={onRename} onEditEnd={onEditEnd} />);
    await user.type(screen.getByRole('textbox'), ' tomorrow{Escape}');
    expect(onRename).toHaveBeenCalledTimes(1);

    rerender(<TaskRow title="Call Sam" editing={false} onRename={onRename} onEditEnd={onEditEnd} />);
    rerender(<TaskRow title="Call Sam" editing onRename={onRename} onEditEnd={onEditEnd} />);
    await user.clear(screen.getByRole('textbox'));
    await user.keyboard('{Enter}');
    expect(onRename).toHaveBeenCalledTimes(1);
  });
});
