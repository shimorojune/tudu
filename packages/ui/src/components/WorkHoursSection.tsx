import {
  DAY_NAMES,
  DAY_SHORT,
  DEFAULT_HOURS,
  EVERY_WORDS,
  HOURS_PROBLEM_WORDS,
  NUDGE_EVERY,
  minutesOf,
  type NudgeEvery,
  type WorkHours,
} from '@tudu/core';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cx } from '../lib/cx';
import { Button } from './Button';
import { DayPick } from './DayPick';
import { HoursField } from './HoursField';
import { Segmented } from './Segmented';
import { SettingRow, SettingsSection } from './SettingsSection';
import { Switch } from './Switch';

/**
 * Whether macOS lets Tudu notify you. `asking` while its box is up; `denied` is also what an ad hoc signed Tudu
 * gets with no box at all, until you allow it in System Settings; `unavailable` is a build that can't notify.
 */
export type NudgePermission = 'unknown' | 'asking' | 'allowed' | 'denied' | 'unavailable';

/** Settings › Working hours › Nudges, in the Mac app only. */
export interface SettingsNudges {
  on: boolean;
  every: NudgeEvery;
  permission: NudgePermission;
  /** "Next at 11:00", "Next on Wednesday at 09:00"; null when none is coming. */
  next: string | null;
  /** "Paused until Wednesday 09:00" while paused. */
  paused?: string | null;
  test: 'idle' | 'sending' | 'sent' | 'failed';
  /** "09:00, 10:00, 11:00": the first slots, for How often's line. */
  example: string;
  onSwitch?: (on: boolean) => void;
  onEvery?: (every: NudgeEvery) => void;
  onPause?: () => void;
  onResume?: () => void;
  onTest?: () => void;
  onOpenSettings?: () => void;
}

/** Settings › Working hours: your hours, on every device. */
export interface SettingsHours {
  /** Null while your account hasn't answered: the section shimmers in its final shape. */
  hours: WorkHours | null;
  /** The last save didn't go through: the line says so and Tudu tries again when back online. */
  saveError?: boolean;
  onChange?: (hours: WorkHours) => void;
}

/** What's on screen while editing: per-day hours remember a day switched off. */
interface Draft {
  same: boolean;
  days: number[];
  start: string;
  end: string;
  per: Record<number, { on: boolean; start: string; end: string }>;
}

function draftOf(h: WorkHours): Draft {
  const first = h.days[0] ?? DEFAULT_HOURS.days[0]!;
  const per: Draft['per'] = {};
  for (let d = 1; d <= 7; d++) {
    const x = h.days.find((y) => y.day === d);
    per[d] = x ? { on: true, start: x.start, end: x.end } : { on: false, start: first.start, end: first.end };
  }
  return { same: h.same, days: h.days.map((d) => d.day), start: first.start, end: first.end, per };
}

function hoursOf(d: Draft): WorkHours {
  if (d.same) return { same: true, days: d.days.map((day) => ({ day, start: d.start, end: d.end })) };
  const days = [1, 2, 3, 4, 5, 6, 7]
    .filter((day) => d.per[day]!.on)
    .map((day) => ({ day, start: d.per[day]!.start, end: d.per[day]!.end }));
  return { same: false, days };
}

/** The first thing wrong, and where: day 0 is the one stretch for every day. */
function problemOf(d: Draft): { text: string; day: number | null } | null {
  const late = (s: string, e: string) => minutesOf(e)! <= minutesOf(s)!;
  if (d.same) {
    if (!d.days.length) return { text: HOURS_PROBLEM_WORDS['no-days'], day: null };
    return late(d.start, d.end) ? { text: HOURS_PROBLEM_WORDS['end-before-start'], day: 0 } : null;
  }
  const on = [1, 2, 3, 4, 5, 6, 7].filter((day) => d.per[day]!.on);
  if (!on.length) return { text: HOURS_PROBLEM_WORDS['no-days'], day: null };
  const bad = on.find((day) => late(d.per[day]!.start, d.per[day]!.end));
  return bad ? { text: HOURS_PROBLEM_WORDS['end-before-start'], day: bad } : null;
}

const SAVE_ERROR = 'Couldn’t save. Tudu will try again when you’re back online.';

function Bad({ children }: { children: ReactNode }) {
  return <span className="tp-set-st tp-set-bad">{children}</span>;
}

