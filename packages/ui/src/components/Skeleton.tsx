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
  className,
}: {
  rows?: number;
  compact?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cx('tp-root tp-skl', compact && 'tp-compact', className)}
      aria-busy="true"
      aria-label="Loading tasks"
    >
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="tp-skl-row">
          <span className="tp-skel tp-skl-box" />
          <div className="tp-skl-lines">
            <Skeleton width={`${WIDTHS[i % WIDTHS.length]}%`} height={12} />
            <Skeleton width={`${24 + ((i * 13) % 30)}%`} height={8} />
          </div>
        </div>
      ))}
    </div>
  );
}
