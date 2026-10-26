import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cx } from '../lib/cx';
import { Tooltip, type TooltipSide } from './Tooltip';

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  /** Required: the accessible name and the tooltip. */
  label: string;
  /** The icon, 16px. */
  children: ReactNode;
  /** Where the tooltip sits. `left` by default; `bottom` along a top edge; `bottom-end` at a panel's right edge. */
  tipSide?: TooltipSide;
  /** Only when the label is already visible beside the button. */
  tip?: boolean;
  /** The tooltip, when it says more than the name (a shortcut). The label stays the accessible name. */
  tipLabel?: string;
}

/** A 38px square button with radius-md for a single icon, with a tooltip that names it. */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, children, tipSide = 'left', tip = true, tipLabel, className, type = 'button', ...rest },
  ref,
) {
  const button = (
    <button ref={ref} type={type} className={cx('tp-ib', className)} aria-label={label} {...rest}>
      {children}
    </button>
  );
  if (!tip) return <span className="tp-root">{button}</span>;
  return (
    <Tooltip label={tipLabel ?? label} side={tipSide}>
      {button}
    </Tooltip>
  );
});
