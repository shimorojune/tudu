import type { ReactNode } from 'react';
import { cx } from '../lib/cx';
import { useControllable } from '../lib/hooks';
import { Icon, type IconName } from '../lib/icons';
import { IconButton } from './IconButton';
import { JiraMark } from './JiraMark';
import { Logo } from './Logo';

export interface CountProps {
  /** Nothing renders without a number; 0 is a number. */
  value?: number | null;
  /** `brand` is Today's count; the rest are quiet mono. */
  tone?: 'brand' | '';
}

/** A quiet mono count at the end of a nav row. */
export function Count({ value, tone }: CountProps) {
  if (!value && value !== 0) return null;
  return <span className={cx('tp-count', tone === 'brand' && 'tp-brand')}>{value}</span>;
}

export interface SidebarItem {
  value: string;
  label: string;
  /** `today`, `week`, `backlog`, `inbox`, `team`. */
  icon?: IconName;
  count?: number | null;
  tone?: 'brand' | '';
}

export interface SidebarDay {
  value: string;
  /** The day of the month, "19". */
  date: string;
  /** "Mon". */
  label: string;
  /** Tasks on the day: a dot each, up to three. */
  dots?: number;
  today?: boolean;
}

export interface SidebarSpace {
  name: string;
  color?: string;
  count?: number | null;
}

export interface SidebarApp {
  label: string;
  count?: number | null;
  /** Without one the row draws Jira's own mark. */
  icon?: IconName;
  /** Fades a just-connected app in. */
  fresh?: boolean;
}

export interface SidebarProps {
  items?: SidebarItem[];
  /** The next days, each with a dot per task. */
  week?: SidebarDay[];
  /** Space values come back as `space:<name>`. */
  spaces?: SidebarSpace[];
  /** Only apps that are connected; values come back as `app:<label>`. */
  connected?: SidebarApp[];
  /** Adds a quiet "Add an app" at the end of the Apps section. */
  onAddApp?: () => void;
  active?: string;
  defaultActive?: string;
  onSelect?: (value: string) => void;
  /** The tablet form: 64px of icons with tooltips beside them, a pip for a count, no week list. */
  rail?: boolean;
  /** Adds the panel button next to the logo that folds the sidebar to the rail and back. */
  collapsible?: boolean;
  collapsed?: boolean;
  defaultCollapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
  /** The phone's More page: the same list, full width, taller rows, no logo. */
  sheet?: boolean;
  /** Replaces the logo at the top (the space switcher, or the space's name). */
  head?: ReactNode;
  footer?: ReactNode;
  /** Names the nav for screen readers, "Main" by default. */
  label?: string;
  className?: string;
}

interface Entry {
  value: string;
  label: string;
  icon?: IconName;
  count?: number | null;
  tone?: 'brand' | '';
  fresh?: boolean;
  quiet?: boolean;
}

/**
 * The app's left column on the desk, never on paper: the logo, the views, this week's days, spaces and your apps.
 * The active view is a paper chip with its icon in brand; every item keeps one weight, so nothing reflows.
 * One set of elements serves both widths: collapsing never swaps the content. The stylesheet does the fold
 * (tp-rail): icons keep their place, the width eases, labels and counts fade and are clipped, headers turn into
 * rules and the week's days fold away; expanding runs the same move backwards.
 */
