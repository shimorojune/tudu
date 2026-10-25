import { addDays, dateShort, isoOfDate, WEEKDAYS_SHORT, weekdayOf, type MyReport } from '@tudu/core';
import { Icon } from '../lib/icons';
import { Button } from './Button';

export type FeedbackReportsState = 'loading' | 'error' | 'ready';

export interface FeedbackReportsProps {
  state: FeedbackReportsState;
  /** Newest first, as the server answers. */
  reports: MyReport[];
  onRetry?: () => void;
  /** Today, for the day words (tests pin it). */
  now?: Date;
}

/** "Today", "Yesterday", "Thu" for the five days before, then "19 Oct" (so a weekday never means last week). */
export function reportDay(createdAt: string, now: Date): string {
  const day = isoOfDate(new Date(createdAt));
  const today = isoOfDate(now);
  if (day === today) return 'Today';
  if (day === addDays(today, -1)) return 'Yesterday';
  if (day > addDays(today, -6)) return WEEKDAYS_SHORT[weekdayOf(day)]!;
  return dateShort(day);
}

/** The row's quiet line: "Today · Something’s wrong", "Today · Waiting for GitHub", "19 Oct · Sent by email". */
export function reportMeta(r: MyReport, now: Date): string {
  const what =
    r.state === 'filed' && r.issue
      ? r.kind === 'bug'
        ? 'Something’s wrong'
        : 'An idea'
      : r.state === 'pending'
        ? 'Waiting for GitHub'
        : 'Sent by email';
  return `${reportDay(r.createdAt, now)} · ${what}`;
}

function Row({ r, now }: { r: MyReport; now: Date }) {
  const meta = reportMeta(r, now);
  const num = r.state === 'filed' && r.issue ? `#${r.issue.number}` : '';
  const body = (
    <>
      <span className="tp-fbr-kind">
        <Icon name={r.kind === 'bug' ? 'bug' : 'idea'} size={15} />
      </span>
      <span className="tp-fbr-t">
        <span className="tp-fbr-a">
          {num ? <b>{num}</b> : null}
          <span>{r.title}</span>
        </span>
        <span className="tp-fbr-m">{meta}</span>
      </span>
      {r.state === 'pending' ? <span className="tp-fbr-shim" aria-label="Waiting for GitHub" /> : null}
      {num ? (
        <span className="tp-fbr-x">
          <Icon name="external" size={14} />
        </span>
      ) : null}
    </>
  );
  if (num && r.issue)
    return (
      <a
        className="tp-fbr-row"
        href={r.issue.url}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`Issue ${num}: ${r.title}, ${meta}`}
      >
        {body}
      </a>
    );
  return <div className="tp-fbr-row">{body}</div>;
}

/**
 * Your reports, inside Send feedback: newest first, each with its GitHub issue. A filed row opens its issue; one
 * waiting for GitHub shimmers where its number goes; one from before issues (or only mailed) says "Sent by email".
 */
export function FeedbackReports({ state, reports, onRetry, now = new Date() }: FeedbackReportsProps) {
  if (state === 'loading')
    return (
      <div className="tp-fbr-list" aria-busy="true" aria-label="Loading your reports">
        {[78, 62].map((w) => (
          <div key={w} className="tp-fbr-row tp-fbr-skel-row">
            <span className="tp-fbr-kind" />
            <span className="tp-fbr-t tp-fbr-skels">
              <span className="tp-fbr-skel" style={{ width: `${w}%` }} />
              <span className="tp-fbr-skel tp-sm" style={{ width: `${w / 2.3}%` }} />
            </span>
          </div>
        ))}
      </div>
    );
  if (state === 'error')
    return (
      <div className="tp-fbr-empty" role="alert">
        <span className="tp-fbr-kind">
          <Icon name="warning" size={15} />
        </span>
        <b>Couldn’t load your reports</b>
        <span>Check the connection and try again. Sending still works.</span>
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Try again
        </Button>
      </div>
    );
  if (reports.length === 0)
    return (
      <div className="tp-fbr-empty">
        <span className="tp-fbr-kind">
          <Icon name="bug" size={17} />
        </span>
        <b>Nothing sent yet</b>
        <span>What you send shows here with its GitHub issue, so you can follow it.</span>
      </div>
    );
  return (
    <ul className="tp-fbr-list" aria-label="Your reports">
      {reports.map((r) => (
        <li key={r.id}>
          <Row r={r} now={now} />
        </li>
      ))}
    </ul>
  );
}
