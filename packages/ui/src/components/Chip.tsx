import { useRef } from 'react';
import { cx } from '../lib/cx';
import { useWidthEase } from '../lib/hooks';
import { Icon } from '../lib/icons';

export interface ChipProps {
  label: string;
  /** A project's dot colour. */
  color?: string;
  /** Shows the × that clears the filter. */
  onClear?: () => void;
  className?: string;
}

/** An active filter you can clear, shown under the day header ("Northwind ×"). A changed label eases the width. */
export function Chip({ label, color, onClear, className }: ChipProps) {
  const ref = useRef<HTMLSpanElement | null>(null);
  useWidthEase(ref, label);
  return (
    <span ref={ref} className={cx('tp-root tp-chip', className)}>
      {color ? <i className="tp-dot" style={{ background: color }} aria-hidden="true" /> : null}
      <span>{label}</span>
      {onClear ? (
        <button type="button" aria-label={`Clear filter ${label}`} onClick={onClear}>
          <Icon name="x" size={12} />
        </button>
      ) : null}
    </span>
  );
}
