import { Fragment, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { cx } from '../lib/cx';
import { useOutside } from '../lib/hooks';
import { Icon } from '../lib/icons';
import { Linger } from '../lib/linger';
import { SpaceTile, type SpaceTileSpace } from './SpaceTile';

export interface SwitchSpace extends SpaceTileSpace {
  id: string;
  name: string;
  /** "Just you", "5 people". */
  sub?: string;
  /** What is new in that space's Inbox, shown as "N new" on the others. */
  count?: number;
}

export interface SpaceSwitchProps {
  spaces: SwitchSpace[];
  /** The id of the space you are in. */
  active?: string;
  onPick?: (space: SwitchSpace) => void;
  onCreate?: () => void;
  /** `menu` (the default) pops the list under the name; `sheet` (phones) raises it from the bottom over a veil. */
  variant?: 'menu' | 'sheet';
  /** The tablet rail: only the tile shows; the list opens beside it. */
  rail?: boolean;
  /** The kit: start open. */
  defaultOpen?: boolean;
  className?: string;
}

/** The sheet slides back down for this long before it goes. */
export const SSW_SHEET_LEAVE_MS = 220;
/** The picked row's check draws in for this long before the list closes. */
export const SSW_PICK_MS = 150;

/**
 * The space's tile and name with a chevron, at the top of the sidebar or in the phone's header. It opens the list of
 * spaces: a tile and name each with a quiet line, "N new" on the others, a tick on the one you are in, and Create a
 * space at the foot. A brand dot by the name says something is new in another space.
 */
export function SpaceSwitch({
  spaces,
  active,
  onPick,
  onCreate,
  variant = 'menu',
  rail,
  defaultOpen,
  className,
}: SpaceSwitchProps) {
  const cur = spaces.find((s) => s.id === active) ?? spaces[0];
  const sheet = variant === 'sheet';
  const [open, setOpen] = useState(!!defaultOpen);
  const [leaving, setLeaving] = useState(false);
  const box = useRef<HTMLDivElement | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  useOutside(open && !sheet, box, () => setOpen(false));
  // Esc closes the list and puts focus back on the name.
  useEffect(() => {
    if (!open) return;
    function key(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      close();
      box.current?.querySelector<HTMLElement>('.tp-ssw-b')?.focus({ preventScroll: true });
    }
    document.addEventListener('keydown', key, true);
    return () => document.removeEventListener('keydown', key, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- close reads the latest state through setState
  }, [open]);

  // The row you chose takes the check (drawn in) for a beat before the list goes, so the choice reads as made.
  const [picked, setPicked] = useState<string | null>(null);
  const pickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (pickTimer.current) clearTimeout(pickTimer.current);
    },
    [],
  );
  // The trigger's tile and name rise in when the space changes, never on first paint.
  const first = useRef(cur?.id);

  const others = spaces.reduce((n, s) => n + (s.id !== cur?.id && s.count ? s.count : 0), 0);

  // The sheet slides back down before it goes (and before the space changes), so closing reads as calmly as opening.
  function close(then?: () => void) {
    if (!sheet || !open) {
      setOpen(false);
      then?.();
      return;
    }
    if (leaving) return;
    setLeaving(true);
    timer.current = setTimeout(() => {
      setOpen(false);
      setLeaving(false);
      then?.();
    }, SSW_SHEET_LEAVE_MS);
  }
  function pick(s: SwitchSpace) {
    if (s.id === cur?.id) {
      close();
      return;
    }
    if (picked) return;
    setPicked(s.id);
    pickTimer.current = setTimeout(
      () =>
        close(() => {
          setPicked(null);
          onPick?.(s);
        }),
      SSW_PICK_MS,
    );
  }

  const list = (
    <div className="tp-sswl" role="menu" aria-label="Spaces">
      <div className="tp-mh">Spaces</div>
      {spaces.map((s) => {
        const on = picked ? s.id === picked : s.id === cur?.id;
        const row = (
          <button
            key={s.id}
            type="button"
            role="menuitemradio"
            aria-checked={on ? 'true' : 'false'}
            className={cx('tp-sswl-it', on && 'tp-on', picked === s.id && 'tp-picked')}
            onClick={() => pick(s)}
          >
            <SpaceTile space={s} size={28} />
            <span className="tp-sswl-n">
              <span>{s.name}</span>
              {s.sub ? <span className="tp-sswl-sub">{s.sub}</span> : null}
            </span>
            {s.count && !on ? (
              <span className="tp-sswl-c">{s.count} new</span>
            ) : on ? (
              <span className="tp-sswl-ok" aria-hidden="true">
                <svg
                  width={14}
                  height={14}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2.6}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M5 12.4 9.8 17.2 19.2 6.8" />
                </svg>
              </span>
            ) : null}
          </button>
        );
        // All spaces sits on top, apart from the spaces themselves.
        return s.all ? (
          <Fragment key={s.id}>
            {row}
            <div className="tp-sswl-sep" role="separator" />
          </Fragment>
        ) : (
          row
        );
      })}
      {onCreate ? (
        <div className="tp-sswl-foot">
          <button type="button" role="menuitem" className="tp-mi" onClick={() => close(onCreate)}>
            <Icon name="plus" size={14} />
            Create a space
          </button>
        </div>
      ) : null}
    </div>
  );

  const trigger = (
    <button
      type="button"
      className={cx('tp-ssw-b', open && 'tp-on')}
      aria-haspopup="menu"
      aria-expanded={open ? 'true' : 'false'}
      aria-label={rail ? `Space: ${cur?.name ?? ''}` : undefined}
      onClick={() => (open ? close() : setOpen(true))}
    >
      {cur ? (
        <span key={cur.id} className={cx('tp-ssw-id', cur.id !== first.current && 'tp-ssw-swap')}>
          <SpaceTile space={cur} size={26} />
          <span className="tp-ssw-name">{cur.name}</span>
        </span>
      ) : null}
      {others ? <span className="tp-ssw-pip" aria-label={`${others} new in other spaces`} /> : null}
      <span className="tp-ssw-chev" aria-hidden="true">
        <Icon name="right" size={13} />
      </span>
    </button>
  );

  if (sheet)
    return (
      <div ref={box} className={cx('tp-root tp-ssw tp-ssw-sheet', className)}>
        {trigger}
        {open && typeof document !== 'undefined'
          ? createPortal(
              <div
                className={cx('tp-root tp-sswsheet', leaving && 'tp-leaving')}
                role="dialog"
                aria-label="Spaces"
              >
                <div className="tp-sswsheet-veil" onClick={() => close()} />
                <div className="tp-sswsheet-p">
                  <div className="tp-qa-grabber" aria-hidden="true" />
                  {list}
                </div>
              </div>,
              document.body,
            )
          : null}
      </div>
    );
  return (
    <div ref={box} className={cx('tp-root tp-ssw', rail && 'tp-ssw-rail', className)}>
      {trigger}
      <Linger open={open} className="tp-ssw-pop">
        {list}
      </Linger>
    </div>
  );
}
