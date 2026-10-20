import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cx } from '../lib/cx';
import { useControllable } from '../lib/hooks';
import { InkTick, PlainTick } from '../lib/ink';
import { Sparkle, useSpark } from '../lib/spark';

export interface CheckboxProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'onChange' | 'children'
> {
  /** The accessible name: the task's title. */
  label: string;
  checked?: boolean;
  defaultChecked?: boolean;
  onChange?: (checked: boolean) => void;
  /** `sm` is the 15px subtask box with the smaller sparkle. */
  size?: 'md' | 'sm';
  /** `ink` (default): the pen-stroke tick breaking out of the corner. `fill`: a filled box with a plain tick. */
  tick?: 'ink' | 'fill';
  /** Turn the completion sparkle off. */
  sparkle?: boolean;
}

/**
 * The tick: a 19px box with radius-xs. Checking it draws the tick over dur-tick and plays the completion
 * sparkle; unchecking plays nothing. For crossing off tasks only; settings use switches.
 */
export const Checkbox = forwardRef<HTMLButtonElement, CheckboxProps>(function Checkbox(
  {
    label,
    checked,
    defaultChecked = false,
    onChange,
    size = 'md',
    tick = 'ink',
    sparkle = true,
    disabled,
    className,
    onClick,
    ...rest
  },
  ref,
) {
  const [on, setOn] = useControllable(checked, defaultChecked);
  const [sparking, fire] = useSpark();
  const ink = tick !== 'fill';
  return (
    <span className="tp-root tp-cbw">
      <button
        ref={ref}
        type="button"
        role="checkbox"
        aria-checked={on ? 'true' : 'false'}
        aria-label={label}
        disabled={disabled}
        className={cx('tp-cb', size === 'sm' && 'tp-sm', ink && 'tp-ink', className)}
        onClick={(e) => {
          onClick?.(e);
          if (disabled || e.defaultPrevented) return;
          const next = !on;
          setOn(next);
          if (next && sparkle) fire();
          onChange?.(next);
        }}
        {...rest}
      >
        {ink ? <InkTick /> : <PlainTick />}
      </button>
      {sparkle ? <Sparkle go={sparking} small={size === 'sm'} /> : null}
    </span>
  );
});
