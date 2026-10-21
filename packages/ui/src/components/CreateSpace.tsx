import { EMAIL_PATTERN, SPACE_COLORS, SPACE_NAME_MAX, spaceInitials } from '@tudu/core';
import { useEffect, useRef, useState } from 'react';
import { cx } from '../lib/cx';
import { Button } from './Button';
import { ColorPick } from './ColorPick';
import { Dialog } from './Dialog';
import { InviteField } from './InviteField';
import { SpaceTile } from './SpaceTile';

export interface CreateSpaceInput {
  name: string;
  color: string;
  initials: string;
  /** The addresses that read as emails. */
  invites: string[];
}

export interface CreateSpaceProps {
  open: boolean;
  onClose?: () => void;
  /** Make the space. Resolve when it exists (the button confirms "Created"); reject to keep the form. */
  onCreate?: (input: CreateSpaceInput) => Promise<void> | void;
  /** `sheet` on phones. */
  variant?: 'dialog' | 'sheet';
  /** The kit: start with these. */
  initial?: { name?: string; color?: string; invites?: string[]; busy?: 0 | 1 | 2; noFocus?: boolean };
  /** Draws the panel in place, without the veil (the kit). */
  inline?: boolean;
  className?: string;
}

/** "Created" shows for this long before the dialog hands over. */
export const CS_DONE_MS = 520;

/**
 * Make a new space in one dialog (a sheet on phones): the space's tile beside its name (it recolours and reletters as
 * you type and pick), a ColorPick, and people to invite (optional). Create space spins ("Creating…"), confirms
 * ("Created"), then you land in the new space.
 */
export function CreateSpace(p: CreateSpaceProps) {
  const init = p.initial ?? {};
  const sheet = p.variant === 'sheet';
  const [name, setName] = useState(init.name ?? '');
  const [color, setColor] = useState(init.color ?? SPACE_COLORS[1]);
  const [inv, setInv] = useState<string[]>(init.invites ?? []);
  const [busy, setBusy] = useState<0 | 1 | 2>(init.busy ?? 0);
  const nameEl = useRef<HTMLInputElement | null>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  // Opening starts fresh and puts the caret in the name once the dialog has risen.
  const [was, setWas] = useState(p.open);
  if (p.open !== was) {
    setWas(p.open);
    if (p.open) {
      setName(init.name ?? '');
      setColor(init.color ?? SPACE_COLORS[1]);
      setInv(init.invites ?? []);
      setBusy(0);
    }
  }
  useEffect(() => {
    if (!p.open || init.noFocus) return;
    const t = setTimeout(() => nameEl.current?.focus({ preventScroll: true }), 240);
    return () => clearTimeout(t);
  }, [p.open, init.noFocus]);

  const nm = name.trim();
  const space = { name: nm || 'New space', color, initials: spaceInitials(nm || 'New space') };
  const good = inv.filter((x) => EMAIL_PATTERN.test(x));
  const bad = inv.length - good.length;

  async function create() {
    if (!nm || busy || bad) return;
    setBusy(1);
    try {
      await p.onCreate?.({ name: nm, color, initials: space.initials, invites: good });
      if (!alive.current) return;
      setBusy(2);
    } catch {
      if (alive.current) setBusy(0);
    }
  }

  const foot = (
    <>
      <span className="tp-cs-says">
        {good.length ? 'Invites go out when you create it.' : 'You can invite people later.'}
      </span>
      {sheet ? null : (
        <Button variant="quiet" size="sm" onClick={p.onClose}>
          Cancel
        </Button>
      )}
      <Button
        variant="primary"
        size={sheet ? 'md' : 'sm'}
        disabled={!nm || !!bad}
        loading={busy === 1}
        loadingLabel="Creating…"
        success={busy === 2}
        successLabel="Created"
        onClick={() => void create()}
      >
        Create space
      </Button>
    </>
  );

  return (
    <Dialog
      open={p.open}
      inline={p.inline}
      onClose={busy ? undefined : p.onClose}
      variant={sheet ? 'sheet' : 'dialog'}
      size="md"
      title="Create a space"
      sub="Its own Tudu for a team: its own lists, Inbox and people."
      footer={foot}
      noFocus
      className={cx('tp-cs-dlg', p.className)}
    >
      <div className="tp-cs-row">
        <SpaceTile space={space} size={48} className="tp-cs-tile" />
        <label className="tp-field tp-cs-field">
          <input
            ref={nameEl}
            className="tp-cs-name"
            value={name}
            maxLength={SPACE_NAME_MAX}
            placeholder="Name, like “Design team”"
            aria-label="Space name"
            readOnly={busy > 0}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void create();
              }
            }}
          />
        </label>
      </div>
      <div className="tp-cs-l">Colour</div>
      <ColorPick value={color} onChange={setColor} />
      <div className="tp-cs-l">
        Invite people<span>Optional</span>
      </div>
      <InviteField value={inv} onChange={setInv} />
    </Dialog>
  );
}
