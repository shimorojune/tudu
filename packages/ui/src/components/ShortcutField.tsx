import {
  caps,
  combo,
  comboFromEvent,
  formatCombo,
  heldMods,
  sameCombo,
  spokenCombo,
  SPACE_KEY,
  type Combo,
  type KeyPlatform,
  type Mod,
} from '@tudu/core';
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { cx } from '../lib/cx';
import { Icon } from '../lib/icons';
import { IconButton } from './IconButton';
import { Keys } from './Keys';
import { SettingRow } from './SettingsSection';
import { Skeleton } from './Skeleton';

/** How long the tick stays after a save, and how long it takes to fold away. */
export const SAVED_HOLD_MS = 1500;
export const SAVED_OUT_MS = 220;

const GLYPH: Record<Mod, string> = { ctrl: '⌃', alt: '⌥', shift: '⇧', meta: '⌘' };
const WORD: Record<Mod, string> = { ctrl: 'Ctrl', alt: 'Alt', shift: 'Shift', meta: 'Win' };
const MODIFIER_KEYS = ['Control', 'Alt', 'Shift', 'Meta', 'OS', 'AltGraph'];

/** What a change answers: the line to show when it was refused, or nothing when it was kept. */
export type ShortcutAnswer = string | null | void;

export interface ShortcutRowProps {
  /** "New task". */
  title: string;
  /** What it does, in the row's quiet line. */
  sub: ReactNode;
  /** The keys now; null when it is off. */
  value: Combo | null;
  /** The usual keys: the back arrow appears when the keys differ and puts these back. */
  usual: Combo | null;
  platform: KeyPlatform;
  /** The space row: it listens for keys plus a number and keeps the keys for 1 to 9. */
  digit?: boolean;
  /** The field waits for the Mac app to answer. */
  loading?: boolean;
  /** A standing problem, shown in place of the line (another app took the keys). */
  problem?: string | null;
  /**
   * Checks a press before it is kept (for the space row, `next.key` is the number pressed). The reason it can't be
   * used, or null; while refused the field keeps listening.
   */
  check?: (next: Combo) => string | null;
  /** Keeps the keys (null: off). Answers, at once or later, the line to show when they were refused. */
  onSet?: (next: Combo | null) => ShortcutAnswer | Promise<ShortcutAnswer>;
  className?: string;
}

function labels(mods: Mod[], platform: KeyPlatform): string[] {
  return mods.map((m) => (platform === 'mac' ? GLYPH[m] : WORD[m]));
}

/**
 * One row of Settings › Shortcuts: the name and its line, and the keys in a field at the row's end. Click the field
 * (or Enter) and it listens; the keys save the moment the last one lands, with a tick that folds away. Esc, Tab or a
 * click elsewhere keeps the old keys; Delete turns it off. A refusal shows in red under the name and the field keeps
 * listening. A back arrow appears on a row you changed.
 */
