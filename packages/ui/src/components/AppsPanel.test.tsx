import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AppsPanel } from './AppsPanel';
import { Settings } from './Settings';

const ME = { name: 'Rohit Raj', email: 'rohit@x.y', initials: 'RR' };
const NW = { name: 'Northwind', color: '#3d5a80', members: 19, role: 'admin' as const };
const PERSONAL = { name: 'Personal', personal: true, members: 1, role: 'admin' as const };
const JIRA = { id: 'jira', name: 'Jira', blurb: 'Your Jira issues beside your day.' };

describe('Apps (chunk 10)', () => {
  it('C10-U07 the Apps panel and Settings › Apps', async () => {
    const user = userEvent.setup();
    const onConnect = vi.fn();
    const onOpen = vi.fn();
    const onClose = vi.fn();
    const { rerender } = render(
      <AppsPanel apps={[JIRA]} onConnect={onConnect} onOpen={onOpen} onClose={onClose} />,
    );
    const panel = screen.getByRole('region', { name: 'Apps' });
    expect(within(panel).getByRole('heading', { name: 'Apps' })).toBeInTheDocument();
    expect(panel).toHaveTextContent(
      'Bring work from the tools you use next to your day. Everything here is optional; Tudu works fine on its own.',
    );
    expect(panel).toHaveTextContent('Your Jira issues beside your day.');
    expect(panel).toHaveTextContent('More apps will show up here.');
    await user.click(screen.getByRole('button', { name: 'Connect Jira' }));
    expect(onConnect).toHaveBeenCalledWith('jira');
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalled();

    rerender(
      <AppsPanel
        apps={[{ ...JIRA, connected: true, status: 'As rohit@x.y on jira.northwind.io.' }]}
        onOpen={onOpen}
      />,
    );
    expect(screen.getByText('Connected')).toBeInTheDocument();
    expect(screen.getByText('As rohit@x.y on jira.northwind.io.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Open Jira' }));
    expect(onOpen).toHaveBeenCalledWith('jira');

    // Settings › Apps: under You (yours, not the space's), the section's words, Connect and Disconnect.
    const onJira = vi.fn();
    rerender(
      <Settings me={ME} space={NW} still section="apps" onJira={onJira} jira={{ connected: false }} />,
    );
    const nav = screen.getByRole('navigation', { name: 'Settings' });
    expect(within(nav).getByRole('button', { name: /^Apps/ })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Apps');
    expect(
      screen.getByText('Connected once, for you. Pick the spaces each one shows in.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Bring your Jira issues next to your day. Connect once with a personal access token, then pick the spaces it shows in.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText('More apps are on the way. Everything here is optional; Tudu works fine on its own.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Use Jira in')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Connect' }));
    expect(onJira).toHaveBeenCalledTimes(1);

    rerender(
      <Settings
        me={ME}
        space={NW}
        still
        section="apps"
        onJira={onJira}
        jira={{ connected: true, who: 'rohit@x.y', site: 'jira.northwind.io' }}
      />,
    );
    expect(
      screen.getByText('As rohit@x.y on jira.northwind.io. Only you see your issues.'),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole('navigation', { name: 'Settings' })).getByRole('button', { name: /^Apps/ }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Disconnect' }));
    expect(onJira).toHaveBeenCalledTimes(2);

    // The old per-space Apps, kept for history boards.
    rerender(
      <Settings
        me={ME}
        space={PERSONAL}
        still
        section="apps"
        appsScope="space"
        jira={{ connected: false }}
      />,
    );
    expect(screen.getByText('What you’ve connected in Personal.')).toBeInTheDocument();
  });

  it('C10-U14 connected but off here: Turn on here, Turning on…, and the account Connect words', async () => {
    const user = userEvent.setup();
    const onEnable = vi.fn();
    const { rerender } = render(
      <AppsPanel
        apps={[{ ...JIRA, connected: true, off: true }]}
        spaceName="Northwind"
        onEnable={onEnable}
      />,
    );
    expect(screen.getByText('Connected · off here')).toBeInTheDocument();
    expect(
      screen.getByText('Connected to your account. Turn it on to use it in Northwind.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Open Jira' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Turn on Jira here' }));
    expect(onEnable).toHaveBeenCalledWith('jira');

    rerender(
      <AppsPanel
        apps={[{ ...JIRA, connected: true, off: true, busy: true }]}
        spaceName="Northwind"
        onEnable={onEnable}
      />,
    );
    const busy = screen.getByRole('button', { name: 'Turn on Jira here' });
    expect(busy).toHaveTextContent('Turning on…');
    await user.click(busy);
    expect(onEnable).toHaveBeenCalledTimes(1);
  });

  it('C10-U21 connected and on here: a quiet Turn off here, Turning off…, and the reason it couldn’t', async () => {
    const user = userEvent.setup();
    const onDisable = vi.fn();
    const onOpen = vi.fn();
    const on = { ...JIRA, connected: true, status: 'As rohit@x.y on jira.northwind.io.' };
    const { rerender } = render(
      <AppsPanel apps={[on]} spaceName="Acme Studio" onDisable={onDisable} onOpen={onOpen} />,
    );
    const off = screen.getByRole('button', { name: 'Turn off Jira in Acme Studio' });
    expect(off).toHaveTextContent('Turn off here');
    await user.click(off);
    expect(onDisable).toHaveBeenCalledWith('jira');
    await user.click(screen.getByRole('button', { name: 'Open Jira' }));
    expect(onOpen).toHaveBeenCalledWith('jira');
    expect(screen.queryByRole('alert')).toBeNull();

    rerender(<AppsPanel apps={[{ ...on, busy: true }]} spaceName="Acme Studio" onDisable={onDisable} />);
    const busy = screen.getByRole('button', { name: 'Turn off Jira in Acme Studio' });
    expect(busy).toHaveTextContent('Turning off…');
    expect(busy).toBeDisabled();
    expect(busy.querySelector('.tp-spin')).not.toBeNull();
    await user.click(busy);
    expect(onDisable).toHaveBeenCalledTimes(1);

    rerender(
      <AppsPanel
        apps={[{ ...on, error: 'Couldn’t turn Jira off here.' }]}
        spaceName="Acme Studio"
        onDisable={onDisable}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Couldn’t turn Jira off here.');
    expect(screen.getByRole('button', { name: 'Turn off Jira in Acme Studio' })).toBeEnabled();

    rerender(
      <AppsPanel
        apps={[{ ...JIRA, connected: true, off: true }]}
        spaceName="Acme Studio"
        onDisable={onDisable}
      />,
    );
    expect(screen.getByRole('button', { name: 'Turn on Jira here' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Turn off/ })).toBeNull();

    rerender(<AppsPanel apps={[JIRA]} spaceName="Acme Studio" onDisable={onDisable} />);
    expect(screen.getByRole('button', { name: 'Connect Jira' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Turn off/ })).toBeNull();
  });
});
