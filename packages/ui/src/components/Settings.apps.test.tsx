import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { JIRA_SWITCH_SETTLE_MS, Settings, type JiraSpaceRow, type SettingsProps } from './Settings';

const ME = { name: 'Rohit Raj', email: 'rohit@x.y', initials: 'RR' };
const NW = { id: 'nw', name: 'Northwind', color: '#3d5a80', members: 19, role: 'admin' as const };
const SPACES: JiraSpaceRow[] = [
  { id: 'me', name: 'Personal', personal: true, on: true, linked: 3 },
  { id: 'nw', name: 'Northwind', color: '#3d5a80', on: false, linked: 2, current: true },
  { id: 'hb', name: 'Harbour', color: '#6b8f71', on: false },
];
const JIRA = { connected: true, who: 'rohit@x.y', site: 'jira.northwind.io', spaces: SPACES };

function apps(p: Partial<SettingsProps>) {
  return <Settings me={ME} space={NW} still section="apps" {...p} />;
}

const rowOf = (name: string) =>
  screen.getByRole('switch', { name: `Jira in ${name}` }).closest('.tp-set-sprow')!;

describe('C10-U13 Settings › Apps is yours', () => {
  it('sits under You; one row per space with its line; the count; Connect; expired', async () => {
    const user = userEvent.setup();
    const { rerender } = render(apps({ jira: JIRA }));
    const nav = screen.getByRole('navigation', { name: 'Settings' });
    const you = within(nav)
      .getAllByRole('button')
      .map((b) => b.textContent);
    expect(you.slice(0, 3)).toEqual(['Account', 'Appearance', 'Apps']);

    rerender(apps({ jira: JIRA, layout: 'phone' }));
    expect(screen.getByRole('button', { name: /^AppsJira · on in 1 space$/ })).toBeInTheDocument();
    rerender(apps({ jira: JIRA }));

    expect(screen.getByText('Use Jira in')).toBeInTheDocument();
    expect(screen.getByText('1 of 3 on')).toBeInTheDocument();
    expect(rowOf('Personal')).toHaveTextContent('Personal3 linked tasks');
    expect(rowOf('Northwind')).toHaveTextContent('NorthwindYou’re hereOff · 2 tasks keep their keys');
    expect(rowOf('Harbour')).toHaveTextContent('HarbourOff');
    expect(screen.getByRole('switch', { name: 'Jira in Personal' })).toHaveAttribute('aria-checked', 'true');
    expect(
      screen.getByText(
        'New spaces start with Jira off. Turning it off hides Jira there; tasks keep their keys.',
      ),
    ).toBeInTheDocument();

    // Not connected: Connect, no list.
    const onJira = vi.fn();
    rerender(apps({ jira: { connected: false }, onJira }));
    expect(screen.queryByText('Use Jira in')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Connect' }));
    expect(onJira).toHaveBeenCalled();

    // Expired: paused everywhere, Add a new token, the switches wait.
    const onJiraReconnect = vi.fn();
    rerender(apps({ jira: { ...JIRA, state: 'expired' }, onJiraReconnect }));
    expect(screen.getByText(/has expired\. Jira is paused in every space/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Add a new token' }));
    expect(onJiraReconnect).toHaveBeenCalled();
    expect(screen.getByRole('switch', { name: 'Jira in Harbour' })).toBeDisabled();
  });

  it('a switch says Turning on… and calls back; a refusal puts it back with the reason', async () => {
    const user = userEvent.setup({ advanceTimers: (ms) => vi.advanceTimersByTime(ms) });
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let answer: (r?: { error?: string }) => void = () => {};
    const onJiraSpace = vi.fn(() => new Promise<{ error?: string } | void>((r) => (answer = r)));
    const { rerender } = render(apps({ jira: JIRA, onJiraSpace }));
    await user.click(screen.getByRole('switch', { name: 'Jira in Northwind' }));
    expect(onJiraSpace).toHaveBeenCalledWith(expect.objectContaining({ id: 'nw' }), true);
    expect(rowOf('Northwind')).toHaveTextContent('Turning on…');
    expect(screen.getByRole('switch', { name: 'Jira in Northwind' })).toBeDisabled();
    await act(async () => answer());
    await act(async () => vi.advanceTimersByTime(JIRA_SWITCH_SETTLE_MS + 10));
    expect(rowOf('Northwind')).toHaveTextContent('2 linked tasks');
    expect(screen.getByText('2 of 3 on')).toBeInTheDocument();
    // The server's word arrives: the row speaks for itself again.
    rerender(
      apps({
        jira: { ...JIRA, spaces: SPACES.map((x) => (x.id === 'nw' ? { ...x, on: true } : x)) },
        onJiraSpace,
      }),
    );
    expect(screen.getByRole('switch', { name: 'Jira in Northwind' })).toHaveAttribute('aria-checked', 'true');

    // A refusal (rejected): back off, and the reason under the row.
    const refuse = vi.fn(() => Promise.reject(new Error('You’re not in Harbour any more.')));
    rerender(apps({ jira: JIRA, onJiraSpace: refuse }));
    await user.click(screen.getByRole('switch', { name: 'Jira in Harbour' }));
    await act(async () => vi.advanceTimersByTime(JIRA_SWITCH_SETTLE_MS + 10));
    expect(screen.getByRole('switch', { name: 'Jira in Harbour' })).toHaveAttribute('aria-checked', 'false');
    expect(within(rowOf('Harbour') as HTMLElement).getByRole('alert')).toHaveTextContent(
      'You’re not in Harbour any more.',
    );
    vi.useRealTimers();
  });

  it('loading draws skeleton rows; an error shows Try again and hides the list; no spaces given is one row, on', async () => {
    const user = userEvent.setup();
    const { rerender } = render(apps({ jira: { ...JIRA, loading: true } }));
    expect(document.querySelectorAll('.tp-set-skl')).toHaveLength(3);
    expect(screen.queryByText(/of 3 on/)).toBeNull();

    const onRetry = vi.fn();
    rerender(apps({ jira: { ...JIRA, error: true }, onRetry }));
    expect(screen.getByText('Couldn’t load your spaces.')).toBeInTheDocument();
    expect(screen.queryByText('Use Jira in')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalled();

    rerender(apps({ jira: { connected: true, site: 'jira.northwind.io' } }));
    expect(screen.getByRole('switch', { name: 'Jira in Northwind' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText('1 of 1 on')).toBeInTheDocument();
  });
});
