import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  JiraPanel,
  JiraPreview,
  JPConnect,
  JPLinked,
  JP_CONNECTED_MS,
  JP_SEARCH_AFTER_MS,
  type JiraPanelIssue,
  type JiraPanelProps,
  type JiraPreviewIssue,
} from './JiraPanel';
import { ToastHost } from './Toast';

const SUN = '2026-10-18';

const ISSUES: JiraPanelIssue[] = [
  {
    key: 'TUDU-212',
    summary: 'Make the Jira panel remember the last view',
    status: 'In progress',
    due: '2026-10-22',
  },
  { key: 'TUDU-219', summary: 'Fix the date picker on Safari', status: 'To do', due: '2026-10-16' },
  {
    key: 'TUDU-220',
    summary: 'Run the request status enum migration',
    status: 'In review',
    linked: [{ taskId: 't1', id: 'ME-52', title: 'Run the migration', day: SUN, done: false }],
  },
];

const VIEWS = [
  { value: 'assigned', label: 'Assigned to me' },
  { value: 'v1', label: 'My open bugs', jql: 'issuetype = Bug', saved: true },
];

function Panel(props: Partial<JiraPanelProps>) {
  return (
    <JiraPanel
      today={SUN}
      issues={ISSUES}
      views={VIEWS}
      view="assigned"
      site="jira.northwind.io"
      synced="12 min ago"
      {...props}
    />
  );
}

const rows = () => screen.queryAllByRole('button', { name: /Open preview$/ });
const row = (key: string) => screen.getByRole('button', { name: new RegExp(`^${key}: .*Open preview$`) });

afterEach(() => vi.useRealTimers());

