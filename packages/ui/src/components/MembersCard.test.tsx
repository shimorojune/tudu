import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { JoinCard, type JoinInvite } from './JoinCard';
import { MembersCard, type MembersCardMember } from './MembersCard';
import { SignIn } from './SignIn';

const MEMBERS: MembersCardMember[] = [
  { id: 'r', name: 'Rohit Raj', email: 'rohit@x.y', initials: 'RR', role: 'admin', you: true },
  { id: 'm', name: 'Meera Nair', email: 'meera@x.y', initials: 'MN', color: '#3d5a80', role: 'member' },
];
const INVITES = [{ id: 'i1', email: 'arjun@x.y', when: '2 days ago' }];

describe('MembersCard', () => {
  it('C08-U04 people with roles, the email line with Invite, pending invites with when and Cancel; nothing pending reads so', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    const { rerender } = render(
      <MembersCard
        open
        inline
        spaceName="Northwind"
        members={MEMBERS}
        invites={INVITES}
        onCancelInvite={onCancel}
        initial={{ noFocus: true }}
      />,
    );
    const dialog = screen.getByRole('dialog', { name: 'Members' });
    expect(within(dialog).getByText('Who is in Northwind, and who is invited.')).toBeInTheDocument();
    expect(within(dialog).getByText('They get an email with a link to join Northwind.')).toBeInTheDocument();
    const members = within(dialog).getByRole('list', { name: 'Members' });
    const rows = within(members).getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('Rohit Raj');
    expect(rows[0]!.querySelector('.tp-prow-you')).toHaveTextContent('You');
    expect(rows[0]!.querySelector('.tp-mrow-role')).toHaveTextContent('Admin');
    expect(rows[1]!.querySelector('.tp-mrow-role')).toHaveTextContent('Member');
    expect(rows[1]!.querySelector('.tp-mrow-sub')).toHaveTextContent('meera@x.y');
    const invited = within(dialog).getByRole('list', { name: 'Invited' });
    const inv = within(invited).getAllByRole('listitem');
    expect(inv).toHaveLength(1);
    expect(inv[0]).toHaveTextContent('arjun@x.y');
    expect(inv[0]).toHaveTextContent('Invited 2 days ago');
    await user.click(within(inv[0]!).getByRole('button', { name: 'Cancel the invite to arjun@x.y' }));
    expect(onCancel).toHaveBeenCalledWith(INVITES[0]);
    expect(within(dialog).getByRole('button', { name: 'Invite' })).toBeDisabled();
    rerender(
      <MembersCard
        open
        inline
        spaceName="Northwind"
        members={MEMBERS}
        invites={[]}
        initial={{ noFocus: true }}
      />,
    );
    expect(within(dialog).queryByRole('list', { name: 'Invited' })).toBeNull();
    expect(within(dialog).getByText('No invites waiting.')).toBeInTheDocument();
  });

  it('C08-U04 Invite reports the addresses, says Sending… then Sent and clears; a bad address keeps it off', async () => {
    const user = userEvent.setup();
    let resolve: () => void = () => {};
    const onInvite = vi.fn(() => new Promise<void>((r) => (resolve = r)));
    render(
      <MembersCard
        open
        inline
        spaceName="Northwind"
        members={MEMBERS}
        invites={[]}
        onInvite={onInvite}
        initial={{ noFocus: true }}
      />,
    );
    const dialog = screen.getByRole('dialog', { name: 'Members' });
    const field = within(dialog).getByLabelText('Invite by email');
    await user.type(field, 'nope{Enter}');
    expect(within(dialog).getByRole('button', { name: 'Invite' })).toBeDisabled();
    await user.click(within(dialog).getByRole('button', { name: 'Remove nope' }));
    await user.type(field, 'arjun@x.y priya@x.y{Enter}');
    const btn = within(dialog).getByRole('button', { name: 'Invite 2' });
    expect(btn).toBeEnabled();
    await user.click(btn);
    expect(onInvite).toHaveBeenCalledWith(['arjun@x.y', 'priya@x.y']);
    expect(within(dialog).getByRole('button', { name: /Sending…/ })).toBeInTheDocument();
    await act(async () => {
      resolve();
      await Promise.resolve();
    });
    expect(within(dialog).getByRole('button', { name: /Sent/ })).toHaveClass('tp-ok');
  });
});

const INVITE: JoinInvite = {
  space: { name: 'Northwind', color: '#3d5a80', initials: 'N' },
  from: { name: 'Rohit Raj' },
  count: 7,
  people: Array.from({ length: 6 }, (_, i) => ({ id: `p${i}`, name: `Person ${i}`, initials: `P${i}` })),
};

describe('JoinCard', () => {
  it('C08-U05 names the space and who asked; Join Northwind when signed in; the five marks and +2', async () => {
    const user = userEvent.setup();
    const onJoin = vi.fn();
    render(<JoinCard invite={INVITE} state="open" onJoin={onJoin} />);
    expect(screen.getByRole('heading', { name: 'Join Northwind' })).toBeInTheDocument();
    expect(screen.getByText('You’re invited')).toBeInTheDocument();
    expect(
      screen.getByText(/invited you to Northwind, where 7 people share their work in Tudu/),
    ).toBeInTheDocument();
    expect(screen.getByText('Rohit Raj').tagName).toBe('B');
    const people = screen.getByLabelText('7 people in Northwind');
    expect(people.querySelectorAll('.tp-pdot')).toHaveLength(5);
    expect(people.querySelector('.tp-auth-more')).toHaveTextContent('+2');
    await user.click(screen.getByRole('button', { name: 'Join Northwind' }));
    expect(onJoin).toHaveBeenCalledTimes(1);
  });

  it('C08-U05 Sign in to join: the sign-in form under the card with the invited address locked; the expired and already-a-member states', async () => {
    const user = userEvent.setup();
    const sendCode = vi.fn(async () => {});
    const { unmount } = render(
      <SignIn
        open
        inline
        invite={{ ...INVITE, email: 'meera@x.y' }}
        initial={{ noFocus: true }}
        sendCode={sendCode}
        verifyCode={async () => {}}
        onDone={() => {}}
      />,
    );
    expect(screen.getByRole('main', { name: 'Join Northwind' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Join Northwind' })).toBeInTheDocument();
    const email = screen.getByLabelText('Email');
    expect(email).toHaveValue('meera@x.y');
    expect(email).toHaveAttribute('readonly');
    expect(screen.getByText('The invite was sent to this address.')).toBeInTheDocument();
    expect(screen.getByText(/then take you to Northwind/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Sign in to join' }));
    expect(sendCode).toHaveBeenCalledWith('meera@x.y');
    expect(await screen.findByRole('heading', { name: 'Check your email' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Use a different email' })).toBeNull();
    unmount();

    const onOpen = vi.fn();
    const { rerender } = render(<JoinCard invite={INVITE} state="expired" onOpen={onOpen} />);
    expect(screen.getByRole('heading', { name: 'This invite has expired' })).toBeInTheDocument();
    expect(screen.getByText(/Invites last 7 days/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Join Northwind' })).toBeNull();
    rerender(<JoinCard invite={INVITE} state="member" onOpen={onOpen} />);
    expect(screen.getByRole('heading', { name: 'You’re already in Northwind' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Open Northwind' }));
    expect(onOpen).toHaveBeenCalledTimes(1);
    rerender(<JoinCard invite={INVITE} state="cancelled" />);
    expect(screen.getByRole('heading', { name: 'This invite was taken back' })).toBeInTheDocument();
  });
});
