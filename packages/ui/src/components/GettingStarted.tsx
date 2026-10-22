import { useEffect, useState, type CSSProperties } from 'react';
import { cx } from '../lib/cx';
import { Icon } from '../lib/icons';
import { TICK_PATH } from '../lib/ink';
import { IconButton } from './IconButton';

/** How long the card takes to sink and fade once it is closed. */
export const GS_LEAVE_MS = 220;

export interface GettingStartedItem {
  key: string;
  label: string;
  /** The quieter second line. */
  sub?: string;
  done?: boolean;
  /** The way in; a done row ignores clicks. */
  onDo?: () => void;
}

export interface GettingStartedProps {
  items: GettingStartedItem[];
  /** False eases the card away (220ms), then it unmounts. */
  open?: boolean;
  /** Folded to its one line at first; phones start folded. */
  collapsed?: boolean;
  /** The title was clicked: the card folded (true) or unfolded. */
  onCollapse?: (collapsed: boolean) => void;
  /** × (Hide). */
  onClose?: () => void;
  /** Sits beside the phone's New task button instead of in the corner. */
  phone?: boolean;
  /** In the flow of the page, for the kit. */
  inline?: boolean;
  className?: string;
}

/**
 * Getting started: a small card in the corner of a new person's first days. A few things worth doing, each ticking
 * itself off as you do it; "You're set" when all are done, then it eases away. Folds to one line; × hides it.
 */
export function GettingStarted({
  items,
  open = true,
  collapsed,
  onCollapse,
  onClose,
  phone,
  inline,
  className,
}: GettingStartedProps) {
  const done = items.filter((x) => x.done).length;
  const all = items.length > 0 && done === items.length;
  const [col, setCol] = useState(collapsed !== undefined ? collapsed : !!phone);
  const [mounted, setMounted] = useState(open);
  const [leaving, setLeaving] = useState(false);
  const [was, setWas] = useState(open);
  if (open !== was) {
    setWas(open);
    if (open) {
      setLeaving(false);
      setMounted(true);
    } else if (mounted) setLeaving(true);
  }
  useEffect(() => {
    if (!leaving) return;
    const t = setTimeout(() => setMounted(false), GS_LEAVE_MS);
    return () => clearTimeout(t);
  }, [leaving]);

  if (!mounted) return null;
  const fold = () => {
    setCol(!col);
    onCollapse?.(!col);
  };
  return (
    <section
      className={cx(
        'tp-root tp-gs',
        inline && 'tp-gs-inline',
        phone && 'tp-gs-phone',
        col && 'tp-collapsed',
        all && 'tp-all',
        leaving && 'tp-leaving',
        className,
      )}
      aria-label="Getting started"
    >
      <div className="tp-gs-h">
        <button type="button" className="tp-gs-t" aria-expanded={col ? 'false' : 'true'} onClick={fold}>
          <span
            className="tp-gs-ring"
            style={{ '--p': items.length ? done / items.length : 0 } as CSSProperties}
          />
          <span>{all ? 'You’re set' : 'Getting started'}</span>
          <span className="tp-gs-n">
            {done} of {items.length}
          </span>
          <span className="tp-gs-chev" aria-hidden="true">
            <Icon name="right" size={13} />
          </span>
        </button>
        <IconButton label="Hide" tipSide="bottom-end" onClick={onClose}>
          <Icon name="x" size={14} />
        </IconButton>
      </div>
      <div className="tp-gs-b">
        <div className="tp-gs-bi" inert={col || undefined}>
          {items.map((x) => (
            <button
              key={x.key}
              type="button"
              className={cx('tp-gs-it', x.done && 'tp-done')}
              // The two lines would run together as one name ("photoSo people"): read them with a pause.
              aria-label={x.sub ? `${x.label}, ${x.sub}` : x.label}
              aria-disabled={x.done || undefined}
              onClick={() => {
                if (!x.done) x.onDo?.();
              }}
            >
              <span className="tp-gs-box" aria-hidden="true">
                {x.done ? (
                  <svg
                    width={12}
                    height={12}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={3}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d={TICK_PATH} />
                  </svg>
                ) : null}
              </span>
              <span className="tp-gs-l">
                <span>{x.label}</span>
                {x.sub ? <span>{x.sub}</span> : null}
              </span>
              {x.done ? null : (
                <span className="tp-gs-go" aria-hidden="true">
                  <Icon name="right" size={13} />
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
