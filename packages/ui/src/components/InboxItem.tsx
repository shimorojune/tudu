import { addDays, formatDay, type IsoDate } from '@tudu/core';
import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react';
import { cx } from '../lib/cx';
import { Icon } from '../lib/icons';
import { Logo } from './Logo';
import { closeRow } from '../lib/motion';
import { Button } from './Button';
import { IconButton } from './IconButton';
import { DatePop } from './DatePop';
import { MiniCalendar, type MiniCalendarProps } from './MiniCalendar';
import { RichTextContent } from './RichTextEditor';

export interface InboxWho {
  id?: string;
  name: string;
  initials: string;
  color?: string | null;
}

export interface InboxTaskFacts {
  key?: string;
  title: string;
  /** "Tue 20 Oct": the day the sender asked for. */
  forLabel?: string | null;
  forIso?: IsoDate | null;
  due?: { label: string; overdue?: boolean } | null;
  project?: { name: string; color: string } | null;
  /** The sender's note, plain words. */
  note?: string | null;
  /** "Today", "Backlog": where the task lives (an update). */
  where?: string | null;
}

export type InboxOutcome =
  { status: 'accepted'; label: string } | { status: 'declined'; reason: string | null };

export type SentStatus =
  | { state: 'waiting'; seen?: string | null }
  | { state: 'accepted'; label: string }
  | { state: 'declined'; reason: string | null };

/** One thing in the Inbox, as the item shows it. */
export interface InboxEntry {
  id: string;
  /**
   * `app`: a new version of the macOS app, downloaded and ready (its name in `who`, Tudu when left out). `invite`: an
   * invite to a space (`task.title` is the space). `notice`: a space went away for you (`task.title` is the space,
   * `text` what happened, `who` who did it when known).
   */
  kind: 'request' | 'comment' | 'answer' | 'sent' | 'app' | 'invite' | 'notice';
  who?: InboxWho;
  /** The picture on the row when it isn't `who`'s: a notice shows its space's initials. */
  mark?: InboxWho;
  /** The space it is about, first on the byline: "Northwind · Today". */
  space?: string | null;
  /** For a sent one: who it went to. */
  to?: InboxWho;
  /** "Thu 10:12", "Just now". */
  when: string;
  unread?: boolean;
  /** An update's line: "commented on", "accepted your task onto Fri 16 Oct", "is ready: version 0.38.0". */
  text?: string;
  /** A comment's words, or a new version's notes (HTML). */
  quote?: string;
  task: InboxTaskFacts;
  outcome?: InboxOutcome | null;
  status?: SentStatus | null;
}

export type InboxItemMode = 'list' | 'full' | 'fold';

export interface InboxItemProps {
  item: InboxEntry;
  /** `list` a compact line for a two-pane list; `full` the reading pane; `fold` unfolds in place. */
  mode?: InboxItemMode;
  selected?: boolean;
  open?: boolean;
  calendar?: Pick<MiniCalendarProps, 'marks' | 'month'> & { today: IsoDate };
  onAccept?: (item: InboxEntry, day: IsoDate | null) => void;
  onDecline?: (item: InboxEntry, reason: string) => void;
  onOpen?: (item: InboxEntry) => void;
  onSelect?: (item: InboxEntry) => void;
  onToggle?: (item: InboxEntry, open: boolean) => void;
  onReply?: (item: InboxEntry, text: string) => void;
  onWithdraw?: (item: InboxEntry) => void;
  onTakeBack?: (item: InboxEntry, day: IsoDate | null) => void;
  onPerson?: (who: InboxWho) => void;
  /** A new version: Restart to update. While it runs the button says Restarting…; a promise that fails frees it. */
  onUpdate?: (item: InboxEntry) => void | Promise<unknown>;
  /** An invite: Join. While it runs the button says Joining…; a promise that fails frees it. */
  onJoin?: (item: InboxEntry) => void | Promise<unknown>;
  /** An invite: Not now, which puts it away. */
  onNotNow?: (item: InboxEntry) => void;
  /** On hover (list rows): Mark as read or unread. */
  onToggleRead?: (item: InboxEntry) => void;
  /** On hover (list rows), and by swiping left on phones: Delete. Never offered on a request still to answer. */
  onDelete?: (item: InboxEntry) => void;
  /** Phones: a list row swipes left to delete. */
  swipe?: boolean;
  /** On a person's own page the line reads "You sent this". */
  hideTo?: boolean;
  /** Phones: the back control at the top of the pane. */
  onBack?: () => void;
  backLabel?: string;
  /** Where attachment chips in a comment link. */
  fileBase?: string;
  initial?: { declining?: boolean; reason?: string; reply?: string; updating?: boolean };
  className?: string;
}

