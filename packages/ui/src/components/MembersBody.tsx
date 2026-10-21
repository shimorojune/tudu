import { EMAIL_PATTERN } from '@tudu/core';
import { useEffect, useRef, useState } from 'react';
import { Icon } from '../lib/icons';
import { Button } from './Button';
import { FilterField } from './FilterField';
import { InviteField } from './InviteField';
import { MemberRow, type MemberRowPerson } from './MemberRow';
import { SettingsSection } from './SettingsSection';

export interface MembersBodyMember extends MemberRowPerson {
  id: string;
  role: 'admin' | 'member';
}

export interface MembersBodyInvite {
  id: string;
  email: string;
  /** "2 days ago". */
  when: string;
}

export interface MembersBodyProps {
  spaceName: string;
  members: MembersBodyMember[];
  invites: MembersBodyInvite[];
  /** Send the invites; resolve when they are on their way (the button confirms "Sent"). */
  onInvite?: (emails: string[]) => Promise<void> | void;
  onCancelInvite?: (invite: MembersBodyInvite) => void;
  onResendInvite?: (invite: MembersBodyInvite) => void;
  /** You are an admin: roles are menus with Remove. */
  canEdit?: boolean;
  onRole?: (member: MembersBodyMember, role: 'admin' | 'member') => void;
  onRemove?: (member: MembersBodyMember) => void;
  autoFocus?: boolean;
  /** The kit: start with these. */
  initial?: { invites?: string[]; busy?: 0 | 1 | 2; query?: string };
}

/** "Sent" shows for this long before the field clears. */
export const MB_DONE_MS = 600;
/** Find someone appears past this many people. */
export const FIND_PAST = 8;

/**
 * Who is in a space: Invite people (an email line with Invite), the invites waiting with Resend and Cancel, then
 * the members with their role, and Find someone past eight people. The Members card and Settings › Members both
 * show it.
 */
export function MembersBody(p: MembersBodyProps) {
  const init = p.initial ?? {};
  const [inv, setInv] = useState<string[]>(init.invites ?? []);
  const [busy, setBusy] = useState<0 | 1 | 2>(init.busy ?? 0);
  const [q, setQ] = useState(init.query ?? '');
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
      }, MB_DONE_MS);
    } catch {
      if (alive.current) setBusy(0);
    }
  }
  const ql = q.trim().toLowerCase();
  const shown = ql ? p.members.filter((m) => `${m.name} ${m.email}`.toLowerCase().includes(ql)) : p.members;
  return (
    <div className="tp-set-members">
      <SettingsSection title="Invite people" sub={`They get an email with a link to join ${p.spaceName}.`}>
        <div className="tp-set-invite">
          <InviteField value={inv} onChange={setInv} autoFocus={p.autoFocus} />
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
      </SettingsSection>
      {p.invites.length ? (
        <SettingsSection title="Invited" aside={String(p.invites.length)}>
          <div role="list" aria-label="Invited">
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
        </SettingsSection>
      ) : null}
      <SettingsSection title="Members" aside={String(p.members.length)}>
        {p.members.length > FIND_PAST ? (
          <div className="tp-set-find">
            <FilterField value={q} onChange={setQ} placeholder="Find someone" />
          </div>
        ) : null}
        <div role="list" aria-label="Members">
          {shown.map((m) => (
            <MemberRow
              key={m.id}
              person={m}
              role={m.role}
              canEdit={p.canEdit}
              spaceName={p.spaceName}
              onRole={(r) => p.onRole?.(m, r)}
              onRemove={m.you || !p.onRemove ? undefined : () => p.onRemove!(m)}
            />
          ))}
        </div>
        {!shown.length ? (
          <p className="tp-set-note">
            No one called “{q.trim()}” in {p.spaceName}.
          </p>
        ) : null}
        {!p.invites.length && !ql ? <p className="tp-set-note">No invites waiting.</p> : null}
      </SettingsSection>
    </div>
  );
}
