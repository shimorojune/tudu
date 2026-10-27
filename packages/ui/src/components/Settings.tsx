import { deleteWords, membersWords, spaceInitials, spaceLine } from '@tudu/core';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cx } from '../lib/cx';
import { Icon } from '../lib/icons';
import type { ThemeChoice } from '../lib/theme';
import { Banner } from './Banner';
import { Button } from './Button';
import { CodeField } from './CodeField';
import { ColorPick } from './ColorPick';
import { Field } from './Field';
import { IconButton } from './IconButton';
import { JiraMark } from './JiraMark';
import { MembersBody, type MembersBodyInvite, type MembersBodyMember } from './MembersBody';
import { PersonDot } from './PersonDot';
import { ProjectSettings, type ProjectSettingsProps } from './ProjectSettings';
import { Segmented } from './Segmented';
import { SettingRow, SettingsSection } from './SettingsSection';
import { SettingsNav, type SettingsNavGroup } from './SettingsNav';
import { Skeleton } from './Skeleton';
import { VersionLink, type VersionLinkProps } from './VersionLink';
import { SpaceTile } from './SpaceTile';
import { Switch } from './Switch';
import { ThemePick } from './ThemePick';

export type SettingsSectionName = 'account' | 'appearance' | 'mac' | 'space' | 'members' | 'apps';

/** Open at login, as macOS has it: `approval` waits for your OK in Login Items, `refused` is macOS saying no. */
export type SettingsLogin = 'off' | 'on' | 'approval' | 'refused';

/** Show Tudu in the Dock: only while the window is open, or always. */
export type SettingsDock = 'open' | 'always';

/** Settings › This Mac, in the Mac app only. */
export interface SettingsMac {
  openAtLogin: SettingsLogin;
  onOpenAtLogin?: (on: boolean) => void;
  onLoginItems?: () => void;
  dock: SettingsDock;
  onDock?: (dock: SettingsDock) => void;
  /** This Mac › Updates; an app too old to answer leaves it out. */
  updates?: SettingsUpdates;
}

/**
 * Where the updater stands: `loading` until the app answers, `never` before a first check, `idle` up to date,
 * `checking`, `downloading` (with `progress` when the size is known), `ready` (downloaded and verified), `error`.
 */
export type SettingsUpdateState =
  'loading' | 'never' | 'idle' | 'checking' | 'downloading' | 'ready' | 'error';

export interface SettingsUpdates {
  /** The app's name: "Tudu", "Tudu Staging". */
  name: string;
  /** The version it runs: "0.37.0". */
  current: string;
  state: SettingsUpdateState;
  /** "Checked 12 minutes ago". */
  checked?: string;
  /** The version downloading or ready. */
  version?: string;
  /** 0 to 1 while downloading. */
  progress?: number;
  /** The line for `error`: "Couldn’t check for updates. …". */
  error?: string;
  onCheck?: () => void;
  /**
   * The error is one retrying can't fix (the download failed its safety check): its button reads "Get it from the
   * website" and calls this in place of Try again.
   */
  onGetIt?: () => void;
  onRestart?: () => void;
  /** Restart to update failed: what to do instead. */
  restartError?: string;
}

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
  /** Names the one row of Settings › Apps when the spaces aren't given. */
  id?: string;
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

  // This Mac: the Mac app only; without it the section is not listed.
  mac?: SettingsMac;

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
  /**
   * Apps are yours (the default): connected once for your account, listed under You, turned on per space there.
   * `space` draws the old per-space Apps, kept only for history boards.
   */
  appsScope?: 'account' | 'space';
  /** Your Jira: who you are there, the site ("jira.northwind.io"), and your switch in each of your spaces. */
  jira?: {
    connected: boolean;
    who?: string;
    site?: string;
    state?: 'ok' | 'expired';
    /** The spaces are being read: skeleton rows. */
    loading?: boolean;
    /** The spaces couldn't be read: a banner with Try again, no list. */
    error?: boolean;
    /** Without it, the space you are in is the one row, on. */
    spaces?: JiraSpaceRow[];
  };
  /** Connect (not connected) or Disconnect (connected). */
  onJira?: () => void;
  /** Flip your switch in a space; `{ error }` or a rejection puts it back with the reason under the row. */
  onJiraSpace?: (
    space: JiraSpaceRow,
    on: boolean,
  ) => void | { error?: string } | Promise<{ error?: string } | void>;
  /** The token expired: Add a new token. */
  onJiraReconnect?: () => void;
  /** Read the spaces again after they couldn't be read. */
  onRetry?: () => void;

  /** Which Tudu this is, at the foot of the list: a link to its release on GitHub. */
  version?: VersionLinkProps;

  /** No connection: names and colours wait in the outbox; the page says so. */
  offline?: boolean;
  /** State boards: no rise-in. */
  still?: boolean;
  className?: string;
}

