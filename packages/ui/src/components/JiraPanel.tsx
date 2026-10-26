import {
  addDays,
  dueWords,
  formatDay,
  jiraDueWords,
  linkChipWords,
  linkDayLong,
  linkFootWords,
  siteHost,
  siteProblem,
  type IsoDate,
} from '@tudu/core';
import { Fragment, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { cx } from '../lib/cx';
import { useOutside } from '../lib/hooks';
import { Icon } from '../lib/icons';
import { Linger } from '../lib/linger';
import { Avatar } from './Avatar';
import { Banner } from './Banner';
import { Button } from './Button';
import { DatePop } from './DatePop';
import { EmptyState } from './EmptyState';
import { IconButton } from './IconButton';
import { JiraMark } from './JiraMark';
import { MenuList } from './Menu';
import { MiniCalendar, type MiniCalendarProps } from './MiniCalendar';
import { QAChip } from './QuickAdd';
import { RichTextContent } from './RichTextEditor';
import { Skeleton } from './Skeleton';
import { SpaceTile, type SpaceTileSpace } from './SpaceTile';
import { showToast } from './Toast';

/** A task of yours linked to an issue: its ID once numbered, where it sits, whether it is crossed off. */
export interface JiraPanelLink {
  /** The task's own id. */
  taskId: string;
  /** "ME-52", once the server has numbered it. */
  id?: string | null;
  title: string;
  day: IsoDate | null;
  done: boolean;
  /** The task lives in another of your spaces: its tile and name, quiet, at the end of the chip. */
  space?: SpaceTileSpace & { name: string };
}

export interface JiraPanelIssue {
  key: string;
  summary: string;
  status?: string;
  due?: IsoDate | null;
  linked?: JiraPanelLink[];
}

export interface JiraPreviewComment {
  key: string;
  who: string;
  initials: string;
  color?: string;
  when: string;
  html: string;
}

/** The whole issue, for the preview. */
export interface JiraPreviewIssue extends JiraPanelIssue {
  issuetype?: string | null;
  assignee?: { name: string; initials: string; color?: string } | null;
  priority?: string | null;
  /** "12 min ago". */
  updated?: string | null;
  /** Cleaned HTML. */
  description?: string;
  comments?: JiraPreviewComment[];
}

/** What the panel is doing: asking for a token, loading, showing issues, or showing the last ones under a banner. */
export type JiraPanelState =
  'connect' | 'connecting' | 'reconnect' | 'loading' | 'ready' | 'error' | 'expired' | 'offline';

export interface JiraView {
  value: string;
  label: string;
  jql?: string;
  /** A view of your own: it can be removed from the Custom JQL editor while it is open. */
  saved?: boolean;
}

export interface JiraConnectError {
  field: 'site' | 'token';
  message: string;
}

export type AddState = 'busy' | 'done';

const SPIN = (
  <svg className="tp-spin" width={13} height={13} viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <circle cx={12} cy={12} r={9} stroke="currentColor" strokeWidth={2.5} opacity={0.25} />
    <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" />
  </svg>
);

const JP_PATHS = {
  back: <path d="M19 12H5M11 18l-6-6 6-6" />,
  tick: <path d="M5.5 12.2 10 16.6 18.8 7" />,
  link: (
    <>
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </>
  ),
  day: (
    <>
      <rect x={3} y={4} width={18} height={18} rx={2} />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </>
  ),
  ext: <path d="M7 17 17 7M8 7h9v9" />,
  alert: (
    <>
      <circle cx={12} cy={12} r={10} />
      <path d="M12 8v4" />
      <path d="M12 16h.01" />
    </>
  ),
};

function JpIcon({
  name,
  size = 15,
  width = 2,
}: {
  name: keyof typeof JP_PATHS;
  size?: number;
  width?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={width}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {JP_PATHS[name]}
    </svg>
  );
}

/** The add-day and preview slides last this long before they unmount. */
export const JP_PREVIEW_LEAVE_MS = 180;
export const JP_SHEET_LEAVE_MS = 240;
const JQL_LEAVE_MS = 180;
/** How long the linked chip keeps its tick after a task was made. */
export const JP_FRESH_MS = 1600;
/** Search across Jira asks this long after the last key. */
export const JP_SEARCH_AFTER_MS = 250;

// ---------------------------------------------------------------------------------------------------------------

export interface JPLinkedProps {
  link: JiraPanelLink;
  today: IsoDate;
  big?: boolean;
  /** Just made: the tick in place of the link mark, and the soft wash. */
  fresh?: boolean;
  onShow?: (l: JiraPanelLink) => void;
}

/**
 * The end of an issue's byline once it has its task: the task's ID and the day it is on ("↳ ME-52 · Today").
 * Clicking it shows the task where it lives.
 */
export function JPLinked({ link: l, today, big, fresh, onShow }: JPLinkedProps) {
  const w = linkChipWords({ ref: l.id ?? null, day: l.day, done: l.done }, today);
  const day = w.text.slice(l.id ? l.id.length + 3 : 0);
  return (
    <button
      type="button"
      className={cx(
        'tp-jp-linked',
        big && 'tp-big',
        fresh && 'tp-fresh',
        l.done && 'tp-done',
        l.day === today && 'tp-today',
      )}
      aria-label={w.label}
      title={l.title}
      onClick={(e) => {
        e.stopPropagation();
        onShow?.(l);
      }}
    >
      {fresh ? (
        <span className="tp-jp-lk-tick">
          <JpIcon name="tick" size={12} width={2.6} />
        </span>
      ) : (
        <span className="tp-jp-lk-i">
          <JpIcon name="link" size={big ? 14 : 12} width={2.2} />
        </span>
      )}
      {big ? <span>Show</span> : null}
      {l.id ? <span className="tp-jp-lk-id">{l.id}</span> : null}
      <span className="tp-jp-lk-day">{(l.id ? '· ' : '') + day}</span>
      {l.space ? (
        <span className="tp-jp-lk-sp">
          {'· '}
          <SpaceTile space={l.space} size={12} />
          {l.space.name}
        </span>
      ) : null}
    </button>
  );
}

function byline(it: JiraPanelIssue, today: IsoDate, linked: ReactNode): ReactNode[] {
  const b: ReactNode[] = [
    <span key="k" className="tp-jp-key">
      {it.key}
    </span>,
  ];
  if (it.status)
    b.push(
      <span key="s" className="tp-jp-st">
        {it.status}
      </span>,
    );
  if (it.due) {
    const d = jiraDueWords(it.due, today);
    b.push(
      <span key="d" className={cx('tp-jp-due', d.overdue && 'tp-od')}>
        <Icon name="clock" size={12} />
        {d.text}
      </span>,
    );
  }
  if (linked) b.push(<Fragment key="lk">{linked}</Fragment>);
  return b.flatMap((x, i) =>
    i
      ? [
          <span key={`sep${i}`} className="tp-sep" aria-hidden="true">
            ·
          </span>,
          x,
        ]
      : [x],
  );
}

// ---------------------------------------------------------------------------------------------------------------

export interface JiraPreviewProps {
  issue: JiraPreviewIssue;
  today: IsoDate;
  compact?: boolean;
  addState?: AddState | null;
  /** The detail is still on its way: the facts show what the list knows. */
  loading?: boolean;
  onBack?: () => void;
  onOpenInJira?: (key: string) => void;
  onShowTask?: (l: JiraPanelLink) => void;
  onPick?: (anchor: HTMLElement) => void;
}

/** The whole issue, read-mostly, sliding over the list inside the panel (a sheet from the bottom on phones). */
export function JiraPreview({
  issue: it,
  today,
  compact,
  addState,
  loading,
  onBack,
  onOpenInJira,
  onShowTask,
  onPick,
}: JiraPreviewProps) {
  const [all, setAll] = useState(false);
  const cms = it.comments ?? [];
  const shown = all || cms.length <= 4 ? cms : cms.slice(-3);
  const links = it.linked ?? [];
  const link = links[0];
  const due = it.due ? dueWords(it.due, today) : null;
  const facts: Array<[string, ReactNode]> = [];
  if (it.status) facts.push(['Status', <span className="tp-jp-st">{it.status}</span>]);
  facts.push([
    'Assignee',
    it.assignee ? (
      <span className="tp-jp-who">
        <Avatar initials={it.assignee.initials} name={it.assignee.name} color={it.assignee.color} size="sm" />
        {it.assignee.name}
      </span>
    ) : (
      <span className="tp-jp-none">{loading ? '' : 'Unassigned'}</span>
    ),
  ]);
  if (it.priority) facts.push(['Priority', it.priority]);
  facts.push([
    'Due',
    it.due ? (
      <span className={cx(it.due < today && 'tp-jp-odt')}>
        {formatDay(it.due)} · {due!.text}
      </span>
    ) : (
      <span className="tp-jp-none">No due date</span>
    ),
  ]);
  if (it.updated) facts.push(['Updated', it.updated]);
  return (
    <div
      className={cx('tp-jp-pv', compact && 'tp-compact')}
      role="dialog"
      aria-label={`${it.key} ${it.summary}`}
    >
      {compact ? <div className="tp-jp-grab" aria-hidden="true" /> : null}
      <div className="tp-jp-pvtop">
        <button type="button" className="tp-jp-back" onClick={onBack}>
          <JpIcon name="back" />
          {compact ? 'Close' : 'All issues'}
        </button>
        <span className="tp-jp-sp" />
        <span className="tp-jp-pvkey">{it.key}</span>
        {onOpenInJira ? (
          <IconButton
            label={`Open ${it.key} in Jira`}
            tipSide="bottom-end"
            onClick={() => onOpenInJira(it.key)}
          >
            <JpIcon name="ext" />
          </IconButton>
        ) : null}
      </div>
      <div className="tp-jp-pvscroll" aria-busy={loading ? 'true' : undefined}>
        {it.issuetype ? <div className="tp-jp-pvtype">{it.issuetype}</div> : null}
        <h2 className="tp-jp-pvsum">{it.summary}</h2>
        <dl className="tp-jp-facts">
          {facts.map(([k, v]) => (
            <Fragment key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </Fragment>
          ))}
        </dl>
        <section className="tp-jp-sec">
          <h3 className="tp-td-h">Description</h3>
          {loading ? (
            <Skeleton width="72%" height={10} />
          ) : it.description ? (
            <RichTextContent html={it.description} compact={compact} />
          ) : (
            <p className="tp-jp-none">No description.</p>
          )}
        </section>
        <section className="tp-jp-sec">
          <h3 className="tp-td-h">
            In Tudu
            {links.length ? <span>{links.length}</span> : null}
          </h3>
          {links.length ? (
            <ul className="tp-jp-links">
              {links.map((l) => (
                <li key={l.taskId} className={cx(l.done && 'tp-done')}>
                  <button type="button" className="tp-jp-lrow" onClick={() => onShowTask?.(l)}>
                    <span className={cx('tp-jp-ld', l.day === today && 'tp-today')}>
                      {linkDayLong(l.day, today).replace('the Backlog', 'Backlog')}
                    </span>
                    <span className="tp-jp-lt">{l.title || it.summary}</span>
                    {l.id ? <span className="tp-jp-lid">{l.id}</span> : null}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="tp-jp-none">No task for it yet. Add it to Today, or pick a day below.</p>
          )}
        </section>
        <section className="tp-jp-sec">
          <h3 className="tp-td-h">
            Comments
            {cms.length ? <span>{cms.length}</span> : null}
          </h3>
          {cms.length > shown.length ? (
            <button type="button" className="tp-jp-more" onClick={() => setAll(true)}>
              Show {cms.length - shown.length} earlier comment{cms.length - shown.length === 1 ? '' : 's'}
            </button>
          ) : null}
          {cms.length ? (
            <div className="tp-jp-cms">
              {shown.map((c) => (
                <div key={c.key} className="tp-td-cmt">
                  <Avatar initials={c.initials} name={c.who} color={c.color} size="sm" />
                  <div className="tp-td-cmt-b">
                    <div className="tp-td-who">
                      <b>{c.who}</b>
                      <span>{c.when}</span>
                    </div>
                    <RichTextContent html={c.html} className="tp-td-cmt-text" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="tp-jp-none">{loading ? '' : 'No comments yet.'}</p>
          )}
          {onOpenInJira ? (
            <button type="button" className="tp-jp-reply" onClick={() => onOpenInJira(it.key)}>
              Reply in Jira
              <JpIcon name="ext" size={13} />
            </button>
          ) : null}
        </section>
      </div>
      {link && addState !== 'busy' ? (
        <div className="tp-jp-pvfoot">
          <JPLinked big link={link} today={today} fresh={addState === 'done'} onShow={onShowTask} />
          <span className="tp-jp-pvnote">{linkFootWords(link, today)}</span>
        </div>
      ) : (
        <div className="tp-jp-pvfoot">
          <button
            type="button"
            className={cx('tp-jp-addday', addState === 'busy' && 'tp-busy')}
            aria-haspopup="dialog"
            disabled={addState === 'busy'}
            onClick={(e) => onPick?.(e.currentTarget)}
          >
            {addState === 'busy' ? SPIN : <JpIcon name="day" />}
            {addState === 'busy' ? 'Adding' : 'Add to a day'}
          </button>
          <span className="tp-jp-pvnote">Adds a Tudu task linked to this issue.</span>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------

export interface JPConnectProps {
  /** Reconnect: the address is kept and only a new token is asked for. */
  reconnect?: boolean;
  /** The Jira address, kept on a reconnect. */
  site?: string;
  busy?: boolean;
  compact?: boolean;
  initial?: { site?: string; token?: string; error?: JiraConnectError | null; connected?: boolean };
  /** Jira's answer: nothing (yes), or the words for the field they belong under. */
  onConnect?: (input: { site: string; token: string }) => Promise<{ error?: JiraConnectError } | void>;
  /** After the tick: the panel moves on to loading the issues. */
  onConnected?: (input: { site: string }) => void;
  onCancel?: () => void;
  /** Connected once for your account (the default): the words say so. `false` keeps the old per-space words. */
  account?: boolean;
  /** The space Jira turns on in when you connect from here. */
  spaceName?: string;
}

/** How long the Connected tick shows before the panel moves on. */
export const JP_CONNECTED_MS = 900;

/**
 * Connecting Jira with a personal access token: the Jira address, the token (hidden, with Show), where tokens are
 * made, and Connect. Jira's answer comes back right under the field it is about and clears as soon as you edit it.
 */
export function JPConnect(p: JPConnectProps) {
  const init = p.initial ?? {};
  const re = !!p.reconnect;
  const uid = useId();
  const [url, setUrl] = useState(init.site ?? (re && p.site ? p.site : ''));
  const [token, setToken] = useState(init.token ?? '');
  const [show, setShow] = useState(false);
  const [err, setErr] = useState<JiraConnectError | null>(init.error ?? null);
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState(!!init.connected);
  const working = busy || !!p.busy || ok;
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);

  function connect() {
    const u = url.trim();
    const t = token.trim();
    const bad = siteProblem(u);
    if (bad) {
      setErr({ field: 'site', message: bad });
      return;
    }
    if (!t) {
      setErr({ field: 'token', message: 'Paste your personal access token.' });
      return;
    }
    setErr(null);
    setBusy(true);
    const site = u.replace(/\/+$/, '');
    Promise.resolve(p.onConnect?.({ site, token: t })).then(
      (r) => {
        if (!live.current) return;
        setBusy(false);
        if (r && r.error) {
          setErr(r.error);
          return;
        }
        setOk(true);
        setTimeout(() => {
          if (live.current) p.onConnected?.({ site });
        }, JP_CONNECTED_MS);
      },
      (e: unknown) => {
        if (!live.current) return;
        setBusy(false);
        setErr({ field: 'token', message: (e as Error)?.message || 'Jira didn’t accept this token.' });
      },
    );
  }

  const badUrl = err?.field === 'site';
  const badTok = err?.field === 'token';
  const field = (id: string, label: string, input: ReactNode, bad: boolean, extra?: ReactNode) => (
    <div className="tp-jp-cf">
      <label className="tp-jp-cl" htmlFor={id}>
        {label}
      </label>
      <div className={cx('tp-field', bad && 'tp-bad')}>
        {input}
        {extra}
      </div>
      {bad ? (
        <div className="tp-help" id={`${id}-err`} role="alert">
          <JpIcon name="alert" size={13} width={2.2} />
          {err!.message}
        </div>
      ) : null}
    </div>
  );
  const host = siteHost(p.site ?? 'Jira');
  return (
    <form
      className={cx('tp-jp-connect', p.compact && 'tp-compact')}
      noValidate
      onSubmit={(e) => e.preventDefault()}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT') {
          e.preventDefault();
          if (!working) connect();
        }
      }}
    >
      <span className="tp-jp-bigmark" aria-hidden="true">
        <JiraMark size={26} />
      </span>
      <h3>{re ? 'Add a new token' : 'Your Jira issues, next to your day'}</h3>
      <p>
        {re
          ? `Your token for ${host} stopped working. Paste a new one; ${
              p.account !== false
                ? 'Jira comes back in every space it was on, with your views and linked tasks.'
                : 'your views and linked tasks stay as they are.'
            }`
          : p.account !== false
            ? `Connect once for your account with a personal access token. Jira turns on in ${p.spaceName || 'this space'}; turn it on in your other spaces from Settings › Apps.`
            : 'Connect with a personal access token. Tudu reads your issues and adds links; it never changes them without you.'}
      </p>
      {field(
        `${uid}-url`,
        'Jira address',
        <input
          id={`${uid}-url`}
          type="url"
          value={url}
          placeholder="https://jira.yourcompany.com"
          autoComplete="url"
          spellCheck={false}
          disabled={working}
          aria-invalid={badUrl ? 'true' : undefined}
          aria-describedby={badUrl ? `${uid}-url-err` : undefined}
          onChange={(e) => {
            setUrl(e.target.value);
            if (badUrl) setErr(null);
          }}
        />,
        badUrl,
      )}
      {field(
        `${uid}-tok`,
        'Personal access token',
        <input
          id={`${uid}-tok`}
          type={show ? 'text' : 'password'}
          value={token}
          placeholder="Paste your token"
          autoComplete="off"
          spellCheck={false}
          disabled={working}
          className="tp-jp-tokin"
          aria-invalid={badTok ? 'true' : undefined}
          aria-describedby={badTok ? `${uid}-tok-err` : `${uid}-tok-hint`}
          onChange={(e) => {
            setToken(e.target.value);
            if (badTok) setErr(null);
          }}
        />,
        badTok,
        <button
          type="button"
          className="tp-jp-show"
          aria-pressed={show ? 'true' : 'false'}
          onClick={() => setShow(!show)}
        >
          {show ? 'Hide' : 'Show'}
        </button>,
      )}
      <p className="tp-jp-fine" id={`${uid}-tok-hint`}>
        Make one in Jira under your profile → Personal access tokens. A read-only token is enough. Tudu keeps
        it encrypted on its servers and uses it only to read your issues.
      </p>
      <div className="tp-jp-cact">
        <Button
          variant="primary"
          onClick={() => {
            if (!working) connect();
          }}
          loading={(busy || !!p.busy) && !ok}
          loadingLabel="Checking…"
          success={ok}
          successLabel="Connected"
          disabled={(busy || !!p.busy) && !ok}
        >
          {re ? 'Reconnect' : 'Connect Jira'}
        </Button>
        {re && p.onCancel ? (
          <button type="button" className="tp-jp-ghost" onClick={p.onCancel}>
            Not now
          </button>
        ) : null}
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------------------------------------------

export interface JiraPanelProps {
  state?: JiraPanelState;
  issues?: JiraPanelIssue[];
  today: IsoDate;
  /** The day picker's month and dots. */
  calendar?: Pick<MiniCalendarProps, 'marks' | 'month'>;
  /** "jira.northwind.io". */
  site?: string;
  /** The address in full, "https://jira.northwind.io": a reconnect keeps it in the form. */
  siteUrl?: string;
  /** "12 min ago", "just now". */
  synced?: string | null;
  refreshing?: boolean;
  /** Assigned to me, then your saved views. */
  views?: JiraView[];
  /** The view on: a view's value, or `custom` for a JQL of your own. */
  view?: string;
  /** The JQL of a custom view (and the editor's draft when it opens). */
  jql?: string;
  /** The issue open in the preview (the address keeps it). */
  open?: string | null;
  /** The open issue in full, once read. */
  preview?: JiraPreviewIssue | null;
  previewLoading?: boolean;
  compact?: boolean;
  /** Connected once for your account (the default); `false` words the form per space. */
  account?: boolean;
  /** The space you are in: connecting here turns Jira on in it. */
  spaceName?: string;
  emptyTitle?: string;
  emptyText?: string;
  /** For the kit: start part-way through a flow. */
  initial?: {
    query?: string;
    jqlOpen?: boolean;
    jqlError?: string | null;
    saveName?: string | null;
    adding?: Record<string, AddState>;
    connect?: JPConnectProps['initial'];
  };
  onView?: (value: string) => void;
  /** Run a JQL; Jira's reason when it can't. */
  onApplyJql?: (jql: string) => Promise<{ error?: string } | void>;
  onSaveView?: (name: string, jql: string) => void;
  /** Remove a saved view (from the editor while it is open). */
  onRemoveView?: (value: string) => void;
  /** Search across all of Jira (keys and summaries); without it the box filters the view. */
  onSearch?: (q: string) => Promise<JiraPanelIssue[]>;
  /** Make a task for the issue on a day (null: the Backlog). Resolves once it is on the page. */
  onAdd?: (issue: JiraPanelIssue, day: IsoDate | null) => Promise<void> | void;
  onShowTask?: (issue: JiraPanelIssue, link: JiraPanelLink) => void;
  onOpenIssue?: (key: string | null) => void;
  onOpenInJira?: (key: string) => void;
  onRefresh?: () => void;
  onRetry?: () => void;
  onReconnect?: () => void;
  onCancelReconnect?: () => void;
  onDisconnect?: () => void;
  /** More › Turn off in {spaceName}: Jira goes from this space only; your token, views and other spaces stay. */
  onTurnOff?: () => void;
  /** More › Manage spaces…: Settings › Apps, with this space's row glowing. */
  onManage?: () => void;
  onConnect?: JPConnectProps['onConnect'];
  onConnected?: JPConnectProps['onConnected'];
  onClose?: () => void;
  /** Where the panel was opened from (Apps, while connecting): a quiet way back. */
  onBack?: () => void;
  backLabel?: string;
  className?: string;
}

/**
 * Your Jira issues next to the day. The view chip (Assigned to me, your saved views, Custom JQL), search across
 * Jira, then one plain list in Jira's order. A row's calendar button adds the issue to a day as a linked task;
 * clicking a row previews the issue inside the panel. While Jira can't be reached the last issues stay, faded,
 * under a calm banner.
 */
export function JiraPanel(p: JiraPanelProps) {
  const init = p.initial ?? {};
  const today = p.today;
  const compact = !!p.compact;
  const state = p.state ?? 'ready';
  const [query, setQuery] = useState(init.query ?? '');
  const [leaving, setLeaving] = useState<string | null>(null);
  const [jqlOpen, setJqlOpen] = useState(!!init.jqlOpen || p.view === 'custom');
  const [jqlLeaving, setJqlLeaving] = useState(false);
  const [viaCustom, setViaCustom] = useState(!!init.jqlOpen);
  const [found, setFound] = useState<{ q: string; list: JiraPanelIssue[] } | null>(null);
  const [draft, setDraft] = useState(init.jqlOpen ? (p.jql ?? '') : (p.jql ?? ''));
  const [jqlErr, setJqlErr] = useState<string | null>(init.jqlError ?? null);
  const [jqlBusy, setJqlBusy] = useState(false);
  const [saveName, setSaveName] = useState<string | null>(init.saveName !== undefined ? init.saveName : null);
  const [swapped, setSwapped] = useState(false);
  const [adding, setAdding] = useState<Record<string, AddState>>(init.adding ?? {});
  const [dpop, setDpop] = useState<{ key: string; el: HTMLElement } | null>(null);
  const [viewsOpen, setViewsOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreBox = useRef<HTMLDivElement | null>(null);
  useOutside(moreOpen, moreBox, () => setMoreOpen(false));
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);

  const issues = p.issues ?? [];
  const ql = query.trim().toLowerCase();
  // Search looks across all of Jira when the page gives onSearch; otherwise it filters the view.
  const across = !!p.onSearch && !!ql;
  const searching = across && found?.q !== query.trim();
  const onSearch = p.onSearch;
  useEffect(() => {
    const q = query.trim();
    if (!onSearch || !q) return;
    let on = true;
    const t = setTimeout(() => {
      Promise.resolve(onSearch(q)).then(
        (r) => {
          if (on) setFound({ q, list: r ?? [] });
        },
        () => {
          if (on) setFound({ q, list: [] });
        },
      );
    }, JP_SEARCH_AFTER_MS);
    return () => {
      on = false;
      clearTimeout(t);
    };
  }, [query, onSearch]);

  const byKey = new Map<string, JiraPanelIssue>(issues.map((it) => [it.key, it]));
  const list = across
    ? found?.q === query.trim()
      ? found.list.map((it) => byKey.get(it.key) ?? it)
      : []
    : issues.filter(
        (it) => !ql || it.key.toLowerCase().includes(ql) || it.summary.toLowerCase().includes(ql),
      );
  if (across) for (const it of list) if (!byKey.has(it.key)) byKey.set(it.key, it);
  if (p.preview && !byKey.has(p.preview.key)) byKey.set(p.preview.key, p.preview);

  function openJql() {
    setJqlLeaving(false);
    setJqlOpen(true);
  }
  function closeJql() {
    if (!jqlOpen) return;
    setJqlLeaving(true);
    setTimeout(() => {
      if (!live.current) return;
      setJqlOpen(false);
      setJqlLeaving(false);
    }, JQL_LEAVE_MS);
  }
  const open = p.open ?? null;
  function closePreview() {
    if (!open) return;
    setLeaving(open);
    p.onOpenIssue?.(null);
    setTimeout(
      () => {
        if (live.current) setLeaving(null);
      },
      compact ? JP_SHEET_LEAVE_MS : JP_PREVIEW_LEAVE_MS,
    );
  }
  const closeRef = useRef(closePreview);
  useEffect(() => {
    closeRef.current = closePreview;
  });
  // Esc steps back: the preview first, then the panel. Heard on the window before the panel's own Esc (the
  // drawer listens on the document), so closing the preview never closes the panel too.
  useEffect(() => {
    if (!open) return;
    function k(e: KeyboardEvent) {
      if (e.key === 'Escape' && !e.defaultPrevented) {
        e.stopPropagation();
        e.preventDefault();
        closeRef.current();
      }
    }
    window.addEventListener('keydown', k, true);
    return () => window.removeEventListener('keydown', k, true);
  }, [open]);

  function add(it: JiraPanelIssue, day: IsoDate | null) {
    const k = it.key;
    if (adding[k] === 'busy' || (it.linked ?? []).length) return;
    setAdding((a) => ({ ...a, [k]: 'busy' }));
    Promise.resolve(p.onAdd?.(it, day)).then(
      () => {
        if (!live.current) return;
        setAdding((a) => ({ ...a, [k]: 'done' }));
        setTimeout(() => {
          if (!live.current) return;
          setAdding((a) => {
            const n = { ...a };
            delete n[k];
            return n;
          });
        }, JP_FRESH_MS);
      },
      () => {
        if (!live.current) return;
        setAdding((a) => {
          const n = { ...a };
          delete n[k];
          return n;
        });
        showToast(`Couldn’t add ${k}. Try again.`);
      },
    );
  }
  const addState = (it: JiraPanelIssue) => adding[it.key] ?? null;
  const showTask = (it: JiraPanelIssue, l: JiraPanelLink) => p.onShowTask?.(it, l);
  const pick = (it: JiraPanelIssue, el: HTMLElement) =>
    setDpop((cur) => (cur && cur.key === it.key && cur.el === el ? null : { key: it.key, el }));

  function applyJql() {
    const j = draft.trim();
    if (!j) {
      setJqlErr('Write a JQL query first.');
      return;
    }
    setJqlBusy(true);
    setJqlErr(null);
    Promise.resolve(p.onApplyJql?.(j)).then(
      (res) => {
        if (!live.current) return;
        setJqlBusy(false);
        if (res && res.error) setJqlErr(res.error);
      },
      (e: unknown) => {
        if (!live.current) return;
        setJqlBusy(false);
        setJqlErr((e as Error)?.message || 'Check the query and try again.');
      },
    );
  }
  function saveView() {
    const n = (saveName ?? '').trim();
    if (!n) return;
    p.onSaveView?.(n, draft.trim());
    setSaveName(null);
    setViaCustom(false);
    closeJql();
    showToast(`Saved “${n}” to your views`);
  }

  const views = p.views ?? [];
  const cur = views.find((x) => x.value === p.view);
  const viewLabel = p.view === 'custom' || viaCustom ? 'Custom JQL' : cur ? cur.label : 'Choose a view';
  const presetSel = (
    <QAChip
      open={viewsOpen}
      onOpen={(v) => {
        if (state !== 'loading') setViewsOpen(v);
      }}
      empty={state === 'loading'}
      aria={`View: ${viewLabel}`}
      icon={<Icon name="backlog" size={14} />}
      label={viewLabel}
      pop={
        <MenuList
          label="Views"
          heading="Views"
          items={[
            ...views.map((x) => ({
              label: <span className="tp-td-mi">{x.label}</span>,
              onSelect: () => {
                setViewsOpen(false);
                setViaCustom(false);
                closeJql();
                setJqlErr(null);
                setSaveName(null);
                p.onView?.(x.value);
              },
            })),
            {
              label: <span className="tp-td-mi">Custom JQL…</span>,
              onSelect: () => {
                setViewsOpen(false);
                setViaCustom(true);
                openJql();
                setDraft(p.jql || cur?.jql || '');
                setJqlErr(null);
              },
            },
          ]}
        />
      }
    />
  );
  const jqlRows = Math.min(5, Math.max(2, draft.split('\n').length, Math.ceil(draft.length / 44)));
  // The view being edited is one of yours: it can be removed from here.
  const removable = cur?.saved && viaCustom && p.view !== 'custom' ? cur : null;
  const jqlBox = jqlOpen ? (
    <div className={cx('tp-jp-jqlw', jqlLeaving && 'tp-leaving')}>
      <div className="tp-jp-jqlin">
        <div className={cx('tp-jp-jql', jqlErr && 'tp-bad')}>
          <label className="tp-jp-jqlf">
            <span className="tp-jp-jqltag" aria-hidden="true">
              JQL
            </span>
            <textarea
              className="tp-jp-jqlt"
              rows={jqlRows}
              spellCheck={false}
              value={draft}
              placeholder="assignee = currentUser() AND status != Done"
              aria-label="Custom JQL"
              aria-invalid={jqlErr ? 'true' : undefined}
              aria-describedby={jqlErr ? 'tp-jp-jqle' : undefined}
              onChange={(e) => {
                setDraft(e.target.value);
                if (jqlErr) setJqlErr(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  applyJql();
                }
              }}
            />
          </label>
          {jqlErr ? (
            <div className="tp-jp-jqle" id="tp-jp-jqle" role="alert">
              <JpIcon name="alert" size={13} width={2.2} />
              <span>Jira couldn’t run this. {jqlErr}</span>
            </div>
          ) : null}
          {saveName !== null ? (
            <div key="name" className="tp-jp-jqla tp-jp-swap tp-jp-naming">
              <input
                className="tp-jp-name"
                autoFocus
                value={saveName}
                placeholder="Name this view"
                aria-label="View name"
                onChange={(e) => setSaveName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveView();
                  if (e.key === 'Escape') {
                    e.stopPropagation();
                    setSaveName(null);
                  }
                }}
              />
              <button type="button" className="tp-jp-ghost" onClick={() => setSaveName(null)}>
                Cancel
              </button>
              <Button variant="secondary" size="sm" disabled={!saveName.trim()} onClick={saveView}>
                Save view
              </Button>
            </div>
          ) : (
            <div key="acts" className={cx('tp-jp-jqla', swapped && 'tp-jp-swap')}>
              {p.view === 'custom' && draft.trim() && !jqlErr ? (
                <div className="tp-qa-chipw">
                  <button
                    type="button"
                    className="tp-qa-chip"
                    onClick={() => {
                      setSwapped(true);
                      setSaveName('');
                    }}
                  >
                    <Icon name="plus" size={13} />
                    <span>Save as a view</span>
                  </button>
                </div>
              ) : null}
              {removable ? (
                <button
                  type="button"
                  className="tp-jp-ghost"
                  onClick={() => {
                    setViaCustom(false);
                    closeJql();
                    p.onRemoveView?.(removable.value);
                  }}
                >
                  Remove view
                </button>
              ) : null}
              <span className="tp-jp-sp" />
              <button
                type="button"
                className="tp-jp-ghost"
                onClick={() => {
                  setViaCustom(false);
                  closeJql();
                  setJqlErr(null);
                }}
              >
                Cancel
              </button>
              <Button
                variant="secondary"
                size="sm"
                loading={jqlBusy}
                loadingLabel="Running"
                onClick={applyJql}
              >
                Run
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  ) : null;

  const search = (
    <label className="tp-jp-search">
      {searching ? SPIN : <Icon name="search" size={15} />}
      <input
        value={query}
        placeholder={p.onSearch ? 'Search issues across Jira' : 'Search issues'}
        aria-label={p.onSearch ? 'Search issues across Jira' : 'Search Jira issues'}
        disabled={state === 'loading'}
        onChange={(e) => setQuery(e.target.value)}
      />
      {query ? (
        <button type="button" aria-label="Clear search" onClick={() => setQuery('')}>
          <Icon name="x" size={13} />
        </button>
      ) : null}
    </label>
  );

  const refreshing = !!p.refreshing;
  const asking = state === 'connect' || state === 'connecting' || state === 'reconnect';
  const backBtn = p.onBack ? (
    <button type="button" className="tp-jp-back" onClick={p.onBack}>
      <JpIcon name="back" />
      {p.backLabel ?? 'Back'}
    </button>
  ) : null;
  const backRow = backBtn && !asking ? <div className="tp-jp-backrow">{backBtn}</div> : null;
  const closeBtn = p.onClose ? (
    <IconButton label="Close Jira" tipSide="bottom-end" onClick={p.onClose}>
      <Icon name="x" size={16} />
    </IconButton>
  ) : null;
  const top = asking ? (
    <div className="tp-jp-top tp-jp-top-min">
      {backBtn ?? <span />}
      {closeBtn}
    </div>
  ) : (
    <div className={cx('tp-jp-top', backRow && 'tp-has-back')}>
      <span className="tp-jp-mark" aria-hidden="true">
        <JiraMark size={16} />
      </span>
      <div className="tp-jp-ttl">
        <h2>Jira</h2>
        <span className="tp-jp-sync" aria-live="polite">
          {refreshing
            ? 'Syncing…'
            : (p.site ? `${p.site}${p.synced ? ' · ' : ''}` : '') + (p.synced ? `Synced ${p.synced}` : '')}
        </span>
      </div>
      <IconButton
        label={refreshing ? 'Syncing' : 'Refresh'}
        tipSide="bottom"
        className={cx('tp-jp-refresh', refreshing && 'tp-spinning')}
        onClick={() => {
          if (!refreshing) p.onRefresh?.();
        }}
      >
        <Icon name="refresh" size={16} />
      </IconButton>
      {p.onDisconnect ? (
        <div className="tp-jp-morew" ref={moreBox}>
          <IconButton label="More" tipSide="bottom" onClick={() => setMoreOpen(!moreOpen)}>
            <Icon name="more" size={16} />
          </IconButton>
          <Linger open={moreOpen} className="tp-jp-morepop">
            {/* Turn off here hides Jira in this space only; Disconnect is the account-wide one, so it reads red. */}
            <MenuList
              label="More"
              items={[
                {
                  label: p.spaceName ? `Turn off in ${p.spaceName}` : 'Turn off in this space',
                  onSelect: () => {
                    setMoreOpen(false);
                    p.onTurnOff?.();
                  },
                },
                {
                  label: 'Manage spaces…',
                  onSelect: () => {
                    setMoreOpen(false);
                    p.onManage?.();
                  },
                },
                {
                  label: 'Disconnect Jira',
                  danger: true,
                  onSelect: () => {
                    setMoreOpen(false);
                    p.onDisconnect?.();
                  },
                },
              ]}
            />
          </Linger>
        </div>
      ) : null}
      {closeBtn}
    </div>
  );

  let body: ReactNode;
  if (asking) {
    body = (
      <JPConnect
        busy={state === 'connecting'}
        initial={init.connect}
        onConnect={p.onConnect}
        onConnected={p.onConnected}
        onCancel={p.onCancelReconnect}
        reconnect={state === 'reconnect'}
        site={p.siteUrl ?? p.site}
        compact={compact}
        account={p.account}
        spaceName={p.spaceName}
      />
    );
  } else if (state === 'loading') {
    const w1 = [78, 62, 88, 54, 70, 66];
    const w2 = [36, 44, 30, 40, 34, 46];
    body = (
      <div className="tp-jp-list" aria-busy="true" aria-label="Loading Jira issues">
        {w1.map((w, i) => (
          <div key={i} className="tp-jp-row tp-skl-jp">
            <div className="tp-jp-main">
              <Skeleton width={`${w}%`} height={12} />
              <div style={{ height: 8 }} />
              <Skeleton width={`${w2[i]}%`} height={8} />
            </div>
            <span className="tp-skel" style={{ width: 30, height: 30, borderRadius: 8 }} />
          </div>
        ))}
      </div>
    );
  } else if (state === 'error' && !issues.length) {
    body = (
      <EmptyState
        tone="error"
        title="Couldn’t reach Jira"
        action="Try again"
        loading={refreshing}
        loadingLabel="Trying…"
        onAction={p.onRetry}
      >
        Your issues will be back as soon as Jira answers. Your day isn’t affected.
      </EmptyState>
    );
  } else {
    const from = `Showing issues from ${p.synced ?? 'earlier'}.`;
    const banner =
      state === 'error' ? (
        <Banner
          tone="warning"
          title="Couldn’t refresh."
          action={refreshing ? 'Trying…' : 'Try again'}
          onAction={p.onRetry}
        >
          {from}
        </Banner>
      ) : state === 'expired' ? (
        <Banner
          tone="warning"
          title="Your Jira token has expired."
          action="Add a new token"
          onAction={p.onReconnect}
        >
          {from}
        </Banner>
      ) : state === 'offline' ? (
        <Banner tone="info" title="You’re offline.">
          {from} Linked tasks you add now sync when you’re back.
        </Banner>
      ) : null;
    const empty = !list.length ? (
      ql ? (
        across && searching ? null : (
          <div className="tp-jp-empty">
            <p className="tp-jp-et">
              {across ? 'No issues in Jira match “' : 'No issues match “'}
              {query.trim()}”.
            </p>
            <p>
              {across
                ? 'Search looks at keys and summaries across all of Jira.'
                : 'Search looks at keys and summaries in this view.'}
            </p>
            <button type="button" className="tp-jp-q tp-strong" onClick={() => setQuery('')}>
              Clear search
            </button>
          </div>
        )
      ) : (
        <div className="tp-jp-empty">
          <p className="tp-jp-et">{p.emptyTitle ?? 'Nothing here right now.'}</p>
          <p>{p.emptyText ?? 'Try another view, or write your own JQL.'}</p>
        </div>
      )
    ) : null;
    body = (
      <div
        className={cx(
          'tp-jp-list',
          (state === 'expired' || state === 'offline' || state === 'error') && 'tp-stale',
        )}
      >
        {banner ? <div className="tp-jp-banner">{banner}</div> : null}
        {across && list.length ? (
          <div className="tp-jp-scope">
            {list.length} {list.length === 1 ? 'issue' : 'issues'} across Jira
          </div>
        ) : null}
        {empty}
        {list.length ? (
          // One plain list in the order the JQL returns. No grouping or type icons: every Jira is set up differently,
          // so the panel only shows what every Jira has (key, summary, status name, due date).
          <div className="tp-jp-items" role="list" aria-label="Issues">
            {list.map((it) => {
              const ts = addState(it);
              const link = (it.linked ?? [])[0];
              const gone = !!link && ts !== 'busy';
              return (
                <div
                  key={it.key}
                  className={cx('tp-jp-row', open === it.key && 'tp-sel')}
                  role="button"
                  tabIndex={0}
                  aria-label={`${it.key}: ${it.summary}. Open preview`}
                  onClick={(e) => {
                    if ((e.target as HTMLElement).closest('button')) return;
                    p.onOpenIssue?.(it.key);
                  }}
                  onKeyDown={(e) => {
                    if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) {
                      e.preventDefault();
                      p.onOpenIssue?.(it.key);
                    }
                  }}
                >
                  <div className="tp-jp-main">
                    <span className="tp-jp-sum">{it.summary}</span>
                    <div className="tp-jp-by">
                      {byline(
                        it,
                        today,
                        gone ? (
                          <JPLinked
                            link={link}
                            today={today}
                            fresh={ts === 'done'}
                            onShow={(l) => showTask(it, l)}
                          />
                        ) : null,
                      )}
                    </div>
                  </div>
                  {/* One quiet button: add to a day. It keeps its slot once the issue has its task, so nothing reflows. */}
                  <div className="tp-jp-acts">
                    <button
                      type="button"
                      className={cx(
                        'tp-jp-cal',
                        dpop?.key === it.key && 'tp-on',
                        ts === 'busy' && 'tp-busy',
                        gone && 'tp-gone',
                      )}
                      disabled={ts === 'busy'}
                      tabIndex={gone ? -1 : 0}
                      aria-hidden={gone ? 'true' : undefined}
                      aria-label={ts === 'busy' ? `Adding ${it.key}` : `Add ${it.key} to a day`}
                      title="Add to a day"
                      aria-haspopup="dialog"
                      aria-expanded={dpop?.key === it.key ? 'true' : 'false'}
                      onClick={(e) => {
                        e.stopPropagation();
                        pick(it, e.currentTarget);
                      }}
                    >
                      {ts === 'busy' ? SPIN : <JpIcon name="day" />}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}
      </div>
    );
  }

  const tmr = addDays(today, 1);
  const dit = dpop ? byKey.get(dpop.key) : undefined;
  const dayPop =
    dpop && dit && !(dit.linked ?? []).length ? (
      <DatePop
        anchor={dpop.el}
        onClose={() => setDpop(null)}
        heading={`Add ${dit.key} to a day as a linked task`}
      >
        <MiniCalendar
          {...p.calendar}
          today={today}
          presets={[
            { label: 'Today', on: false, value: today },
            { label: 'Tomorrow', on: false, value: tmr },
            { label: 'Backlog', on: false, value: null },
          ]}
          onPreset={(v) => {
            setDpop(null);
            add(dit, v);
          }}
          onPick={(v) => {
            setDpop(null);
            add(dit, v);
          }}
          hint={(k) => ({ text: `Add to ${linkDayLong(k, today)}`, tone: k === today ? 'today' : '' })}
          hintEmpty="Pick a day for the linked task"
        />
      </DatePop>
    ) : null;

  const shownKey = open ?? leaving;
  const base = shownKey ? byKey.get(shownKey) : undefined;
  const pv: JiraPreviewIssue | null = shownKey
    ? {
        ...(base ?? { key: shownKey, summary: '' }),
        ...(p.preview?.key === shownKey ? p.preview : {}),
        linked: base?.linked ?? (p.preview?.key === shownKey ? p.preview.linked : undefined),
      }
    : null;
  const preview = pv ? (
    <div className={cx('tp-jp-pvwrap', !open && 'tp-leaving', compact && 'tp-sheetmode')}>
      {compact ? <div className="tp-jp-veil" aria-hidden="true" onClick={closePreview} /> : null}
      <JiraPreview
        key={pv.key}
        issue={pv}
        today={today}
        compact={compact}
        loading={!!p.previewLoading && p.preview?.key !== pv.key}
        addState={addState(pv)}
        onBack={closePreview}
        onOpenInJira={p.onOpenInJira}
        onShowTask={(l) => showTask(pv, l)}
        onPick={(el) => pick(pv, el)}
      />
    </div>
  ) : null;

  return (
    <section className={cx('tp-root tp-jp', compact && 'tp-compact', p.className)} aria-label="Jira">
      {backRow}
      {top}
      {!asking ? (
        <div className="tp-jp-filters">
          <div className="tp-jp-frow">
            {presetSel}
            {search}
          </div>
          {jqlBox}
        </div>
      ) : null}
      <div className="tp-jp-body">{body}</div>
      {preview}
      {dayPop}
    </section>
  );
}

/** The date words in a preview's Updated fact: "Fri 16 Oct". */
export function updatedWords(at: string | null): string | null {
  if (!at) return null;
  const d = new Date(at);
  const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return formatDay(iso);
}
