import { useEffect, useId, useRef, useState, type RefObject } from 'react';
import { cx } from '../lib/cx';
import { useControllable } from '../lib/hooks';
import { Icon } from '../lib/icons';

export interface CodeFieldProps {
  /** The digits so far; controlled when given. */
  value?: string;
  defaultValue?: string;
  /** Every change, digits only. */
  onChange?: (code: string) => void;
  /** Fires once, when the last box fills. */
  onComplete?: (code: string) => void;
  /** The line under the boxes, in red; the row nudges once when it arrives. */
  error?: string | null;
  /** Bump it for each new error so the row nudges again, even for the same words. */
  errorKey?: number;
  /** While the code is being checked, or after too many tries. */
  disabled?: boolean;
  /** Take focus a beat after mounting, once the step has slid in. */
  autoFocus?: boolean;
  /** How many digits, 6 by default. */
  length?: number;
  /** The accessible name, "The 6-digit code" by default. */
  label?: string;
  className?: string;
}

/** The step slides in over 300ms; the field takes focus once it has settled. */
const FOCUS_DELAY_MS = 260;

interface CodeRowProps {
  value: string;
  length: number;
  disabled: boolean | undefined;
  invalid: boolean;
  describedBy: string | undefined;
  label: string;
  /** Focus after the slide-in (a fresh field). */
  autoFocus: boolean | undefined;
  /** Focus at once (the row came back after a wrong code). */
  focusNow: boolean;
  input: RefObject<HTMLInputElement | null>;
  onChange: (next: string) => void;
}

// The row owns the focus flag so a re-mount (a new error) starts without a stale ring.
function CodeRow({
  value,
  length,
  disabled,
  invalid,
  describedBy,
  label,
  autoFocus,
  focusNow,
  input,
  onChange,
}: CodeRowProps) {
  const [focus, setFocus] = useState(false);

  useEffect(() => {
    if (disabled || !(autoFocus || focusNow)) return;
    if (focusNow) {
      input.current?.focus({ preventScroll: true });
      return;
    }
    const t = setTimeout(() => input.current?.focus({ preventScroll: true }), FOCUS_DELAY_MS);
    return () => clearTimeout(t);
  }, [autoFocus, focusNow, disabled, input]);

  const boxes = [];
  for (let i = 0; i < length; i++) {
    const digit = value[i];
    const on = focus && !disabled && i === Math.min(value.length, length - 1);
    boxes.push(
      <span
        key={i}
        className={cx('tp-code-b', on && 'tp-on', digit && 'tp-has', i === length / 2 - 1 && 'tp-code-mid')}
      >
        {digit ? (
          <span key={`d${digit}${i}`} className="tp-code-d">
            {digit}
          </span>
        ) : null}
      </span>,
    );
  }

  return (
    <div className="tp-code-row" onClick={() => input.current?.focus()}>
      {boxes}
      <input
        ref={input}
        className="tp-code-in"
        value={value}
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={length}
        disabled={disabled}
        aria-label={label}
        aria-invalid={invalid ? 'true' : undefined}
        aria-describedby={describedBy}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocus(true)}
        onBlur={() => setFocus(false)}
      />
    </div>
  );
}

/**
 * The 6-digit code from the sign-in email: six boxes over one real input, so paste and the phone's one-time-code
 * autofill just work. The box you are on has the ink ring (never red); digits pop in. A wrong code nudges the row
 * once, edges the boxes in red and says so under them.
 */
export function CodeField({
  value,
  defaultValue,
  onChange,
  onComplete,
  error,
  errorKey = 0,
  disabled,
  autoFocus,
  length = 6,
  label,
  className,
}: CodeFieldProps) {
  const [val, setVal] = useControllable(value, defaultValue ?? '');
  const input = useRef<HTMLInputElement | null>(null);
  const errorId = `${useId()}-err`;
  // Each new error re-mounts the row so the nudge plays again. Clearing the error (typing on) keeps the row, and
  // with it the focus. The key the field mounted with is the one that must not refocus (state boards).
  const rowKey = `bad${errorKey}`;
  const [firstKey] = useState(rowKey);

  function change(next: string) {
    const v = next.replace(/\D/g, '').slice(0, length);
    setVal(v);
    onChange?.(v);
    if (v.length === length && v !== val) onComplete?.(v);
  }

  return (
    <div className={cx('tp-root tp-code', error && 'tp-bad', disabled && 'tp-off', className)}>
      <CodeRow
        key={rowKey}
        value={val}
        length={length}
        disabled={disabled}
        invalid={!!error}
        describedBy={error ? errorId : undefined}
        label={label ?? `The ${length}-digit code`}
        autoFocus={autoFocus}
        focusNow={rowKey !== firstKey}
        input={input}
        onChange={change}
      />
      {error ? (
        <div className="tp-help" id={errorId} role="alert">
          <Icon name="error" size={13} stroke={2.2} />
          {error}
        </div>
      ) : null}
    </div>
  );
}
