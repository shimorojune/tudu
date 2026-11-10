import { dateShort, isoOfDate, type SimilarIssue } from '@tudu/core';
import { useEffect, useRef, useState } from 'react';
import { cx } from '../lib/cx';
import { Icon } from '../lib/icons';
import { Skeleton } from './Skeleton';

/** `hidden`: folded shut (too few words, nothing similar, or nothing asked yet). */
export type SimilarReportsState = 'hidden' | 'loading' | 'ready' | 'error';

export interface SimilarReportsProps {
  state: SimilarReportsState;
  /** Closest first, as the server answers. */
  issues: SimilarIssue[];
  /** A look is on its way while rows show: they dim, then the new ones crossfade in. */
  stale?: boolean;
  /** The issue picked for "+1 that one instead"; kept (pinned first) if later words drop it from the list. */
  picked?: SimilarIssue | null;
  onPick?: (issue: SimilarIssue | null) => void;
  /** Open the issue: a new tab, or the browser from the Mac app. */
  onOpen?: (url: string) => void;
}

/** The shimmer shows at least this long, so a quick answer still reads as a look rather than a flash. */
export const SIMILAR_SHIMMER_MS = 380;

const RING = (
  <svg
    width={16}
    height={16}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    aria-hidden="true"
  >
    <circle cx={12} cy={12} r={9} />
    <circle cx={12} cy={12} r={1.5} />
  </svg>
);
const DONE = (
  <svg
    width={16}
    height={16}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <circle cx={12} cy={12} r={9} />
    <path d="m8.5 12 2.5 2.5 4.5-5" />
  </svg>
);
const CLOUD = (
  <svg
    width={13}
    height={13}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" />
    <path d="M12 12v3" />
    <path d="M12 18h.01" />
  </svg>
);

/** "closed 5 Nov · 2 +1s", "opened 27 Oct". */
export function similarMeta(i: SimilarIssue): string {
  const when =
    i.state === 'open' || !i.closedAt
      ? `opened ${dateShort(isoOfDate(new Date(i.createdAt)))}`
      : `closed ${dateShort(isoOfDate(new Date(i.closedAt)))}`;
  return i.plusOnes > 0 ? `${when} · ${i.plusOnes} +1${i.plusOnes === 1 ? '' : 's'}` : when;
}

function stateLabel(i: SimilarIssue): string {
  return i.state === 'open' ? 'Open' : i.state === 'fixed' ? 'Closed, fixed' : 'Closed, not planned';
}

/**
 * "Already reported?" under the words of Send feedback (#76): up to three GitHub issues, open and closed, that mean
 * what is being typed, each with +1 to add the report to it instead of filing a new one. Folds open like the
 * screenshot slot; the first look shimmers, later ones dim the rows and crossfade; a picked issue stays pinned.
 */
export function SimilarReports({ state, issues, stale, picked = null, onPick, onOpen }: SimilarReportsProps) {
  // The shimmer holds for a moment at least: `held` is the look still shimmering after its answer came.
  const [held, setHeld] = useState(false);
  const since = useRef<number | null>(null);
  const [wasState, setWasState] = useState(state);
  if (state !== wasState) {
    setWasState(state);
    if (wasState === 'loading' && state !== 'loading' && since.current !== null) setHeld(true);
  }
  useEffect(() => {
    if (state === 'loading') since.current = Date.now();
  }, [state]);
  useEffect(() => {
    if (!held) return;
    const left = SIMILAR_SHIMMER_MS - (Date.now() - (since.current ?? 0));
    const t = setTimeout(() => setHeld(false), Math.max(0, left));
    return () => clearTimeout(t);
  }, [held]);

  const shown = held ? 'loading' : state;
  // The pick stays, first, even when the latest words no longer find it.
  const rows = picked && !issues.some((i) => i.number === picked.number) ? [picked, ...issues] : issues;
  const open = shown === 'loading' || shown === 'error' || (shown === 'ready' && rows.length > 0) || !!picked;
  // A new answer is a new set: the rows rise in again. Keyed by what they are, so the same set doesn't replay.
  const setKey = rows.map((i) => i.number).join(',');

  return (
    <div
      className={cx('tp-root tp-fb-slot tp-sim-fold', !open && 'tp-hide')}
      aria-hidden={!open}
      inert={!open}
      data-testid="similar-reports"
    >
      <div>
        <div className="tp-sim" aria-busy={shown === 'loading' ? 'true' : undefined}>
          {shown === 'loading' ? (
            <>
              <div className="tp-sim-h">
                <Icon name="search" size={13} />
                <span>Checking for similar reports…</span>
              </div>
              {[78, 62].map((w) => (
                <div className="tp-sim-skel" key={w}>
                  <Skeleton width={14} height={14} />
                  <Skeleton width={`${w}%`} height={11} />
                  <Skeleton width={40} height={22} />
                </div>
              ))}
            </>
          ) : shown === 'error' && !picked ? (
            <div className="tp-sim-err" role="status">
              {CLOUD}
              <span>Couldn’t check for similar reports. Sending works as usual.</span>
            </div>
          ) : rows.length ? (
            <>
              <div className="tp-sim-h" role="status">
                <Icon name="search" size={13} />
                <span>
                  <b>Already reported?</b> +1 that one instead.
                </span>
              </div>
              <ul aria-label="Similar reports" className={cx(stale && 'tp-stale')} key={setKey}>
                {rows.map((i) => {
                  const on = picked?.number === i.number;
                  return (
                    <li key={i.number} className={cx('tp-sim-row', on && 'tp-picked')}>
                      <span
                        className={cx('tp-sim-st', i.state !== 'open' && 'tp-closed')}
                        role="img"
                        aria-label={stateLabel(i)}
                      >
                        {i.state === 'open' ? RING : DONE}
                      </span>
                      <span className="tp-sim-t">
                        <span className="tp-sim-tt">
                          <span className="tp-sim-n">#{i.number}</span>
                          {i.title}
                        </span>
                        <span className="tp-sim-meta">
                          {i.state === 'fixed' ? <span className="tp-sim-badge">Fixed</span> : null}
                          {i.state === 'closed' ? (
                            <span className="tp-sim-badge tp-sim-badge-closed">Closed</span>
                          ) : null}
                          <span>{similarMeta(i)}</span>
                        </span>
                      </span>
                      <a
                        className="tp-sim-gh"
                        href={i.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`Open #${i.number} on GitHub`}
                        onClick={(e) => {
                          if (!onOpen) return;
                          e.preventDefault();
                          onOpen(i.url);
                        }}
                      >
                        <Icon name="external" size={14} />
                      </a>
                      <button
                        type="button"
                        className="tp-sim-plus"
                        aria-pressed={on ? 'true' : 'false'}
                        aria-label={`+1 #${i.number} instead of a new issue${on ? ', picked' : ''}`}
                        onClick={() => onPick?.(on ? null : i)}
                      >
                        {on ? <Icon name="check" size={13} /> : '+1'}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
