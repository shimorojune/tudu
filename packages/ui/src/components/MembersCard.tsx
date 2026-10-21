import { EMAIL_PATTERN } from '@tudu/core';
import { useEffect, useRef, useState } from 'react';
import { cx } from '../lib/cx';
import { Icon } from '../lib/icons';
import { Button } from './Button';
import { Dialog } from './Dialog';
import { InviteField } from './InviteField';
import { MemberRow, type MemberRowPerson } from './MemberRow';

export interface MembersCardMember extends MemberRowPerson {
  id: string;
  role: 'admin' | 'member';
}

export interface MembersCardInvite {
  id: string;
  email: string;
  /** "2 days ago". */
  when: string;
}

export interface MembersCardProps {
  open: boolean;
  onClose?: () => void;
  spaceName: string;
  members: MembersCardMember[];
  invites: MembersCardInvite[];
  /** Send the invites; resolve when they are on their way (the button confirms "Sent"). */
  onInvite?: (emails: string[]) => Promise<void> | void;
  onCancelInvite?: (invite: MembersCardInvite) => void;
  onResendInvite?: (invite: MembersCardInvite) => void;
  /** `sheet` on phones. */
  variant?: 'dialog' | 'sheet';
  inline?: boolean;
  /** The kit: start with these. */
  initial?: { invites?: string[]; busy?: 0 | 1 | 2; noFocus?: boolean };
  className?: string;
}

/** "Sent" shows for this long before the field clears. */
export const MC_DONE_MS = 600;

/**
 * The Members card: you and the people in the space with their role, an email line with Invite, then the invites
 * still waiting with when they were sent and a Cancel each. The same card Settings hosts in chunk 09; until then it
 * opens from the welcome, from People and after creating a space.
 */
export function MembersCard(p: MembersCardProps) {
  const init = p.initial ?? {};
  const sheet = p.variant === 'sheet';
  const [inv, setInv] = useState<string[]>(init.invites ?? []);
  const [busy, setBusy] = useState<0 | 1 | 2>(init.busy ?? 0);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const good = inv.length > 0 && inv.every((x) => EMAIL_PATTERN.test(x));
  async function send() {
    if (!good || busy) return;
    setBusy(1);
    try {
      await p.onInvite?.(inv);
      if (!alive.current) return;
      // The addresses are pending rows now: the field clears at once, and the button says Sent for a beat.
      setInv([]);
      setBusy(2);
      setTimeout(() => {
        if (alive.current) setBusy(0);
      }, MC_DONE_MS);
    } catch {
      if (alive.current) setBusy(0);
    }
  }
  return (
    <Dialog
      open={p.open}
      inline={p.inline}
      onClose={p.onClose}
      variant={sheet ? 'sheet' : 'dialog'}
      size="md"
      title="Members"
      sub={`Who is in ${p.spaceName}, and who is invited.`}
      noFocus={init.noFocus}
      className={cx('tp-mc', p.className)}
    >
      <div className="tp-set-members">
        <section className="tp-ssec" aria-label="Invite people">
          <div className="tp-ssec-h">Invite people</div>
          <p className="tp-ssec-s">They get an email with a link to join {p.spaceName}.</p>
          <div className="tp-ssec-b">
            <div className="tp-set-invite">
              <InviteField value={inv} onChange={setInv} autoFocus={!init.noFocus && !sheet} />
              <Button
                variant="primary"
                size="sm"
                icon={<Icon name="send" size={14} />}
                disabled={!good && busy === 0}
                loading={busy === 1}
                loadingLabel="Sending…"
                success={busy === 2}
                successLabel="Sent"
                onClick={() => void send()}
              >
                {inv.length > 1 ? `Invite ${inv.length}` : 'Invite'}
              </Button>
            </div>
          </div>
        </section>
        {p.invites.length ? (
          <section className="tp-ssec" aria-label="Invited">
            <div className="tp-ssec-h">
              Invited<span className="tp-ssec-a">{p.invites.length}</span>
            </div>
            <div className="tp-ssec-b" role="list" aria-label="Invited">
              {p.invites.map((x) => (
                <MemberRow
                  key={x.id}
                  person={{ name: '', email: x.email }}
                  invited
                  when={x.when}
                  onResend={p.onResendInvite ? () => p.onResendInvite!(x) : undefined}
                  onCancel={p.onCancelInvite ? () => p.onCancelInvite!(x) : undefined}
                />
              ))}
            </div>
          </section>
        ) : null}
        <section className="tp-ssec" aria-label="Members">
          <div className="tp-ssec-h">
            Members<span className="tp-ssec-a">{p.members.length}</span>
          </div>
          <div className="tp-ssec-b" role="list" aria-label="Members">
            {p.members.map((m) => (
              <MemberRow key={m.id} person={m} role={m.role} />
            ))}
          </div>
          {!p.invites.length ? <p className="tp-set-note">No invites waiting.</p> : null}
        </section>
      </div>
    </Dialog>
  );
}
