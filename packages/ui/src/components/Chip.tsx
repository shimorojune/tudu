import { useRef } from 'react';
import { cx } from '../lib/cx';
import { useWidthEase } from '../lib/hooks';
import { Icon } from '../lib/icons';
import { SpaceTile, type SpaceTileSpace } from './SpaceTile';

export interface ChipProps {
  label: string;
  /** A project's dot colour. */
  color?: string;
  /** A space filter (All spaces): the space's small tile in place of a dot. */
  space?: SpaceTileSpace;
  /** Shows the × that clears the filter. */
  onClear?: () => void;
  className?: string;
}

/** An active filter you can clear, shown under the day header ("Northwind ×"). A changed label eases the width. */
export function Chip({ label, color, space, onClear, className }: ChipProps) {
  const ref = useRef<HTMLSpanElement | null>(null);
  useWidthEase(ref, label);
  return (
    <span ref={ref} className={cx('tp-root tp-chip', space && 'tp-chip-space', className)}>
      {!space && color ? <i className="tp-dot" style={{ background: color }} aria-hidden="true" /> : null}
      <span>
        {/* Inside the label's text line, so the tile hangs off its baseline (see .tp-chip-tile). */}
        {space ? <SpaceTile space={space} size={14} className="tp-chip-tile" /> : null}
        {label}
      </span>
      {onClear ? (
        <button type="button" aria-label={`Clear filter ${label}`} onClick={onClear}>
          <Icon name="x" size={12} />
        </button>
      ) : null}
    </span>
  );
}
