import { addDays, formatDay, isoToday, type IsoDate } from '@tudu/core';
import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';
import { copyText, COPY_FAILED_WORDS, COPY_ID_FAILED_WORDS } from '../lib/clipboard';
import { cx } from '../lib/cx';
import { Icon } from '../lib/icons';
import { InkTick, PlainTick } from '../lib/ink';
import { Sparkle, useSpark } from '../lib/spark';
import { DatePop } from './DatePop';
import { JiraMark } from './JiraMark';
import { MiniCalendar, type MiniCalendarProps } from './MiniCalendar';
import { SubtaskList, type SubtaskItem } from './SubtaskList';
import { showToast } from './Toast';
import { Tooltip } from './Tooltip';

export interface TaskDue {
  /** "Fri", "4 Nov", "today". */
  label: string;
  /** The exact date, in the tooltip. */
  tip?: string;
  overdue?: boolean;
  /** The due day itself, so the picker can mark it. */
  iso?: IsoDate;
}

export interface TaskCarried {
  /** What follows "From": "Sat", "4 Oct". */
  label: string;
  /** "Carried over from Saturday". */
  tip?: string;
  /** Carried two days or more: red. */
  slipping?: boolean;
}

export interface TaskProject {
  name: string;
  color: string;
}

export type TaskSignal = 'due' | 'carried' | 'subtasks' | 'comments' | 'jira' | 'project';

export interface TaskRowProps {
  title: string;
  /** The task ID people see ("ME-41"), last in the byline; click it to copy. Missing until the server numbers it. */
  id?: string | null;
  /** The task's own page; clicking the ID copies this. Without it the ID copies itself. */
  link?: string;
  done?: boolean;
  onToggle?: (done: boolean) => void;
  /** Click anywhere on the row (not the checkbox, byline items or a drag) to open the task. */
  onOpen?: () => void;
  /** A byline item other than the date was clicked. */
  onSignal?: (kind: TaskSignal) => void;
  due?: TaskDue;
  carried?: TaskCarried;
  comments?: number;
  jira?: string;
  project?: TaskProject;
  /** Phones: the byline may wrap, titles wrap to three lines. */
  compact?: boolean;
  /** Three lines of title instead of two. */
  lines?: 2 | 3;
  tick?: 'ink' | 'fill';
  /** The week: the byline keeps only the date, the Jira key and the project. */
  brief?: boolean;
  /** Inside a TaskList: the grip in the left margin. */
  reorderable?: boolean;
  /** With these the date pills open a date picker beside them. */
  calendar?: MiniCalendarProps;
  /** The day the row is on. */
  planned?: IsoDate | null;
  /** The carried pill's picker: the day it is on keeps it (the marker goes); another day, or null, moves it. */
  onPlan?: (day: IsoDate | null) => void;
  onDueChange?: (day: IsoDate | null) => void;
  /** A quiet calendar button at the row's end (the Backlog). */
  planButton?: boolean;
  /** Subtasks fold out from the byline ("1 of 4 done ›"), lined up under the title. */
  subtasks?: SubtaskItem[];
  /** The fold starts open. */
  defaultSubtasksOpen?: boolean;
  onAddSubtask?: (title: string) => void;
  onRenameSubtask?: (sub: SubtaskItem, title: string) => void;
  onToggleSubtask?: (sub: SubtaskItem, done: boolean) => void;
  onReorderSubtask?: (sub: SubtaskItem, from: number, to: number) => void;
  onDeleteSubtask?: (sub: SubtaskItem, index: number) => void;
  onRestoreSubtask?: (sub: SubtaskItem, index: number) => void;
}

interface Sig {
  k: TaskSignal;
  od?: boolean;
  icon: ReactNode;
  long: string;
  label: string;
  act: string;
  mono?: boolean;
}

