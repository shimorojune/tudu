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
    expect(items).toEqual(['Account', 'Appearance', 'Space', 'Members19', 'Apps']);
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
    ).toEqual(['Account', 'Appearance', 'Space', 'Apps']);
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
      'SpaceName, colour, leaving',
      'Members19 people',
      'AppsNone yet',
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
