import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AiAccess, type AiAccessData } from './AiAccess';
import { ApiKeyDialog } from './ApiKeyDialog';
import { OAuthConsent } from './OAuthConsent';
import { Settings } from './Settings';

const URL = 'https://mcp.tudu.test/mcp';
const ICON = 'data:image/svg+xml,%3Csvg%2F%3E';
const DATA: AiAccessData = {
  url: URL,
  apps: [
    {
      id: 'c1',
      name: 'Claude',
      verified: true,
      icon: ICON,
      level: 'write',
      spaces: 'all',
      notebook: true,
      lastUsed: '2 hours ago',
    },
    { id: 'c2', name: 'Helper', verified: false, level: 'read', spaces: ['Northwind'] },
  ],
  keys: [
    {
      id: 'k1',
      name: 'Claude Code on my Mac',
      level: 'write',
      del: true,
      spaces: ['A', 'B'],
      notebook: true,
    },
    { id: 'k2', name: 'Old script', level: 'read', spaces: 'all', state: 'expired', expires: 'on 3 Oct' },
  ],
};
const SPACES = [
  { id: 's1', name: 'Personal', personal: true },
  { id: 's2', name: 'Northwind', color: '#3d5a80' },
];
const rowOf = (name: string) => screen.getByText(name).closest('.tp-set-sprow') as HTMLElement;

