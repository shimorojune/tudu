import type { ReactNode } from 'react';
import { cx } from '../lib/cx';
import { Icon } from '../lib/icons';
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

export interface TopBarProps {
  /** Content on the left. */
  leading?: ReactNode;
  /** A Segmented at the left of the bar: the day page uses it for "Day | 2 days". */
  views?: TopBarViews;
  /** Opens the search panel. */
  onSearch?: () => void;
  /** Holds the search icon in its open look while the panel is open. */
  searchOpen?: boolean;
  searchLabel?: string;
  /** The Jira button. Leave it out, or pass false, until Jira is connected. */
  jira?: false | TopBarJira;
  onNewTask?: () => void;
  /** Tablets: New task becomes an icon button. */
  compact?: boolean;
  user?: TopBarUser;
  /** With these, the avatar opens the AccountMenu; without them it is the Avatar alone. */
  account?: Omit<AccountMenuProps, 'me'>;
  className?: string;
}

/**
 * The row above the sheet, on the desk: search (one quiet icon that opens the search panel), Jira, New task (the
 * one ink button on the page) and you. Nothing in the bar changes size, so nothing moves.
 */
export function TopBar({
  leading,
  views,
  onSearch,
  searchOpen,
  searchLabel = 'Search tasks',
  jira,
  onNewTask,
  compact,
  user,
  account,
  className,
}: TopBarProps) {
  const jiraCount = jira ? jira.count : undefined;
  const jiraTip = jiraCount ? `${jiraCount} assigned to you, not in Tudu yet` : 'Your Jira issues';
  return (
    <header className={cx('tp-root tp-topbar', compact && 'tp-compact', className)}>
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
      <span className="tp-tb-sp" />
      <IconButton
        label={searchLabel}
        tipSide="bottom"
        className={searchOpen ? 'tp-on' : undefined}
        onClick={onSearch}
      >
        <Icon name="search" size={17} />
      </IconButton>
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
        <Avatar initials={user.initials} name={user.name} color={user.color} />
      ) : null}
    </header>
  );
}