function YourHours({ h, phone }: { h: SettingsHours; phone?: boolean }) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const d = draft ?? draftOf(h.hours ?? DEFAULT_HOURS);
  const bad = problemOf(d);
  // A valid change goes straight to your account (shown at once); one that can't be saved stays as a draft.
  const put = (next: Draft) => {
    if (problemOf(next)) return setDraft(next);
    setDraft(null);
    h.onChange?.(hoursOf(next));
  };
  const line = bad ? <Bad>{bad.text}</Bad> : h.saveError ? <Bad>{SAVE_ERROR}</Bad> : null;

  if (d.same)
    return (
      <div key="same" className="tp-wh-swap">
        <SettingRow
          stack
          title="Days"
          sub={!d.days.length && line ? line : 'The days you work. Nudges stay quiet on the others.'}
        >
          <DayPick days={d.days} onChange={(days) => put({ ...d, days })} />
        </SettingRow>
        <SettingRow
          stack
          title="Hours"
          sub={d.days.length && line ? line : 'The same on every day you work.'}
        >
          <div className="tp-wh-x">
            <HoursField
              start={d.start}
              end={d.end}
              bad={bad?.day === 0}
              onChange={(r) => put({ ...d, ...r })}
            />
            {phone ? null : (
              <button
                type="button"
                className="tp-wh-link"
                onClick={() => {
                  const per: Draft['per'] = {};
                  for (let x = 1; x <= 7; x++)
                    per[x] = { on: d.days.includes(x), start: d.start, end: d.end };
                  put({ ...d, same: false, per });
                }}
              >
                Set hours per day
              </button>
            )}
          </div>
        </SettingRow>
      </div>
    );
  return (
    <div key="per" className="tp-wh-swap">
      <SettingRow stack title="Hours" sub={line ?? 'Each day its own. A day switched off is a day off.'}>
        <div style={{ width: '100%' }}>
          <div className="tp-wh-week">
            {DAY_NAMES.map((name, i) => {
              const day = i + 1;
              const v = d.per[day]!;
              const setDay = (part: Partial<Draft['per'][number]>) =>
                put({ ...d, per: { ...d.per, [day]: { ...v, ...part } } });
              return [
                <b key={`b${day}`}>{DAY_SHORT[i]}</b>,
                <Switch key={`s${day}`} label={name} checked={v.on} onChange={(on) => setDay({ on })} />,
                v.on ? (
                  <HoursField
                    key={`h${day}`}
                    label={name}
                    start={v.start}
                    end={v.end}
                    bad={bad?.day === day}
                    onChange={setDay}
                  />
                ) : (
                  <span key={`o${day}`} className="tp-wh-off">
                    Off
                  </span>
                ),
              ];
            })}
          </div>
          <div style={{ marginTop: 12 }}>
            <button
              type="button"
              className="tp-wh-link"
              onClick={() => {
                // Back to one stretch: Monday's hours (or the first working day's) for every day still on.
                const firstOn = [1, 2, 3, 4, 5, 6, 7].find((x) => d.per[x]!.on) ?? 1;
                const base = d.per[1]!.on ? d.per[1]! : d.per[firstOn]!;
                put({
                  ...d,
                  same: true,
                  start: base.start,
                  end: base.end,
                  days: [1, 2, 3, 4, 5, 6, 7].filter((x) => d.per[x]!.on),
                });
              }}
            >
              Same hours every day
            </button>
          </div>
        </div>
      </SettingRow>
    </div>
  );
}

/** System Settings drawn small in Tudu's own lines: the one switch to turn on. Never a screenshot. */
function AllowGuide() {
  return (
    <div className="tp-wh-guide">
      <div className="tp-wh-mac" aria-hidden="true">
        <div className="tp-wh-mac-side">
          <span>Focus</span>
          <span className="tp-on">Notifications</span>
          <span>Sound</span>
        </div>
        <div className="tp-wh-mac-main">
          <b>Tudu</b>
          <div className="tp-wh-mac-row tp-hit">
            <span>Allow notifications</span>
            <span className="tp-wh-mac-sw" />
          </div>
          <div className="tp-wh-mac-row">
            <span>Banners</span>
            <span>›</span>
          </div>
        </div>
      </div>
      <ol className="tp-wh-steps" aria-label="How to allow Tudu">
        <li>Open Notification settings. It opens on Tudu.</li>
        <li>Turn on Allow notifications.</li>
        <li>Come back here. Tudu checks by itself.</li>
      </ol>
    </div>
  );
}

function Fold({ open, children }: { open: boolean; children: ReactNode }) {
  return (
    <div
      className={cx('tp-wh-fold', open && 'tp-open')}
      aria-hidden={open ? undefined : 'true'}
      inert={!open}
    >
      <div>{children}</div>
    </div>
  );
}

