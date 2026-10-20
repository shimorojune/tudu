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
});

describe('TaskRow subtasks and due (chunk 03)', () => {
  const SUBS = [
    { key: 'a', title: 'Pull the branch', done: true },
    { key: 'b', title: 'Run it on a clean profile', done: false },
  ];

  it('C03-U15 the byline says "1 of 2 done ›" and opens the fold; the fold lines up under the title; comments and due read in words', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    const { container } = render(
      <TaskRow
        title="Review Quick Add PR"
        id="ME-52"
        subtasks={SUBS}
        comments={3}
        due={{ label: 'Fri', tip: 'Due Friday', iso: '2026-10-23' }}
        onAddSubtask={onAdd}
      />,
    );
    const byline = container.querySelector('.tp-byline')!;
    expect(byline.textContent).toBe('Due Fri·1 of 2 done·3 comments·ME-52');
    const fold = screen.getByRole('button', { name: '1 of 2 subtasks done. Show subtasks' });
    expect(fold).toHaveAttribute('aria-expanded', 'false');
    const wrap = container.querySelector('.tp-subwrap')!;
    expect(wrap).not.toHaveClass('tp-open');
    expect(screen.getByRole('group', { name: 'Subtasks of Review Quick Add PR' })).toHaveClass('tp-subs');
    expect(screen.getByRole('checkbox', { name: 'Cross off: Pull the branch' })).toHaveAttribute(
      'tabindex',
      '-1',
    );
    await user.click(fold);
    expect(fold).toHaveAttribute('aria-expanded', 'true');
    expect(fold).toHaveClass('tp-open');
    expect(wrap).toHaveClass('tp-open');
    expect(container.querySelector('.tp-row')).toHaveClass('tp-hassubs');
    expect(screen.getByRole('checkbox', { name: 'Cross off: Pull the branch' })).toHaveAttribute(
      'tabindex',
      '0',
    );
    // the fold is the design's: the guide line and the indent come from the stylesheet
    const subs = rulesWhere(rules, (s) => s === '.tp-subs')[0]!;
    expect(subs.declarations['padding']).toBe('0 24px 0 56px');
    expect(rulesWhere(rules, (s) => s === '.tp-subwrap::before')[0]!.declarations.left).toBe('35px');
    // "Add subtask" is the last line and writes a subtask
    await user.click(screen.getByRole('button', { name: 'Add subtask' }));
    await user.keyboard('Leave review comments{Enter}');
    expect(onAdd).toHaveBeenCalledWith('Leave review comments');
    // a crossed-off task keeps its subtasks folded
    await user.click(fold);
    expect(wrap).not.toHaveClass('tp-open');
  });

  it('C03-U16 Due replaces the carried pill; "Overdue since Fri" reads in red', () => {
    const { container, rerender } = render(
      <TaskRow
        title="Reply to legal"
        id="ME-81"
        carried={{ label: 'Wed', slipping: true }}
        due={{ label: 'Fri', tip: 'Was due Friday', overdue: true, iso: '2026-10-16' }}
      />,
    );
    expect(container.querySelector('.tp-sg-carried')).toBeNull();
    const due = container.querySelector('.tp-sg-due')!;
    expect(due.textContent).toBe('Overdue since Fri');
    expect(due).toHaveClass('tp-od');
    expect(rulesWhere(rules, (s) => s === '.tp-sg.tp-od')[0]!.declarations.color).toBe('var(--destructive)');
    rerender(<TaskRow title="Reply to legal" id="ME-81" due={{ label: 'Fri', iso: '2026-10-23' }} />);
    expect(container.querySelector('.tp-sg-due')!.textContent).toBe('Due Fri');
    expect(container.querySelector('.tp-sg-due')).not.toHaveClass('tp-od');
  });
});

describe('TaskRow project (chunk 04)', () => {
  it('C04-U11 the project dot and name sit in the byline after the Jira key; brief rows keep them', () => {
    const { container, rerender } = render(
      <TaskRow
        title="Run the migration"
        id="ME-47"
        comments={1}
        jira="TUDU-219"
        project={{ name: 'Platform', color: '#5b7553' }}
      />,
    );
    const byline = container.querySelector('.tp-byline')!;
    expect(byline.textContent).toBe('1 comment·TUDU-219·Platform·ME-47');
    const dot = byline.querySelector('.tp-sg-project .tp-dot') as HTMLElement;
    expect(dot.style.background).toBe('rgb(91, 117, 83)');
    expect(
      screen.getByRole('button', { name: 'Project · Platform. Show all tasks in Platform' }),
    ).toBeInTheDocument();
    rerender(
      <TaskRow
        title="Run the migration"
        id="ME-47"
        comments={1}
        project={{ name: 'Platform', color: '#5b7553' }}
        brief
      />,
    );
    expect(container.querySelector('.tp-byline')!.textContent).toBe('Platform');
  });
});