function signals(p: TaskRowProps): Sig[] {
  const out: Sig[] = [];
  if (p.due) {
    const long = p.due.overdue ? `Overdue since ${p.due.label}` : `Due ${p.due.label}`;
    out.push({
      k: 'due',
      od: p.due.overdue,
      icon: <Icon name="clock" size={12} stroke={2.2} />,
      long,
      label: p.due.tip ?? long,
      act: 'Change the date',
    });
  }
  if (p.carried && !p.due) {
    out.push({
      k: 'carried',
      od: !!p.carried.slipping,
      icon: <Icon name="carried" size={12} stroke={2.2} />,
      long: `From ${p.carried.label}`,
      label: p.carried.tip ?? `Carried over from ${p.carried.label}`,
      act: 'Change the date',
    });
  }
  const subs = p.subtasks ?? [];
  if (subs.length) {
    const done = subs.filter((x) => x.done).length;
    out.push({
      k: 'subtasks',
      icon: <Icon name="subtasks" size={12} />,
      long: `${done} of ${subs.length} done`,
      label: `${done} of ${subs.length} subtasks done`,
      act: 'Show or hide subtasks',
    });
  }
  if (p.comments) {
    const words = `${p.comments} ${p.comments === 1 ? 'comment' : 'comments'}`;
    out.push({
      k: 'comments',
      icon: <Icon name="comment" size={12} />,
      long: words,
      label: words,
      act: 'Open comments',
    });
  }
  if (p.jira) {
    out.push({
      k: 'jira',
      icon: <JiraMark size={11} />,
      long: p.jira,
      mono: true,
      label: `Linked to Jira · ${p.jira}`,
      act: 'Open in Jira',
    });
  }
  if (p.project) {
    out.push({
      k: 'project',
      icon: <i className="tp-dot" style={{ background: p.project.color }} />,
      long: p.project.name,
      label: `Project · ${p.project.name}`,
      act: `Show all tasks in ${p.project.name}`,
    });
  }
  return p.brief
    ? out.filter((x) => x.k === 'due' || x.k === 'carried' || x.k === 'jira' || x.k === 'project')
    : out;
}

function Grip() {
  return (
    <span className="tp-grip" aria-hidden="true" title="Drag to reorder">
      <svg width={8} height={14} viewBox="0 0 8 14" aria-hidden="true">
        {[1.5, 7, 12.5].map((y) => (
          <g key={y}>
            <circle cx={1.5} cy={y} r={1.3} fill="currentColor" />
            <circle cx={6.5} cy={y} r={1.3} fill="currentColor" />
          </g>
        ))}
      </svg>
    </span>
  );
}

/** The ID chip's link mark, which turns into a tick once copied. Both drawn, CSS shows one. */
export function CopyMark() {
  return (
    <span className="tp-copy-ic" aria-hidden="true">
      <Icon name="link" size={13} className="tp-copy-ln" />
      <Icon name="check" size={13} stroke={2.4} className="tp-copy-ok" />
    </span>
  );
}

/** How long the copied ID stays lit. */
export const COPY_FLASH_MS = 700;

/**
 * One task on the day sheet: the checkbox, the title, and a quiet byline under it ("→ From Sat · ME-41"). Rows with
 * nothing in the byline but the ID stay one line. Click anywhere on the row to open the task; the checkbox, byline
 * items and a drag keep their own job. Crossing off draws the ink tick, the strike fades in after it, and the
 * sparkle plays once.
 */