function Nudges({ n }: { n: SettingsNudges }) {
  const off = n.permission === 'denied' && n.on;
  const open = n.on && n.permission === 'allowed';
  const sub =
    n.permission === 'asking' ? (
      <span className="tp-set-st">Allow Tudu in the box macOS just showed.</span>
    ) : off ? (
      <>
        <Bad>macOS has Tudu’s notifications off.</Bad> Turn on Allow notifications for Tudu, then come back.
      </>
    ) : n.permission === 'unavailable' && n.on ? (
      <Bad>This build of Tudu can’t send notifications.</Bad>
    ) : (
      'A short note on today: what’s done, what’s left, what’s next.'
    );
  const testSub =
    n.test === 'sent' ? (
      <span className="tp-set-st">Sent. It shows at the top right of your screen.</span>
    ) : n.test === 'failed' ? (
      <Bad>Couldn’t read today, so nothing was sent. Try again in a moment.</Bad>
    ) : (
      'Shows the one you’d get now.'
    );
  return (
    <>
      <SettingsSection title="Nudges">
        <SettingRow
          title="Nudge me in my hours"
          sub={sub}
          control={
            <Switch
              label="Nudge me in my hours"
              checked={n.on || n.permission === 'asking'}
              onChange={n.onSwitch}
            />
          }
        >
          {off ? (
            <div>
              <Button variant="secondary" size="sm" onClick={n.onOpenSettings}>
                Open Notification settings
              </Button>
            </div>
          ) : null}
        </SettingRow>
        <Fold open={off}>
          <AllowGuide />
        </Fold>
        <Fold open={open}>
          <SettingRow
            stack
            title="How often"
            sub={`On the clock from your start: ${n.example}. The last one comes at the end of your day.`}
          >
            <Segmented<string>
              label="How often"
              value={String(n.every)}
              onChange={(v) => n.onEvery?.(Number(v) as NudgeEvery)}
              items={NUDGE_EVERY.map((e) => ({ value: String(e), label: EVERY_WORDS[e] }))}
            />
          </SettingRow>
          <SettingRow
            title={n.paused ?? n.next ?? 'No more today'}
            sub={
              n.paused
                ? 'From Pause for today here, or on a nudge.'
                : 'Pausing stops them until your next working day.'
            }
            control={
              n.paused ? (
                <Button variant="secondary" size="sm" onClick={n.onResume}>
                  Resume
                </Button>
              ) : (
                <Button variant="secondary" size="sm" onClick={n.onPause}>
                  Pause for today
                </Button>
              )
            }
          />
          <SettingRow
            title="Send a test nudge"
            sub={testSub}
            control={
              <Button
                variant="secondary"
                size="sm"
                loading={n.test === 'sending'}
                loadingLabel="Sending…"
                onClick={n.onTest}
              >
                Send now
              </Button>
            }
          />
        </Fold>
      </SettingsSection>
      <p className="tp-set-note">
        Nudges come from Tudu while it runs on this Mac. Turn on Open at login in This Mac so they still come
        after a restart.
      </p>
    </>
  );
}

/** Holds its children's height and eases to each new one, so nothing snaps. */
function AutoHeight({ children }: { children: ReactNode }) {
  const inner = useRef<HTMLDivElement>(null);
  const [ht, setHt] = useState<number | null>(null);
  useEffect(() => {
    const el = inner.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setHt(el.offsetHeight + 8));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div className="tp-wh-auto" style={ht === null ? undefined : { height: ht }}>
      <div ref={inner}>{children}</div>
    </div>
  );
}

export interface WorkHoursSectionProps {
  hours: SettingsHours;
  /** The Mac app passes it; the web and phones say where nudges come from instead. */
  nudges?: SettingsNudges;
  phone?: boolean;
}

/** Settings › Working hours: your hours (all devices) and, in the Mac app, Nudges. */
export function WorkHoursSection({ hours, nudges, phone }: WorkHoursSectionProps) {
  const loading = hours.hours === null;
  // Set during render, once the hours arrive: the reveal plays once, never on a later load.
  const [shown, setShown] = useState(false);
  if (!loading && !shown) setShown(true);
  return (
    <AutoHeight>
      <div
        className={cx(loading && 'tp-wh-ld', !loading && shown && 'tp-wh-shown')}
        aria-busy={loading ? 'true' : undefined}
      >
        <SettingsSection title="Your hours">
          <YourHours h={hours} phone={phone} />
        </SettingsSection>
        {nudges ? (
          <Nudges n={nudges} />
        ) : (
          <SettingsSection title="Nudges">
            <SettingRow
              title="Nudges"
              sub="Nudges come from the Tudu app on a Mac. Your hours here are the ones it uses."
            />
          </SettingsSection>
        )}
      </div>
    </AutoHeight>
  );
}
