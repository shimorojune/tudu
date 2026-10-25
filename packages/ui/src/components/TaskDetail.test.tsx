import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseRules, readStylesheet, rulesWhere } from '../test-utils/stylesheet';
import { POP_LEAVE_MS } from '../lib/linger';
import { Drawer } from './Drawer';
import { COMMENT_FRESH_MS, TaskDetail, type TaskDetailProps, type TaskDetailTask } from './TaskDetail';
import { ToastHost } from './Toast';

const rules = parseRules(readStylesheet('components.css'));
const TODAY = '2026-10-18';

const FULL: TaskDetailTask = {
  key: 't52',
  id: 'ME-52',
  title: 'Review Quick Add PR',
  done: false,
  day: TODAY,
  due: '2026-10-16',
  visibility: 'space',
  notes: '<p>Meera wants a <strong>yes or no</strong> by Monday.</p>',
  subtasks: [
    { key: 'a', title: 'Pull the branch', done: true },
    { key: 'b', title: 'Run it on a clean profile', done: false },
  ],
  comments: [
    {
      key: 'c1',
      who: 'Meera Iyer',
      initials: 'MI',
      when: 'Thu 10:12',
      html: '<p>PR is up.</p>',
      mine: false,
    },
    {
      key: 'c2',
      who: 'Rohit Raj',
      initials: 'RR',
      when: 'Thu 16:40',
      html: '<p>Will review tomorrow.</p>',
      mine: true,
    },
  ],
  history: [
    { key: 1, text: 'Created', when: 'Wed' },
    { key: 2, text: 'Due date set to Fri 16 Oct', when: 'Thu' },
  ],
};

const FRESH: TaskDetailTask = {
  key: 't90',
  id: 'ME-90',
  title: 'Order a new desk lamp',
  done: false,
  day: TODAY,
  due: null,
  visibility: 'space',
  notes: '',
  subtasks: [],
  comments: [],
  history: [{ key: 1, text: 'Created', when: 'Just now' }],
};

const ME = { initials: 'RR', name: 'Rohit Raj' };
const VIS = [{ value: 'space' as const, label: 'Only you' }];

/** The panel with its task kept in state, as the page keeps it through the store. */
function Panel(props: Partial<TaskDetailProps> & { initial?: TaskDetailTask; switchTo?: TaskDetailTask }) {
  const [task, setTask] = useState(props.initial ?? FULL);
  // The page shows another task: the same panel, a different task.
  const [seen, setSeen] = useState(props.switchTo);
  if (props.switchTo !== seen) {
    setSeen(props.switchTo);
    if (props.switchTo) setTask(props.switchTo);
  }
  let n = 0;
  return (
    <>
      <TaskDetail
        today={TODAY}
        me={ME}
        visibility={VIS}
        calendar={{ marks: { '2026-10-19': 2 } }}
        link="https://tudu.test/t/ME-52"
        onAddSubtask={() => {}}
        {...props}
        task={task}
        onRename={(t) => {
          setTask((x) => ({ ...x, title: t }));
          props.onRename?.(t);
        }}
        onCross={(v) => {
          setTask((x) => ({ ...x, done: v }));
          props.onCross?.(v);
        }}
        onDue={(d) => {
          setTask((x) => ({ ...x, due: d }));
          props.onDue?.(d);
        }}
        onAddComment={(html) => {
          const key = `n${n++}`;
          setTask((x) => ({
            ...x,
            comments: [
              ...x.comments,
              { key, who: ME.name, initials: ME.initials, when: 'Just now', html, mine: true },
            ],
          }));
          props.onAddComment?.(html);
          return key;
        }}
        onEditComment={(c, html) => {
          setTask((x) => ({
            ...x,
            comments: x.comments.map((y) => (y.key === c.key ? { ...y, html, edited: true } : y)),
          }));
          props.onEditComment?.(c, html);
        }}
        onDeleteComment={(c) => {
          setTask((x) => ({ ...x, comments: x.comments.filter((y) => y.key !== c.key) }));
          props.onDeleteComment?.(c);
        }}
        onRestoreComment={(c) => {
          setTask((x) => ({ ...x, comments: [...x.comments, c] }));
          props.onRestoreComment?.(c);
        }}
      />
      <ToastHost />
    </>
  );
}

