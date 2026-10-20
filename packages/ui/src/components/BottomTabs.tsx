import { cx } from '../lib/cx';
import { useControllable } from '../lib/hooks';
import { Icon, type IconName } from '../lib/icons';
import { JiraMark } from './JiraMark';

export interface BottomTab {
  value: string;
  label: string;
  /** A nav icon, or `jira` for Jira's own mark. */
  icon: IconName | 'jira';
  /** A count on the icon, read as "<n> new". */
  badge?: number;
  /** Fades a just-added tab in. */
  fresh?: boolean;
}

export interface BottomTabsProps {
  items: BottomTab[];
  active?: string;
  defaultActive?: string;
  onSelect?: (value: string) => void;
  /** Names the nav for screen readers, "Main" by default. */
  label?: string;
  className?: string;
}

/**
 * The phone's navigation: Today, Week, Search, More, with Jira once it is connected. 64px plus the safe area on
 * the desk colour; the active tab's icon is brand. Switching cross-fades the colours (180ms) and the label keeps
 * one weight, so nothing reflows. No line on top: the desk fades up over whatever sits above it.
 */
export function BottomTabs({
  items,
  active,
  defaultActive,
  onSelect,
  label = 'Main',
  className,
}: BottomTabsProps) {
  const [current, setCurrent] = useControllable<string | undefined>(active, defaultActive ?? items[0]?.value);
  return (
    <nav className={cx('tp-root tp-tabs', className)} aria-label={label}>
      {items.map((it) => {
        const on = current === it.value;
        return (
          <button
            key={it.value}
            type="button"
            className={cx('tp-tab', on && 'tp-on', it.fresh && 'tp-appear')}
            aria-current={on ? 'page' : undefined}
            onClick={() => {
              setCurrent(it.value);
              onSelect?.(it.value);
            }}
          >
            <span className="tp-tab-i">
              {it.icon === 'jira' ? (
                <JiraMark size={18} className="tp-tab-jd" />
              ) : (
                <Icon name={it.icon} size={20} />
              )}
              {it.badge ? (
                <span className="tp-tab-b" aria-label={`${it.badge} new`}>
                  {it.badge}
                </span>
              ) : null}
            </span>
            <span className="tp-tab-l">{it.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
