import '@testing-library/jest-dom/vitest';
import type { SpaceSummary } from '@tudu/core';
import { QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { JiraConnectHost } from './JiraHost';
import { ALL_GLOW, clearJiraGlow, jiraClient, peekJiraGlow, useJira } from './jira';
import { queryClient } from './session';

const navigate = vi.fn();
let location = { pathname: '/all', searchStr: 'jira' };
vi.mock('@tanstack/react-router', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  useNavigate: () => navigate,
  useRouterState: ({ select }: { select: (s: { location: typeof location }) => unknown }) =>
    select({ location }),
}));
vi.mock('./workingDay', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  useWorkingDay: () => ({ today: '2026-10-18' }),
}));
vi.mock('./jira', async (orig) => ({ ...(await orig<Record<string, unknown>>()), useJira: vi.fn() }));

const PERSONAL: SpaceSummary = {
  id: 'p',
  kind: 'personal',
  name: 'Personal',
  color: null,
  role: 'admin',
  slug: 'me',
  prefix: 'ME',
  members: 1,
  inbox: { toAnswer: 0, unread: 0 },
};
const CONN = {
  connected: true as const,
  site: 'https://jira.northwind.io',
  who: { name: 'Rohit Raj', email: 'rohit@x.y' },
  state: 'ok' as const,
  syncedAt: null,
  views: [],
  assigned: [],
  count: 0,
  onIn: 0,
};
type Jira = ReturnType<typeof useJira>;
const jira = (connected: Jira['connected'], known = true): Jira => ({
  conn: null,
  connected,
  known,
  onHere: false,
  links: [],
  count: null,
});

function show() {
  return render(
    <QueryClientProvider client={queryClient}>
      <JiraConnectHost space={PERSONAL} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  navigate.mockClear();
  clearJiraGlow();
  location = { pathname: '/all', searchStr: 'jira' };
  vi.mocked(useJira).mockReturnValue(jira(null));
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('C10-U27 Jira from All spaces: only the token form', () => {
  it('opens the form, connects with no space, then opens Settings › Apps with every row glowing', async () => {
    const connect = vi.spyOn(jiraClient, 'connect').mockResolvedValue(CONN);
    show();
    expect(screen.getByText(/Then pick the spaces it shows in/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Jira address'), {
      target: { value: 'https://jira.northwind.io' },
    });
    fireEvent.change(screen.getByLabelText('Personal access token'), { target: { value: 'good-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Connect Jira' }));
    await waitFor(() => expect(connect).toHaveBeenCalledWith('https://jira.northwind.io', 'good-1'));
    // Once connected the reads say so, but the form stays for its tick.
    vi.mocked(useJira).mockReturnValue(jira(CONN));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith({ href: '/all?settings=apps' }), {
      timeout: 2500,
    });
    expect(peekJiraGlow()).toBe(ALL_GLOW);
  });

  it('a refusal stays on the form with the reason; × closes', async () => {
    vi.spyOn(jiraClient, 'connect').mockRejectedValue(new Error('down'));
    show();
    fireEvent.change(screen.getByLabelText('Jira address'), {
      target: { value: 'https://jira.northwind.io' },
    });
    fireEvent.change(screen.getByLabelText('Personal access token'), { target: { value: 'bad' } });
    fireEvent.click(screen.getByRole('button', { name: 'Connect Jira' }));
    expect(await screen.findByText(/Couldn’t reach Jira at this address/)).toBeInTheDocument();
    expect(navigate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Close Jira' }));
    expect(navigate).toHaveBeenLastCalledWith({ href: '/all' });
  });

  it('expired asks for a new token; already connected drops ?jira and shows nothing; not read yet waits', () => {
    vi.mocked(useJira).mockReturnValue(jira({ ...CONN, state: 'expired' }));
    const a = show();
    expect(screen.getByRole('heading', { name: 'Add a new token' })).toBeInTheDocument();
    a.unmount();

    vi.mocked(useJira).mockReturnValue(jira(CONN));
    const b = show();
    expect(screen.queryByLabelText('Jira address')).toBeNull();
    expect(navigate).toHaveBeenLastCalledWith({ href: '/all', replace: true });
    b.unmount();

    navigate.mockClear();
    vi.mocked(useJira).mockReturnValue(jira(null, false));
    show();
    expect(screen.queryByLabelText('Jira address')).toBeNull();
    expect(navigate).not.toHaveBeenCalled();
  });
});
