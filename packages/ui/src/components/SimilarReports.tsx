import { dateShort, isoOfDate, type SimilarIssue } from '@tudu/core';
import { cx } from '../lib/cx';
import { Icon } from '../lib/icons';

/**
 * `hidden`: folded shut (too few words, nothing similar, nothing asked yet, a look on its way or one that failed).
 * There is no loading or error state (#114): the box only ever shows real matches.
 */
export type SimilarReportsState = 'hidden' | 'ready';

export interface SimilarReportsProps {
  state: SimilarReportsState;
  /** Closest first, as the server answers. */
  issues: SimilarIssue[];
  /** The issue picked for "+1 that one instead"; kept (pinned first) if later words drop it from the list. */
  picked?: SimilarIssue | null;
  onPick?: (issue: SimilarIssue | null) => void;
  /** Open the issue: a new tab, or the browser from the Mac app. */
  onOpen?: (url: string) => void;
}

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
 * what is being typed, each with +1 to add the report to it instead of filing a new one. It folds open only when
 * there are matches (#114: nothing shows while a look is on its way, and a failed look shows nothing); a new answer
 * swaps the rows in place; a picked issue stays pinned. Each row shows the report's own words, up to 3 lines (#115).
 */
export function SimilarReports({ state, issues, picked = null, onPick, onOpen }: SimilarReportsProps) {
  // The pick stays, first, even when the latest words no longer find it.
  const rows = picked && !issues.some((i) => i.number === picked.number) ? [picked, ...issues] : issues;
  const open = (state === 'ready' && rows.length > 0) || !!picked;
  // A new answer is a new set: the rows rise in again. Keyed by what they are, so the same set doesn't replay.
  const setKey = rows.map((i) => i.number).join(',');

  return (
    <div
      className={cx('tp-root tp-sim-fold', !open && 'tp-hide')}
      aria-hidden={!open}
      inert={!open}
      data-testid="similar-reports"
    >
      <div>
        <div className="tp-sim">
          {rows.length ? (
            <>
              <div className="tp-sim-h" role="status">
                <Icon name="search" size={13} />
                <span>
                  <b>Already reported?</b> +1 that one instead.
                </span>
              </div>
              <ul aria-label="Similar reports" key={setKey}>
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
                          {i.summary || i.title}
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
