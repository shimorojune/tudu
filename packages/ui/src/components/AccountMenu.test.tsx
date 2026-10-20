import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AccountMenu, type AccountMenuProps } from './AccountMenu';

const me = { name: 'Rohit Raj', email: 'rohit@example.com', initials: 'RR', color: '#2f5fa8' };

function setup(extra: Partial<AccountMenuProps> = {}) {
  const user = userEvent.setup();
  const onTheme = vi.fn();
  const onSettings = vi.fn();
  const onSignOut = vi.fn();
  render(
    <div>
      <button type="button">Elsewhere</button>
      <AccountMenu
        me={me}
        theme="system"
        onTheme={onTheme}
        onSettings={onSettings}
        onSignOut={onSignOut}
        {...extra}
      />
    </div>,
  );
  return {
    user,
    onTheme,
    onSettings,
    onSignOut,
    trigger: screen.getByRole('button', { name: 'You: Rohit Raj' }),
    menu: () => screen.queryByRole('menu', { name: 'You' }),
  };
}

describe('AccountMenu', () => {
  it('C01-U07 opens from the avatar and shows your name, email and the theme switch', async () => {
    const { user, trigger, menu } = setup();
    expect(trigger).toHaveClass('tp-acct-b');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
    expect(within(trigger).getByRole('img', { name: 'Rohit Raj' })).toHaveTextContent('RR');
    expect(menu()).toBeNull();

    await user.click(trigger);
    const list = menu();
    expect(list).not.toBeNull();
    expect(list).toHaveClass('tp-menu', 'tp-acct-menu');
    expect(list!.closest('.tp-acct-pop')).toHaveClass('tp-root');
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(trigger).toHaveClass('tp-on');

    const you = list!.querySelector('.tp-acct-me');
    expect(you).toHaveTextContent('Rohit Raj');
    expect(you).toHaveTextContent('rohit@example.com');
    expect(you!.querySelector('.tp-pdot')).toHaveTextContent('RR');
    const theme = within(list!).getByRole('group', { name: 'Theme' });
    const [light, dark, system] = within(theme).getAllByRole('button');
    expect(light).toHaveTextContent('Light');
    expect(dark).toHaveTextContent('Dark');
    expect(system).toHaveTextContent('System');
    expect(system).toHaveAttribute('aria-pressed', 'true');
    expect(list!.querySelector('.tp-mrow-sep')).not.toBeNull();
    const items = within(list!).getAllByRole('menuitem');
    expect(items.map((it) => it.textContent)).toEqual(['Settings', 'Sign out']);
    for (const it of items) expect(it).toHaveClass('tp-mi', 'tp-acct-mi');
  });

  it("C01-U07 picking Dark calls onTheme('dark') and keeps the menu open", async () => {
    const { user, onTheme, trigger, menu } = setup();
    await user.click(trigger);
    await user.click(within(menu()!).getByRole('button', { name: 'Dark' }));
    expect(onTheme).toHaveBeenCalledTimes(1);
    expect(onTheme).toHaveBeenCalledWith('dark');
    expect(menu()).not.toBeNull();
    // controlled: the switch shows the prop until the page changes it
    expect(within(menu()!).getByRole('button', { name: 'System' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('C01-U07 without a theme prop the switch keeps the choice itself', async () => {
    const { user, onTheme, trigger, menu } = setup({ theme: undefined });
    await user.click(trigger);
    await user.click(within(menu()!).getByRole('button', { name: 'Light' }));
    expect(onTheme).toHaveBeenCalledWith('light');
    expect(within(menu()!).getByRole('button', { name: 'Light' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('C01-U07 Settings and Sign out call their handlers and close the menu', async () => {
    const { user, onSettings, onSignOut, trigger, menu } = setup();
    await user.click(trigger);
    await user.click(screen.getByRole('menuitem', { name: 'Settings' }));
    expect(onSettings).toHaveBeenCalledTimes(1);
    expect(onSignOut).not.toHaveBeenCalled();
    await waitFor(() => expect(menu()).toBeNull());
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).not.toHaveClass('tp-on');

    await user.click(trigger);
    await user.click(screen.getByRole('menuitem', { name: 'Sign out' }));
    expect(onSignOut).toHaveBeenCalledTimes(1);
    expect(onSettings).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(menu()).toBeNull());
  });

  it('C01-U07 Escape and a click outside close it; defaultOpen starts open', async () => {
    const { user, trigger, menu } = setup();
    await user.click(trigger);
    expect(menu()).not.toBeNull();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(menu()).toBeNull());

    await user.click(trigger);
    expect(menu()).not.toBeNull();
    await user.click(screen.getByRole('button', { name: 'Elsewhere' }));
    await waitFor(() => expect(menu()).toBeNull());

    render(<AccountMenu me={{ name: 'Ada Byron', initials: 'AB' }} defaultOpen />);
    expect(screen.getByRole('menu', { name: 'You' })).toHaveTextContent('Ada Byron');
  });
});