export function ShortcutRow({
  title,
  sub,
  value,
  usual,
  platform,
  digit,
  loading,
  problem,
  check,
  onSet,
  className,
}: ShortcutRowProps) {
  const [rec, setRec] = useState(false);
  const [held, setHeld] = useState<Mod[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [saved, setSaved] = useState<'in' | 'out' | null>(null);
  const timers = useRef<number[]>([]);
  const alive = useRef(true);

  const clear = () => {
    for (const t of timers.current) window.clearTimeout(t);
    timers.current = [];
  };
  useEffect(
    () => () => {
      alive.current = false;
      clear();
    },
    [],
  );

  const stop = () => {
    setRec(false);
    setHeld([]);
    setErr(null);
  };

  const keep = async (next: Combo | null) => {
    stop();
    clear();
    setSaved(null);
    setFailed(null);
    let answer: ShortcutAnswer;
    try {
      answer = await onSet?.(next);
    } catch (e) {
      answer = typeof e === 'string' ? e : e instanceof Error ? e.message : 'Couldn’t save that. Try again.';
    }
    if (!alive.current) return;
    if (answer) {
      setFailed(answer);
      return;
    }
    if (!next) return;
    setSaved('in');
    timers.current.push(
      window.setTimeout(() => setSaved('out'), SAVED_HOLD_MS),
      window.setTimeout(() => setSaved(null), SAVED_HOLD_MS + SAVED_OUT_MS),
    );
  };

  const start = () => {
    if (rec || loading) return;
    clear();
    setSaved(null);
    setFailed(null);
    setErr(null);
    setHeld([]);
    setRec(true);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (!rec) return;
    if (e.key === 'Tab') {
      stop();
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    if (e.repeat) return;
    if (MODIFIER_KEYS.includes(e.key)) {
      setHeld(heldMods(e));
      return;
    }
    const mods = heldMods(e);
    if (!mods.length && e.key === 'Escape') {
      stop();
      return;
    }
    if (!mods.length && (e.key === 'Backspace' || e.key === 'Delete')) {
      void keep(null);
      return;
    }
    const next = comboFromEvent(e);
    if (!next) return;
    const why = check?.(next) ?? null;
    if (why) {
      setErr(why);
      setHeld([]);
      return;
    }
    void keep(digit ? combo(next.mods, SPACE_KEY) : next);
  };

  const onKeyUp = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (!rec) return;
    // Space and Enter would press the button again on the way up.
    e.preventDefault();
    setHeld(heldMods(e));
  };

  const range = !!digit && !!value;
  const spoken = value ? spokenCombo(value, platform) : 'off';
  const changed = !rec && !(value === null && usual === null) && !sameCombo(value, usual);
  const usualText = usual
    ? digit
      ? `${formatCombo(usual, platform, '1')} to ${formatCombo(usual, platform, '9')}`
      : formatCombo(usual, platform)
    : 'off';
  const line = err ?? failed ?? problem ?? null;

  let inner: ReactNode;
  if (rec && held.length === 0)
    inner = <span className="tp-kf-ask">{digit ? 'Press keys + a number' : 'Press the new keys'}</span>;
  else if (rec)
    inner = (
      <>
        <Keys caps={labels(held, platform)} />
        {digit ? (
          <span className="tp-kf-ask" style={{ animation: 'none' }}>
            + a number
          </span>
        ) : (
          <span className="tp-kf-caret" aria-hidden="true" />
        )}
      </>
    );
  else if (value)
    inner = <Keys caps={caps(value, platform, '1')} to={range ? caps(value, platform, '9') : undefined} />;
  else inner = <span className="tp-kf-off">Off</span>;

  return (
    <SettingRow
      className={className}
      title={title}
      sub={
        line ? (
          <span key={line} className="tp-kf-line tp-set-bad" role="alert">
            {line}
          </span>
        ) : (
          sub
        )
      }
      control={
        loading ? (
          <Skeleton width={136} height={34} />
        ) : (
          <span className="tp-kf-w">
            {changed ? (
              <IconButton
                label={`Back to ${usualText}`}
                className="tp-kf-reset"
                onClick={() => void keep(usual)}
              >
                <Icon name="undo" size={15} />
              </IconButton>
            ) : null}
            <button
              type="button"
              className={cx(
                'tp-kf',
                rec && 'tp-rec',
                rec && err && 'tp-bad',
                // Keys that stopped working are red until changed; a refused change leaves the old keys calm.
                !rec && !failed && problem && 'tp-bad',
                !rec && saved && 'tp-saved',
              )}
              aria-label={`${title} shortcut, ${spoken}. ${rec ? 'Press the new keys' : 'Press to change'}`}
              data-listening={rec || undefined}
              onClick={start}
              onKeyDown={onKeyDown}
              onKeyUp={onKeyUp}
              onBlur={() => rec && stop()}
            >
              {inner}
              {!rec && saved && value ? (
                <span className={cx('tp-kf-ok', saved === 'out' && 'tp-out')} aria-hidden="true">
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M5 12.4 9.8 17.2 19.2 6.8" />
                  </svg>
                </span>
              ) : null}
            </button>
          </span>
        )
      }
    />
  );
}