/** One of your spaces in Settings › Apps, with your switch for Jira there. */
export interface JiraSpaceRow {
  id: string;
  name: string;
  color?: string;
  initials?: string;
  personal?: boolean;
  on?: boolean;
  /** Turning on or off: the line says so with a spinner, the switch waits. */
  busy?: boolean;
  /** Why the switch was put back, in red under the row. */
  error?: string;
  /** The space you are in: "You're here". */
  current?: boolean;
  /** You were sent here from that space: the row glows once. */
  highlight?: boolean;
  /** Your tasks there linked to an issue. */
  linked?: number;
}

/** How long a switch keeps saying Turning on… after the server answered, so the change reads as a step. */
export const JIRA_SWITCH_SETTLE_MS = 520;

const SPIN = (
  <svg className="tp-spin" width={13} height={13} viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <circle cx={12} cy={12} r={9} stroke="currentColor" strokeWidth={2.5} opacity={0.25} />
    <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" />
  </svg>
);

const TICK = (
  <svg
    width={12}
    height={12}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2.6}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M5.5 12.2 10 16.6 18.8 7" />
  </svg>
);

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** A row's quiet line: On, "4 linked tasks", Off, "Off · 2 tasks keep their keys", or Turning on… */
export function jiraSpaceLine(on: boolean, linked: number, busy?: boolean): string {
  if (busy) return on ? 'Turning on…' : 'Turning off…';
  if (on) return linked ? plural(linked, 'linked task', 'linked tasks') : 'On';
  return linked ? `Off · ${plural(linked, 'task keeps its key', 'tasks keep their keys')}` : 'Off';
}

type SwitchState = { on: boolean; busy: boolean; error: string | null };

/**
 * Settings › Apps, yours: Jira connected once with your own token, then "Use Jira in" with a switch per space. A
 * switch settles in place (Turning on…); a refusal says so under the row and puts the switch back; a row you were
 * sent to from a space glows once.
 */
