import { deleteWords, membersWords, spaceInitials, spaceLine } from '@tudu/core';
import { useRef, useState, type ReactNode } from 'react';
import { cx } from '../lib/cx';
import { Icon } from '../lib/icons';
import type { ThemeChoice } from '../lib/theme';
import { Button } from './Button';
import { CodeField } from './CodeField';
import { ColorPick } from './ColorPick';
import { Field } from './Field';
import { IconButton } from './IconButton';
import { JiraMark } from './JiraMark';
import { MembersBody, type MembersBodyInvite, type MembersBodyMember } from './MembersBody';
import { PersonDot } from './PersonDot';
import { ProjectSettings, type ProjectSettingsProps } from './ProjectSettings';
import { SettingRow, SettingsSection } from './SettingsSection';
import { SettingsNav, type SettingsNavGroup } from './SettingsNav';
import { SpaceTile } from './SpaceTile';
import { Switch } from './Switch';
import { ThemePick } from './ThemePick';

export type SettingsSectionName = 'account' | 'appearance' | 'space' | 'members' | 'apps';

export interface SettingsMe {
  name: string;
  /** What the Name field holds when it differs from the name shown (empty until you give one). */
  fieldName?: string;
  email: string;
  initials: string;
  color?: string;
  image?: string;
}

export interface SettingsSpace {
  name: string;
  color?: string;
  personal?: boolean;
  /** How many people are in it, you included. */
  members: number;
  role: 'admin' | 'member';
}

export interface SettingsProps {
  /** `dialog` on the desk and tablets (inside a large Dialog); `phone` is a page. */
  layout?: 'dialog' | 'phone';
  /** Phones: the list, or one section pushed in. */
  view?: 'list' | 'section';
  section?: SettingsSectionName;
  onSection?: (s: SettingsSectionName) => void;
  /** Phones: ‹ Settings from a section. */
  onBack?: () => void;
  onClose?: () => void;
  me: SettingsMe;
  space: SettingsSpace;

  // Account
  onName?: (name: string) => void;
  onPhoto?: (file: File) => void;
  onRemovePhoto?: () => void;
  /** "Uploading…" while a photo goes up. */
  photoBusy?: boolean;
  photoError?: string | null;
  /** Send a code to the new address. Rejects with the reason to show. */
  onEmailStart?: (email: string) => Promise<void>;
  /** The code from the new address. Rejects with the reason to show. */
  onEmailConfirm?: (code: string) => Promise<void>;
  onSignOut?: () => void;

  // Appearance
  theme?: ThemeChoice;
  onTheme?: (t: ThemeChoice) => void;
  lessMotion?: boolean;
  onLessMotion?: (on: boolean) => void;

  // Space
  onSpaceName?: (name: string) => void;
  onSpaceColor?: (color: string) => void;
  onLeave?: () => void;
  onDelete?: () => void;
  onCreateSpace?: () => void;
  projects?: ProjectSettingsProps;

  // Members
  members?: MembersBodyMember[];
  invites?: MembersBodyInvite[];
  onInvite?: (emails: string[]) => Promise<void> | void;
  onCancelInvite?: (invite: MembersBodyInvite) => void;
  onResendInvite?: (invite: MembersBodyInvite) => void;
  onRole?: (member: MembersBodyMember, role: 'admin' | 'member') => void;
  onRemove?: (member: MembersBodyMember) => void;

  // Apps
  /** Your Jira in this space: who you are there and the site ("jira.northwind.io"). */
  jira?: { connected: boolean; who?: string; site?: string };
  /** Connect (not connected) or Disconnect (connected). */
  onJira?: () => void;

  /** No connection: names and colours wait in the outbox; the page says so. */
  offline?: boolean;
  /** State boards: no rise-in. */
  still?: boolean;
  className?: string;
}

/** A text field that saves when you leave it; an empty value puts the old one back. */
function SavedField({
  value,
  label,
  onSave,
}: {
  value: string;
  label: string;
  onSave?: (v: string) => void;
}) {
  // An empty name (nobody gave one yet) stays empty until you type one.
  const [draft, setDraft] = useState(value);
  const [was, setWas] = useState(value);
  if (value !== was) {
    setWas(value);
    setDraft(value);
  }
  return (
    <Field
      label={label}
      value={draft}
      maxLength={80}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        const v = draft.trim();
        if (!v) setDraft(value);
        else if (v !== value) onSave?.(v);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
      }}
      placeholder="Your name"
    />
  );
}