function first(name: string | undefined): string {
  return (name || 'Someone').trim().split(/\s+/)[0]!;
}

const tick = (
  <svg
    width={11}
    height={11}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={3}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M5 12.4 9.8 17.2 19.2 6.8" />
  </svg>
);
const dayIcon = (
  <svg
    width={14}
    height={14}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <rect x={3} y={4} width={18} height={18} rx={2} />
    <path d="M16 2v4M8 2v4M3 10h18" />
  </svg>
);

function Who({ who, size, app }: { who: InboxWho | undefined; size: number; app?: boolean }) {
  if (app)
    return (
      <span className="tp-ix-av tp-ix-av-app" aria-hidden="true" style={{ width: size, height: size }}>
        <Logo size={Math.round(size * 0.62)} />
      </span>
    );
  return (
    <span
      className="tp-ix-av"
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        background: who?.color || undefined,
        fontSize: Math.round(size * 0.38),
      }}
    >
      {who?.initials || '?'}
    </span>
  );
}

/**
 * One thing in the Inbox: a request (a task someone sent you), a comment on your task, an answer to a request you
 * sent, or a request you sent (Sent). The line reads like a sentence with the time in quiet mono and an ink dot while
 * it is new. Accept opens the day picker with the asked day preselected; Decline asks for a reason the sender sees.
 */
