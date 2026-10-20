import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { cx } from '../lib/cx';
import { useWidthEase } from '../lib/hooks';
import { INK_SHAPE } from '../lib/ink';

export interface DayProgressProps {
  done?: number;
  total?: number;
  /** The ring's diameter in px: 36 on the desktop, 30 on phones; 34 by default. */
  size?: number;
  /** Ring plus "2/7", then "All done". */
  compact?: boolean;
  /** The line under "All crossed off". The week says "That's the week". */
  doneNote?: string;
  className?: string;
}

/** How long the reward stays: the sparks and the tick's draw. */
export const REWARD_MS = 1400;

const SPARKS = [0, 1, 2, 3, 4, 5, 6, 7];

/**
 * A thin ember ring that fills as you cross things off, with the count beside it. The arc eases over dur-tick.
 * Crossing off the last task closes the ring, draws an ink tick inside it and lets eight sparks go: one small
 * reward, then still. It plays once, at the moment the day finishes; a day that loads already done shows the
 * tick without the sparks. Both labels share one cell, so the block is as wide as the longer one and the ring
 * never moves; the labels cross-fade instead.
 */
export function DayProgress({
  done: doneProp = 0,
  total = 0,
  size = 34,
  compact,
  doneNote,
  className,
}: DayProgressProps) {
  const done = Math.min(doneProp, total);
  const r = (size - 4) / 2;
  const c = 2 * Math.PI * r;
  const all = total > 0 && done === total;

  // The reward fires when `all` turns true, never on first render; the timer clears it (and the sparks) after a while.
  const [wasAll, setWasAll] = useState(all);
  const [party, setParty] = useState(0);
  if (all !== wasAll) {
    setWasAll(all);
    if (all) setParty((n) => n + 1);
  }
  useEffect(() => {
    if (!party) return;
    const t = setTimeout(() => setParty(0), REWARD_MS);
    return () => clearTimeout(t);
  }, [party]);

  // The label takes the width of what it says now; when the day is done it eases to the new width.
  const lab = useRef<HTMLSpanElement | null>(null);
  useWidthEase(lab, all ? 'all' : 'some');

  return (
    <div
      className={cx(
        'tp-root tp-prog',
        compact && 'tp-compact',
        all && 'tp-all',
        party && 'tp-party',
        className,
      )}
      role="img"
      aria-label={all ? `All ${total} crossed off` : `${done} of ${total} crossed off`}
    >
      <span className="tp-prog-ring" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
          <circle cx={size / 2} cy={size / 2} r={r} className="tp-prog-track" />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            className="tp-prog-arc"
            style={{ strokeDasharray: c, strokeDashoffset: total ? c * (1 - done / total) : c }}
          />
        </svg>
        <svg
          key={`tick${party}`}
          className="tp-prog-tick"
          viewBox="0 0 24 24"
          aria-hidden="true"
          style={{ width: size * 0.56, height: size * 0.56 }}
        >
          <path d={INK_SHAPE} />
        </svg>
        {party ? (
          <span key={`sp${party}`} className="tp-prog-sparks" aria-hidden="true">
            {SPARKS.map((i) => (
              <i key={i} style={{ '--a': `${i * 45 + 22}deg` } as CSSProperties} />
            ))}
          </span>
        ) : null}
      </span>
      {compact ? (
        <span ref={lab} className="tp-prog-n tp-prog-stack tp-prog-fit" aria-hidden="true">
          <b className={all ? undefined : 'tp-on'}>{`${done}/${total}`}</b>
          <b className={all ? 'tp-on' : undefined}>All done</b>
        </span>
      ) : (
        <span ref={lab} className="tp-prog-t tp-prog-stack tp-prog-fit" aria-hidden="true">
          <span className={all ? undefined : 'tp-on'}>
            <b>{`${done} of ${total}`}</b>
            <span>crossed off</span>
          </span>
          <span className={all ? 'tp-on' : undefined}>
            <b>All crossed off</b>
            <span>{doneNote ?? 'That’s the day'}</span>
          </span>
        </span>
      )}
    </div>
  );
}