/** Email with Change: a new address, a code sent to it, then the code. */
function EmailRow({
  email,
  onStart,
  onConfirm,
}: {
  email: string;
  onStart?: (email: string) => Promise<void>;
  onConfirm?: (code: string) => Promise<void>;
}) {
  const [step, setStep] = useState<'idle' | 'address' | 'code'>('idle');
  const [next, setNext] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorKey, setErrorKey] = useState(0);
  const [code, setCode] = useState('');
  const fail = (err: unknown) => {
    setError(err instanceof Error ? err.message : 'That didn’t work. Try again.');
    setErrorKey((k) => k + 1);
  };
  const send = async () => {
    if (!next.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onStart?.(next.trim());
      setStep('code');
      setCode('');
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };
  const confirm = async (c: string) => {
    setBusy(true);
    setError(null);
    try {
      await onConfirm?.(c);
      setStep('idle');
      setNext('');
    } catch (err) {
      fail(err);
      setCode('');
    } finally {
      setBusy(false);
    }
  };
  if (step === 'idle')
    return (
      <SettingRow
        title="Email"
        sub={email}
        control={
          <Button
            variant="secondary"
            size="sm"
            aria-label="Change your email"
            onClick={() => setStep('address')}
          >
            Change
          </Button>
        }
      />
    );
  if (step === 'address')
    return (
      <SettingRow
        title="Email"
        sub={`Now ${email}. A code goes to the new address to check it’s yours.`}
        stack
      >
        <div className="tp-set-email">
          <Field
            label="New email"
            type="email"
            placeholder="you@example.com"
            value={next}
            autoFocus
            error={error ?? undefined}
            onChange={(e) => {
              setNext(e.target.value);
              setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void send();
            }}
          />
          <Button
            variant="primary"
            size="sm"
            loading={busy}
            loadingLabel="Sending…"
            onClick={() => void send()}
            disabled={!next.trim()}
          >
            Send code
          </Button>
          <Button variant="quiet" size="sm" onClick={() => setStep('idle')}>
            Cancel
          </Button>
        </div>
      </SettingRow>
    );
  return (
    <SettingRow title="Email" sub={`A 6-digit code went to ${next}. It works for 10 minutes.`} stack>
      <div className="tp-set-email tp-set-email-code">
        <CodeField
          label="Code from the new address"
          value={code}
          onChange={(v) => {
            setCode(v);
            if (error) setError(null);
          }}
          onComplete={(v) => void confirm(v)}
          error={error}
          errorKey={errorKey}
          disabled={busy}
          autoFocus
        />
        <Button variant="quiet" size="sm" onClick={() => setStep('address')}>
          Use another address
        </Button>
      </div>
    </SettingRow>
  );
}

const TITLES = (p: SettingsProps): Record<SettingsSectionName, [string, string]> => ({
  account: ['Account', p.me.email],
  appearance: ['Appearance', 'How Tudu looks on this computer.'],
  space: [
    p.space.name,
    p.space.personal ? 'Yours alone. Nothing here is shared.' : spaceLine(p.space.members, p.space.role),
  ],
  members: [
    'Members',
    `${p.members?.length ?? p.space.members} in ${p.space.name}` +
      (p.invites?.length ? ` · ${p.invites.length} invited` : ''),
  ],
  apps: [
    'Apps',
    `What you’ve connected in ${p.space.name}.${p.space.personal ? '' : ' Each person connects their own.'}`,
  ],
});

/**
 * Settings: on the desk a large dialog over the page you were on, the sections listed on the left (You: Account,
 * Appearance; then the space: Space, and in a team space Members); on phones a page, the list first and a section
 * pushed in with ‹ Settings. Fields save as you leave them; there is no Save button.
 */
