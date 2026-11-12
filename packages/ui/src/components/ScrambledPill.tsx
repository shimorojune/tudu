import { cx } from '../lib/cx';
import { Icon } from '../lib/icons';
import { setScramble, useScramble } from '../lib/scramble';

export interface ScrambledPillProps {
  /** Boards pass it; the app follows the device's switch. */
  on?: boolean;
  onOff?: () => void;
  className?: string;
}

/**
 * Scrambled (#67): sits in every window's top bar while Scramble my text is on, so a screenshot can't be mistaken
 * for real words and the mode isn't left on by accident. Clicking it turns the mode off.
 */
export function ScrambledPill({ on, onOff, className }: ScrambledPillProps) {
  const device = useScramble();
  if (!(on ?? device.on)) return null;
  return (
    <button
      type="button"
      className={cx('tp-root tp-scr-pill', className)}
      aria-label="Scrambled: turn Scramble my text off"
      title="Your words are scrambled. Click to turn it off."
      onClick={() => (onOff ? onOff() : setScramble(false))}
    >
      <Icon name="shuffle" size={12} />
      Scrambled
    </button>
  );
}
