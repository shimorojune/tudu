import { useCallback, useEffect, useRef, useState } from 'react';
import { cx } from './cx';

/**
 * The completion sparkle: five stars, one of them ember. The subtask sparkle (`small`) is its little sibling:
 * three gold stars that flick up and to the right on a shorter, quicker hop, and no ember star.
 */
export function Sparkle({ go, small }: { go: boolean; small?: boolean }) {
  if (small) {
    return (
      <span className={cx('tp-spark tp-spark-sm', go && 'tp-go')} aria-hidden="true" data-testid="sparkle">
        <i />
        <i />
        <i />
      </span>
    );
  }
  return (
    <span className={cx('tp-spark', go && 'tp-go')} aria-hidden="true" data-testid="sparkle">
      <i />
      <i />
      <i />
      <i />
      <i />
    </span>
  );
}

/** Play the sparkle once; it clears itself after 900ms. Returns [playing, fire]. */
export function useSpark(): [boolean, () => void] {
  const [n, setN] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const fire = useCallback(() => {
    setN((x) => x + 1);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setN(0), 900);
  }, []);
  return [n > 0, fire];
}