describe('AI access', () => {
  it('MCP-U10 rows and lines from the data; verified icon, letter and Unverified; expired; loading; error', async () => {
    const user = userEvent.setup();
    const onRevoke = vi.fn();
    const onCreate = vi.fn();
    const { rerender } = render(<AiAccess access={DATA} onRevoke={onRevoke} onCreate={onCreate} />);
    expect(rowOf('Claude')).toHaveTextContent(
      'Can read and change all your spaces and your Notebook · used 2 hours ago',
    );
    expect(rowOf('Claude').querySelector('.tp-ai-mark-img img')).toHaveAttribute('src', ICON);
    expect(rowOf('Helper').querySelector('.tp-ai-mark')).toHaveTextContent('H');
    expect(within(rowOf('Helper')).getByText('Unverified')).toBeInTheDocument();
    expect(within(rowOf('Claude')).queryByText('Unverified')).toBeNull();
    expect(rowOf('Helper')).toHaveTextContent('Can only read Northwind · not used yet');
    expect(rowOf('Claude Code on my Mac')).toHaveTextContent(
      'Can read, change and delete 2 spaces and your Notebook',
    );
    expect(rowOf('Old script')).toHaveTextContent('Expired on 3 Oct. It no longer works.');
    expect(within(rowOf('Old script')).getByRole('button', { name: 'Remove' })).toBeInTheDocument();
    await user.click(within(rowOf('Claude')).getByRole('button', { name: 'Disconnect' }));
    expect(onRevoke).toHaveBeenCalledWith(expect.objectContaining({ id: 'c1' }), 'app');
    await user.click(within(rowOf('Claude Code on my Mac')).getByRole('button', { name: 'Revoke' }));
    expect(onRevoke).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'k1' }), 'key');
    await user.click(screen.getByRole('button', { name: 'New key' }));
    expect(onCreate).toHaveBeenCalled();

    rerender(<AiAccess access={{ url: URL }} />);
    expect(screen.getByText('Nothing yet. Apps you allow show up here.')).toBeInTheDocument();

    rerender(<AiAccess access={{ url: URL, loading: true }} />);
    expect(document.querySelectorAll('.tp-set-skl')).toHaveLength(4);
    expect(screen.getByRole('button', { name: 'New key' })).toBeDisabled();

    const onRetry = vi.fn();
    rerender(<AiAccess access={{ url: URL, error: true }} onRetry={onRetry} />);
    expect(screen.getByText('Couldn’t load your apps and keys.')).toBeInTheDocument();
    expect(screen.queryByText('Keys')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalled();
  });

  it('MCP-U11 the key dialog: a taken name; Only some needs a space; Can delete only with write; the key once, Claude Code then Cursor', async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn(async () => ({ key: 'tudu_abcd1234' }));
    render(<ApiKeyDialog open inline spaces={SPACES} taken={['Laptop']} url={URL} onCreate={onCreate} />);
    const create = () => screen.getByRole('button', { name: 'Create key' });
    await user.click(create());
    expect(screen.getByText('Give it a name, like “Claude Code on my Mac”.')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Key name'), 'laptop');
    await user.click(create());
    expect(screen.getByText('You already have a key called “laptop”.')).toBeInTheDocument();
    await user.clear(screen.getByLabelText('Key name'));
    await user.type(screen.getByLabelText('Key name'), 'Claude Code');
    expect(screen.getByText('All spaces · Notebook · expires in 90 days')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Change' }));
    expect(screen.queryByRole('switch', { name: 'Can delete' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Read and write' }));
    await user.click(screen.getByRole('switch', { name: 'Can delete' }));
    await user.click(screen.getByRole('button', { name: 'Only some' }));
    await user.click(create());
    expect(screen.getByText('Pick at least one space, or choose All my spaces.')).toBeInTheDocument();
    expect(onCreate).not.toHaveBeenCalled();
    await user.click(screen.getByRole('switch', { name: 'Northwind' }));
    await user.click(screen.getByRole('button', { name: 'Never' }));
    await user.click(create());
    expect(onCreate).toHaveBeenCalledWith({
      name: 'Claude Code',
      level: 'write',
      canDelete: true,
      spaces: ['s2'],
      notebook: true,
      days: null,
    });
    expect(await screen.findByRole('dialog', { name: 'Copy your key' })).toBeInTheDocument();
    expect(screen.getByLabelText('Your new API key')).toHaveTextContent('tudu_abcd1234');
    expect(screen.getByLabelText('Command for Claude Code')).toHaveTextContent(
      `claude mcp add --transport http tudu ${URL} --header "Authorization: Bearer tudu_abcd1234"`,
    );
    await user.click(screen.getByRole('button', { name: 'Cursor' }));
    const json = JSON.parse(screen.getByLabelText('Settings for Cursor').textContent!) as unknown;
    expect(json).toEqual({
      mcpServers: { tudu: { url: URL, headers: { Authorization: 'Bearer tudu_abcd1234' } } },
    });
    expect(screen.getByText('You won’t see it again.')).toBeInTheDocument();
  });

  it('MCP-U11 a key the API refused keeps the form and says why', async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn(async () => {
      throw new Error('');
    });
    render(<ApiKeyDialog open inline spaces={SPACES} url={URL} onCreate={onCreate} />);
    await user.type(screen.getByLabelText('Key name'), 'Script');
    await user.click(screen.getByRole('button', { name: 'Create key' }));
    expect(
      await screen.findByText('Couldn’t create the key. Check your connection and try again.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'New API key' })).toBeInTheDocument();
  });

  it('MCP-U12 the consent page: each state; Change unfolds; Allow waits for a space; Cancel', async () => {
    const user = userEvent.setup();
    const me = { name: 'Rohit Raj', email: 'rohit@x.y', initials: 'RR' };
    const client = { name: 'Claude', host: 'claude.ai', verified: true, icon: ICON };
    let done: () => void = () => {};
    const onAllow = vi.fn(() => new Promise<void>((r) => (done = r)));
    const onDeny = vi.fn();
    const { rerender } = render(
      <OAuthConsent
        inline
        state="ask"
        client={client}
        me={me}
        spaces={SPACES}
        onAllow={onAllow}
        onDeny={onDeny}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Allow Claude?' })).toBeInTheDocument();
    expect(screen.getByText('Read and write · All spaces · Notebook')).toBeInTheDocument();
    expect(screen.queryByText(/can’t confirm/)).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Change' }));
    await user.click(screen.getByRole('button', { name: 'Only some' }));
    expect(screen.getByRole('button', { name: 'Allow' })).toBeDisabled();
    await user.click(screen.getByRole('switch', { name: 'Personal' }));
    await user.click(screen.getByRole('switch', { name: 'Notebook' }));
    await user.click(screen.getByRole('button', { name: 'Allow' }));
    expect(onAllow).toHaveBeenCalledWith({
      level: 'write',
      canDelete: false,
      spaces: ['s1'],
      notebook: false,
    });
    expect(screen.getByRole('button', { name: /Allowing…/ })).toHaveAttribute('aria-busy', 'true');
    await act(async () => {
      done();
      await Promise.resolve();
    });
    expect(screen.getByRole('button', { name: /Allowed/ })).toHaveClass('tp-ok');

    rerender(
      <OAuthConsent inline state="ask" client={{ name: 'Helper', verified: false }} onDeny={onDeny} />,
    );
    expect(screen.getByText('Tudu can’t confirm who made this app.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onDeny).toHaveBeenCalled();

    rerender(<OAuthConsent inline state="loading" />);
    expect(document.querySelector('.tp-oc')).toHaveAttribute('aria-busy', 'true');
    rerender(<OAuthConsent inline state="error" />);
    expect(screen.getByRole('heading', { name: 'This link didn’t work' })).toBeInTheDocument();
    rerender(<OAuthConsent inline state="denied" client={client} />);
    expect(screen.getByRole('heading', { name: 'Nothing was shared' })).toBeInTheDocument();
    rerender(<OAuthConsent inline state="done" client={client} />);
    expect(screen.getByRole('heading', { name: 'Claude is connected' })).toBeInTheDocument();
    expect(screen.getByText('Taking you back to claude.ai…')).toBeInTheDocument();
  });

  it('MCP-U13 Settings lists AI access under You with its counts; the phone section has ‹ Settings', async () => {
    const user = userEvent.setup();
    const ME = { name: 'Rohit Raj', email: 'rohit@x.y', initials: 'RR' };
    const SP = { name: 'Personal', personal: true, members: 1, role: 'admin' as const };
    const { rerender } = render(<Settings me={ME} space={SP} still layout="phone" />);
    expect(screen.getByRole('button', { name: /^AI accessNone yet$/ })).toBeInTheDocument();
    rerender(<Settings me={ME} space={SP} still layout="phone" aiAccess={DATA} />);
    expect(screen.getByRole('button', { name: /^AI access2 apps · 2 keys$/ })).toBeInTheDocument();
    const onBack = vi.fn();
    rerender(
      <Settings
        me={ME}
        space={SP}
        still
        layout="phone"
        view="section"
        section="ai"
        aiAccess={DATA}
        onBack={onBack}
      />,
    );
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('AI access');
    expect(screen.getByText('Use Tudu from Claude, ChatGPT and your own tools.')).toBeInTheDocument();
    expect(document.querySelector('.tp-set-apps.tp-set-ai')).not.toBeNull();
    await user.click(screen.getByRole('button', { name: 'Settings' }));
    expect(onBack).toHaveBeenCalled();
    rerender(<Settings me={ME} space={SP} still section="ai" aiAccess={DATA} />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('AI access');
  });
});
