import type { ReactNode } from 'react';
import { cx } from '../lib/cx';
import { Icon } from '../lib/icons';
import { NoteIcon } from './NoteParts';
import { AccountMenu, type AccountMenuProps } from './AccountMenu';
import { Avatar } from './Avatar';
import { Button } from './Button';
import { IconButton } from './IconButton';
import { JiraMark } from './JiraMark';
import { Segmented, type SegmentedItem } from './Segmented';

export interface TopBarUser {
  name: string;
  initials: string;
  color?: string;
  email?: string;
  image?: string;
}

export interface TopBarViews {
  items: SegmentedItem[];
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
}

export interface TopBarJira {
  /** Issues assigned to you that are not in Tudu yet. Hidden at 0. */
  count?: number;
  /** Holds the button in its jira-soft look while the panel is open. */
  open?: boolean;
  onJira?: () => void;
  /** Fades the button in right after connecting. */
  fresh?: boolean;
}

export interface TopBarInbox {
  /** To answer plus new, across every space. Hidden at 0. */
  count?: number;
  /** Holds the button in its open look while the Inbox is showing. */
  open?: boolean;
  onInbox: () => void;
}

export interface TopBarProps {
  /** Content on the left. */
  leading?: ReactNode;
  /** A Segmented at the left of the bar: the day page uses it for "Day | 2 days". */
  views?: TopBarViews;
  /** Report a bug or idea: the bug, first in the bar, opens Send feedback. Leave it out and there is none. */
  onFeedback?: () => void;
  /** Holds the bug in its open look while the form is open. */
  feedbackOpen?: boolean;
  /** Opens the search panel. */
  onSearch?: () => void;
  /** Holds the search icon in its open look while the panel is open. */
  searchOpen?: boolean;
  searchLabel?: string;
  /** The Notebook (chunk 22): yours, not a space's, so it sits between Search and the Inbox. */
  notebook?: { open?: boolean; onNotebook: () => void };
  /** The one Inbox, across every space: beside Search, in the same quiet button. */
  inbox?: TopBarInbox;
  /** The Jira button. Leave it out, or pass false, until Jira is connected. */
  jira?: false | TopBarJira;
  onNewTask?: () => void;
  /** Tablets: New task becomes an icon button. */
  compact?: boolean;
  user?: TopBarUser;
  /** With these, the avatar opens the AccountMenu; without them it is the Avatar alone. */
  account?: Omit<AccountMenuProps, 'me'>;
  /** In the macOS app: the bar's empty parts drag the window. */
  dragRegion?: boolean;
  className?: string;
}

/**
 * The row above the sheet, on the desk: search (one quiet icon that opens the search panel), the Inbox (every
 * space's, with its count), Jira, New task (the
 * one ink button on the page) and you. Nothing in the bar changes size, so nothing moves.
 */
export function TopBar({
  leading,
  views,
  onFeedback,
  feedbackOpen,
  onSearch,
  searchOpen,
  searchLabel = 'Search tasks',
  notebook,
  inbox,
  jira,
  onNewTask,
  compact,
  user,
  account,
  dragRegion,
  className,
}: TopBarProps) {
  // The macOS app has no title bar: the bar's empty parts drag the window.
  const drag = dragRegion ? { 'data-tauri-drag-region': '' } : {};
  const jiraCount = jira ? jira.count : undefined;
  const jiraTip = jiraCount ? `${jiraCount} assigned to you, not in Tudu yet` : 'Your Jira issues';
  return (
    <header className={cx('tp-root tp-topbar', compact && 'tp-compact', className)} {...drag}>
      {leading ?? null}
      {views ? (
        <Segmented
          label="Days to show"
          items={views.items}
          value={views.value}
          defaultValue={views.defaultValue}
          onChange={views.onChange}
        />
      ) : null}
      <span className="tp-tb-sp" {...drag} />
      {onFeedback ? (
        <IconButton
          label="Report a bug or idea"
          tipSide="bottom"
          className={cx('tp-tb-bug', feedbackOpen && 'tp-on')}
          aria-haspopup="dialog"
          onClick={onFeedback}
        >
          <Icon name="bug" size={17} />
        </IconButton>
      ) : null}
      <IconButton
        label={searchLabel}
        tipSide="bottom"
        className={searchOpen ? 'tp-on' : undefined}
        onClick={onSearch}
      >
        <Icon name="search" size={17} />
      </IconButton>
      {notebook ? (
        <IconButton
          label="Notebook"
          tipSide="bottom"
          className={cx('tp-tb-notebook', notebook.open && 'tp-on')}
          aria-current={notebook.open ? 'page' : undefined}
          onClick={notebook.onNotebook}
        >
          <NoteIcon name="note" size={17} />
        </IconButton>
      ) : null}
      {inbox ? (
        <IconButton
          label={inbox.count ? `Inbox, ${inbox.count} new` : 'Inbox'}
          tipSide="bottom"
          className={cx('tp-tb-inbox', inbox.open && 'tp-on')}
          aria-current={inbox.open ? 'page' : undefined}
          onClick={inbox.onInbox}
        >
          <Icon name="inbox" size={17} />
          {inbox.count ? (
            <span className="tp-tb-pip" key={inbox.count} aria-hidden="true">
              {inbox.count > 99 ? '99+' : inbox.count}
            </span>
          ) : null}
        </IconButton>
      ) : null}
      {jira ? (
        <span className="tp-tip tp-below" data-tip={jiraTip}>
          <button
            type="button"
            className={cx('tp-jirabtn', jira.open && 'tp-on', jira.fresh && 'tp-appear')}
            aria-pressed={jira.open ? 'true' : 'false'}
            onClick={jira.onJira}
          >
            <JiraMark size={14} />
            <span>Jira</span>
            {jiraCount ? (
              <span className="tp-jirabtn-n" aria-label={`${jiraCount} assigned to you, not in Tudu yet`}>
                {jiraCount}
              </span>
            ) : null}
          </button>
        </span>
      ) : null}
      {compact ? (
        <IconButton label="New task" className="tp-ib-ink" tipSide="bottom" onClick={onNewTask}>
          <Icon name="plus" size={17} />
        </IconButton>
      ) : (
        <Button variant="primary" icon={<Icon name="plus" size={15} />} onClick={onNewTask}>
          New task
        </Button>
      )}
      {account && user ? (
        <AccountMenu me={user} {...account} />
      ) : user ? (
        <Avatar initials={user.initials} name={user.name} color={user.color} image={user.image} />
      ) : null}
    </header>
  );
}
