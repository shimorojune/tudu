import { deleteAsk, leaveAsk, removeAsk } from '@tudu/core';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { paintMotion, readLessMotion, setLessMotion } from '../lib/theme';
import { prefersReducedMotion } from '../lib/hooks';
import { ConfirmDialog } from './ConfirmDialog';
import { FIND_PAST, MembersBody, type MembersBodyMember } from './MembersBody';
import { Settings, type SettingsProps } from './Settings';

const ME = { name: 'Rohit Raj', email: 'rohit@x.y', initials: 'RR' };
const NW = { name: 'Northwind', color: '#3d5a80', members: 19, role: 'admin' as const };
const PERSONAL = { name: 'Personal', personal: true, members: 1, role: 'admin' as const };

function settings(extra: Partial<SettingsProps> = {}) {
  const onSection = vi.fn();
  const utils = render(<Settings me={ME} space={NW} still onSection={onSection} {...extra} />);
  return { onSection, ...utils };
}

const nav = () => screen.getByRole('navigation', { name: 'Settings' });

describe('Settings', () => {
  it('C09-U02 the list for a team space and for Personal; picking; titles; close; the phone list and a section', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const { onSection, rerender } = settings({ section: 'account', onClose, theme: 'dark' });
    const items = within(nav())
      .getAllByRole('button')
      .map((b) => b.textContent);
    expect(items).toEqual(['Account', 'Appearance', 'Apps', 'Space', 'Members19']);
    expect(within(nav()).getByRole('button', { name: 'Account' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Account');
    expect(screen.getByText('rohit@x.y', { selector: '.tp-set-h p' })).toBeInTheDocument();
    await user.click(within(nav()).getByRole('button', { name: /^Members/ }));
    expect(onSection).toHaveBeenCalledWith('members');
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalled();

    rerender(<Settings me={ME} space={NW} still section="space" onSection={onSection} />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Northwind');
    expect(screen.getByText('19 people · You’re an admin')).toBeInTheDocument();
    rerender(<Settings me={ME} space={NW} still section="appearance" onSection={onSection} />);
    expect(screen.getByText('How Tudu looks on this computer.')).toBeInTheDocument();

    rerender(<Settings me={ME} space={PERSONAL} still section="space" onSection={onSection} />);
    expect(
      within(nav())
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['Account', 'Appearance', 'Apps', 'Space']);
    expect(screen.getByText('Yours alone. Nothing here is shared.')).toBeInTheDocument();

    // phones: the list is the page, with your mark; rows carry their line; a section has ‹ Settings
    const onBack = vi.fn();
    rerender(
      <Settings me={ME} space={NW} layout="phone" theme="dark" onSection={onSection} onBack={onBack} still />,
    );
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Settings');
    expect(document.querySelector('.tp-set-me')).toHaveTextContent('Rohit Rajrohit@x.y');
    const list = within(nav()).getAllByRole('button');
    expect(list.map((b) => b.textContent)).toEqual([
      'Accountrohit@x.y',
      'AppearanceDark',
      'AppsNone yet',
      'SpaceName, colour, leaving',
      'Members19 people',
    ]);
    expect(list[0]).not.toHaveAttribute('aria-current');
    rerender(
      <Settings
        me={ME}
        space={NW}
        layout="phone"
        view="section"
        section="appearance"
        onSection={onSection}
        onBack={onBack}
        still
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Settings' }));
    expect(onBack).toHaveBeenCalled();
    expect(screen.queryByRole('navigation', { name: 'Settings' })).toBeNull();
  });

  it('C09-U03 Account: photo Change and Remove, the name saves on leaving, email Change with the code, Sign out', async () => {
    const user = userEvent.setup();
    const onPhoto = vi.fn();
    const onRemovePhoto = vi.fn();
    const onName = vi.fn();
    const onSignOut = vi.fn();
    const onEmailStart = vi.fn(async () => {});
    const onEmailConfirm = vi.fn(async (code: string) => {
      if (code !== '123456') throw new Error('That code didn’t work. Check it and try again.');
    });
    const { rerender } = settings({
      section: 'account',
      onPhoto,
      onRemovePhoto,
      onName,
      onSignOut,
      onEmailStart,
      onEmailConfirm,
    });
    expect(screen.queryByRole('button', { name: 'Remove your photo' })).toBeNull();
    const file = new File(['x'], 'me.png', { type: 'image/png' });
    await user.upload(screen.getByLabelText('Choose a photo'), file);
    expect(onPhoto).toHaveBeenCalledWith(file);
    rerender(
      <Settings
        me={{ ...ME, image: '/p.png' }}
        space={NW}
        still
        section="account"
        onRemovePhoto={onRemovePhoto}
        onName={onName}
        onEmailStart={onEmailStart}
        onEmailConfirm={onEmailConfirm}
        onSignOut={onSignOut}
      />,
    );
    expect(document.querySelector('.tp-set-photo img')).toHaveAttribute('src', '/p.png');
    await user.click(screen.getByRole('button', { name: 'Remove your photo' }));
    expect(onRemovePhoto).toHaveBeenCalled();

    const name = screen.getByRole('textbox', { name: 'Name' });
    await user.clear(name);
    await user.type(name, 'Rohit R');
    expect(onName).not.toHaveBeenCalled();
    await user.tab();
    expect(onName).toHaveBeenCalledTimes(1);
    expect(onName).toHaveBeenCalledWith('Rohit R');
    // an empty name puts the old one back
    await user.clear(name);
    await user.tab();
    expect(name).toHaveValue('Rohit Raj');
    expect(onName).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: 'Change your email' }));
    await user.type(screen.getByRole('textbox', { name: 'New email' }), 'rohit@new.y');
    await user.click(screen.getByRole('button', { name: 'Send code' }));
    expect(onEmailStart).toHaveBeenCalledWith('rohit@new.y');
    expect(await screen.findByText(/A 6-digit code went to rohit@new.y/)).toBeInTheDocument();
    const code = screen.getByRole('textbox', { name: 'Code from the new address' });
    await user.type(code, '000000');
    expect(await screen.findByRole('alert')).toHaveTextContent('That code didn’t work');
    await user.type(screen.getByRole('textbox', { name: 'Code from the new address' }), '123456');
    expect(onEmailConfirm).toHaveBeenLastCalledWith('123456');
    expect(await screen.findByRole('button', { name: 'Change your email' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(onSignOut).toHaveBeenCalled();
  });

  it('C09-U04 Appearance: the theme cards report; Less motion puts data-motion on the page, remembered per browser', async () => {
    const user = userEvent.setup();
    const onTheme = vi.fn();
    const onLessMotion = vi.fn();
    settings({ section: 'appearance', theme: 'system', onTheme, onLessMotion });
    const cards = within(screen.getByRole('radiogroup', { name: 'Theme' })).getAllByRole('radio');
    expect(cards.map((c) => c.textContent)).toEqual(['Light', 'Dark', 'SystemFollows your computer']);
    expect(cards[2]).toHaveAttribute('aria-checked', 'true');
    await user.click(cards[1]!);
    expect(onTheme).toHaveBeenCalledWith('dark');
    await user.click(screen.getByRole('switch', { name: 'Less motion' }));
    expect(onLessMotion).toHaveBeenCalledWith(true);

    setLessMotion(true);
    expect(document.documentElement.dataset.motion).toBe('less');
    expect(readLessMotion()).toBe(true);
    expect(prefersReducedMotion()).toBe(true);
    setLessMotion(false);
    expect(document.documentElement.dataset.motion).toBeUndefined();
    expect(readLessMotion()).toBe(false);
    // the computer's own setting still counts with the switch off
    const mm = vi.spyOn(window, 'matchMedia').mockImplementation(
      (q: string) =>
        ({
          matches: q.includes('reduced-motion'),
          media: q,
          addEventListener() {},
          removeEventListener() {},
        }) as never,
    );
    expect(prefersReducedMotion()).toBe(true);
    mm.mockRestore();
    paintMotion(false);
  });

  it('C09-U05 Space: Personal offers Create a space; a team space’s tile follows the name and colour; Leave and Delete', async () => {
    const user = userEvent.setup();
    const onCreateSpace = vi.fn();
    const { rerender } = settings({ section: 'space', space: PERSONAL, onCreateSpace });
    expect(screen.getByText(/it can’t be shared or left/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Create a space' }));
    expect(onCreateSpace).toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Leave' })).toBeNull();

    const onSpaceName = vi.fn();
    const onSpaceColor = vi.fn();
    const onLeave = vi.fn();
    const onDelete = vi.fn();
    const props = { onSpaceName, onSpaceColor, onLeave, onDelete };
    rerender(<Settings me={ME} space={NW} still section="space" {...props} />);
    const field = screen.getByRole('textbox', { name: 'Space name' });
    const tile = () => document.querySelector('.tp-set-name .tp-stile')!;
    expect(tile()).toHaveTextContent('N');
    await user.clear(field);
    await user.type(field, 'Design team');
    expect(tile()).toHaveTextContent('DT');
    expect(onSpaceName).not.toHaveBeenCalled();
    await user.tab();
    expect(onSpaceName).toHaveBeenCalledWith('Design team');
    await user.click(
      within(screen.getByRole('radiogroup', { name: 'Space colour' })).getAllByRole('radio')[4]!,
    );
    expect(onSpaceColor).toHaveBeenCalled();
    expect(
      screen.getByText('Removes it, and everything in it, for all 19 people. This can’t be undone.'),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Leave' }));
    await user.click(screen.getByRole('button', { name: 'Delete…' }));
    expect(onLeave).toHaveBeenCalled();
    expect(onDelete).toHaveBeenCalled();

    // a member: no name field, no Delete, Leave still there
    rerender(<Settings me={ME} space={{ ...NW, role: 'member' }} still section="space" {...props} />);
    expect(screen.queryByRole('textbox', { name: 'Space name' })).toBeNull();
    expect(screen.getByText('Its name and colour are kept by its admins.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete…' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Leave' })).toBeInTheDocument();
  });

  it('C09-U07 Members: Find past eight; an admin’s role menu with Remove; a member sees words; no menu on your own row', async () => {
    const user = userEvent.setup();
    const many: MembersBodyMember[] = [
      { id: 'r', name: 'Rohit Raj', email: 'rohit@x.y', initials: 'RR', role: 'admin', you: true },
      ...'Meera Arjun Priya Sam Ana Ben Chloe Daniel'.split(' ').map((n, i): MembersBodyMember => ({
        id: `p${i}`,
        name: n,
        email: `${n.toLowerCase()}@x.y`,
        initials: n[0]!,
        role: 'member',
      })),
    ];
    expect(many.length).toBeGreaterThan(FIND_PAST);
    const onRole = vi.fn();
    const onRemove = vi.fn();
    const { rerender } = render(
      <MembersBody
        spaceName="Northwind"
        members={many}
        invites={[]}
        canEdit
        onRole={onRole}
        onRemove={onRemove}
      />,
    );
    const find = screen.getByRole('searchbox', { name: 'Find someone' });
    await user.type(find, 'mee');
    expect(within(screen.getByRole('list', { name: 'Members' })).getAllByRole('listitem')).toHaveLength(1);
    await user.clear(find);
    await user.type(find, 'zed');
    expect(screen.getByText('No one called “zed” in Northwind.')).toBeInTheDocument();
    await user.clear(find);

    // your own row has no menu
    expect(screen.queryByRole('button', { name: 'Rohit Raj: Admin' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Meera: Member' }));
    const menu = await screen.findByRole('menu');
    const radios = within(menu).getAllByRole('menuitemradio');
    expect(radios.map((r) => r.textContent)).toEqual([
      'AdminCan change the space and who’s in it',
      'MemberCan add, share and send tasks',
    ]);
    expect(radios[1]).toHaveAttribute('aria-checked', 'true');
    await user.click(radios[0]!);
    expect(onRole).toHaveBeenCalledWith(many[1], 'admin');
    await user.click(screen.getByRole('button', { name: 'Arjun: Member' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Remove from Northwind' }));
    expect(onRemove).toHaveBeenCalledWith(many[2]);

    rerender(<MembersBody spaceName="Northwind" members={many.slice(0, 3)} invites={[]} />);
    expect(screen.queryByRole('searchbox', { name: 'Find someone' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Meera: Member' })).toBeNull();
    expect(within(screen.getByRole('list', { name: 'Members' })).getAllByText('Member')).toHaveLength(2);
  });
});

describe('asking first', () => {
  afterEach(() => vi.useRealTimers());

  it('C09-U08 Leave, Remove and Delete words; Delete wakes only on the exact name; the last admin; the sheet', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const ask = deleteAsk('Northwind', 19);
    const { rerender } = render(
      <ConfirmDialog
        open
        inline
        onClose={() => {}}
        onConfirm={onConfirm}
        title={ask.title}
        confirmLabel={ask.confirm}
        typeToConfirm="Northwind"
      >
        {ask.body}
      </ConfirmDialog>,
    );
    const go = screen.getByRole('button', { name: 'Delete Northwind' });
    expect(go).toBeDisabled();
    const typed = screen.getByRole('textbox', { name: 'Type Northwind to confirm' });
    await user.type(typed, 'northwind');
    expect(go).toBeDisabled();
    await user.clear(typed);
    await user.type(typed, 'Northwind');
    expect(go).toBeEnabled();
    expect(screen.getByText(/for all 19 people/)).toBeInTheDocument();

    const leave = leaveAsk('Northwind', null);
    rerender(
      <ConfirmDialog
        open
        inline
        onClose={() => {}}
        onConfirm={onConfirm}
        title={leave.title}
        confirmLabel={leave.confirm}
      >
        {leave.body}
      </ConfirmDialog>,
    );
    expect(screen.getByRole('heading', { name: 'Leave Northwind?' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Leave Northwind' })).toBeEnabled();
    const last = leaveAsk('Northwind', 'last-admin');
    rerender(
      <ConfirmDialog
        open
        inline
        onClose={() => {}}
        onConfirm={onConfirm}
        title={last.title}
        confirmLabel={last.confirm}
      >
        {last.body}
      </ConfirmDialog>,
    );
    expect(screen.getByText(/Make someone else an admin in Members/)).toBeInTheDocument();
    const remove = removeAsk('Meera', 'Northwind');
    rerender(
      <ConfirmDialog
        open
        variant="sheet"
        onClose={() => {}}
        onConfirm={onConfirm}
        title={remove.title}
        confirmLabel={remove.confirm}
      >
        {remove.body}
      </ConfirmDialog>,
    );
    expect(document.querySelector('.tp-dlg-sheet')).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Remove Meera' }));
    });
    expect(onConfirm).toHaveBeenCalled();
  });
});

describe('C16-U04 Settings › This Mac', () => {
  const mac = (extra: Partial<NonNullable<SettingsProps['mac']>> = {}) => ({
    openAtLogin: 'off' as const,
    dock: 'open' as const,
    onOpenAtLogin: vi.fn(),
    onLoginItems: vi.fn(),
    onDock: vi.fn(),
    ...extra,
  });

  it('is listed under You only in the Mac app; a link to it on the web falls back to Account', () => {
    const { rerender } = settings({ section: 'mac' });
    expect(within(nav()).queryByRole('button', { name: 'This Mac' })).toBeNull();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Account');

    rerender(<Settings me={ME} space={NW} still section="mac" mac={mac()} />);
    expect(
      within(nav())
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['Account', 'Appearance', 'This Mac', 'Apps', 'Space', 'Members19']);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('This Mac');
    expect(screen.getByText('How Tudu runs on this Mac.')).toBeInTheDocument();
  });

  it('Open at login: off, on, waiting for macOS with Open Login Items, refused', async () => {
    const user = userEvent.setup();
    const m = mac();
    const { rerender } = settings({ section: 'mac', mac: m });
    const sw = () => screen.getByRole('switch', { name: 'Open at login' });
    expect(sw()).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByText(/starts in the menu bar when you log in/)).toBeInTheDocument();
    await user.click(sw());
    expect(m.onOpenAtLogin).toHaveBeenCalledWith(true);

    rerender(<Settings me={ME} space={NW} still section="mac" mac={{ ...m, openAtLogin: 'approval' }} />);
    expect(sw()).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText(/needs you to allow Tudu in System Settings/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Open Login Items' }));
    expect(m.onLoginItems).toHaveBeenCalled();

    rerender(<Settings me={ME} space={NW} still section="mac" mac={{ ...m, openAtLogin: 'refused' }} />);
    expect(sw()).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByText(/macOS didn’t allow it/)).toHaveClass('tp-set-bad');
    expect(screen.queryByRole('button', { name: 'Open Login Items' })).toBeNull();

    rerender(<Settings me={ME} space={NW} still section="mac" mac={{ ...m, openAtLogin: 'on' }} />);
    expect(sw()).toHaveAttribute('aria-checked', 'true');
    expect(within(nav()).getByRole('button', { name: 'This Mac' })).toBeInTheDocument();
  });

  it('Show Tudu in the Dock: two choices, While the window is open by default', async () => {
    const user = userEvent.setup();
    const m = mac();
    settings({ section: 'mac', mac: m });
    const group = screen.getByRole('group', { name: 'Show Tudu in the Dock' });
    const options = within(group).getAllByRole('button');
    expect(options.map((b) => b.textContent)).toEqual(['While the window is open', 'Always']);
    expect(options[0]).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText(/Quit Tudu \(⌘Q\) stops it/)).toBeInTheDocument();
    await user.click(options[1]!);
    expect(m.onDock).toHaveBeenCalledWith('always');
  });
});

describe('C11-U12 Settings › This Mac › Updates', () => {
  const base = { openAtLogin: 'off' as const, dock: 'open' as const };
  const row = (u: Partial<NonNullable<NonNullable<SettingsProps['mac']>['updates']>>) =>
    settings({
      section: 'mac',
      mac: { ...base, updates: { name: 'Tudu', current: '0.37.0', state: 'idle', ...u } },
    });
  const button = () => within(screen.getByRole('region', { name: 'Updates' })).getByRole('button');

  it('C11-U12 no updates prop: no section (an app too old to say)', () => {
    settings({ section: 'mac', mac: base });
    expect(screen.queryByText('Updates')).toBeNull();
  });

  it('C11-U12 each state: the title, the line and the button', () => {
    const { rerender } = row({ state: 'loading' });
    const at = (u: object) =>
      rerender(
        <Settings
          me={ME}
          space={NW}
          still
          section="mac"
          mac={{ ...base, updates: { name: 'Tudu', current: '0.37.0', state: 'idle', ...u } }}
        />,
      );
    expect(screen.getByText('Tudu 0.37.0')).toBeInTheDocument();
    expect(button()).toHaveTextContent('Check now');
    expect(button()).toBeDisabled();

    at({ state: 'never' });
    expect(screen.getByText('Not checked yet.')).toBeInTheDocument();
    expect(button()).toBeEnabled();

    at({ state: 'idle', checked: 'Checked 12 minutes ago' });
    expect(screen.getByText('Up to date. Checked 12 minutes ago.')).toHaveClass('tp-set-st');

    at({ state: 'checking' });
    expect(screen.getByText('Looking for a new version…')).toBeInTheDocument();
    expect(button()).toHaveTextContent('Checking…');

    at({ state: 'downloading', version: '0.37.1', progress: 0.42 });
    expect(screen.getByText('Downloading Tudu 0.37.1…')).toBeInTheDocument();
    expect(button()).toHaveTextContent('42%');

    at({ state: 'ready', version: '0.37.1' });
    expect(screen.getByText('Tudu 0.37.1 is ready.')).toHaveClass('tp-set-ready');
    expect(button()).toHaveTextContent('Restart to update');
    expect(button()).toHaveClass('tp-btn-primary');

    at({ state: 'error', error: 'Couldn’t check for updates. Check your connection and try again.' });
    expect(screen.getByText(/Couldn’t check for updates/)).toHaveClass('tp-set-bad');
    expect(button()).toHaveTextContent('Try again');
  });

  it('C11-U12 Tudu Staging: its own name and full version', () => {
    row({ name: 'Tudu Staging', current: '0.37.1-staging.10', state: 'never' });
    expect(screen.getByText('Tudu Staging 0.37.1-staging.10')).toBeInTheDocument();
  });
});

describe('C11-U41 Settings › This Mac › Updates, an error retrying can’t fix', () => {
  const base = { openAtLogin: 'off' as const, dock: 'open' as const };
  const button = () => within(screen.getByRole('region', { name: 'Updates' })).getByRole('button');
  const line =
    'Tudu 0.37.1 didn’t pass its safety check, so it wasn’t installed. Download it from the Tudu website instead.';

  it('C11-U41 with onGetIt the button is Get it from the website (no Try again) and calls it', () => {
    const onGetIt = vi.fn();
    const onCheck = vi.fn();
    settings({
      section: 'mac',
      mac: {
        ...base,
        updates: { name: 'Tudu', current: '0.37.0', state: 'error', error: line, onGetIt, onCheck },
      },
    });
    expect(screen.getByText(line)).toHaveClass('tp-set-bad');
    expect(button()).toHaveTextContent('Get it from the website');
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
    fireEvent.click(button());
    expect(onGetIt).toHaveBeenCalledOnce();
    expect(onCheck).not.toHaveBeenCalled();
  });

  it('C11-U41 without it: Try again, as before', () => {
    settings({
      section: 'mac',
      mac: {
        ...base,
        updates: { name: 'Tudu', current: '0.37.0', state: 'error', error: 'Couldn’t check.' },
      },
    });
    expect(button()).toHaveTextContent('Try again');
  });
});

describe('C11-U13 Settings › This Mac › Updates, acting', () => {
  afterEach(() => vi.useRealTimers());
  const base = { openAtLogin: 'off' as const, dock: 'open' as const };
  const view = (u: object) => (
    <Settings
      me={ME}
      space={NW}
      still
      section="mac"
      mac={{ ...base, updates: { name: 'Tudu', current: '0.37.0', state: 'idle', ...u } }}
    />
  );
  const button = () => within(screen.getByRole('region', { name: 'Updates' })).getByRole('button');

  it('C11-U13 Check now that finds nothing ends on the tick, then settles back', () => {
    vi.useFakeTimers();
    const onCheck = vi.fn();
    const { rerender } = render(view({ onCheck, checked: 'Checked 2 hours ago' }));
    fireEvent.click(button());
    expect(onCheck).toHaveBeenCalledOnce();
    rerender(view({ onCheck, state: 'checking' }));
    rerender(view({ onCheck, state: 'idle', checked: 'Checked just now' }));
    expect(button()).toHaveTextContent('Up to date');
    act(() => vi.advanceTimersByTime(1600));
    expect(button()).toHaveTextContent('Check now');
  });

  it('C11-U13 a check you did not ask for ends without the tick', () => {
    const { rerender } = render(view({ state: 'checking' }));
    rerender(view({ state: 'idle', checked: 'Checked just now' }));
    expect(button()).toHaveTextContent('Check now');
  });

  it('C11-U13 Restart to update calls onRestart; a failed restart says what to do', () => {
    const onRestart = vi.fn();
    const { rerender } = render(view({ state: 'ready', version: '0.37.1', onRestart }));
    fireEvent.click(button());
    expect(onRestart).toHaveBeenCalledOnce();
    rerender(
      view({
        state: 'ready',
        version: '0.37.1',
        onRestart,
        restartError: 'Couldn’t restart. Quit and open Tudu again to finish.',
      }),
    );
    expect(screen.getByText(/Couldn’t restart/)).toHaveClass('tp-set-bad');
  });
});

describe('the version at the foot of the list', () => {
  const RELEASE = 'https://github.com/shimorojune/tudu/releases/tag/tudu-0.37.0';
  const STAGING = 'https://github.com/shimorojune/tudu/releases#release-staging';

  it('C09-U11 a release: "Tudu 0.37.0" linking to its tag in a new tab, last in the list, no staging dot', () => {
    settings({ version: { name: 'Tudu', version: '0.37.0', track: 'production', href: RELEASE } });
    const link = screen.getByRole('link', { name: 'Tudu 0.37.0. Open its release on GitHub' });
    expect(link).toHaveAttribute('href', RELEASE);
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener');
    expect(link).toHaveTextContent('Tudu0.37.0');
    expect(link.closest('.tp-set-side')?.lastElementChild).toBe(link);
    expect(link.querySelector('.tp-ver-dot')).toBeNull();
    expect(link).not.toHaveAttribute('data-tip');
  });

  it('C09-U12 a staging build: the dot, "a staging build" in its name, the tooltip, the staging release', () => {
    settings({
      version: { name: 'Tudu Staging', version: '0.37.1-staging.132', track: 'staging', href: STAGING },
    });
    const link = screen.getByRole('link', {
      name: 'Tudu Staging 0.37.1-staging.132, a staging build. Open its release on GitHub',
    });
    expect(link).toHaveAttribute('href', STAGING);
    expect(link.querySelector('.tp-ver-dot')).not.toBeNull();
    expect(link).toHaveAttribute('data-tip', 'Staging build · opens its release on GitHub');
  });

  it('C09-U13 no release (dev, Tudu Test): plain text, not focusable; no version: nothing', () => {
    const { rerender } = settings({
      version: { name: 'Tudu', version: '0.37.0-dev', track: 'dev', href: null },
    });
    expect(screen.queryByRole('link', { name: /Tudu/ })).toBeNull();
    const line = document.querySelector('.tp-set-ver')!;
    expect(line).toHaveTextContent('Tudu0.37.0-dev');
    expect(line.tagName).toBe('SPAN');
    expect(line).not.toHaveAttribute('tabindex');
    expect(line.querySelector('.tp-ver-arrow')).toBeNull();

    rerender(<Settings me={ME} space={NW} still />);
    expect(document.querySelector('.tp-set-ver')).toBeNull();
  });

  it('C09-U14 phones: under the list on the list page, not on a section', () => {
    const version = { name: 'Tudu', version: '0.37.0', track: 'production' as const, href: RELEASE };
    const { rerender } = settings({ layout: 'phone', version });
    const link = screen.getByRole('link', { name: /^Tudu 0\.37\.0/ });
    expect(link.previousElementSibling).toBe(nav());
    rerender(
      <Settings me={ME} space={NW} still layout="phone" view="section" section="account" version={version} />,
    );
    expect(screen.queryByRole('link', { name: /^Tudu 0\.37\.0/ })).toBeNull();
  });
});
