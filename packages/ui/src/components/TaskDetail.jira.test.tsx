import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TaskDetail, type TaskDetailTask } from './TaskDetail';
import { TaskRow } from './TaskRow';
import { ToastHost } from './Toast';

const TODAY = '2026-10-18';
const TASK: TaskDetailTask = {
  key: 't1',
  id: 'ME-1',
  title: 'Fix the date picker on Safari',
  done: false,
  day: TODAY,
  due: null,
  visibility: 'space',
  notes: '',
  subtasks: [],
  comments: [],
  history: [],
};
const ME = { initials: 'RR', name: 'Rohit Raj' };

describe('the Jira fact (chunk 10)', () => {
  it('C10-U08 link by key on Enter, the key and status, Open in Jira and Unlink; the row’s signal', async () => {
    const user = userEvent.setup();
    const onJira = vi.fn();
    const onOpenJira = vi.fn();
    const { rerender } = render(
      <>
        <TaskDetail
          task={TASK}
          today={TODAY}
          me={ME}
          visibility={[]}
          onJira={onJira}
          onOpenJira={onOpenJira}
        />
        <ToastHost />
      </>,
    );
    const fact = screen.getByRole('button', { name: 'Jira' });
    expect(fact).toHaveTextContent('Link a Jira issue');
    await user.click(fact);
    const input = screen.getByRole('textbox', { name: 'Jira issue key' });
    expect(input).toHaveFocus();
    expect(screen.getByText('Paste the issue key and press Enter.')).toBeInTheDocument();
    // A bad key is refused; lowercase is uppercased.
    await user.type(input, 'not a key{Enter}');
    expect(onJira).not.toHaveBeenCalled();
    await user.clear(input);
    await user.type(input, 'tudu-219{Enter}');
    expect(onJira).toHaveBeenCalledWith('TUDU-219');

    rerender(
      <>
        <TaskDetail
          task={{ ...TASK, jira: 'TUDU-219', jiraStatus: 'To do' }}
          today={TODAY}
          me={ME}
          visibility={[]}
          onJira={onJira}
          onOpenJira={onOpenJira}
        />
        <ToastHost />
      </>,
    );
    const linked = screen.getByRole('button', { name: 'Jira' });
    expect(linked).toHaveTextContent('TUDU-219To do');
    await user.click(linked);
    const menu = screen.getByRole('menu', { name: 'Jira issue' });
    await user.click(within(menu).getByRole('menuitem', { name: /Open TUDU-219 in Jira/ }));
    expect(onOpenJira).toHaveBeenCalledWith('TUDU-219');
    await user.click(screen.getByRole('button', { name: 'Jira' }));
    await user.click(screen.getByRole('menuitem', { name: 'Unlink the issue' }));
    expect(onJira).toHaveBeenLastCalledWith(null);
    expect(document.querySelector('.tp-toast')).toHaveTextContent('Unlinked TUDU-219');

    // A key kept without a connection: the key alone, Unlink only (no Open in Jira, no status).
    rerender(
      <TaskDetail
        task={{ ...TASK, jira: 'TUDU-219' }}
        today={TODAY}
        me={ME}
        visibility={[]}
        onJira={onJira}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Jira' }));
    expect(screen.queryByRole('menuitem', { name: /Open TUDU-219/ })).toBeNull();
    expect(screen.getByRole('menuitem', { name: 'Unlink the issue' })).toBeInTheDocument();

    // The row's signal: the key with the mark; a click reports it (the page opens Jira when connected).
    const onSignal = vi.fn();
    rerender(<TaskRow title="Fix the date picker on Safari" jira="TUDU-219" onSignal={onSignal} />);
    await user.click(screen.getByRole('button', { name: 'Linked to Jira · TUDU-219. Open in Jira' }));
    expect(onSignal).toHaveBeenCalledWith('jira');
  });

  it('C10-U12 without Jira in the space: no Jira fact, four facts; someone else’s linked task shows its key', () => {
    const { rerender } = render(
      <TaskDetail task={TASK} today={TODAY} me={ME} visibility={[]} projects={[]} onProject={vi.fn()} />,
    );
    expect(screen.queryByRole('button', { name: 'Jira' })).toBeNull();
    expect(screen.queryByText('Link a Jira issue')).toBeNull();
    const facts = Array.from(document.querySelectorAll('.tp-td-prop dt')).map((dt) => dt.textContent);
    expect(facts).toEqual(['Planned', 'Due', 'Project', 'Visible to']);

    rerender(
      <TaskDetail task={{ ...TASK, jira: 'TUDU-219' }} today={TODAY} me={ME} visibility={[]} readOnly />,
    );
    expect(screen.queryByRole('button', { name: 'Jira' })).toBeNull();
    expect(screen.getByLabelText('Jira')).toHaveTextContent('TUDU-219');
  });
});