export function Sidebar({
  items = [],
  week = [],
  spaces = [],
  connected = [],
  onAddApp,
  active,
  defaultActive = 'today',
  onSelect,
  rail: fixedRail,
  collapsible,
  collapsed,
  defaultCollapsed,
  onCollapsedChange,
  sheet,
  head,
  footer,
  label = 'Main',
  className,
}: SidebarProps) {
  const [current, setCurrent] = useControllable<string | undefined>(active, defaultActive);
  const [folded, setFolded] = useControllable(collapsed, !!defaultCollapsed);
  const rail = !!fixedRail || (!!collapsible && folded);

  const toggleRail = () => {
    const next = !folded;
    setFolded(next);
    onCollapsedChange?.(next);
  };
  const pick = (value: string) => {
    if (value === 'apps:add') {
      onAddApp?.();
      return;
    }
    setCurrent(value);
    onSelect?.(value);
  };

  const item = (it: Entry, extra?: ReactNode, after?: ReactNode) => {
    const on = it.value !== 'apps:add' && current === it.value;
    return (
      <span
        key={it.value}
        className={cx(
          'tp-navwrap',
          rail && 'tp-tip tp-right',
          it.fresh && 'tp-appear',
          it.quiet && 'tp-nav-quiet',
        )}
        data-tip={rail ? it.label : undefined}
      >
        <button
          type="button"
          className={cx('tp-nav', on && 'tp-on')}
          aria-current={on ? 'page' : undefined}
          aria-label={rail ? `${it.label}${it.count ? `, ${it.count}` : ''}` : undefined}
          onClick={() => pick(it.value)}
        >
          {extra ?? (it.icon ? <Icon name={it.icon} size={16} /> : null)}
          <span className="tp-nav-l" aria-hidden={rail ? 'true' : undefined}>
            {it.label}
          </span>
          <Count value={it.count} tone={it.tone} />
          {it.count ? (
            <i className={cx('tp-nav-pip', it.tone === 'brand' && 'tp-brand')} aria-hidden="true" />
          ) : null}
          {after}
        </button>
      </span>
    );
  };

  const section = (title: string, kids: ReactNode[]) =>
    kids.length ? (
      <div className="tp-nav-sec">
        <div className="tp-nav-h" aria-hidden={rail ? 'true' : undefined}>
          {title}
        </div>
        <i className="tp-nav-rule" aria-hidden="true" />
        {kids}
      </div>
    ) : null;

  const weekSection = section(
    'This week',
    week.map((d) =>
      item(
        { value: d.value, label: d.label, count: null },
        <span className={cx('tp-nav-date', d.today && 'tp-today')}>{d.date}</span>,
        d.dots ? (
          <span className="tp-nav-dots" aria-label={`${d.dots} ${d.dots === 1 ? 'task' : 'tasks'}`}>
            {Array.from({ length: Math.min(3, d.dots) }, (_, j) => (
              <i key={j} />
            ))}
          </span>
        ) : null,
      ),
    ),
  );

  const toggle = collapsible ? (
    <IconButton
      label={rail ? 'Expand sidebar' : 'Collapse sidebar'}
      tipSide="right"
      className="tp-side-tog"
      onClick={toggleRail}
    >
      <Icon name="panel" size={16} />
    </IconButton>
  ) : null;

  return (
    <nav
      className={cx(
        'tp-root tp-sidebar',
        rail && 'tp-rail',
        fixedRail && 'tp-rail-fixed',
        collapsible && 'tp-side-c',
        sheet && 'tp-side-sheet',
        className,
      )}
      aria-label={label}
    >
      {sheet ? null : (
        <div className="tp-side-head">
          {head ? (
            <div className="tp-side-logo tp-side-custom">{head}</div>
          ) : (
            <div className="tp-side-logo">
              <Logo size={22} wordmark />
            </div>
          )}
          {collapsible ? <div className="tp-side-togspace" /> : null}
          {toggle ? <div className="tp-side-togpos">{toggle}</div> : null}
        </div>
      )}
      <div className="tp-nav-sec">{items.map((it) => item(it))}</div>
      {weekSection ? (
        <div className="tp-nav-fold" inert={rail} aria-hidden={rail ? 'true' : undefined}>
          <div>{weekSection}</div>
        </div>
      ) : null}
      {section(
        'Spaces',
        spaces.map((sp) =>
          item(
            { value: `space:${sp.name}`, label: sp.name, count: sp.count },
            <i className="tp-nav-sw" style={{ background: sp.color }} />,
          ),
        ),
      )}
      {section('Apps', [
        ...connected.map((c) =>
          item(
            { value: `app:${c.label}`, label: c.label, count: c.count, icon: c.icon, fresh: c.fresh },
            c.icon ? null : <JiraMark size={14} className="tp-nav-jd" />,
          ),
        ),
        ...(onAddApp
          ? [item({ value: 'apps:add', label: 'Add an app', quiet: true }, <Icon name="plus" size={16} />)]
          : []),
      ])}
      {footer ? <div className="tp-side-foot">{footer}</div> : null}
    </nav>
  );
}