export function InboxItem(p: InboxItemProps) {
  const it = p.item;
  const mode = p.mode ?? 'list';
  const req = it.kind === 'request';
  const sent = it.kind === 'sent';
  const app = it.kind === 'app';
  const invite = it.kind === 'invite';
  const notice = it.kind === 'notice';
  const t = it.task;
  const full = mode === 'full';
  const fold = mode === 'fold';
  const list = mode === 'list';
  const open = full || (fold && !!p.open);
  const [pop, setPop] = useState<HTMLElement | null>(null);
  const [tbPop, setTbPop] = useState<HTMLElement | null>(null);
  const [declining, setDeclining] = useState(!!p.initial?.declining);
  const [reason, setReason] = useState(p.initial?.reason ?? '');
  const [reply, setReply] = useState(p.initial?.reply ?? '');
  const [updating, setUpdating] = useState(!!p.initial?.updating);
  const [joining, setJoining] = useState(false);
  const [drag, setDrag] = useState(0);
  const swipeFrom = useRef<{ x: number; y: number; on: boolean } | null>(null);
  const el = useRef<HTMLElement | null>(null);
  const area = useRef<HTMLTextAreaElement | null>(null);
  useEffect(() => {
    if (declining) area.current?.focus({ preventScroll: true });
  }, [declining]);
  // A new item in the same place (the reading pane) starts fresh.
  const [seen, setSeen] = useState(it.id);
  if (seen !== it.id) {
    setSeen(it.id);
    setDeclining(false);
    setReason('');
    setReply('');
    setPop(null);
    setTbPop(null);
    setUpdating(false);
    setJoining(false);
    setDrag(0);
  }
  const cal = p.calendar;
  const today = cal?.today ?? '';
  const tmr = today ? addDays(today, 1) : '';

  // Answering a request: the row folds away as it is handed over (the reading pane moves on by itself).
  const leave = (fn: () => void) => {
    if (full || !el.current) fn();
    else closeRow(el.current, fn);
  };
  const accept = (v: IsoDate | null) => {
    setPop(null);
    leave(() => p.onAccept?.(it, v));
  };
  const decline = () => {
    const r = reason.trim();
    if (!r) return;
    leave(() => p.onDecline?.(it, r));
  };

  const name = app
    ? (it.who?.name ?? 'Tudu')
    : invite || notice
      ? it.who
        ? first(it.who.name)
        : ''
      : first(sent ? it.to?.name : it.who?.name);
  const oc = it.outcome ?? null;
  const ss = sent ? (it.status ?? { state: 'waiting' as const }) : null;

  const line: ReactNode = sent ? (
    p.hideTo ? (
      'You sent this'
    ) : (
      <>
        You sent <b>{name}</b> a task
      </>
    )
  ) : req ? (
    <>
      <b>{name}</b> sent you a task
    </>
  ) : invite ? (
    <>
      {name ? (
        <>
          <b>{name}</b> invited you to
        </>
      ) : (
        'You’re invited to'
      )}{' '}
      <b className="tp-ix-tt">{t.title}</b>
    </>
  ) : notice && !name ? (
    <>
      <b className="tp-ix-tt">{t.title}</b> {it.text ?? 'is gone'}
    </>
  ) : (
    <>
      <b>{name}</b> {it.text ?? 'updated'}
      {t.title ? (
        <>
          {' '}
          <b className="tp-ix-tt">{t.title}</b>
        </>
      ) : null}
    </>
  );

  const by: ReactNode[] = [];
  if (it.space) by.push(<span key="s">{it.space}</span>);
  if (req && t.forLabel) by.push(<span key="f">For {t.forLabel}</span>);
  if (sent) by.push(<span key="f">{t.forLabel ? `Asked for ${t.forLabel}` : 'No day asked'}</span>);
  if (t.due)
    by.push(
      <span key="d" className={t.due.overdue ? 'tp-od' : undefined}>
        Due {t.due.label}
      </span>,
    );
  if (t.project)
    by.push(
      <span key="p" className="tp-ix-proj">
        <i className="tp-sh-dot" style={{ background: t.project.color }} />
        {t.project.name}
      </span>,
    );
  if (!req && !sent && t.where) by.push(<span key="w">{t.where}</span>);

  let ocLine: ReactNode = null;
  if (oc && !sent)
    ocLine = (
      <span className={cx('tp-ix-oc', oc.status === 'declined' && 'tp-dec')}>
        <span className="tp-ix-ocd" aria-hidden="true">
          {oc.status === 'declined' ? <Icon name="x" size={11} /> : tick}
        </span>
        <span className="tp-ix-oct">
          {oc.status === 'declined' ? (
            <>You declined{oc.reason ? <span className="tp-ix-ocr">: {oc.reason}</span> : null}</>
          ) : (
            <>
              You accepted it onto <b>{oc.label}</b>
            </>
          )}
        </span>
      </span>
    );
  if (ss)
    ocLine = (
      <span
        className={cx('tp-ix-oc', ss.state === 'declined' && 'tp-dec', ss.state === 'waiting' && 'tp-wait')}
      >
        <span className="tp-ix-ocd" aria-hidden="true">
          {ss.state === 'declined' ? (
            <Icon name="x" size={11} />
          ) : ss.state === 'waiting' ? (
            <Icon name="clock" size={11} />
          ) : (
            tick
          )}
        </span>
        <span className="tp-ix-oct">
          {ss.state === 'declined' ? (
            <>
              {name} declined{ss.reason ? <span className="tp-ix-ocr">: {ss.reason}</span> : null}
            </>
          ) : ss.state === 'accepted' ? (
            <>
              {name} accepted it onto <b>{ss.label}</b>
            </>
          ) : (
            `Waiting for ${name}${ss.seen ? ` · seen ${ss.seen}` : ''}`
          )}
        </span>
      </span>
    );

  const acceptBtn = (
    <Button
      variant="secondary"
      size="sm"
      icon={dayIcon}
      className={cx('tp-ix-accept', pop && 'tp-on')}
      onClick={(e) => {
        const a = e.currentTarget;
        setPop((c) => (c ? null : a));
      }}
    >
      Accept
    </Button>
  );
  const datePop =
    pop && cal ? (
      <DatePop
        anchor={pop}
        onClose={() => setPop(null)}
        heading="Accept it onto…"
        align={full ? 'end' : undefined}
      >
        <MiniCalendar
          marks={cal.marks ?? {}}
          month={(t.forIso ?? today).slice(0, 7)}
          today={today}
          selected={t.forIso ?? undefined}
          presets={[
            { label: 'Today', on: t.forIso === today, value: today },
            { label: 'Tomorrow', on: t.forIso === tmr, value: tmr },
            { label: 'Backlog', on: false, value: null },
          ]}
          onPreset={accept}
          onPick={accept}
          hint={(k) => ({
            text: `Accept onto ${k === today ? 'today' : k === tmr ? 'tomorrow' : formatDay(k)}`,
            tone: k === today ? 'today' : '',
          })}
          hintEmpty={t.forLabel ? `${first(it.who?.name)} asked for ${t.forLabel}` : 'Pick a day for it'}
        />
      </DatePop>
    ) : null;

  const declineBox = (
    <div className="tp-ix-decline">
      <textarea
        ref={area}
        rows={2}
        value={reason}
        placeholder={`Why? ${first(it.who?.name)} will see this.`}
        aria-label="Reason for declining"
        onChange={(e) => setReason(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation();
            setDeclining(false);
          }
        }}
      />
      <div className="tp-ix-decline-b">
        <Button
          variant="quiet"
          size="sm"
          onClick={() => {
            setDeclining(false);
            setReason('');
          }}
        >
          Cancel
        </Button>
        <Button variant="primary" size="sm" disabled={!reason.trim()} onClick={decline}>
          Send
        </Button>
      </div>
    </div>
  );
  const actions =
    req && open && !oc ? (
      <div className="tp-ix-acts">
        {declining ? (
          declineBox
        ) : full ? (
          <>
            <Button variant="quiet" size="sm" onClick={() => setDeclining(true)}>
              Decline
            </Button>
            <span>{acceptBtn}</span>
          </>
        ) : (
          <>
            {acceptBtn}
            <Button variant="quiet" size="sm" onClick={() => setDeclining(true)}>
              Decline
            </Button>
          </>
        )}
      </div>
    ) : null;

  const canReply = full && it.kind === 'comment' && !!p.onReply;
  // A new version: Restart to update (it is already downloaded), with What's new beside it.
  const update = () => {
    if (updating) return;
    setUpdating(true);
    const r = p.onUpdate?.(it);
    if (r && typeof (r as Promise<unknown>).then === 'function')
      (r as Promise<unknown>).catch(() => setUpdating(false));
  };
  const appActs =
    app && full ? (
      <div className="tp-ix-acts">
        <Button variant="quiet" size="sm" onClick={() => p.onOpen?.(it)}>
          What’s new
        </Button>
        <Button variant="primary" size="sm" loading={updating} loadingLabel="Restarting…" onClick={update}>
          Restart to update
        </Button>
      </div>
    ) : null;
  const join = () => {
    if (joining) return;
    setJoining(true);
    const r = p.onJoin?.(it);
    if (r && typeof (r as Promise<unknown>).then === 'function')
      (r as Promise<unknown>).catch(() => setJoining(false));
  };
  const inviteActs =
    invite && (full || (fold && open)) ? (
      <div className="tp-ix-acts">
        <Button variant="quiet" size="sm" onClick={() => leave(() => p.onNotNow?.(it))}>
          Not now
        </Button>
        <Button variant="primary" size="sm" loading={joining} loadingLabel="Joining…" onClick={join}>
          Join {t.title}
        </Button>
      </div>
    ) : null;
  const noticeActs =
    notice && (full || (fold && open)) && p.onDelete ? (
      <div className="tp-ix-acts">
        <Button
          variant="secondary"
          size="sm"
          icon={<Icon name="trash" size={14} />}
          onClick={() => leave(() => p.onDelete?.(it))}
        >
          Delete
        </Button>
      </div>
    ) : null;
  const ocActs =
    req && oc && (full || (fold && open)) && oc.status === 'accepted' ? (
      <div className="tp-ix-acts">
        <Button variant="secondary" size="sm" onClick={() => p.onOpen?.(it)}>
          Open task
        </Button>
      </div>
    ) : null;
  const sentActs =
    sent && ss && (full || (fold && open)) ? (
      <div className="tp-ix-acts">
        {ss.state === 'waiting' || ss.state === 'declined' ? (
          <Button variant="quiet" size="sm" onClick={() => leave(() => p.onWithdraw?.(it))}>
            Take it back
          </Button>
        ) : null}
        {ss.state === 'declined' || ss.state === 'waiting' ? (
          <Button
            variant="secondary"
            size="sm"
            icon={dayIcon}
            className={tbPop ? 'tp-on' : undefined}
            onClick={(e) => {
              const a = e.currentTarget;
              setTbPop((c) => (c ? null : a));
            }}
          >
            Do it myself
          </Button>
        ) : null}
        {ss.state === 'accepted' && p.onPerson && it.to ? (
          <Button variant="quiet" size="sm" onClick={() => p.onPerson!(it.to!)}>
            See {name}’s week
          </Button>
        ) : null}
        {ss.state === 'accepted' && p.onOpen ? (
          <Button variant="secondary" size="sm" onClick={() => p.onOpen!(it)}>
            Open task
          </Button>
        ) : null}
      </div>
    ) : null;
  const tbCal =
    tbPop && cal ? (
      <DatePop
        anchor={tbPop}
        onClose={() => setTbPop(null)}
        heading="Put it on your list"
        align={full ? 'end' : undefined}
      >
        <MiniCalendar
          marks={cal.marks ?? {}}
          today={today}
          presets={[
            { label: 'Today', on: false, value: today },
            { label: 'Tomorrow', on: false, value: tmr },
            { label: 'Backlog', on: false, value: null },
          ]}
          onPreset={(v) => {
            setTbPop(null);
            leave(() => p.onTakeBack?.(it, v));
          }}
          onPick={(v) => {
            setTbPop(null);
            leave(() => p.onTakeBack?.(it, v));
          }}
        />
      </DatePop>
    ) : null;
  const updActs =
    sentActs ??
    inviteActs ??
    noticeActs ??
    appActs ??
    ocActs ??
    (!req && !sent && (full || (fold && open)) ? (
      <div className="tp-ix-upd">
        {canReply ? (
          <div className="tp-ix-reply">
            <textarea
              rows={2}
              value={reply}
              placeholder={`Reply to ${name}…`}
              aria-label={`Reply to ${name}`}
              onChange={(e) => setReply(e.target.value)}
            />
          </div>
        ) : null}
        <div className="tp-ix-acts">
          <Button variant={canReply ? 'quiet' : 'secondary'} size="sm" onClick={() => p.onOpen?.(it)}>
            {app ? 'See what’s new' : 'Open task'}
          </Button>
          {canReply ? (
            <Button
              variant="primary"
              size="sm"
              disabled={!reply.trim()}
              onClick={() => {
                const r = reply.trim();
                if (!r) return;
                setReply('');
                p.onReply?.(it, r);
              }}
            >
              Reply
            </Button>
          ) : null}
        </div>
      </div>
    ) : null);

  const clickable = list || fold;
  const onHead = () => {
    if (list) p.onSelect?.(it);
    else if (fold) p.onToggle?.(it, !p.open);
  };
  const headInner = (
    <>
      <Who who={it.mark ?? (sent ? it.to : it.who)} size={full ? 26 : 28} app={app} />
      <span className="tp-ix-main">
        <span className="tp-ix-line">
          <span className="tp-ix-text">{line}</span>
          <span className="tp-ix-when">{it.when}</span>
        </span>
        {req || sent ? <span className="tp-ix-title">{t.title}</span> : null}
        {!req && !sent && it.quote ? (
          <span className={cx('tp-ix-quote', (open || full) && 'tp-open')}>
            {open || full ? (
              <RichTextContent html={it.quote} fileBase={p.fileBase} />
            ) : (
              it.quote.replace(/<[^>]+>/g, ' ')
            )}
          </span>
        ) : null}
        {by.length ? <span className="tp-ix-by">{by}</span> : null}
        {ocLine}
      </span>
      {it.unread && !full ? <span className="tp-ix-dot" aria-label="New" /> : null}
    </>
  );
  const head = clickable ? (
    <button
      type="button"
      className="tp-ix-head"
      onClick={onHead}
      aria-expanded={fold ? (open ? 'true' : 'false') : undefined}
    >
      {headInner}
    </button>
  ) : (
    <div className="tp-ix-head">{headInner}</div>
  );
  const more =
    fold || full ? (
      <div className={cx('tp-ix-more', open && 'tp-on')} inert={!open}>
        <div>
          {(req || sent) && t.note ? <p className="tp-ix-note">{t.note}</p> : null}
          {actions ?? updActs}
        </div>
      </div>
    ) : (
      actions
    );
  // Row actions on hover: read or unread, and Delete (not while a request waits for its answer).
  const deletable = !!p.onDelete && !(req && !oc);
  const racts =
    list && (p.onToggleRead || deletable) ? (
      <span className="tp-ix-racts">
        {p.onToggleRead ? (
          <IconButton
            label={it.unread ? 'Mark as read' : 'Mark as unread'}
            tipSide="bottom"
            onClick={() => p.onToggleRead?.(it)}
          >
            <Icon name={it.unread ? 'read' : 'unread'} />
          </IconButton>
        ) : null}
        {deletable ? (
          <IconButton label="Delete" tipSide="bottom" onClick={() => leave(() => p.onDelete?.(it))}>
            <Icon name="trash" />
          </IconButton>
        ) : null}
      </span>
    ) : null;
  // Phones: swipe a row left; past 40% of its width it is deleted, short of that it springs back.
  const canSwipe = list && !!p.swipe && deletable;
  const swipeHandlers = canSwipe
    ? {
        onPointerDown: (e: PointerEvent) => {
          if (e.pointerType === 'mouse') return;
          swipeFrom.current = { x: e.clientX, y: e.clientY, on: false };
        },
        onPointerMove: (e: PointerEvent) => {
          const f = swipeFrom.current;
          if (!f) return;
          const dx = e.clientX - f.x;
          if (!f.on) {
            if (Math.abs(e.clientY - f.y) > 10) {
              swipeFrom.current = null;
              return;
            }
            if (dx > -10) return;
            f.on = true;
          }
          setDrag(Math.min(0, dx));
        },
        onPointerUp: () => {
          const f = swipeFrom.current;
          swipeFrom.current = null;
          if (!f?.on) return;
          const w = el.current?.offsetWidth ?? 1;
          if (-drag > w * 0.4) leave(() => p.onDelete?.(it));
          else setDrag(0);
        },
        onPointerCancel: () => {
          swipeFrom.current = null;
          setDrag(0);
        },
      }
    : {};
  const label = sent
    ? `You sent ${name} ${t.title}`
    : req
      ? `${name} sent you ${t.title}`
      : invite
        ? `${name || 'Someone'} invited you to ${t.title}`
        : notice && !name
          ? `${t.title} ${it.text ?? ''}`.trim()
          : `${name} ${it.text ?? ''} ${t.title ?? ''}`.trim();
  return (
    <article
      ref={el}
      className={cx(
        'tp-root tp-ix',
        `tp-ix-${mode}`,
        req && 'tp-ix-req',
        invite && 'tp-ix-inv',
        it.unread && 'tp-unread',
        canSwipe && 'tp-ix-swipe',
        drag < 0 && 'tp-dragging',
        p.selected && 'tp-sel',
        open && 'tp-open',
        p.className,
      )}
      aria-label={label}
      aria-current={p.selected ? 'true' : undefined}
      {...swipeHandlers}
    >
      {canSwipe ? (
        <span className="tp-ix-swipe-bg" aria-hidden="true">
          <Icon name="trash" size={16} />
          Delete
        </span>
      ) : null}
      {full && p.onBack ? (
        <div className="tp-ix-backrow">
          <button type="button" className="tp-td-back" onClick={p.onBack}>
            <Icon name="left" size={18} />
            <span>{p.backLabel ?? 'Inbox'}</span>
          </button>
        </div>
      ) : null}
      {canSwipe ? (
        <div className="tp-ix-slide" style={drag ? { transform: `translateX(${drag}px)` } : undefined}>
          {head}
        </div>
      ) : (
        head
      )}
      {racts}
      {more}
      {datePop}
      {tbCal}
    </article>
  );
}