export function TaskRow(p: TaskRowProps) {
  const { title, id, done = false, compact, tick = 'ink' } = p;
  const [sparking, fire] = useSpark();
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pop, setPop] = useState<{ k: 'carried' | 'due' | 'plan'; el: HTMLElement } | null>(null);
  const [subsOpen, setSubsOpen] = useState(!!p.defaultSubtasksOpen);
  const subs = p.subtasks ?? [];
  const hasSubs = subs.length > 0 && !p.brief;
  const showSubs = hasSubs && subsOpen && !done;
  useEffect(
    () => () => {
      if (copyTimer.current) clearTimeout(copyTimer.current);
    },
    [],
  );

  const canPick = !!p.calendar && !done;
  const ink = tick !== 'fill';

  function toggle() {
    const next = !done;
    if (next) fire();
    p.onToggle?.(next);
  }

  async function copyId(e: MouseEvent) {
    e.stopPropagation();
    if (!id) return;
    const link = p.link;
    if (!(await copyText(link ?? id))) {
      showToast(link ? COPY_FAILED_WORDS : COPY_ID_FAILED_WORDS);
      return;
    }
    // The ID itself never changes (nothing shifts): the link mark turns to a tick and a toast confirms.
    setCopied(true);
    if (copyTimer.current) clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopied(false), COPY_FLASH_MS);
    showToast(link ? 'Link copied' : `Copied ${id}`);
  }

  function pick(k: 'carried' | 'due' | 'plan', el: HTMLElement) {
    setPop((cur) => (cur && cur.k === k ? null : { k, el }));
  }

  const sigs = signals(p);
  const byline: ReactNode[] = sigs.map((x) => {
    const isDate = (x.k === 'due' || x.k === 'carried') && canPick;
    const isSubs = x.k === 'subtasks';
    const hasTip = (x.k === 'due' || x.k === 'carried') && x.label !== x.long;
    const button = (
      <button
        key={x.k}
        type="button"
        className={cx(
          'tp-sg',
          `tp-sg-${x.k}`,
          x.od && 'tp-od',
          x.mono && 'tp-mono',
          pop?.k === x.k && 'tp-on',
          isSubs && showSubs && 'tp-open',
        )}
        aria-label={
          isSubs ? `${x.label}. ${showSubs ? 'Hide subtasks' : 'Show subtasks'}` : `${x.label}. ${x.act}`
        }
        aria-expanded={
          isDate ? (pop?.k === x.k ? 'true' : 'false') : isSubs ? (showSubs ? 'true' : 'false') : undefined
        }
        aria-haspopup={isDate ? 'dialog' : undefined}
        title={x.k === 'due' || x.k === 'carried' ? undefined : x.long}
        onClick={(e) => {
          e.stopPropagation();
          if (isDate) {
            pick(x.k as 'carried' | 'due', e.currentTarget);
            return;
          }
          if (isSubs) setSubsOpen((v) => !v);
          p.onSignal?.(x.k);
        }}
      >
        {x.icon}
        <span>{x.long}</span>
        {isSubs ? (
          <span className="tp-sg-caret" aria-hidden="true">
            <Icon name="caret" size={11} />
          </span>
        ) : null}
      </button>
    );
    return hasTip ? (
      <Tooltip key={x.k} label={x.label} side="right">
        {button}
      </Tooltip>
    ) : (
      button
    );
  });
  if (id && !p.brief) {
    byline.push(
      <button
        key="id"
        type="button"
        className={cx('tp-sg tp-sg-id tp-mono', copied && 'tp-flash')}
        title={p.link ? 'Copy link' : 'Copy task ID'}
        aria-label={p.link ? `Copy link to ${id}` : `Copy task ID ${id}`}
        onClick={(e) => void copyId(e)}
      >
        <span>{id}</span>
        {p.link ? <CopyMark /> : null}
      </button>,
    );
  }

  let datePop: ReactNode = null;
  if (pop && canPick) {
    const cal = p.calendar!;
    const today = cal.today ?? isoToday();
    const day = p.planned ?? cal.selected ?? today;
    const tmr = addDays(today, 1);
    const close = () => setPop(null);
    const word = (k: IsoDate) => (k === today ? 'today' : k === tmr ? 'tomorrow' : formatDay(k));
    if (pop.k === 'plan') {
      const planIt = (v: IsoDate | null) => {
        close();
        p.onPlan?.(v);
      };
      datePop = (
        <DatePop anchor={pop.el} onClose={close} heading="Plan it for a day" align="end">
          <MiniCalendar
            {...cal}
            selected={undefined}
            presets={[
              { label: 'Today', on: false, value: today },
              { label: 'Tomorrow', on: false, value: tmr },
            ]}
            onPreset={planIt}
            onPick={planIt}
            hint={(k) => ({ text: `Move to ${word(k)}`, tone: k === today ? 'today' : '' })}
            hintEmpty="Pick a day for it"
          />
        </DatePop>
      );
    } else if (pop.k === 'carried') {
      const plan = (v: IsoDate | null) => {
        close();
        p.onPlan?.(v);
      };
      datePop = (
        <DatePop
          anchor={pop.el}
          onClose={close}
          heading={p.carried ? (p.carried.tip ?? `Carried over from ${p.carried.label}`) : 'Move it'}
        >
          <MiniCalendar
            {...cal}
            selected={day}
            presets={[
              { label: 'Today', on: day === today, value: today },
              { label: 'Tomorrow', on: day === tmr, value: tmr },
              { label: 'Backlog', on: false, value: null },
            ]}
            onPreset={plan}
            onPick={plan}
            hint={(k) => ({
              text: k === day ? `Keep it on ${k === today ? 'today' : formatDay(k)}` : `Move to ${word(k)}`,
              tone: k === today ? 'today' : '',
            })}
            hintEmpty="Pick a day for it"
          />
        </DatePop>
      );
    } else {
      const setDue = (v: IsoDate | null) => {
        close();
        p.onDueChange?.(v);
      };
      const dIso = p.due?.iso;
      datePop = (
        <DatePop anchor={pop.el} onClose={close} heading={p.due?.tip ?? 'Due date'}>
          <MiniCalendar
            {...cal}
            selected={dIso}
            month={(dIso ?? cal.month ?? today).slice(0, 7)}
            marks={{}}
            clearLabel="Remove due date"
            onClear={() => setDue(null)}
            onPick={setDue}
            hintEmpty="Pick a due date"
          />
        </DatePop>
      );
    }
  }

  const planBtn =
    p.planButton && canPick ? (
      <button
        type="button"
        className={cx('tp-row-plan', pop?.k === 'plan' && 'tp-on')}
        title="Plan it"
        aria-label={`Plan it for a day: ${title}`}
        aria-haspopup="dialog"
        aria-expanded={pop?.k === 'plan' ? 'true' : 'false'}
        onClick={(e) => {
          e.stopPropagation();
          pick('plan', e.currentTarget);
        }}
      >
        <Icon name="week" size={15} />
      </button>
    ) : null;

  // The whole row opens the task. Controls inside it keep their own job; a drag swallows the click that follows it.
  function rowClick(e: MouseEvent<HTMLDivElement>) {
    if (!p.onOpen) return;
    if (
      (e.target as HTMLElement).closest(
        'button, a, input, textarea, select, .tp-grip, .tp-cbw, [contenteditable="true"]',
      )
    )
      return;
    e.currentTarget.querySelector<HTMLElement>('.tp-strike[tabindex]')?.focus({ preventScroll: true });
    p.onOpen();
  }
  function titleKey(e: KeyboardEvent<HTMLSpanElement>) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      p.onOpen?.();
    }
  }

  return (
    <div className="tp-root">
      <div
        className={cx(
          'tp-row',
          done && 'tp-done',
          compact && 'tp-compact',
          p.onOpen && 'tp-openable',
          planBtn && 'tp-has-plan',
          hasSubs && showSubs && 'tp-hassubs',
        )}
        onClick={p.onOpen ? rowClick : undefined}
      >
        {p.reorderable && !compact ? <Grip /> : null}
        <span className="tp-cbw">
          <button
            type="button"
            role="checkbox"
            aria-checked={done ? 'true' : 'false'}
            aria-label={`Cross off: ${title}`}
            className={cx('tp-cb', ink && 'tp-ink')}
            onClick={toggle}
          >
            {ink ? <InkTick /> : <PlainTick />}
          </button>
          <Sparkle go={sparking} />
        </span>
        <div className="tp-main">
          <div className="tp-titlecol">
            <span className={cx('tp-title', (p.lines === 3 || compact) && 'tp-l3')}>
              <span
                className="tp-strike"
                role={p.onOpen ? 'button' : undefined}
                tabIndex={p.onOpen ? 0 : undefined}
                title={title}
                onKeyDown={p.onOpen ? titleKey : undefined}
              >
                {title}
              </span>
            </span>
            {byline.length ? (
              <div className={cx('tp-byline', compact && 'tp-byline-wrap')}>
                {byline.flatMap((b, i) =>
                  i
                    ? [
                        <span key={`sep${i}`} className="tp-sep" aria-hidden="true">
                          ·
                        </span>,
                        b,
                      ]
                    : [b],
                )}
              </div>
            ) : null}
          </div>
        </div>
        {planBtn}
        {datePop}
      </div>
      {hasSubs ? (
        <div className={cx('tp-subwrap', showSubs && 'tp-open')}>
          <SubtaskList
            variant="row"
            subtasks={subs}
            parentTitle={title}
            compact={compact}
            shown={showSubs}
            onAdd={p.onAddSubtask}
            onRename={p.onRenameSubtask}
            onToggle={p.onToggleSubtask}
            onReorder={p.onReorderSubtask}
            onDelete={p.onDeleteSubtask}
            onRestore={p.onRestoreSubtask}
          />
        </div>
      ) : null}
    </div>
  );
}