function AccountApps({ p }: { p: SettingsProps }) {
  const j = p.jira;
  const connected = !!j?.connected;
  const spaces: JiraSpaceRow[] =
    j?.spaces ??
    (connected
      ? [
          {
            id: p.space.id ?? 'here',
            name: p.space.name,
            color: p.space.color,
            personal: p.space.personal,
            on: true,
            current: true,
          },
        ]
      : []);
  // Your flips while the server answers, and the reasons it said no. A flip speaks for its row only while the row's
  // own `on` is still what it was when you flipped: once the server's word arrives (or another tab flips it), the
  // row speaks for itself again.
  const [st, setSt] = useState<Record<string, SwitchState & { was: boolean }>>({});
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const stateOf = (x: JiraSpaceRow): SwitchState => {
    const o = st[x.id];
    if (o && (o.busy || !!x.on === o.was)) return o;
    return { on: !!x.on, busy: !!x.busy, error: x.error ?? null };
  };
  const settle = (id: string, was: boolean, next: SwitchState) =>
    timers.current.push(
      setTimeout(() => setSt((m) => ({ ...m, [id]: { ...next, was } })), JIRA_SWITCH_SETTLE_MS),
    );
  const flip = (x: JiraSpaceRow, v: boolean) => {
    if (stateOf(x).busy) return;
    const was = !!x.on;
    setSt((m) => ({ ...m, [x.id]: { on: v, busy: true, error: null, was } }));
    Promise.resolve(p.onJiraSpace?.(x, v)).then(
      (r) =>
        settle(
          x.id,
          was,
          r && r.error ? { on: !v, busy: false, error: r.error } : { on: v, busy: false, error: null },
        ),
      (e: unknown) =>
        settle(x.id, was, {
          on: !v,
          busy: false,
          error: e instanceof Error && e.message ? e.message : 'Couldn’t change it. Try again.',
        }),
    );
  };

  const site = (j?.site || 'your Jira').replace(/^https?:\/\//, '');
  const expired = j?.state === 'expired';
  const on = spaces.filter((x) => stateOf(x).on).length;
  return (
    <div className="tp-set-apps">
      {j?.error ? (
        <Banner tone="warning" title="Couldn’t load your spaces." action="Try again" onAction={p.onRetry}>
          Jira stays as it was in each space.
        </Banner>
      ) : null}
      <SettingsSection title="Connected">
        <SettingRow
          title={
            <span className="tp-set-app">
              <JiraMark size={18} />
              Jira
              {connected && !expired ? (
                <span className="tp-app-ok">
                  {TICK}
                  Connected
                </span>
              ) : null}
            </span>
          }
          sub={
            !connected
              ? 'Bring your Jira issues next to your day. Connect once with a personal access token, then pick the spaces it shows in.'
              : expired
                ? `Your token for ${site} has expired. Jira is paused in every space until you add a new one; your views and linked tasks stay.`
                : `As ${j?.who || p.me.email} on ${site}. Only you see your issues.`
          }
          control={
            !connected ? (
              <Button variant="primary" size="sm" onClick={p.onJira}>
                Connect
              </Button>
            ) : expired ? (
              <Button variant="primary" size="sm" onClick={p.onJiraReconnect}>
                Add a new token
              </Button>
            ) : (
              <Button variant="secondary" size="sm" onClick={p.onJira}>
                Disconnect
              </Button>
            )
          }
        />
      </SettingsSection>
      {!connected || j?.error ? null : (
        <SettingsSection
          title="Use Jira in"
          aside={j?.loading ? undefined : `${on} of ${spaces.length} on`}
          sub="Jira shows only in spaces where it’s on: the panel, the Jira fact on tasks and Add to a day. In a team space, people see a task’s Jira key, never your issues."
        >
          {j?.loading
            ? [0, 1, 2].map((i) => (
                <div key={i} className="tp-setrow tp-set-sprow tp-set-skl">
                  <span className="tp-skel" style={{ width: 22, height: 22, borderRadius: 7 }} />
                  <div className="tp-setrow-t">
                    <Skeleton width={[96, 120, 84][i]} height={12} />
                    <div style={{ height: 6 }} />
                    <Skeleton width={[140, 110, 160][i]} height={8} />
                  </div>
                  <span className="tp-skel" style={{ width: 36, height: 22, borderRadius: 999 }} />
                </div>
              ))
            : spaces.map((x) => {
                const s = stateOf(x);
                const line = jiraSpaceLine(s.on, x.linked ?? 0, s.busy);
                return (
                  <div
                    key={x.id}
                    className={cx('tp-set-sprow', x.highlight && 'tp-set-hl', s.error && 'tp-bad')}
                  >
                    <SettingRow
                      title={
                        <span className="tp-set-app">
                          <SpaceTile
                            space={{
                              name: x.name,
                              color: x.color,
                              personal: x.personal,
                              initials: x.initials ?? spaceInitials(x.name),
                            }}
                            size={22}
                          />
                          {x.name}
                          {x.current ? <span className="tp-set-here">You’re here</span> : null}
                        </span>
                      }
                      sub={
                        <span key={line} className={cx('tp-set-spsub', s.busy && 'tp-busy')}>
                          {s.busy ? SPIN : null}
                          {line}
                        </span>
                      }
                      control={
                        <Switch
                          label={`Jira in ${x.name}`}
                          checked={s.on}
                          disabled={s.busy || expired}
                          onChange={(v) => flip(x, v)}
                        />
                      }
                    />
                    {s.error ? (
                      <div className="tp-help tp-set-sperr" role="alert">
                        <svg
                          width={13}
                          height={13}
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={2.2}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                        >
                          <circle cx={12} cy={12} r={10} />
                          <path d="M12 8v4" />
                          <path d="M12 16h.01" />
                        </svg>
                        {s.error}
                      </div>
                    ) : null}
                  </div>
                );
              })}
        </SettingsSection>
      )}
      <p className="tp-set-note">
        {connected
          ? 'New spaces start with Jira off. Turning it off hides Jira there; tasks keep their keys.'
          : 'More apps are on the way. Everything here is optional; Tudu works fine on its own.'}
      </p>
    </div>
  );
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

/** How long Check now's tick stays when nothing new was found. */
export const UP_TO_DATE_MS = 1600;

/**
 * This Mac › Updates: the version you run, what the last check found, and one button. A Check now that finds nothing
 * ends on the tick ("Up to date") for a moment; each new line fades up into place.
 */
function UpdatesSection({ u }: { u: SettingsUpdates }) {
  const [asked, setAsked] = useState(false);
  const [tick, setTick] = useState(false);
  const [was, setWas] = useState(u.state);
  if (u.state !== was) {
    setWas(u.state);
    if (u.state === 'idle' && was === 'checking' && asked) setTick(true);
    if (u.state !== 'checking') setAsked(false);
  }
  useEffect(() => {
    if (!tick) return;
    const t = setTimeout(() => setTick(false), UP_TO_DATE_MS);
    return () => clearTimeout(t);
  }, [tick]);
  const check = () => {
    setAsked(true);
    u.onCheck?.();
  };
  const v = u.version ?? '';
  const line: ReactNode =
    u.state === 'loading' ? (
      <Skeleton width={220} height={10} />
    ) : u.state === 'never' ? (
      'Not checked yet.'
    ) : u.state === 'idle' ? (
      `Up to date.${u.checked ? ` ${u.checked}.` : ''}`
    ) : u.state === 'checking' ? (
      'Looking for a new version…'
    ) : u.state === 'downloading' ? (
      `Downloading ${u.name} ${v}…`
    ) : u.state === 'ready' ? (
      <>
        <span className="tp-set-ready">{`${u.name} ${v} is ready.`}</span> Restart to use it.
      </>
    ) : (
      <span className="tp-set-bad">
        {u.error ?? 'Couldn’t check for updates. Check your connection and try again.'}
      </span>
    );
  const control =
    u.state === 'ready' ? (
      <Button variant="primary" size="sm" onClick={u.onRestart}>
        Restart to update
      </Button>
    ) : u.state === 'downloading' ? (
      <Button variant="secondary" size="sm" progress={u.progress ?? 0}>
        Downloading
      </Button>
    ) : u.state === 'error' && u.onGetIt ? (
      <Button variant="secondary" size="sm" onClick={u.onGetIt}>
        Get it from the website
      </Button>
    ) : (
      <Button
        variant="secondary"
        size="sm"
        disabled={u.state === 'loading'}
        loading={u.state === 'checking'}
        loadingLabel="Checking…"
        success={tick}
        successLabel="Up to date"
        onClick={check}
      >
        {u.state === 'error' ? 'Try again' : 'Check now'}
      </Button>
    );
  return (
    <SettingsSection title="Updates">
      <SettingRow
        title={`${u.name} ${u.current}`}
        sub={
          <>
            <span key={u.state} className="tp-set-st" aria-live="polite">
              {line}
            </span>
            {u.restartError ? <span className="tp-set-st tp-set-bad">{u.restartError}</span> : null}
          </>
        }
        control={control}
      />
    </SettingsSection>
  );
}

const TITLES = (p: SettingsProps): Record<SettingsSectionName, [string, string]> => ({
  account: ['Account', p.me.email],
  appearance: ['Appearance', 'How Tudu looks on this computer.'],
  mac: ['This Mac', 'How Tudu runs on this Mac.'],
  space: [
    p.space.name,
    p.space.personal ? 'Yours alone. Nothing here is shared.' : spaceLine(p.space.members, p.space.role),
  ],
  members: [
    'Members',
    `${p.members?.length ?? p.space.members} in ${p.space.name}` +
      (p.invites?.length ? ` · ${p.invites.length} invited` : ''),
  ],
  apps:
    p.appsScope !== 'space'
      ? ['Apps', 'Connected once, for you. Pick the spaces each one shows in.']
      : [
          'Apps',
          `What you’ve connected in ${p.space.name}.${p.space.personal ? '' : ' Each person connects their own.'}`,
        ],
});

/**
 * Settings: on the desk a large dialog over the page you were on, the sections listed on the left (You: Account,
 * Appearance, and This Mac in the Mac app; then the space: Space, and in a team space Members); on phones a page, the list first and a section
 * pushed in with ‹ Settings. Fields save as you leave them; there is no Save button.
 */
export function Settings(p: SettingsProps) {
  const layout = p.layout ?? 'dialog';
  const phone = layout === 'phone';
  const sec = p.section === 'mac' && !p.mac ? 'account' : (p.section ?? 'account');
  const sp = p.space;
  const team = !sp.personal;
  const admin = team && sp.role === 'admin';
  const photoInput = useRef<HTMLInputElement>(null);
  const [spaceDraft, setSpaceDraft] = useState<string | null>(null);
  const tileName = spaceDraft ?? sp.name;

  // Apps are connected once, for you: Apps sits under You. `appsScope="space"` is the old per-space Apps.
  const acct = p.appsScope !== 'space';
  const jOn = p.jira?.spaces ? p.jira.spaces.filter((x) => x.on).length : 1;
  const appsItem = {
    value: 'apps',
    label: 'Apps',
    icon: 'plug' as const,
    sub: p.jira?.connected ? (acct ? `Jira · on in ${plural(jOn, 'space', 'spaces')}` : 'Jira') : 'None yet',
  };
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
        ...(p.mac
          ? [
              {
                value: 'mac',
                label: 'This Mac',
                icon: 'laptop' as const,
                sub: p.mac.openAtLogin === 'on' ? 'Opens at login' : 'Login, Dock',
              },
            ]
          : []),
        ...(acct ? [appsItem] : []),
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
  if (!acct) groups[1]!.items.push(appsItem);
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
  else if (sec === 'mac' && p.mac) {
    const m = p.mac;
    const on = m.openAtLogin === 'on' || m.openAtLogin === 'approval';
    body = (
      <>
        <SettingsSection title="Starting up">
          <SettingRow
            title="Open at login"
            sub={
              m.openAtLogin === 'refused' ? (
                <span className="tp-set-bad">
                  macOS didn’t allow it. Try again, or add Tudu in Login Items yourself.
                </span>
              ) : m.openAtLogin === 'approval' ? (
                'macOS needs you to allow Tudu in System Settings › General › Login Items first.'
              ) : (
                'Tudu starts in the menu bar when you log in, with no window, so today is a click away.'
              )
            }
            control={
              <div className="tp-set-login">
                {m.openAtLogin === 'approval' ? (
                  <Button variant="secondary" size="sm" onClick={m.onLoginItems}>
                    Open Login Items
                  </Button>
                ) : null}
                <Switch label="Open at login" checked={on} onChange={m.onOpenAtLogin} />
              </div>
            }
          />
        </SettingsSection>
        <SettingsSection title="The Dock">
          <SettingRow
            title="Show Tudu in the Dock"
            sub="Closing the window keeps Tudu running in the menu bar either way. Quit Tudu (⌘Q) stops it."
            stack
          >
            <Segmented<SettingsDock>
              label="Show Tudu in the Dock"
              value={m.dock}
              onChange={m.onDock}
              items={[
                { value: 'open', label: 'While the window is open' },
                { value: 'always', label: 'Always' },
              ]}
            />
          </SettingRow>
        </SettingsSection>
        {m.updates ? <UpdatesSection u={m.updates} /> : null}
      </>
    );
  } else if (sec === 'space' && !team)
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
  else if (sec === 'apps' && acct) body = <AccountApps p={p} />;
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
              {p.version ? <VersionLink {...p.version} className="tp-set-ver" /> : null}
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
        {p.version ? <VersionLink {...p.version} className="tp-set-ver" /> : null}
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
