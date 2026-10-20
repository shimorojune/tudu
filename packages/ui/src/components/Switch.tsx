import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cx } from '../lib/cx';
import { useControllable } from '../lib/hooks';

export interface SwitchProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onChange' | 'children'> {
  /** Read aloud. */
  label: string;
  checked?: boolean;
  defaultChecked?: boolean;
  onChange?: (on: boolean) => void;
}

/** On or off for one setting. The track fills with ink when on (never red); the knob slides with a short settle. */
export const Switch = forwardRef<HTMLButtonElement, SwitchProps>(function Switch(
  { label, checked, defaultChecked = false, onChange, disabled, className, onClick, ...rest },
  ref,
) {
  const [on, setOn] = useControllable(checked, defaultChecked);
  return (
    <button
      ref={ref}
      type="button"
      role="switch"
      aria-checked={on ? 'true' : 'false'}
      aria-label={label}
      disabled={disabled}
      className={cx('tp-root tp-switch', on && 'tp-on', className)}
      onClick={(e) => {
        onClick?.(e);
        if (disabled || e.defaultPrevented) return;
        const next = !on;
        setOn(next);
        onChange?.(next);
      }}
      {...rest}
    >
      <span className="tp-switch-k" aria-hidden="true" />
    </button>
  );
});