afterEach(() => vi.useRealTimers());

describe('TaskDetail', () => {
  it('C03-U01 one calm column: ID, title, Planned, Due, Visible to, Notes, Subtasks, History, Comments; a fresh task invites you in', () => {
    const { container } = render(<Panel />);
    expect(screen.getByRole('button', { name: 'Copy link to ME-52' })).toHaveTextContent('ME-52');
    expect(screen.getByRole('textbox', { name: 'Task title' })).toHaveValue('Review Quick Add PR');
    const facts = container.querySelectorAll('.tp-td-prop dt span');
    expect(Array.from(facts).map((e) => e.textContent)).toEqual(['Planned', 'Due', 'Visible to']);
    expect(screen.getByRole('button', { name: 'Planned' })).toHaveTextContent('Today · Sun 18 Oct');
    expect(screen.getByRole('button', { name: 'Due' })).toHaveTextContent('Fri 16 Oct2 days overdue');
    expect(screen.getByRole('button', { name: 'Due' }).querySelector('.tp-td-note')).toHaveClass('tp-od');
    expect(screen.getByRole('button', { name: 'Visible to' })).toHaveTextContent('Only you');
    const heads = Array.from(container.querySelectorAll('.tp-td-h')).map((e) => e.textContent);
    expect(heads).toEqual(['Notes', 'Subtasks1 of 2', 'History2 events', 'Comments2']);
    expect(screen.getByRole('textbox', { name: 'Notes' }).innerHTML).toContain('<strong>yes or no</strong>');
    expect(screen.getByRole('textbox', { name: 'Write a comment' })).toBeInTheDocument();
    expect(container.querySelector('.tp-td-compose')).not.toBeNull();
    // the order on the page
    const order = Array.from(container.querySelectorAll('.tp-td-body > *, .tp-td-body section')).map(
      (e) => e.className,
    );
    expect(order.indexOf('tp-td-head')).toBeLessThan(order.indexOf('tp-td-sec'));

    // a task just written: every empty fact invites you in
    const { container: c2 } = render(<Panel initial={FRESH} />);
    expect(within(c2).getByRole('button', { name: 'Due' })).toHaveTextContent('Add a due date');
    expect(within(c2).getByRole('button', { name: 'Due' })).toHaveClass('tp-td-empty');
    expect(within(c2).getByRole('textbox', { name: 'Notes' })).toHaveAttribute(
      'data-placeholder',
      'Add notes, links, anything that helps…',
    );
    expect(within(c2).getByRole('button', { name: 'Add subtask' })).toBeInTheDocument();
    expect(within(c2).getByText('No comments yet.')).toBeInTheDocument();
  });

  it('C03-U02 the title edits in place: Enter and blur save, Esc and a blank put the old words back, no newlines', async () => {
    const user = userEvent.setup();
    const onRename = vi.fn();
    render(<Panel onRename={onRename} />);
    const title = screen.getByRole('textbox', { name: 'Task title' });
    await user.click(title);
    await user.keyboard(' before Monday{Enter}');
    expect(onRename).toHaveBeenCalledWith('Review Quick Add PR before Monday');
    expect(title).not.toHaveFocus();
    await user.click(title);
    await user.keyboard(' now{Escape}');
    expect(onRename).toHaveBeenCalledTimes(1);
    expect(title).toHaveValue('Review Quick Add PR before Monday');
    await user.clear(title);
    act(() => title.blur());
    expect(onRename).toHaveBeenCalledTimes(1);
    expect(title).toHaveValue('Review Quick Add PR before Monday');
    await user.click(title);
    await user.paste('a\nb');
    expect(title).toHaveValue('Review Quick Add PR before Mondaya b');
  });

  it('C03-U03 the checkbox crosses off from the panel; it takes the crossed-off look', async () => {
    const user = userEvent.setup();
    const onCross = vi.fn();
    const { container } = render(<Panel onCross={onCross} />);
    await user.click(screen.getByRole('checkbox', { name: 'Cross off: Review Quick Add PR' }));
    expect(onCross).toHaveBeenCalledWith(true);
    expect(container.querySelector('.tp-td')).toHaveClass('tp-done');
    expect(screen.getByRole('checkbox', { name: 'Not done: Review Quick Add PR' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(
      rulesWhere(rules, (s) => s === '.tp-td.tp-done .tp-td-title')[0]!.declarations['text-decoration-line'],
    ).toBe('line-through');
  });

  it('C03-U04 Planned opens the calendar under the fact; a pick moves it and closes; "carried from Sat" reads beside it, red when slipping', async () => {
    const user = userEvent.setup();
    const onMove = vi.fn();
    const { container } = render(
      <Panel onMove={onMove} initial={{ ...FULL, carried: { label: 'Sat', slipping: false } }} />,
    );
    const planned = screen.getByRole('button', { name: 'Planned' });
    expect(planned).toHaveTextContent('carried from Sat');
    expect(planned.querySelector('.tp-td-note')).not.toHaveClass('tp-od');
    await user.click(planned);
    expect(planned).toHaveAttribute('aria-expanded', 'true');
    const pop = container.querySelector('.tp-td-pop')!;
    expect(pop).not.toBeNull();
    expect(within(pop as HTMLElement).getByRole('button', { name: 'Tomorrow' })).toBeInTheDocument();
    expect(
      within(pop as HTMLElement).getByRole('button', { name: 'Move to the Backlog' }),
    ).toBeInTheDocument();
    await user.click(within(pop as HTMLElement).getByRole('button', { name: /19 October/ }));
    expect(onMove).toHaveBeenCalledWith('2026-10-19');
    expect(planned).toHaveAttribute('aria-expanded', 'false');
    const { container: c2 } = render(
      <Panel initial={{ ...FULL, key: 't81', carried: { label: 'Wed', slipping: true } }} />,
    );
    expect(within(c2).getByRole('button', { name: 'Planned' }).querySelector('.tp-td-note')).toHaveClass(
      'tp-od',
    );
  });

  it('C03-U05 Due: pick a day, the hover hint says how far, Remove due date clears it', async () => {
    const user = userEvent.setup();
    const onDue = vi.fn();
    const { container } = render(<Panel onDue={onDue} initial={FRESH} />);
    const due = screen.getByRole('button', { name: 'Due' });
    await user.click(due);
    const pop = container.querySelector('.tp-td-pop') as HTMLElement;
    expect(within(pop).getByText('Pick a due date')).toBeInTheDocument();
    await user.hover(within(pop).getByRole('button', { name: /21 October/ }));
    expect(within(pop).getByText('Wed 21 Oct · in 3 days')).toBeInTheDocument();
    await user.click(within(pop).getByRole('button', { name: /21 October/ }));
    expect(onDue).toHaveBeenCalledWith('2026-10-21');
    expect(due).toHaveTextContent('Wed 21 Octin 3 days');
    await user.click(due);
    await user.click(
      within(container.querySelector('.tp-td-pop') as HTMLElement).getByRole('button', {
        name: 'Remove due date',
      }),
    );
    expect(onDue).toHaveBeenLastCalledWith(null);
    expect(due).toHaveTextContent('Add a due date');
  });

  it('C03-U06 Esc steps out of a picker first and gives focus back to its fact; the pop eases out', async () => {
    vi.useFakeTimers();
    const onClose = vi.fn();
    const { container } = render(<Panel onClose={onClose} />);
    const due = screen.getByRole('button', { name: 'Due' });
    fireEvent.click(due);
    const pop = container.querySelector('.tp-td-pop')!;
    const day = within(pop as HTMLElement).getByRole('button', { name: /21 October/ });
    day.focus();
    fireEvent.keyDown(day, { key: 'Escape' });
    expect(due).toHaveAttribute('aria-expanded', 'false');
    expect(due).toHaveFocus();
    expect(container.querySelector('.tp-td-pop')).toHaveClass('tp-pop-leaving');
    act(() => {
      vi.advanceTimersByTime(POP_LEAVE_MS + 10);
    });
    expect(container.querySelector('.tp-td-pop')).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    expect(rulesWhere(rules, (s) => s === '.tp-pop-leaving')[0]!.declarations.animation).toMatch(
      /tp-pop-out 130ms/,
    );
  });

  it('C03-U07 next and previous: the content slides in from the side you are heading to; arrows only where there is a neighbour', () => {
    const { container } = render(<Panel onNext={() => {}} />);
    expect(screen.getByRole('button', { name: 'Next task' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Previous task' })).toBeNull();
    expect(container.querySelector('.tp-td-body')).toHaveClass('tp-td-in-next');
    const { container: c2 } = render(<Panel onPrev={() => {}} initial={FRESH} turnDir="prev" />);
    expect(c2.querySelector('.tp-td-body')).toHaveClass('tp-td-in-prev');
    expect(within(c2).getByRole('textbox', { name: 'Task title' })).toHaveValue('Order a new desk lamp');
    expect(within(c2).queryByRole('button', { name: 'Next task' })).toBeNull();
    expect(rulesWhere(rules, (s) => s === '.tp-td-body.tp-td-in-prev')[0]!.declarations.animation).toMatch(
      /tp-in-prev 220ms var\(--ease-arrive\)/,
    );
  });

  it('C03-U08 ⋯: Copy link copies the link with a toast, Copy task ID copies it, Delete task asks the page', async () => {
    const user = userEvent.setup();
    const write = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: write }, configurable: true });
    const onDelete = vi.fn();
    render(<Panel onDelete={onDelete} />);
    await user.click(screen.getByRole('button', { name: 'More' }));
    const menu = screen.getByRole('menu', { name: 'More' });
    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map((m) => m.textContent),
    ).toEqual(['Copy link to task', 'Copy task IDME-52', 'Delete task']);
    await user.click(within(menu).getByRole('menuitem', { name: 'Copy link to task' }));
    expect(write).toHaveBeenCalledWith('https://tudu.test/t/ME-52');
    expect(await screen.findByRole('status')).toHaveTextContent('Link copied');
    await user.click(screen.getByRole('button', { name: 'More' }));
    await user.click(screen.getByRole('menuitem', { name: /Copy task ID/ }));
    expect(write).toHaveBeenLastCalledWith('ME-52');
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Copied ME-52'));
    await user.click(screen.getByRole('button', { name: 'More' }));
    const del = screen.getByRole('menuitem', { name: 'Delete task' });
    expect(del).toHaveClass('tp-mi-danger');
    await user.click(del);
    expect(onDelete).toHaveBeenCalledTimes(1);
    // the ID at the top copies the link (C03-U25)
    await user.click(screen.getByRole('button', { name: 'Copy link to ME-52' }));
    expect(write).toHaveBeenLastCalledWith('https://tudu.test/t/ME-52');
  });

  it('C03-U09 switching tasks resets every field, picker and fold', async () => {
    const user = userEvent.setup();
    const { container, rerender } = render(<Panel key="a" />);
    await user.click(screen.getByRole('button', { name: /^History/ }));
    expect(screen.getByRole('button', { name: /^History/ })).toHaveAttribute('aria-expanded', 'true');
    await user.click(screen.getByRole('button', { name: 'Due' }));
    expect(container.querySelector('.tp-td-pop')).not.toBeNull();
    await user.click(screen.getByRole('textbox', { name: 'Task title' }));
    await user.keyboard(' unsaved');
    rerender(<Panel key="a" initial={FRESH} switchTo={FRESH} />);
    expect(screen.getByRole('textbox', { name: 'Task title' })).toHaveValue('Order a new desk lamp');
    expect(screen.getByRole('button', { name: 'Due' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('button', { name: /^History/ })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('textbox', { name: 'Notes' }).textContent).toBe('');
  });

  it('C03-U17 History folds by default with its count; it opens with the events in order and their day words', async () => {
    const user = userEvent.setup();
    const { container } = render(<Panel />);
    const btn = screen.getByRole('button', { name: /^History/ });
    expect(btn).toHaveTextContent('History2 events');
    expect(btn).toHaveAttribute('aria-expanded', 'false');
    const fold = container.querySelector('.tp-td-hist')!;
    expect(fold).not.toHaveClass('tp-open');
    expect(container.querySelector('.tp-td-evts')).toHaveAttribute('aria-hidden', 'true');
    await user.click(btn);
    expect(fold).toHaveClass('tp-open');
    expect(btn).toHaveClass('tp-open');
    const rows = Array.from(container.querySelectorAll('.tp-td-evt')).map((li) => li.textContent);
    expect(rows).toEqual(['CreatedWed', 'Due date set to Fri 16 OctThu']);
    expect(rulesWhere(rules, (s) => s === '.tp-td-hist')[0]!.declarations.transition).toMatch(
      /grid-template-rows var\(--dur-fold\)/,
    );
    // a task with no history shows no fold
    const { container: c2 } = render(<Panel initial={{ ...FRESH, history: [] }} />);
    expect(within(c2).queryByRole('button', { name: /^History/ })).toBeNull();
  });

  it('C03-U18 a new comment appears with the wash and the panel scrolls to it; Edit saves with "edited"; Delete removes it and Undo brings it back', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    const onRestore = vi.fn();
    const { container } = render(
      <Panel
        onAddComment={onAdd}
        onEditComment={onEdit}
        onDeleteComment={onDelete}
        onRestoreComment={onRestore}
      />,
    );
    const scroller = container.querySelector('.tp-td-scroll') as HTMLElement;
    const scrollTo = vi.fn();
    scroller.scrollTo = scrollTo;
    scroller.getBoundingClientRect = () => ({ top: 0, bottom: 300, height: 300 }) as DOMRect;
    const box = screen.getByRole('textbox', { name: 'Write a comment' });
    await user.click(box);
    await user.keyboard('Thanks, demo moved.');
    const li = () => container.querySelectorAll('.tp-td-cmt');
    const before = li().length;
    const send = screen.getByRole('button', { name: 'Comment' });
    // the new comment sits below the fold of the scroller
    fireEvent.click(send);
    expect(onAdd).toHaveBeenCalledWith('<p>Thanks, demo moved.</p>');
    expect(li()).toHaveLength(before + 1);
    const fresh = li()[before]!;
    expect(fresh).toHaveClass('tp-fresh');
    expect(fresh.textContent).toContain('Rohit RajJust now');
    expect(rulesWhere(rules, (s) => s === '.tp-td-cmt.tp-fresh::before')[0]!.declarations.animation).toMatch(
      /tp-cmt-wash 1700ms/,
    );
    await waitFor(() => expect(fresh).not.toHaveClass('tp-fresh'), { timeout: COMMENT_FRESH_MS + 1500 });

    // only your own comments have the ⋯
    const mine = li()[1]!;
    const theirs = li()[0]!;
    expect(within(theirs as HTMLElement).queryByRole('button', { name: 'Comment options' })).toBeNull();
    await user.click(within(mine as HTMLElement).getByRole('button', { name: 'Comment options' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Edit comment' }));
    const editor = within(mine as HTMLElement).getByRole('textbox', { name: 'Edit comment' });
    expect(editor.textContent).toBe('Will review tomorrow.');
    // it opens with the caret at the end of the words
    await waitFor(() => expect(editor).toHaveFocus());
    await user.keyboard(' Morning.');
    await user.click(within(mine as HTMLElement).getByRole('button', { name: 'Save' }));
    expect(onEdit).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'c2' }),
      '<p>Will review tomorrow. Morning.</p>',
    );
    expect(li()[1]!.textContent).toContain('· edited');

    await user.click(within(li()[1] as HTMLElement).getByRole('button', { name: 'Comment options' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Delete comment' }));
    expect(onDelete).toHaveBeenCalledWith(expect.objectContaining({ key: 'c2' }));
    expect(li()).toHaveLength(before);
    expect(screen.getByRole('status')).toHaveTextContent('Comment deleted');
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(onRestore).toHaveBeenCalledWith(expect.objectContaining({ key: 'c2' }));
    expect(li()).toHaveLength(before + 1);
  });

  it('C03-U19 more than five comments fold behind "Show N earlier comments"', async () => {
    const user = userEvent.setup();
    const many = Array.from({ length: 7 }, (_, i) => ({
      key: `k${i}`,
      who: 'Meera Iyer',
      initials: 'MI',
      when: 'Thu',
      html: `<p>Comment ${i + 1}</p>`,
      mine: false,
    }));
    const { container } = render(<Panel initial={{ ...FULL, comments: many }} />);
    expect(container.querySelectorAll('.tp-td-cmt')).toHaveLength(3);
    expect(container.querySelector('.tp-td-cmt')!.textContent).toContain('Comment 5');
    await user.click(screen.getByRole('button', { name: 'Show 4 earlier comments' }));
    expect(container.querySelectorAll('.tp-td-cmt')).toHaveLength(7);
    expect(screen.queryByRole('button', { name: /earlier comments/ })).toBeNull();
  });

  it('C03-U20 on phones the panel is its own page: fullscreen, a back button with the day’s name, no ×; reduced motion fades', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <Drawer open onClose={onClose} label="Task details" fullscreen>
        <Panel compact backLabel="Today" onClose={onClose} />
      </Drawer>,
    );
    expect(document.querySelector('.tp-drawer-wrap')).toHaveClass('tp-full');
    expect(document.querySelector('.tp-drawer-veil')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull();
    const back = screen.getByRole('button', { name: 'Today' });
    expect(back).toHaveClass('tp-td-back');
    expect(document.querySelector('.tp-td')).toHaveClass('tp-compact');
    await user.click(back);
    expect(onClose).toHaveBeenCalled();
    const full = rules.filter((r) => r.selector.includes('.tp-full') && r.selector.includes('.tp-drawer'));
    expect(full.length).toBeGreaterThan(0);
    const reduced = rules.filter(
      (r) => r.selector.includes('.tp-drawer') && r.context.some((c) => c.includes('prefers-reduced-motion')),
    );
    expect(reduced.length).toBeGreaterThan(0);
  });
});

describe('TaskDetail project (chunk 04)', () => {
  it('C04-U12 the Project fact: the picker with dots, No project and New project…; "Add to a project" when empty', async () => {
    const user = userEvent.setup();
    const onProject = vi.fn();
    const onNewProject = vi.fn(() => 'new-1');
    const projects = [
      { id: 'nw', name: 'Northwind', color: '#3d5a80' },
      { id: 'pf', name: 'Platform', color: '#5b7553' },
    ];
    const { container } = render(
      <Panel
        initial={{ ...FULL, projectId: null }}
        projects={projects}
        onProject={onProject}
        onNewProject={onNewProject}
      />,
    );
    const facts = Array.from(container.querySelectorAll('.tp-td-prop dt span')).map((e) => e.textContent);
    expect(facts).toEqual(['Planned', 'Due', 'Project', 'Visible to']);
    const fact = screen.getByRole('button', { name: 'Project' });
    expect(fact).toHaveTextContent('Add to a project');
    expect(fact).toHaveClass('tp-td-empty');
    await user.click(fact);
    const pop = container.querySelector('.tp-td-pop') as HTMLElement;
    expect(
      within(pop)
        .getAllByRole('menuitem')
        .map((m) => m.textContent),
    ).toEqual(['Northwind', 'Platform', 'New project…']);
    await user.click(within(pop).getByRole('menuitem', { name: 'Platform' }));
    expect(onProject).toHaveBeenCalledWith('pf');
    const { container: c2 } = render(
      <Panel
        initial={{ ...FULL, key: 't2', projectId: 'pf' }}
        projects={projects}
        onProject={onProject}
        onNewProject={onNewProject}
      />,
    );
    const fact2 = within(c2).getByRole('button', { name: 'Project' });
    expect(fact2).toHaveTextContent('Platform');
    expect((fact2.querySelector('.tp-dot') as HTMLElement).style.background).toBe('rgb(91, 117, 83)');
    await user.click(fact2);
    const pop2 = c2.querySelector('.tp-td-pop') as HTMLElement;
    await user.click(within(pop2).getByRole('menuitem', { name: 'New project…' }));
    await user.type(within(pop2).getByRole('textbox', { name: 'Project name' }), 'Home{Enter}');
    expect(onNewProject).toHaveBeenCalledWith('Home', '#8a5a00');
    expect(onProject).toHaveBeenLastCalledWith('new-1');
    // without a project list the fact stays out
    const { container: c3 } = render(<Panel initial={{ ...FULL, key: 't3' }} />);
    expect(Array.from(c3.querySelectorAll('.tp-td-prop dt span')).map((e) => e.textContent)).toEqual([
      'Planned',
      'Due',
      'Visible to',
    ]);
  });
});

describe('TaskDetail, someone else’s task (chunk 08)', () => {
  it('C08-U07 Visible to lists "Everyone in Northwind" and "Only you" in a team space and picking reports', async () => {
    const user = userEvent.setup();
    const onVisibility = vi.fn();
    render(
      <Panel
        visibility={[
          { value: 'space', label: 'Everyone in Northwind' },
          { value: 'me', label: 'Only you' },
        ]}
        onVisibility={onVisibility}
      />,
    );
    const vis = screen.getByRole('button', { name: 'Visible to' });
    expect(vis).toHaveTextContent('Everyone in Northwind');
    await user.click(vis);
    const menu = screen.getByRole('menu', { name: 'Who can see this task' });
    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map((m) => m.textContent),
    ).toEqual(['Everyone in Northwind✓', 'Only you']);
    await user.click(within(menu).getByRole('menuitem', { name: 'Only you' }));
    expect(onVisibility).toHaveBeenCalledWith('me');
  });

  it('C08-U07 read-only: the owner line, nothing editable, the comment box there, no Delete under ⋯', async () => {
    const user = userEvent.setup();
    const onAddComment = vi.fn(() => 'c9');
    const onRename = vi.fn();
    const onCross = vi.fn();
    render(
      <Panel
        readOnly
        owner={{ name: 'Meera Iyer', initials: 'MI', color: '#3d5a80' }}
        ownerLine="Mon 19 Oct · Meera’s"
        visibility={[{ value: 'space', label: 'Everyone in Northwind' }]}
        onRename={onRename}
        onCross={onCross}
        onAddComment={onAddComment}
        onDelete={() => {}}
      />,
    );
    const panel = document.querySelector('.tp-td')!;
    expect(panel).toHaveClass('tp-td-readonly');
    expect(screen.getByText('Mon 19 Oct · Meera’s').closest('.tp-td-owner')).not.toBeNull();
    // the title is plain words, the box takes no tick
    expect(screen.getByRole('heading', { name: 'Review Quick Add PR' })).toHaveClass('tp-td-title-ro');
    expect(screen.queryByRole('textbox', { name: 'Task title' })).toBeNull();
    const box = screen.getByRole('checkbox', { name: 'Cross off: Review Quick Add PR' });
    expect(box).toBeDisabled();
    await user.click(box);
    expect(onCross).not.toHaveBeenCalled();
    // the facts read as text: no buttons, no pickers
    expect(screen.queryByRole('button', { name: 'Planned' })).toBeNull();
    expect(screen.getByLabelText('Planned')).toHaveClass('tp-td-ro');
    expect(screen.getByLabelText('Visible to')).toHaveTextContent('Everyone in Northwind');
    expect(panel.querySelectorAll('.tp-td-pop')).toHaveLength(0);
    // notes read, not written; subtasks without the add line
    expect(screen.getByText(/yes or no/)).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Notes' })).toBeNull();
    expect(screen.queryByRole('textbox', { name: /Add subtask|New subtask/ })).toBeNull();
    // ⋯ has no Delete; the comment box is there
    await user.click(screen.getByRole('button', { name: 'More' }));
    const menu = await screen.findByRole('menu', { name: 'More' });
    expect(within(menu).queryByRole('menuitem', { name: 'Delete task' })).toBeNull();
    expect(within(menu).getByRole('menuitem', { name: 'Copy link to task' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.getByRole('textbox', { name: 'Write a comment' })).toBeInTheDocument();
  });
  it('C03-U25 the ID at the top copies the task link, lights up with a tick and says "Link copied"; with no link it copies the ID', async () => {
    const write = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: write }, configurable: true });
    const { unmount } = render(<Panel />);
    const chip = screen.getByRole('button', { name: 'Copy link to ME-52' });
    expect(chip).toHaveAttribute('title', 'Copy link');
    expect(chip.querySelector('.tp-copy-ic')).toHaveAttribute('aria-hidden', 'true');
    fireEvent.click(chip);
    await waitFor(() => expect(chip).toHaveClass('tp-flash'));
    expect(write).toHaveBeenCalledWith('https://tudu.test/t/ME-52');
    expect(screen.getByRole('status')).toHaveTextContent('Link copied');
    await waitFor(() => expect(chip).not.toHaveClass('tp-flash'), { timeout: 2000 });
    unmount();
    render(<Panel link={undefined} />);
    const bare = screen.getByRole('button', { name: 'Copy task ID ME-52' });
    expect(bare.querySelector('.tp-copy-ic')).toBeNull();
    fireEvent.click(bare);
    await waitFor(() => expect(write).toHaveBeenLastCalledWith('ME-52'));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Copied ME-52'));
  });

  it('C03-U26 when the clipboard says no (or is missing) the chip stays quiet and the toast says so', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn(() => Promise.reject(new Error('denied'))) },
      configurable: true,
    });
    const { unmount } = render(<Panel />);
    const chip = screen.getByRole('button', { name: 'Copy link to ME-52' });
    fireEvent.click(chip);
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('Couldn’t copy the link. Try again.'),
    );
    expect(chip).not.toHaveClass('tp-flash');
    unmount();
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
    render(<Panel />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy link to ME-52' }));
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('Couldn’t copy the link. Try again.'),
    );
  });

  it('C03-U27 the link mark slides out on hover with the menu timing; less motion keeps it still', () => {
    const slot = rulesWhere(rules, (s) => s === '.tp-copy-ic')[0]!.declarations;
    expect(slot.width).toBe('0');
    expect(slot.opacity).toBe('0');
    expect(slot.transform).toBe('translateX(-4px)');
    expect(slot.transition).toMatch(/width var\(--dur-menu\) var\(--ease-arrive\)/);
    expect(slot.transition).toMatch(/transform var\(--dur-menu\) var\(--ease-arrive\)/);
    const shown = rules.find(
      (r) =>
        !r.context.length &&
        r.selector.includes('.tp-td-id') &&
        r.selector.includes(':hover') &&
        r.selector.includes('.tp-copy-ic'),
    )!.declarations;
    expect(shown).toMatchObject({ width: '13px', opacity: '1', transform: 'none' });
    expect(rulesWhere(rules, (s) => s === '.tp-flash .tp-copy-ic .tp-copy-ok')[0]!.declarations.opacity).toBe(
      '1',
    );
    const still = rules.find(
      (r) =>
        r.selector.includes('.tp-copy-ic svg') && r.context.some((c) => c.includes('prefers-reduced-motion')),
    )!;
    expect(still.declarations.transform).toBe('none !important');
  });
});

describe('TaskDetail in All spaces', () => {
  it('C21-U13 the Space fact comes first, reads the space and opens it; without inSpace it stays out', async () => {
    const user = userEvent.setup();
    const onOpenSpace = vi.fn();
    const { container, rerender } = render(
      <Panel
        inSpace={{ id: 'nw', name: 'Northwind', color: '#3d5a80', initials: 'N' }}
        onOpenSpace={onOpenSpace}
      />,
    );
    const facts = container.querySelectorAll('.tp-td-props > .tp-td-prop');
    expect(facts[0]!.querySelector('dt')).toHaveTextContent('Space');
    expect(facts[0]!.querySelector('dd')).toHaveTextContent('Northwind');
    const btn = screen.getByRole('button', { name: 'Space: Northwind. Open in Northwind' });
    expect(btn).not.toHaveAttribute('aria-haspopup');
    expect(btn.querySelector('.tp-stile')).not.toBeNull();
    await user.click(btn);
    expect(onOpenSpace).toHaveBeenCalledTimes(1);
    rerender(<Panel />);
    expect(screen.queryByRole('button', { name: /^Space:/ })).toBeNull();
  });
});
