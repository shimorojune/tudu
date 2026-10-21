import type { ReactNode } from 'react';
import { cx } from '../lib/cx';
import { Icon, type IconName } from '../lib/icons';
import { SpaceTile, type SpaceTileSpace } from './SpaceTile';

export interface SettingsNavItem {
  value: string;
  label: string;
  icon?: IconName;
  /** A mark of its own in place of the icon. */
  mark?: ReactNode;
  count?: number;
  /** The quiet line under the label in the phone list: "Dark", "19 people". */
  sub?: string;
}

export interface SettingsNavGroup {
  key: string;
  title?: string;
  /** The space's tile beside the group's title. */
  space?: SpaceTileSpace;
  items: SettingsNavItem[];
}

export interface SettingsNavProps {
  groups: SettingsNavGroup[];
  active?: string;
  onPick?: (value: string) => void;
  /** The phone's list: rows with their line and a chevron, nothing lit. */
  list?: boolean;
  label?: string;
  className?: string;
}

/** The list of Settings' sections, grouped under You and the space. The picked row takes the accent fill. */
export function SettingsNav({
  groups,
  active,
  onPick,
  list,
  label = 'Settings',
  className,
}: SettingsNavProps) {
  return (
    <nav className={cx('tp-root tp-snav', list && 'tp-snav-list', className)} aria-label={label}>
      {groups.map((g) => (
        <div key={g.key} className="tp-snav-g">
          {g.title ? (
            <div className="tp-snav-h">
              {g.space ? <SpaceTile space={g.space} size={16} /> : null}
              <span>{g.title}</span>
            </div>
          ) : null}
          {g.items.map((it) => {
            const on = !list && active === it.value;
            return (
              <button
                key={it.value}
                type="button"
                className={cx('tp-snav-it', on && 'tp-on')}
                aria-current={on ? 'page' : undefined}
                onClick={() => onPick?.(it.value)}
              >
                <span className="tp-snav-i" aria-hidden="true">
                  {it.mark ?? <Icon name={it.icon ?? 'settings'} size={16} />}
                </span>
                <span className="tp-snav-l">
                  {it.label}
                  {list && it.sub ? <span>{it.sub}</span> : null}
                </span>
                {it.count ? <span className="tp-snav-c">{it.count}</span> : null}
                {list ? (
                  <span className="tp-snav-go" aria-hidden="true">
                    <Icon name="right" size={14} />
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