export function Settings(p: SettingsProps) {
  const layout = p.layout ?? 'dialog';
  const phone = layout === 'phone';
  const sec = p.section ?? 'account';
  const sp = p.space;
  const team = !sp.personal;
  const admin = team && sp.role === 'admin';
  const photoInput = useRef<HTMLInputElement>(null);
  const [spaceDraft, setSpaceDraft] = useState<string | null>(null);
  const tileName = spaceDraft ?? sp.name;

  const groups: SettingsNavGroup[] = [
    {
      key: 'you',
      title: 'You',
      items: [
        { value: 'account', label: 'Account', icon: 'user', sub: p.me.email },
        {
          value: 'appearance',
          label: 'Appearance',
          icon: 'sun',
          sub: { light: 'Light', dark: 'Dark', system: 'System' }[p.theme ?? 'system'],
        },
      ],
    },
    {
      key: 'space',
      title: sp.name,
      space: { name: sp.name, color: sp.color, personal: sp.personal, initials: spaceInitials(sp.name) },
      items: team
        ? [
            {
              value: 'space',
              label: 'Space',
              icon: 'home',
              sub: admin ? 'Name, colour, leaving' : 'Projects, leaving',
            },
            {
              value: 'members',
              label: 'Members',
              icon: 'team',
              count: phone ? undefined : sp.members,
              sub: membersWords(sp.members),
            },
          ]
        : [{ value: 'space', label: 'Space', icon: 'home', sub: 'Just you' }],
    },
  ];
  groups[1]!.items.push({
    value: 'apps',
    label: 'Apps',
    icon: 'plug',
    sub: p.jira?.connected ? 'Jira' : 'None yet',
  });
  const pick = (v: string) => p.onSection?.(v as SettingsSectionName);

  let body: ReactNode = null;
  if (sec === 'account')
    body = (
      <>
        <SettingsSection title="You">
          <SettingRow
            title="Photo"
            sub={
              p.photoError ? (
                <span className="tp-set-bad">{p.photoError}</span>
              ) : (
                'Shows wherever people see you.'
              )
            }
            control={
              <div className="tp-set-photo">
                <PersonDot person={p.me} size={44} />
                <input
                  ref={photoInput}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  hidden
                  aria-label="Choose a photo"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = '';
                    if (f) p.onPhoto?.(f);
                  }}
                />
                <Button
                  variant="secondary"
                  size="sm"
                  loading={p.photoBusy}
                  loadingLabel="Uploading…"
                  aria-label="Change your photo"
                  onClick={() => photoInput.current?.click()}
                >
                  Change
                </Button>
                {p.me.image ? (
                  <Button variant="quiet" size="sm" aria-label="Remove your photo" onClick={p.onRemovePhoto}>
                    Remove
                  </Button>
                ) : null}
              </div>
            }
          />
          <SettingRow title="Name" stack>
            <SavedField label="Name" value={p.me.fieldName ?? p.me.name} onSave={p.onName} />
          </SettingRow>
          <EmailRow email={p.me.email} onStart={p.onEmailStart} onConfirm={p.onEmailConfirm} />
        </SettingsSection>
        <SettingsSection title="Signing out">
          <SettingRow
            title="Sign out"
            sub="Of Tudu on this computer. Your spaces and tasks stay as they are."
            control={
              <Button
                variant="secondary"
                size="sm"
                icon={<Icon name="signout" size={14} />}
                onClick={p.onSignOut}
              >
                Sign out
              </Button>
            }
          />
        </SettingsSection>
      </>
    );
  else if (sec === 'appearance')
    body = (
      <>
        <SettingsSection title="Theme">
          <ThemePick value={p.theme ?? 'system'} onChange={p.onTheme} compact={phone} />
        </SettingsSection>
        <SettingsSection title="Motion">
          <SettingRow
            title="Less motion"
            sub="Day turns, slides and sparkles become simple fades. Tudu also follows your computer’s Reduce motion setting."
            control={<Switch label="Less motion" checked={!!p.lessMotion} onChange={p.onLessMotion} />}
          />
        </SettingsSection>
      </>
    );
  else if (sec === 'space' && !team)
    body = (
      <>
        <SettingsSection title="This space">
          <SettingRow
            title="Personal"
            sub="Your own Today, Week, Backlog and Inbox. No one else can see it, and it can’t be shared or left."
            control={<SpaceTile space={{ name: sp.name, personal: true }} size={36} />}
          />
        </SettingsSection>
        {p.projects ? <ProjectSettings {...p.projects} /> : null}
        <SettingsSection title="Working with others">
          <SettingRow
            title="Create a space"
            sub="A space is its own Tudu for a team: its own lists, Inbox and people. Personal stays yours."
            control={
              <Button
                variant="primary"
                size="sm"
                icon={<Icon name="plus" size={14} />}
                onClick={p.onCreateSpace}
              >
                Create a space
              </Button>
            }
          />
        </SettingsSection>
      </>
    );
  else if (sec === 'space')
    body = (
      <>
        {admin ? (
          <SettingsSection title="Name and colour">
            <SettingRow title="Name" stack>
              <div className="tp-set-name">
                <SpaceTile
                  space={{ name: tileName, color: sp.color, initials: spaceInitials(tileName) }}
                  size={40}
                />
                <SpaceNameField
                  value={sp.name}
                  onDraft={setSpaceDraft}
                  onSave={(v) => {
                    setSpaceDraft(null);
                    p.onSpaceName?.(v);
                  }}
                />
              </div>
            </SettingRow>
            <SettingRow
              title="Colour"
              sub="Its mark in the space list."
              stack={phone}
              control={<ColorPick value={sp.color} onChange={p.onSpaceColor} label="Space colour" />}
            />
          </SettingsSection>
        ) : (
          <SettingsSection title="This space">
            <SettingRow
              title={sp.name}
              sub="Its name and colour are kept by its admins."
              control={
                <SpaceTile
                  space={{ name: sp.name, color: sp.color, initials: spaceInitials(sp.name) }}
                  size={36}
                />
              }
            />
          </SettingsSection>
        )}
        {p.projects ? <ProjectSettings {...p.projects} /> : null}
        <SettingsSection title="Leaving">
          <SettingRow
            title={`Leave ${sp.name}`}
            sub="What you shared stays with the space. You’ll need an invite to come back."
            control={
              <Button variant="secondary" size="sm" onClick={p.onLeave}>
                Leave
              </Button>
            }
          />
          {admin ? (
            <SettingRow
              title={`Delete ${sp.name}`}
              sub={deleteWords(sp.members)}
              control={
                <Button variant="secondary" size="sm" onClick={p.onDelete}>
                  Delete…
                </Button>
              }
            />
          ) : null}
        </SettingsSection>
      </>
    );
  else if (sec === 'members')
    body = (
      <MembersBody
        spaceName={sp.name}
        members={p.members ?? []}
        invites={p.invites ?? []}
        onInvite={p.onInvite}
        onCancelInvite={p.onCancelInvite}
        onResendInvite={p.onResendInvite}
        canEdit={admin}
        onRole={p.onRole}
        onRemove={admin ? p.onRemove : undefined}
      />
    );
  else if (sec === 'apps') {
    const j = p.jira;
    body = (
      <>
        <SettingsSection title="Connected">
          <SettingRow
            title={
              <span className="tp-set-app">
                <JiraMark size={18} />
                Jira
              </span>
            }
            sub={
              j?.connected
                ? `As ${j.who || p.me.email} on ${j.site || 'your Jira'}. Only you see your issues.`
                : 'Bring your Jira issues next to your day. Connect with a personal access token.'
            }
            control={
              j?.connected ? (
                <Button variant="secondary" size="sm" onClick={p.onJira}>
                  Disconnect
                </Button>
              ) : (
                <Button variant="primary" size="sm" onClick={p.onJira}>
                  Connect
                </Button>
              )
            }
          />
        </SettingsSection>
        <p className="tp-set-note">
          More apps are on the way. Everything here is optional; Tudu works fine on its own.
        </p>
      </>
    );
  }

  const [title, line] = TITLES(p)[sec];
  const main = (
    <div className="tp-set-main">
      {phone ? null : (
        <header className="tp-set-h">
          <div>
            <h1>{title}</h1>
            <p>{line}</p>
          </div>
          {p.onClose ? (
            <IconButton label="Close" tipSide="bottom-end" onClick={p.onClose}>
              <Icon name="x" size={16} />
            </IconButton>
          ) : null}
        </header>
      )}
      <div className="tp-set-scroll">
        <div key={sec} className={cx('tp-set-body', !p.still && 'tp-set-in')}>
          {phone ? (
            <header className="tp-set-ph">
              {p.onBack ? (
                <button type="button" className="tp-set-back" onClick={p.onBack}>
                  <Icon name="left" size={16} />
                  Settings
                </button>
              ) : null}
              <h1>{title}</h1>
              <p>{line}</p>
            </header>
          ) : null}
          {p.offline ? (
            <p className="tp-set-note tp-set-offline" role="status">
              Saves when you’re back.
            </p>
          ) : null}
          {body}
        </div>
      </div>
    </div>
  );

  if (phone)
    return (
      <div className={cx('tp-root tp-set tp-set-phone', p.className)}>
        {p.view === 'section' ? (
          main
        ) : (
          <div className="tp-set-main">
            <div className="tp-set-scroll">
              <header className="tp-set-ph">
                <h1>Settings</h1>
              </header>
              <div className="tp-set-me">
                <PersonDot person={p.me} size={44} />
                <span>
                  <b>{p.me.name}</b>
                  <span>{p.me.email}</span>
                </span>
              </div>
              <SettingsNav list groups={groups} onPick={pick} />
            </div>
          </div>
        )}
      </div>
    );
  return (
    <div className={cx('tp-root tp-set', `tp-set-${layout}`, p.className)}>
      <aside className="tp-set-side">
        <div className="tp-set-sh">
          <h2>Settings</h2>
        </div>
        <SettingsNav groups={groups} active={sec} onPick={pick} />
      </aside>
      {main}
    </div>
  );
}

/** The space's name: the tile follows as you type; it saves when you leave the field. */
function SpaceNameField({
  value,
  onDraft,
  onSave,
}: {
  value: string;
  onDraft: (v: string | null) => void;
  onSave: (v: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const [was, setWas] = useState(value);
  if (value !== was) {
    setWas(value);
    setDraft(value);
  }
  return (
    <Field
      label="Space name"
      value={draft}
      maxLength={40}
      onChange={(e) => {
        setDraft(e.target.value);
        onDraft(e.target.value || null);
      }}
      onBlur={() => {
        const v = draft.trim();
        if (!v || v === value) {
          setDraft(value);
          onDraft(null);
        } else onSave(v);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
      }}
    />
  );
}
