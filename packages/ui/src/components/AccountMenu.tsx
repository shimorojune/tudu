import { Popover } from 'radix-ui';
import { useState } from 'react';
import { cx } from '../lib/cx';
import { useControllable } from '../lib/hooks';
import { Icon } from '../lib/icons';
import { setScramble, useMine, useScramble } from '../lib/scramble';
import type { ThemeChoice } from '../lib/theme';
import { Avatar } from './Avatar';
import { PersonDot } from './PersonDot';
import { Segmented, type SegmentedItem } from './Segmented';
import { Switch } from './Switch';

export interface AccountMenuPerson {
  name: string;
  email?: string;
  initials: string;
  color?: string;
  image?: string;
}

export interface AccountMenuProps {
  me: AccountMenuPerson;
  /** The theme choice; kept locally when not given. */
  theme?: ThemeChoice;
  onTheme?: (choice: ThemeChoice) => void;
  /** Scramble my text (#67). Follows the device's switch when not given (boards pass it). */
  scramble?: boolean;
  onScramble?: (on: boolean) => void;
  onSettings?: () => void;
  /** Send feedback, between Settings and Sign out. Without it the line stays out. */
  onFeedback?: () => void;
  onSignOut?: () => void;
  /** For static boards: start open. */
  defaultOpen?: boolean;
  className?: string;
}

const THEMES: SegmentedItem<ThemeChoice>[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
];

/**
 * You, from the avatar at the end of the top bar: your mark, name and email, the theme as a small
 * Light | Dark | System switch, Scramble my text under it, Settings, Send feedback and Sign out. Radix floats the pop and handles Escape, a click outside
 * and focus; it eases in and out like every pop (tp-acct-pop, see app.css).
 */
export function AccountMenu({
  me,
  theme,
  onTheme,
  scramble,
  onScramble,
  onSettings,
  onFeedback,
  onSignOut,
  defaultOpen,
  className,
}: AccountMenuProps) {
  const [open, setOpen] = useState(!!defaultOpen);
  const [choice, setChoice] = useControllable<ThemeChoice>(theme, 'system');
  const device = useScramble();
  const scrambled = scramble ?? device.on;
  const mine = useMine();
  const closeThen = (then?: () => void) => {
    setOpen(false);
    then?.();
  };
  return (
    <div className={cx('tp-root tp-acct', className)}>
      <Popover.Root open={open} onOpenChange={setOpen}>
        <Popover.Trigger asChild>
          <button
            type="button"
            className={cx('tp-acct-b', open && 'tp-on')}
            aria-haspopup="menu"
            aria-expanded={open ? 'true' : 'false'}
            aria-label={`You: ${mine(me.name)}`}
          >
            <Avatar initials={me.initials} name={me.name} color={me.color} image={me.image} />
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            className="tp-root tp-acct-pop"
            side="bottom"
            align="end"
            sideOffset={8}
            collisionPadding={8}
          >
            <div className="tp-menu tp-acct-menu" role="menu" aria-label="You">
              <div className="tp-acct-me">
                <PersonDot person={me} size={36} />
                <span>
                  <b>{mine(me.name)}</b>
                  <span>{mine(me.email)}</span>
                </span>
              </div>
              <div className="tp-acct-theme">
                <span>Theme</span>
                <Segmented
                  label="Theme"
                  items={THEMES}
                  value={choice}
                  onChange={(v) => {
                    setChoice(v);
                    onTheme?.(v);
                  }}
                />
              </div>
              {/* Flipping it keeps the menu open, like Theme: switch it, then take the screenshot. */}
              <div className="tp-acct-scr">
                <span>
                  Scramble my text
                  <small>Hides your words for screenshots</small>
                </span>
                <Switch
                  label="Scramble my text"
                  checked={scrambled}
                  onChange={(on) => (onScramble ? onScramble(on) : setScramble(on))}
                />
              </div>
              <div className="tp-mrow-sep" />
              <button
                type="button"
                role="menuitem"
                className="tp-mi tp-acct-mi"
                onClick={() => closeThen(onSettings)}
              >
                <Icon name="settings" size={15} />
                Settings
              </button>
              {onFeedback ? (
                <button
                  type="button"
                  role="menuitem"
                  className="tp-mi tp-acct-mi"
                  onClick={() => closeThen(onFeedback)}
                >
                  <Icon name="comment" size={15} />
                  Send feedback
                </button>
              ) : null}
              <button
                type="button"
                role="menuitem"
                className="tp-mi tp-acct-mi"
                onClick={() => closeThen(onSignOut)}
              >
                <Icon name="signout" size={15} />
                Sign out
              </button>
            </div>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </div>
  );
}
