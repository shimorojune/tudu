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

    // Settings › Apps: the row in the space's group, the section's words, Connect and Disconnect.
    const onJira = vi.fn();
    rerender(
      <Settings me={ME} space={NW} still section="apps" onJira={onJira} jira={{ connected: false }} />,
    );
    const nav = screen.getByRole('navigation', { name: 'Settings' });
    expect(within(nav).getByRole('button', { name: /^Apps/ })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Apps');
    expect(
      screen.getByText('What you’ve connected in Northwind. Each person connects their own.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Bring your Jira issues next to your day. Connect with a personal access token.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('More apps are on the way. Everything here is optional; Tudu works fine on its own.'),
    ).toBeInTheDocument();
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

    rerender(<Settings me={ME} space={PERSONAL} still section="apps" jira={{ connected: false }} />);
    expect(screen.getByText('What you’ve connected in Personal.')).toBeInTheDocument();
  });
});
