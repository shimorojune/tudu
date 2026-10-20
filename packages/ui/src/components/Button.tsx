import { forwardRef, useLayoutEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cx } from '../lib/cx';
import { TICK_PATH } from '../lib/ink';

export type ButtonVariant = 'primary' | 'secondary' | 'quiet' | 'danger';

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  /** The label. Says what happens: "New task", "Reconnect", "Delete". */
  children?: ReactNode;
  /** `primary` is ink (one per view); there is no red button. */
  variant?: ButtonVariant;
  /** 32px for small inline actions inside a panel. */
  size?: 'md' | 'sm';
  /** A 14px icon before the label. */
  icon?: ReactNode;
  /** Work in progress without a known amount: a spinner and a soft sheen. Ignores clicks. */
  loading?: boolean;
  loadingLabel?: ReactNode;
  /** Work in progress with a known amount (0 to 1): the fill grows behind the label. */
  progress?: number;
  /** Finished: the tick draws in and the label confirms. */
  success?: boolean;
  successLabel?: ReactNode;
}

/**
 * A 38px action button with radius-lg. Loading never greys it out; when the label changes the button eases from
 * its old width to the new one and the new label fades up into place. Pressing tints, never shrinks.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    children,
    variant = 'primary',
    size = 'md',
    icon,
    loading,
    loadingLabel,
    progress,
    success,
    successLabel,
    className,
    disabled,
    onClick,
    type = 'button',
    style,
    ...rest
  },
  forwardedRef,
) {
  const inner = useRef<HTMLButtonElement | null>(null);
  const lastWidth = useRef(0);
  const busy = !!loading || typeof progress === 'number';
  const pct = typeof progress === 'number' ? Math.max(0, Math.min(1, progress)) : null;

  let shownIcon = icon ?? null;
  let label = children;
  let mode: 'idle' | 'busy' | 'done' = 'idle';
  if (busy) {
    mode = 'busy';
    shownIcon = (
      <svg className="tp-spin" width={14} height={14} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx={12} cy={12} r={9} stroke="currentColor" strokeWidth={2.5} opacity={0.25} />
        <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" />
      </svg>
    );
    label = loadingLabel ?? label;
  } else if (success) {
    mode = 'done';
    shownIcon = (
      <svg className="tp-done-tick" width={14} height={14} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d={TICK_PATH}
          stroke="currentColor"
          strokeWidth={2.75}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
    label = successLabel ?? label;
  }
  const labelKey = `${mode}:${typeof label === 'string' ? label : ''}`;
  const hasIcon = !!shownIcon;

  // When the label changes, ease the width from the old size to the new one; never cut text off.
  useLayoutEffect(() => {
    const el = inner.current;
    if (!el) return;
    const from = lastWidth.current;
    el.style.width = '';
    const to = el.getBoundingClientRect().width;
    lastWidth.current = to;
    if (!from || Math.abs(from - to) < 0.5) return;
    el.style.width = `${from}px`;
    void el.offsetWidth;
    el.style.width = `${to}px`;
    const done = (e: TransitionEvent) => {
      if (e.propertyName === 'width') {
        el.style.width = '';
        el.removeEventListener('transitionend', done);
      }
    };
    el.addEventListener('transitionend', done);
    return () => el.removeEventListener('transitionend', done);
  }, [labelKey, hasIcon]);

  return (
    <button
      ref={(node) => {
        inner.current = node;
        if (typeof forwardedRef === 'function') forwardedRef(node);
        else if (forwardedRef) forwardedRef.current = node;
      }}
      type={type}
      className={cx(
        'tp-root tp-btn',
        `tp-btn-${variant}`,
        size === 'sm' && 'tp-sm',
        busy && 'tp-busy',
        pct === null && loading && 'tp-indet',
        success && 'tp-ok',
        className,
      )}
      disabled={disabled}
      aria-busy={busy ? 'true' : undefined}
      aria-disabled={busy ? 'true' : undefined}
      onClick={busy ? undefined : onClick}
      style={pct !== null ? ({ ...style, '--p': pct } as React.CSSProperties) : style}
      data-mode={mode}
      {...rest}
    >
      {pct !== null ? <span className="tp-btn-fill" aria-hidden="true" /> : null}
      {shownIcon}
      <span key={mode} className="tp-btn-label" aria-live="polite">
        {pct !== null && mode === 'busy' && !loadingLabel ? `${Math.round(pct * 100)}%` : label}
      </span>
    </button>
  );
});
