import { cx } from '../lib/cx';

export interface AppMarkProps {
  /** The app's name: its first letter is the mark when there is no icon. */
  name: string;
  /** A verified app's logo (Claude, ChatGPT, Cursor): drawn at 62% on the tile. */
  icon?: string | null;
  /** Pixel size, 28 by default. */
  size?: number;
  className?: string;
}

/** A connected app's square: its logo when Tudu knows the app, otherwise its first letter on a soft tile. */
export function AppMark({ name, icon, size = 28, className }: AppMarkProps) {
  if (icon) {
    const inner = Math.round(size * 0.62);
    return (
      <span
        className={cx('tp-ai-mark tp-ai-mark-img', className)}
        aria-hidden="true"
        style={{ width: size, height: size }}
      >
        <img src={icon} alt="" width={inner} height={inner} />
      </span>
    );
  }
  return (
    <span
      className={cx('tp-ai-mark', className)}
      aria-hidden="true"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.46) }}
    >
      {(name.trim() || '?').charAt(0).toUpperCase()}
    </span>
  );
}