export interface InboxSectionProps {
  title: string;
  count?: number;
  /** A quiet action on the right: "Clear all". */
  action?: string;
  onAction?: () => void;
  items?: InboxEntry[];
  mode?: InboxItemMode;
  selectedKey?: string | null;
  openKey?: string | null;
  calendar?: InboxItemProps['calendar'];
  onAccept?: InboxItemProps['onAccept'];
  onDecline?: InboxItemProps['onDecline'];
  onOpen?: InboxItemProps['onOpen'];
  onSelect?: InboxItemProps['onSelect'];
  onToggle?: InboxItemProps['onToggle'];
  onWithdraw?: InboxItemProps['onWithdraw'];
  onTakeBack?: InboxItemProps['onTakeBack'];
  onPerson?: InboxItemProps['onPerson'];
  onJoin?: InboxItemProps['onJoin'];
  onNotNow?: InboxItemProps['onNotNow'];
  onToggleRead?: InboxItemProps['onToggleRead'];
  onDelete?: InboxItemProps['onDelete'];
  swipe?: boolean;
  hideTo?: boolean;
  fileBase?: string;
  className?: string;
  children?: ReactNode;
}

/** A small mono heading over a group of Inbox items ("To answer 2", "Updates"), with a quiet action on its right. */
export function InboxSection(p: InboxSectionProps) {
  return (
    <section className={cx('tp-root tp-ixs', p.className)} aria-label={p.title}>
      <div className="tp-ixs-head">
        <span>
          {p.title}
          {p.count ? <span className="tp-ixs-n">{p.count}</span> : null}
        </span>
        {p.action ? (
          <button type="button" className="tp-sp-headbtn" onClick={p.onAction}>
            {p.action}
          </button>
        ) : null}
      </div>
      <div className="tp-ixs-list" role="list">
        {p.items
          ? p.items.map((it) => (
              <div key={it.id} role="listitem">
                <InboxItem
                  item={it}
                  mode={p.mode}
                  selected={p.selectedKey === it.id}
                  open={p.openKey === it.id}
                  calendar={p.calendar}
                  onAccept={p.onAccept}
                  onDecline={p.onDecline}
                  onOpen={p.onOpen}
                  onSelect={p.onSelect}
                  onToggle={p.onToggle}
                  onWithdraw={p.onWithdraw}
                  onTakeBack={p.onTakeBack}
                  onPerson={p.onPerson}
                  onJoin={p.onJoin}
                  onNotNow={p.onNotNow}
                  onToggleRead={p.onToggleRead}
                  onDelete={p.onDelete}
                  swipe={p.swipe}
                  hideTo={p.hideTo}
                  fileBase={p.fileBase}
                />
              </div>
            ))
          : p.children}
      </div>
    </section>
  );
}
