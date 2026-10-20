import { Tooltip as RadixTooltip } from 'radix-ui';
import type { ReactElement } from 'react';
import { cx } from '../lib/cx';

export type TooltipSide = 'left' | 'right' | 'bottom' | 'bottom-end' | 'top';

export interface TooltipProps {
  /** A few words. Never an action. */
  label: string;
  /** The target: one element that can take a ref. */
  children: ReactElement;
  /** `left` by default; `right` near the left edge; `bottom` along a top edge; `bottom-end` at a panel's right edge. */
  side?: TooltipSide;
  /** For static boards and tests: keep it shown. */
  open?: boolean;
  className?: string;
}

/** Appears after dur-tooltip-delay (380ms) on hover or keyboard focus, beside the target, never over the row. A click hides it. */
export const TOOLTIP_DELAY_MS = 380;

export function Tooltip({ label, children, side = 'left', open, className }: TooltipProps) {
  const radixSide = side === 'bottom-end' ? 'bottom' : side;
  const align = side === 'bottom-end' ? 'end' : 'center';
  return (
    <RadixTooltip.Provider delayDuration={TOOLTIP_DELAY_MS} skipDelayDuration={0} disableHoverableContent>
      <RadixTooltip.Root open={open}>
        <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
        <RadixTooltip.Portal>
          <RadixTooltip.Content
            className={cx('tp-root tp-tip-pop', className)}
            side={radixSide}
            align={align}
            sideOffset={8}
            collisionPadding={8}
          >
            {label}
          </RadixTooltip.Content>
        </RadixTooltip.Portal>
      </RadixTooltip.Root>
    </RadixTooltip.Provider>
  );
}
