import { Fragment } from 'react';
import { cx } from '../lib/cx';

export interface SkeletonProps {
  width?: number | string;
  /** 12px by default. */
  height?: number | string;
  className?: string;
}

/** A shimmer bar that holds the place of a row while it loads. No spinners on the day page. */
export function Skeleton({ width = '100%', height = 12, className }: SkeletonProps) {
  return <div className={cx('tp-root tp-skel', className)} style={{ width, height }} aria-hidden="true" />;
}

const WIDTHS = [72, 54, 86, 40, 64, 58, 78];

/** The list while a day loads: shimmer bars in the shape of rows. */
export function TaskListSkeleton({
  rows = 5,
  compact,
  grouped,
  className,
}: {
  rows?: number;
  compact?: boolean;
  /** By project: a header bar before the first row and again halfway, the shape the groups will take. */
  grouped?: boolean;
  className?: string;
}) {
  const half = Math.ceil(rows / 2);
  return (
    <div
      className={cx('tp-root tp-skl', compact && 'tp-compact', className)}
      aria-busy="true"
      aria-label="Loading tasks"
    >
      {Array.from({ length: rows }, (_, i) => (
        <Fragment key={i}>
          {grouped && (i === 0 || i === half) ? (
            <div className="tp-skl-gh">
              <Skeleton width={14} height={10} />
              <Skeleton width={i === 0 ? 96 : 72} height={10} />
            </div>
          ) : null}
          <div className="tp-skl-row">
            <span className="tp-skel tp-skl-box" />
            <div className="tp-skl-lines">
              <Skeleton width={`${WIDTHS[i % WIDTHS.length]}%`} height={12} />
              <Skeleton width={`${24 + ((i * 13) % 30)}%`} height={8} />
            </div>
          </div>
        </Fragment>
      ))}
    </div>
  );
}