describe('the Jira panel (chunk 10)', () => {
  it('C10-U02 the header, Refresh, More › Disconnect, Close; the views menu; the rows and their bylines; the day picker', async () => {
    const user = userEvent.setup();
    const onRefresh = vi.fn();
    const onDisconnect = vi.fn();
    const onClose = vi.fn();
    const onView = vi.fn();
    const onAdd = vi.fn();
    const { rerender } = render(
      <Panel
        onRefresh={onRefresh}
        onDisconnect={onDisconnect}
        onClose={onClose}
        onView={onView}
        onAdd={onAdd}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Jira' })).toBeInTheDocument();
    expect(document.querySelector('.tp-jp-sync')).toHaveTextContent('jira.northwind.io · Synced 12 min ago');
    await user.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(onRefresh).toHaveBeenCalledTimes(1);
    rerender(
      <Panel
        refreshing
        onRefresh={onRefresh}
        onDisconnect={onDisconnect}
        onClose={onClose}
        onView={onView}
        onAdd={onAdd}
      />,
    );
    expect(document.querySelector('.tp-jp-sync')).toHaveTextContent('Syncing…');
    expect(screen.getByRole('button', { name: 'Syncing' })).toHaveClass('tp-spinning');
    await user.click(screen.getByRole('button', { name: 'Syncing' }));
    expect(onRefresh).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: 'More' }));
    await user.click(screen.getByRole('menuitem', { name: 'Disconnect Jira' }));
    expect(onDisconnect).toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Close Jira' }));
    expect(onClose).toHaveBeenCalled();

    // The views: the presets and your own, then Custom JQL.
    await user.click(screen.getByRole('button', { name: 'View: Assigned to me' }));
    const menu = screen.getByRole('menu', { name: 'Views' });
    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map((m) => m.textContent),
    ).toEqual(['Assigned to me', 'My open bugs', 'Custom JQL…']);
    await user.click(within(menu).getByRole('menuitem', { name: 'My open bugs' }));
    expect(onView).toHaveBeenCalledWith('v1');

    // Rows in Jira's order, each with its byline.
    expect(rows().map((r) => r.querySelector('.tp-jp-sum')!.textContent)).toEqual(
      ISSUES.map((i) => i.summary),
    );
    expect(row('TUDU-212').querySelector('.tp-jp-by')).toHaveTextContent('TUDU-212·In progress·Due Thu');
    expect(row('TUDU-219').querySelector('.tp-jp-due')).toHaveClass('tp-od');
    expect(row('TUDU-219').querySelector('.tp-jp-by')).toHaveTextContent('Overdue since Fri');

    // The calendar button opens the picker: Today, Tomorrow, Backlog and a day.
    for (const [choice, want] of [
      ['Today', SUN],
      ['Tomorrow', '2026-10-19'],
      ['Backlog', null],
    ] as const) {
      await user.click(screen.getByRole('button', { name: 'Add TUDU-212 to a day' }));
      const pop = await screen.findByRole('dialog', { name: 'Add TUDU-212 to a day as a linked task' });
      await user.click(within(pop).getByRole('button', { name: choice }));
      expect(onAdd).toHaveBeenLastCalledWith(expect.objectContaining({ key: 'TUDU-212' }), want);
      await waitFor(() => expect(screen.queryByRole('dialog', { name: /as a linked task/ })).toBeNull());
      // Each add finishes (the stub resolves at once), so the button is free again for the next.
      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Add TUDU-212 to a day' })).not.toBeDisabled(),
      );
    }
  });

  it('C10-U03 adding: busy, done with the tick, a failure frees the button; a linked issue; the chip; search', async () => {
    const user = userEvent.setup();
    let finish!: () => void;
    let fail!: (e: Error) => void;
    const onAdd = vi.fn(
      () =>
        new Promise<void>((res, rej) => {
          finish = res;
          fail = rej;
        }),
    );
    const onShowTask = vi.fn();
    const { rerender } = render(<Panel onAdd={onAdd} onShowTask={onShowTask} />);
    await user.click(screen.getByRole('button', { name: 'Add TUDU-212 to a day' }));
    await user.click(
      within(await screen.findByRole('dialog', { name: /TUDU-212/ })).getByRole('button', { name: 'Today' }),
    );
    const busy = screen.getByRole('button', { name: 'Adding TUDU-212' });
    expect(busy).toBeDisabled();
    expect(busy.querySelector('.tp-spin')).not.toBeNull();
    // The page answers: the task is there, linked.
    const linked = ISSUES.map((i) =>
      i.key === 'TUDU-212'
        ? { ...i, linked: [{ taskId: 't9', id: null, title: i.summary, day: SUN, done: false }] }
        : i,
    );
    rerender(<Panel issues={linked} onAdd={onAdd} onShowTask={onShowTask} />);
    await act(async () => finish());
    const chip = within(row('TUDU-212')).getByRole('button', { name: 'Show the linked task on Today' });
    expect(chip).toHaveClass('tp-fresh');
    expect(chip.querySelector('.tp-jp-lk-tick')).not.toBeNull();
    // The calendar keeps its slot, out of reach.
    const cal = row('TUDU-212').querySelector('.tp-jp-cal')!;
    expect(cal).toHaveClass('tp-gone');
    expect(cal).toHaveAttribute('aria-hidden', 'true');

    // A linked issue's chip shows the task.
    await user.click(
      within(row('TUDU-220')).getByRole('button', { name: 'Show the linked task ME-52 on Today' }),
    );
    expect(onShowTask).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'TUDU-220' }),
      expect.objectContaining({ id: 'ME-52' }),
    );

    // A failure: a toast and the button is free again.
    await user.click(screen.getByRole('button', { name: 'Add TUDU-219 to a day' }));
    await user.click(
      within(await screen.findByRole('dialog', { name: /TUDU-219/ })).getByRole('button', {
        name: 'Tomorrow',
      }),
    );
    await act(async () => fail(new Error('no')));
    expect(screen.getByRole('button', { name: 'Add TUDU-219 to a day' })).not.toBeDisabled();

    // Search filters the view when there is no Jira-wide search.
    await user.type(screen.getByRole('textbox', { name: 'Search Jira issues' }), 'safari');
    expect(rows()).toHaveLength(1);
    await user.clear(screen.getByRole('textbox', { name: 'Search Jira issues' }));
    await user.type(screen.getByRole('textbox', { name: 'Search Jira issues' }), 'nothing like it');
    expect(screen.getByText('No issues match “nothing like it”.')).toBeInTheDocument();
    await user.click(screen.getByText('Clear search', { selector: 'button.tp-jp-q' }));
    expect(rows()).toHaveLength(3);
  });

  it('C10-U03 search across Jira: a moment after typing, the count above, no match and Clear', async () => {
    const user = userEvent.setup();
    const onSearch = vi.fn(async (q: string) =>
      q === 'staging'
        ? [{ key: 'OPS-14', summary: 'Rotate the staging database password', status: 'To do' }]
        : [],
    );
    render(<Panel onSearch={onSearch} />);
    const box = screen.getByRole('textbox', { name: 'Search issues across Jira' });
    await user.type(box, 'staging');
    expect(document.querySelector('.tp-jp-search .tp-spin')).not.toBeNull();
    await waitFor(() => expect(onSearch).toHaveBeenCalledWith('staging'), {
      timeout: JP_SEARCH_AFTER_MS + 500,
    });
    expect(onSearch).toHaveBeenCalledTimes(1);
    await screen.findByText('1 issue across Jira');
    expect(rows().map((r) => r.getAttribute('aria-label'))).toEqual([
      'OPS-14: Rotate the staging database password. Open preview',
    ]);
    await user.clear(box);
    await user.type(box, 'zzz');
    await screen.findByText('No issues in Jira match “zzz”.');
    expect(screen.getByText('Search looks at keys and summaries across all of Jira.')).toBeInTheDocument();
    await user.click(screen.getByText('Clear search', { selector: 'button.tp-jp-q' }));
    expect(rows()).toHaveLength(3);
  });

  it('C10-U04 the states: connect, refused, loading, nothing found, JQL errors, saving a view, unreachable, stale, expired, offline', async () => {
    const user = userEvent.setup();
    const first = render(<Panel state="connect" />);
    expect(screen.getByRole('heading', { name: 'Your Jira issues, next to your day' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^View:/ })).toBeNull();
    first.unmount();
    const second = render(
      <Panel
        state="connect"
        initial={{ connect: { error: { field: 'token', message: 'Jira didn’t accept this token.' } } }}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Jira didn’t accept this token.');
    second.unmount();
    const { rerender } = render(<Panel state="loading" />);

    rerender(<Panel state="loading" />);
    expect(screen.getByLabelText('Loading Jira issues')).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('button', { name: 'View: Assigned to me' })).toHaveClass('tp-qa-empty');

    rerender(<Panel state="ready" issues={[]} view="custom" jql="project = NONE" />);
    expect(screen.getByText('Nothing here right now.')).toBeInTheDocument();

    // A JQL Jira can't run: its reason under it, the list as it was.
    const onApplyJql = vi.fn(async (j: string) =>
      j.includes('stauts')
        ? { error: "Field 'stauts' does not exist or you do not have permission to view it." }
        : undefined,
    );
    const onSaveView = vi.fn();
    rerender(<Panel state="ready" onApplyJql={onApplyJql} onSaveView={onSaveView} />);
    await user.click(screen.getByRole('button', { name: 'View: Assigned to me' }));
    await user.click(screen.getByRole('menuitem', { name: 'Custom JQL…' }));
    expect(screen.getByRole('button', { name: 'View: Custom JQL' })).toBeInTheDocument();
    const jql = screen.getByRole('textbox', { name: 'Custom JQL' });
    await user.type(jql, 'stauts = Done{Enter}');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Jira couldn’t run this. Field 'stauts' does not exist",
    );
    expect(jql).toHaveAttribute('aria-invalid', 'true');
    expect(rows()).toHaveLength(3);
    await user.type(jql, 'x');
    expect(screen.queryByRole('alert')).toBeNull();

    // A query that ran can be saved as a view.
    rerender(
      <Panel
        state="ready"
        view="custom"
        jql="issuetype = Bug"
        onApplyJql={onApplyJql}
        onSaveView={onSaveView}
      />,
    );
    await user.clear(screen.getByRole('textbox', { name: 'Custom JQL' }));
    await user.type(screen.getByRole('textbox', { name: 'Custom JQL' }), 'issuetype = Bug');
    await user.click(screen.getByRole('button', { name: 'Save as a view' }));
    await user.type(screen.getByRole('textbox', { name: 'View name' }), 'My open bugs');
    const toasts = render(<ToastHost />);
    await user.click(screen.getByRole('button', { name: 'Save view' }));
    expect(onSaveView).toHaveBeenCalledWith('My open bugs', 'issuetype = Bug');
    expect(document.querySelector('.tp-toast')).toHaveTextContent('Saved “My open bugs” to your views');
    toasts.unmount();

    const onRetry = vi.fn();
    rerender(<Panel state="error" issues={[]} onRetry={onRetry} />);
    expect(screen.getByText('Couldn’t reach Jira')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalled();

    rerender(<Panel state="error" onRetry={onRetry} />);
    expect(screen.getByRole('status')).toHaveTextContent('Couldn’t refresh. Showing issues from 12 min ago.');
    expect(document.querySelector('.tp-jp-list')).toHaveClass('tp-stale');
    expect(rows()).toHaveLength(3);

    const onReconnect = vi.fn();
    rerender(<Panel state="expired" onReconnect={onReconnect} />);
    expect(screen.getByRole('status')).toHaveTextContent('Your Jira token has expired.');
    await user.click(screen.getByRole('button', { name: 'Add a new token' }));
    expect(onReconnect).toHaveBeenCalled();

    rerender(<Panel state="offline" />);
    expect(screen.getByRole('status')).toHaveTextContent(
      'You’re offline. Showing issues from 12 min ago. Linked tasks you add now sync when you’re back.',
    );
    expect(screen.getByRole('button', { name: 'Add TUDU-212 to a day' })).not.toBeDisabled();
  });

  it('C10-U04 a saved view open in the editor can be removed', async () => {
    const user = userEvent.setup();
    const onRemoveView = vi.fn();
    render(<Panel view="v1" onRemoveView={onRemoveView} />);
    await user.click(screen.getByRole('button', { name: 'View: My open bugs' }));
    await user.click(screen.getByRole('menuitem', { name: 'Custom JQL…' }));
    expect(screen.getByRole('textbox', { name: 'Custom JQL' })).toHaveValue('issuetype = Bug');
    await user.click(screen.getByRole('button', { name: 'Remove view' }));
    expect(onRemoveView).toHaveBeenCalledWith('v1');
  });

  it('C10-U05 the connect form: checks before sending, Checking…, refusals under their field, Connected, Reconnect', async () => {
    const user = userEvent.setup();
    let answer: (r: { error?: { field: 'site' | 'token'; message: string } } | void) => void = () => {};
    const onConnect = vi.fn(
      () => new Promise<{ error?: { field: 'site' | 'token'; message: string } } | void>((r) => (answer = r)),
    );
    const onConnected = vi.fn();
    const { unmount } = render(<JPConnect onConnect={onConnect} onConnected={onConnected} />);
    const url = screen.getByLabelText('Jira address');
    const tok = screen.getByLabelText('Personal access token');
    await user.click(screen.getByRole('button', { name: 'Connect Jira' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Add your Jira address');
    await user.type(url, 'jira.northwind');
    expect(screen.queryByRole('alert')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Connect Jira' }));
    expect(screen.getByRole('alert')).toHaveTextContent(
      'That doesn’t look like a web address. It starts with https://',
    );
    expect(url).toHaveAttribute('aria-invalid', 'true');
    await user.clear(url);
    await user.type(url, 'https://jira.northwind.io/');
    await user.click(screen.getByRole('button', { name: 'Connect Jira' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Paste your personal access token.');
    expect(onConnect).not.toHaveBeenCalled();

    // Show reveals the token.
    await user.type(tok, 'pat-1');
    expect(tok).toHaveAttribute('type', 'password');
    await user.click(screen.getByRole('button', { name: 'Show' }));
    expect(tok).toHaveAttribute('type', 'text');

    await user.type(tok, '{Enter}');
    expect(onConnect).toHaveBeenCalledWith({ site: 'https://jira.northwind.io', token: 'pat-1' });
    expect(screen.getByRole('button', { name: /Checking/ })).toBeInTheDocument();
    expect(url).toBeDisabled();
    expect(tok).toBeDisabled();
    await act(async () => answer({ error: { field: 'token', message: 'Jira didn’t accept this token.' } }));
    expect(screen.getByRole('alert')).toHaveTextContent('Jira didn’t accept this token.');
    expect(tok).toHaveAttribute('aria-invalid', 'true');
    await user.type(tok, '2');
    expect(screen.queryByRole('alert')).toBeNull();

    vi.useFakeTimers({ shouldAdvanceTime: true });
    fireEvent.click(screen.getByRole('button', { name: 'Connect Jira' }));
    await act(async () => answer());
    expect(screen.getByRole('button', { name: /Connected/ })).toBeInTheDocument();
    expect(onConnected).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTime(JP_CONNECTED_MS + 10));
    expect(onConnected).toHaveBeenCalledWith({ site: 'https://jira.northwind.io' });
    vi.useRealTimers();
    unmount();

    // Reconnect keeps the address and asks for the token only.
    const onCancel = vi.fn();
    render(
      <JPConnect reconnect site="https://jira.northwind.io" onConnect={onConnect} onCancel={onCancel} />,
    );
    expect(screen.getByRole('heading', { name: 'Add a new token' })).toBeInTheDocument();
    expect(screen.getByText(/Your token for jira.northwind.io stopped working/)).toBeInTheDocument();
    expect(screen.getByLabelText('Jira address')).toHaveValue('https://jira.northwind.io');
    expect(screen.getByRole('button', { name: 'Reconnect' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Not now' }));
    expect(onCancel).toHaveBeenCalled();
  });

  it('C10-U06 the preview: key, Open in Jira, facts, description, In Tudu, comments, the foot, back and Esc, the sheet', async () => {
    const user = userEvent.setup();
    const issue: JiraPreviewIssue = {
      key: 'TUDU-212',
      summary: 'Make the Jira panel remember the last view',
      status: 'In progress',
      due: '2026-10-22',
      issuetype: 'Story',
      assignee: { name: 'Asha Rao', initials: 'AR' },
      priority: 'High',
      updated: 'Sun 08:40',
      description: '<p>When you close the panel…</p>',
      comments: [1, 2, 3, 4, 5].map((n) => ({
        key: `c${n}`,
        who: 'Meera Iyer',
        initials: 'MI',
        when: 'Thu',
        html: `<p>Comment ${n}</p>`,
      })),
    };
    const onOpenInJira = vi.fn();
    const onPick = vi.fn();
    const onShowTask = vi.fn();
    const onBack = vi.fn();
    const { rerender } = render(
      <JiraPreview
        issue={issue}
        today={SUN}
        onOpenInJira={onOpenInJira}
        onPick={onPick}
        onShowTask={onShowTask}
        onBack={onBack}
      />,
    );
    const pv = screen.getByRole('dialog', { name: 'TUDU-212 Make the Jira panel remember the last view' });
    expect(within(pv).getByText('Story')).toHaveClass('tp-jp-pvtype');
    const facts = [...pv.querySelectorAll('.tp-jp-facts dt')].map(
      (d) => `${d.textContent}: ${d.nextElementSibling!.textContent}`,
    );
    expect(facts).toEqual([
      'Status: In progress',
      'Assignee: ARAsha Rao',
      'Priority: High',
      'Due: Thu 22 Oct · in 4 days',
      'Updated: Sun 08:40',
    ]);
    expect(within(pv).getByText('When you close the panel…')).toBeInTheDocument();
    expect(
      within(pv).getByText('No task for it yet. Add it to Today, or pick a day below.'),
    ).toBeInTheDocument();
    // The last three comments, with the earlier ones a click away.
    expect([...pv.querySelectorAll('.tp-td-cmt-text')].map((c) => c.textContent)).toEqual([
      'Comment 3',
      'Comment 4',
      'Comment 5',
    ]);
    await user.click(within(pv).getByRole('button', { name: 'Show 2 earlier comments' }));
    expect(pv.querySelectorAll('.tp-td-cmt')).toHaveLength(5);
    await user.click(within(pv).getByRole('button', { name: 'Open TUDU-212 in Jira' }));
    await user.click(within(pv).getByRole('button', { name: /Reply in Jira/ }));
    expect(onOpenInJira).toHaveBeenCalledTimes(2);
    await user.click(within(pv).getByRole('button', { name: 'Add to a day' }));
    expect(onPick).toHaveBeenCalled();
    await user.click(within(pv).getByRole('button', { name: 'All issues' }));
    expect(onBack).toHaveBeenCalled();

    // With its task: In Tudu lists it, the foot shows it; crossed off says so.
    const linked = {
      ...issue,
      description: '',
      comments: [],
      linked: [{ taskId: 't1', id: 'ME-52', title: 'Remember the view', day: SUN, done: true }],
    };
    rerender(<JiraPreview issue={linked} today={SUN} onShowTask={onShowTask} onBack={onBack} compact />);
    expect(screen.getByText('No description.')).toBeInTheDocument();
    expect(screen.getByText('No comments yet.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Remember the view/ }));
    expect(onShowTask).toHaveBeenCalledWith(expect.objectContaining({ id: 'ME-52' }));
    expect(screen.getByText('Its Tudu task is done.')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Show the linked task ME-52 on Today, crossed off' }),
    ).toHaveClass('tp-big', 'tp-done');
    // The phone's sheet: a grab bar and Close.
    expect(document.querySelector('.tp-jp-grab')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
  });

  it('C10-U06 in the panel: a row opens its preview; Esc steps back to the list first', async () => {
    const user = userEvent.setup();
    const onOpenIssue = vi.fn();
    const { rerender } = render(<Panel onOpenIssue={onOpenIssue} />);
    await user.click(row('TUDU-219'));
    expect(onOpenIssue).toHaveBeenLastCalledWith('TUDU-219');
    rerender(<Panel open="TUDU-219" onOpenIssue={onOpenIssue} />);
    expect(screen.getByRole('dialog', { name: /^TUDU-219/ })).toBeInTheDocument();
    expect(row('TUDU-219')).toHaveClass('tp-sel');
    // Facts the list knows show while the rest is read.
    rerender(<Panel open="TUDU-219" previewLoading onOpenIssue={onOpenIssue} />);
    expect(
      screen.getByRole('dialog', { name: /^TUDU-219/ }).querySelector('.tp-jp-pvscroll'),
    ).toHaveAttribute('aria-busy', 'true');
    const esc = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    act(() => void document.body.dispatchEvent(esc));
    expect(onOpenIssue).toHaveBeenLastCalledWith(null);
    expect(esc.defaultPrevented).toBe(true);
    rerender(<Panel open={null} onOpenIssue={onOpenIssue} />);
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /^TUDU-219/ })).toBeNull());
    // With nothing open, Esc is the panel's own (the drawer closes).
    const esc2 = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    act(() => void document.body.dispatchEvent(esc2));
    expect(esc2.defaultPrevented).toBe(false);
  });

  it('C10-U15 a task in another of your spaces names it; the connect words are your account’s', () => {
    const l = { taskId: 't1', id: 'NW-52', title: 'Run the migration', day: SUN, done: false };
    const { rerender } = render(
      <JPLinked link={{ ...l, space: { name: 'Northwind', color: '#3d5a80' } }} today={SUN} />,
    );
    const chip = screen.getByRole('button');
    expect(chip).toHaveTextContent('NW-52· Today· N');
    expect(chip.querySelector('.tp-jp-lk-sp')).toHaveTextContent('Northwind');
    rerender(<JPLinked link={l} today={SUN} />);
    expect(screen.getByRole('button').querySelector('.tp-jp-lk-sp')).toBeNull();

    rerender(<JPConnect spaceName="Northwind" />);
    expect(
      screen.getByText(
        'Connect once for your account with a personal access token. Jira turns on in Northwind; turn it on in your other spaces from Settings › Apps.',
      ),
    ).toBeInTheDocument();
    rerender(<JPConnect reconnect site="https://jira.northwind.io" />);
    expect(
      screen.getByText(
        'Your token for jira.northwind.io stopped working. Paste a new one; Jira comes back in every space it was on, with your views and linked tasks.',
      ),
    ).toBeInTheDocument();
    rerender(<JPConnect account={false} />);
    expect(screen.getByText(/^Connect with a personal access token\./)).toBeInTheDocument();
  });
});
