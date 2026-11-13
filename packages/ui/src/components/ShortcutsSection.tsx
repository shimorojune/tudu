import {
  checkShortcut,
  formatCombo,
  problemText,
  type Bindings,
  type Combo,
  type KeyPlatform,
  type ShortcutId,
} from '@tudu/core';
import { Banner } from './Banner';
import { SettingsSection } from './SettingsSection';
import { ShortcutRow, type ShortcutAnswer } from './ShortcutField';

/** Settings › Shortcuts: listed when given, never on phones. */
export interface SettingsShortcuts {
  platform: KeyPlatform;
  /** Every shortcut as it is now (the From anywhere ones as the Mac app has them); null is off. */
  bindings: Bindings;
  /** The usual keys, for the back arrow. */
  usual: Bindings;
  /**
   * The From anywhere rows, in the Mac app only: `loading` until it answers, `error` when it couldn't. Left out on
   * the web, where only In Tudu is shown.
   */
  global?: 'ready' | 'loading' | 'error';
  /** A standing problem per shortcut (another app took its keys). */
  problems?: Partial<Record<ShortcutId, string>>;
  /** Keeps a change (null: off); answers the line to show when it was refused. */
  onSet?: (id: ShortcutId, next: Combo | null) => ShortcutAnswer | Promise<ShortcutAnswer>;
  /** Couldn't read the Mac app's shortcuts: Try again. */
  onRetry?: () => void;
}

/** The nav's line under Shortcuts: the keys you'd use most, as they are now. */
export function keysSub(k: SettingsShortcuts): string {
  const b = k.bindings;
  const shown = [
    k.global === 'ready' && b.newTask ? formatCombo(b.newTask, k.platform) : null,
    b.allSpaces ? formatCombo(b.allSpaces, k.platform) : null,
    b.space ? `${formatCombo(b.space, k.platform, '1')} to ${formatCombo(b.space, k.platform, '9')}` : null,
  ].filter(Boolean);
  return shown.length ? shown.slice(0, 2).join(' · ') : 'Off';
}

const SHORTCUT_LINES: Record<ShortcutId, string> = {
  newTask: 'Brings up Quick Add over whatever you’re doing, in any app.',
  newNote: 'Opens a blank note over whatever you’re doing, in any app.',
  allSpaces: 'Everything of yours, from every space.',
  space: 'The number is the space’s place in your list: 1 is the first, up to 9.',
};

const SHORTCUT_TITLES: Record<ShortcutId, string> = {
  newTask: 'New task',
  newNote: 'New note',
  allSpaces: 'All spaces',
  space: 'A space',
};

/**
 * Settings › Shortcuts: From anywhere (the Mac app's New task and New note, which work in every app) and In Tudu (All
 * spaces and the space keys). Click a field and press the new keys; it saves as the last key lands.
 */
export function ShortcutsSection({ k }: { k: SettingsShortcuts }) {
  const row = (id: ShortcutId, loading?: boolean) => (
    <ShortcutRow
      key={id}
      title={SHORTCUT_TITLES[id]}
      sub={SHORTCUT_LINES[id]}
      value={k.bindings[id]}
      usual={k.usual[id]}
      platform={k.platform}
      digit={id === 'space'}
      loading={loading}
      problem={k.problems?.[id] ?? null}
      check={(next) => {
        const why = checkShortcut(id, next, k.bindings, k.platform);
        return why ? problemText(why, k.platform) : null;
      }}
      onSet={(next) => k.onSet?.(id, next)}
    />
  );
  return (
    <>
      {k.global ? (
        <SettingsSection title="From anywhere">
          {k.global === 'error' ? (
            <Banner
              tone="error"
              title="Couldn’t load your From anywhere shortcuts."
              action="Try again"
              onAction={k.onRetry}
            >
              They still work as you left them.
            </Banner>
          ) : (
            <>
              {row('newTask', k.global === 'loading')}
              {row('newNote', k.global === 'loading')}
            </>
          )}
        </SettingsSection>
      ) : null}
      <SettingsSection title="In Tudu">
        {row('allSpaces')}
        {row('space')}
      </SettingsSection>
      {k.global ? null : (
        <p className="tp-set-note">New task and New note from anywhere come with the Mac app.</p>
      )}
      <p className="tp-set-note">
        Click a shortcut, then press the new keys. Esc keeps the old one. Delete turns it off.
      </p>
    </>
  );
}
