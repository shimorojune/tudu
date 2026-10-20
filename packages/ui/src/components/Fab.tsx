import type { ButtonHTMLAttributes } from 'react';
import { cx } from '../lib/cx';
import { Icon } from '../lib/icons';

export interface FabProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  /** The accessible name, "New task" by default. */
  label?: string;
}

/**
 * The phone's one floating action: New task. Ink, never red. It tints slightly while pressed and never changes
 * size, so the plus does not move. The page puts it 18px from the right, just above the BottomTabs.
 */
export function Fab({ label = 'New task', className, type = 'button', ...rest }: FabProps) {
  return (
    <button type={type} className={cx('tp-root tp-fab', className)} aria-label={label} {...rest}>
      <Icon name="plus" size={22} stroke={2.2} />
    </button>
  );
}
