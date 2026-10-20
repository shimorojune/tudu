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
