import type { ReactNode } from 'react';
import { cx } from '../lib/cx';
import { Button } from './Button';
import { PersonDot, type PersonDotPerson } from './PersonDot';
import { SpaceTile, type SpaceTileSpace } from './SpaceTile';

export interface JoinInvite {
  space: SpaceTileSpace & { name: string };
  /** Who asked. */
  from: { name: string } | null;
  /** How many people are in the space. */
  count: number;
  people: Array<PersonDotPerson & { id: string }>;
}

export interface JoinCardProps {
  invite: JoinInvite;
  /** What the link says: open, or why it cannot be used. `member` when you are already in. */
  state: 'open' | 'expired' | 'cancelled' | 'spent' | 'member';
  /** Join (already signed in): 0 at rest, 1 joining, 2 joined. */
  busy?: 0 | 1 | 2;
  onJoin?: () => void;
  /** Already in, or a dead link: open the space, or go to Tudu. */
  onOpen?: () => void;
  className?: string;
  /** Under the lead: the sign-in form, when you are not signed in yet. */
  children?: ReactNode;
}

/** The head of "Join Northwind": the tile, "You're invited", who asked and the people already in. */
export function JoinHead({
  invite: inv,
  eyebrow,
  title,
  lead,
}: {
  invite: JoinInvite;
  eyebrow: string;
  title: string;
  lead: ReactNode;
}) {
  return (
    <div className="tp-auth-inv">
      <SpaceTile space={inv.space} size={56} />
      <div className="tp-auth-eyeb">{eyebrow}</div>
      <h1>{title}</h1>
      <p className="tp-auth-lead">{lead}</p>
      {inv.people.length ? (
        <div
          className="tp-auth-ppl"
          aria-label={`${inv.count} ${inv.count === 1 ? 'person' : 'people'} in ${inv.space.name}`}
        >
          {inv.people.slice(0, 5).map((x) => (
            <PersonDot key={x.id} person={x} size={28} />
          ))}
          {inv.count > 5 ? <span className="tp-auth-more">+{inv.count - 5}</span> : null}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Join a space from an invite: the card names the space and who asked, shows who is in it, and offers Join
 * Northwind when you are signed in (the sign-in form sits under it otherwise). A dead link says what happened; a
 * link for a space you are already in just opens it.
 */
export function JoinCard({
  invite: inv,
  state,
  busy = 0,
  onJoin,
  onOpen,
  className,
  children,
}: JoinCardProps) {
  const name = inv.space.name;
  const who = inv.from?.name ?? 'Someone';
  const people = inv.count <= 1 ? 'it’s just them for now' : `${inv.count} people share their work`;
  let body: ReactNode;
  if (state === 'member')
    body = (
      <>
        <JoinHead
          invite={inv}
          eyebrow="You’re in"
          title={`You’re already in ${name}`}
          lead={`Nothing to join: ${name} is one of your spaces.`}
        />
        <Button className="tp-auth-go" onClick={onOpen}>
          Open {name}
        </Button>
      </>
    );
  else if (state === 'expired')
    body = (
      <>
        <JoinHead
          invite={inv}
          eyebrow={`Invite to ${name}`}
          title="This invite has expired"
          lead={
            <>
              Invites last 7 days. Ask <b>{who}</b> to send you a new one; it goes to the same address.
            </>
          }
        />
        {onOpen ? (
          <Button className="tp-auth-go" variant="secondary" onClick={onOpen}>
            Go to Tudu
          </Button>
        ) : null}
      </>
    );
  else if (state === 'cancelled' || state === 'spent')
    body = (
      <>
        <JoinHead
          invite={inv}
          eyebrow={`Invite to ${name}`}
          title={state === 'spent' ? 'This invite was already used' : 'This invite was taken back'}
          lead={
            <>
              Ask <b>{who}</b> for a new one if you still need a way in.
            </>
          }
        />
        {onOpen ? (
          <Button className="tp-auth-go" variant="secondary" onClick={onOpen}>
            Go to Tudu
          </Button>
        ) : null}
      </>
    );
  else
    body = (
      <>
        <JoinHead
          invite={inv}
          eyebrow="You’re invited"
          title={`Join ${name}`}
          lead={
            <>
              <b>{who}</b> invited you to {name}, where {people} in Tudu.
            </>
          }
        />
        {children ?? (
          <Button
            className="tp-auth-go"
            loading={busy === 1}
            loadingLabel="Joining…"
            success={busy === 2}
            successLabel="Joined"
            onClick={onJoin}
          >
            Join {name}
          </Button>
        )}
      </>
    );
  return <div className={cx('tp-auth-page tp-join', className)}>{body}</div>;
}
