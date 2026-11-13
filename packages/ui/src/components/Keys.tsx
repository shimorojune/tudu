import { cx } from '../lib/cx';

export interface KeysProps {
  /** One label per key, in the order they are pressed: `['⇧', '⌘', 'N']`. */
  caps: string[];
  /** A range's last keys (`['⌃', '9']`): drawn after "to". */
  to?: string[];
  className?: string;
}

/** A shortcut drawn as key caps, one per key, in the quiet mono type menus use. */
export function Keys({ caps, to, className }: KeysProps) {
  return (
    <span className={cx('tp-keys', className)}>
      {caps.map((c, i) => (
        <kbd key={`${i}-${c}`}>{c}</kbd>
      ))}
      {to ? (
        <>
          <span className="tp-keys-to">to</span>
          {to.map((c, i) => (
            <kbd key={`to-${i}-${c}`}>{c}</kbd>
          ))}
        </>
      ) : null}
    </span>
  );
}
