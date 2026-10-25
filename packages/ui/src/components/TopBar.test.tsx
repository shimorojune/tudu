import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TopBar, type TopBarProps } from './TopBar';

const user = { name: 'Rohit Raj', initials: 'RR', email: 'rohit@example.com', color: '#2f5fa8' };

function setup(extra: Partial<TopBarProps> = {}) {
  const u = userEvent.setup();
  const onSearch = vi.fn();
  const onNewTask = vi.fn();
  render(<TopBar onSearch={onSearch} onNewTask={onNewTask} user={user} {...extra} />);
  return { user: u, onSearch, onNewTask, bar: screen.getByRole('banner') };
}

describe('TopBar', () => {
  it('search, New task and you: the avatar alone when there are no account props', async () => {
    const { user, onSearch, onNewTask, bar } = setup();
    expect(bar).toHaveClass('tp-root', 'tp-topbar');
    expect(bar).not.toHaveClass('tp-compact');
    expect(bar.querySelector('.tp-tb-sp')).not.toBeNull();

    const search = screen.getByRole('button', { name: 'Search tasks' });
    expect(search).toHaveClass('tp-ib');
    expect(search).not.toHaveClass('tp-on');
    await user.click(search);
    expect(onSearch).toHaveBeenCalledTimes(1);

    const add = screen.getByRole('button', { name: 'New task' });
    expect(add).toHaveClass('tp-btn', 'tp-btn-primary');
    expect(add.querySelector('svg')).not.toBeNull();
    await user.click(add);
    expect(onNewTask).toHaveBeenCalledTimes(1);

    const avatar = screen.getByRole('img', { name: 'Rohit Raj' });
    expect(avatar).toHaveClass('tp-avatar');
    expect(avatar).toHaveTextContent('RR');
    expect(screen.queryByRole('button', { name: 'You: Rohit Raj' })).toBeNull();
    expect(bar.querySelector('.tp-jirabtn')).toBeNull();
  });

  it('account props put the AccountMenu in place of the avatar; no user means neither', async () => {
    const onSignOut = vi.fn();
    const { user } = setup({ account: { theme: 'dark', onSignOut } });
    const you = screen.getByRole('button', { name: 'You: Rohit Raj' });
    expect(you).toHaveClass('tp-acct-b');
    await user.click(you);
    const menu = screen.getByRole('menu', { name: 'You' });
    expect(menu).toHaveTextContent('rohit@example.com');
    expect(within(menu).getByRole('button', { name: 'Dark' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(within(menu).getByRole('menuitem', { name: 'Sign out' }));
    expect(onSignOut).toHaveBeenCalledTimes(1);

    render(<TopBar />);
    const [, bare] = screen.getAllByRole('banner');
    expect(within(bare!).queryByRole('img')).toBeNull();
    expect(within(bare!).queryByRole('button', { name: /^You:/ })).toBeNull();
  });

  it('searchOpen holds the search icon in its open look; searchLabel renames it', () => {
    setup({ searchOpen: true, searchLabel: 'Search' });
    expect(screen.getByRole('button', { name: 'Search' })).toHaveClass('tp-ib', 'tp-on');
    expect(screen.queryByRole('button', { name: 'Search tasks' })).toBeNull();
  });

  it('the Jira button: a count with its plain-words tooltip, pressed while its panel is open', async () => {
    const onJira = vi.fn();
    const { user, bar } = setup({ jira: { count: 4, open: true, onJira, fresh: true } });
    const btn = bar.querySelector<HTMLButtonElement>('.tp-jirabtn');
    expect(btn).not.toBeNull();
    expect(btn).toHaveClass('tp-on', 'tp-appear');
    expect(btn).toHaveAttribute('aria-pressed', 'true');
    expect(btn).toHaveTextContent('Jira');
    expect(btn!.querySelector('svg.tp-jm')).not.toBeNull();
    expect(btn!.parentElement).toHaveClass('tp-tip', 'tp-below');
    expect(btn!.parentElement).toHaveAttribute('data-tip', '4 assigned to you, not in Tudu yet');
    const count = within(btn!).getByLabelText('4 assigned to you, not in Tudu yet');
    expect(count).toHaveClass('tp-jirabtn-n');
    expect(count).toHaveTextContent('4');
    await user.click(btn!);
    expect(onJira).toHaveBeenCalledTimes(1);
  });

  it('the Jira button: hidden with false or when left out; quiet and uncounted at 0', () => {
    const { bar } = setup({ jira: false });
    expect(bar.querySelector('.tp-jirabtn')).toBeNull();

    render(<TopBar jira={{ count: 0, onJira: () => {} }} />);
    const [, second] = screen.getAllByRole('banner');
    const btn = second!.querySelector('.tp-jirabtn');
    expect(btn).not.toHaveClass('tp-on');
    expect(btn).not.toHaveClass('tp-appear');
    expect(btn).toHaveAttribute('aria-pressed', 'false');
    expect(btn!.parentElement).toHaveAttribute('data-tip', 'Your Jira issues');
    expect(btn!.querySelector('.tp-jirabtn-n')).toBeNull();
  });

  it('compact makes New task an ink icon button; views put a Segmented at the left; leading goes first', async () => {
    const onChange = vi.fn();
    const { user, bar } = setup({
      compact: true,
      leading: <i data-testid="lead">Lead</i>,
      views: {
        items: [
          { value: 'day', label: 'Day' },
          { value: 'two', label: '2 days' },
        ],
        defaultValue: 'day',
        onChange,
      },
    });
    expect(bar).toHaveClass('tp-compact');
    const add = screen.getByRole('button', { name: 'New task' });
    expect(add).toHaveClass('tp-ib', 'tp-ib-ink');
    expect(add).not.toHaveClass('tp-btn');
    expect(bar.firstElementChild).toBe(screen.getByTestId('lead'));
    const views = screen.getByRole('group', { name: 'Days to show' });
    expect(views).toHaveClass('tp-seg');
    expect(bar.children[1]).toBe(views);
    await user.click(within(views).getByRole('button', { name: '2 days' }));
    expect(onChange).toHaveBeenCalledWith('two');
  });
});

describe('C08-U14 TopBar inbox', () => {
  it('sits between Search and New task, with a pip for the count, an open look and a click', async () => {
    const onInbox = vi.fn();
    const { user, bar } = setup({ inbox: { count: 4, onInbox } });
    const buttons = within(bar).getAllByRole('button');
    const names = buttons.map((b) => b.getAttribute('aria-label') ?? b.textContent);
    expect(names.indexOf('Inbox, 4 new')).toBe(names.indexOf('Search tasks') + 1);
    const ib = screen.getByRole('button', { name: 'Inbox, 4 new' });
    expect(ib).toHaveClass('tp-ib', 'tp-tb-inbox');
    expect(ib).not.toHaveClass('tp-on');
    expect(ib.querySelector('.tp-tb-pip')).toHaveTextContent('4');
    await user.click(ib);
    expect(onInbox).toHaveBeenCalledTimes(1);
  });

  it('no pip at 0, 99+ past 99, and tp-on with aria-current while open', () => {
    const { bar } = setup({ inbox: { count: 0, open: true, onInbox: () => {} } });
    const ib = within(bar).getByRole('button', { name: 'Inbox' });
    expect(ib.querySelector('.tp-tb-pip')).toBeNull();
    expect(ib).toHaveClass('tp-on');
    expect(ib).toHaveAttribute('aria-current', 'page');
  });

  it('caps the pip at 99+ and leaves the button out when there is no inbox prop', () => {
    const { bar } = setup({ inbox: { count: 140, onInbox: () => {} } });
    expect(
      within(bar).getByRole('button', { name: 'Inbox, 140 new' }).querySelector('.tp-tb-pip'),
    ).toHaveTextContent('99+');
  });

  it('C19-U14 the bug comes first, named Report a bug or idea, pressed while the form is open; none without onFeedback', async () => {
    const onFeedback = vi.fn();
    const { user, bar } = setup({ onFeedback, inbox: { count: 2, onInbox: () => {} } });
    const buttons = within(bar).getAllByRole('button');
    expect(buttons[0]).toHaveAccessibleName('Report a bug or idea');
    expect(buttons[1]).toHaveAccessibleName('Search tasks');
    expect(buttons[0]).toHaveClass('tp-tb-bug');
    expect(buttons[0]).not.toHaveClass('tp-on');
    expect(buttons[0]).toHaveAttribute('aria-haspopup', 'dialog');
    await user.click(buttons[0]!);
    expect(onFeedback).toHaveBeenCalledTimes(1);
  });

  it('C19-U14 the bug holds its pressed wash while feedbackOpen, and is left out without onFeedback', () => {
    const { bar } = setup({ onFeedback: () => {}, feedbackOpen: true });
    expect(within(bar).getByRole('button', { name: 'Report a bug or idea' })).toHaveClass('tp-on');
  });

  it('C19-U14 no bug without onFeedback', () => {
    const { bar } = setup();
    expect(within(bar).queryByRole('button', { name: 'Report a bug or idea' })).toBeNull();
  });
});
