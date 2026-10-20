import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { parseRules, readStylesheet, rulesWhere } from '../test-utils/stylesheet';
import { Count, Sidebar, type SidebarProps } from './Sidebar';

const items: NonNullable<SidebarProps['items']> = [
  { value: 'today', label: 'Today', icon: 'today', count: 4, tone: 'brand' },
  { value: 'week', label: 'Week', icon: 'week' },
  { value: 'backlog', label: 'Backlog', icon: 'backlog', count: 12 },
  { value: 'inbox', label: 'Inbox', icon: 'inbox', count: 2 },
];
const week: NonNullable<SidebarProps['week']> = [
  { value: 'day:2026-10-19', date: '19', label: 'Mon', dots: 3, today: true },
  { value: 'day:2026-10-20', date: '20', label: 'Tue', dots: 1 },
  { value: 'day:2026-10-21', date: '21', label: 'Wed' },
];
const spaces = [{ name: 'Northwind', color: '#2f5fa8', count: 3 }];

function setup(extra: Partial<SidebarProps> = {}) {
  const user = userEvent.setup();
  const onSelect = vi.fn();
  render(<Sidebar items={items} week={week} spaces={spaces} onSelect={onSelect} {...extra} />);
  const nav = screen.getByRole('navigation', { name: 'Main' });
  // The row for a label. Counts sit in the same button, so the accessible name is not just the label.
  const button = (label: string) => {
    const el = within(nav).getByText(label, { selector: '.tp-nav-l' }).closest('button');
    if (!el) throw new Error(`no item ${label}`);
    return el;
  };
  return { user, onSelect, nav, button };
}

describe('Sidebar', () => {
  it('C01-U05 the active item is the paper chip (tp-on) with aria-current="page", and picking moves it', async () => {
    const { user, onSelect, nav, button } = setup();
    expect(nav).toHaveClass('tp-root', 'tp-sidebar');
    expect(nav).not.toHaveClass('tp-rail');
    expect(button('Today')).toHaveClass('tp-nav', 'tp-on');
    expect(button('Today')).toHaveAttribute('aria-current', 'page');
    expect(button('Today').querySelector('.tp-count')).toHaveTextContent('4');
    expect(button('Today').querySelector('.tp-count')).toHaveClass('tp-brand');
    expect(button('Backlog').querySelector('.tp-count')).not.toHaveClass('tp-brand');
    expect(button('Week').querySelector('.tp-count')).toBeNull();
    expect(button('Week')).not.toHaveClass('tp-on');
    expect(button('Week')).not.toHaveAttribute('aria-current');
    expect(nav.querySelectorAll('.tp-nav.tp-on')).toHaveLength(1);

    await user.click(button('Week'));
    expect(onSelect).toHaveBeenCalledWith('week');
    expect(button('Week')).toHaveClass('tp-on');
    expect(button('Week')).toHaveAttribute('aria-current', 'page');
    expect(button('Today')).not.toHaveClass('tp-on');
    expect(button('Today')).not.toHaveAttribute('aria-current');
    expect(nav.querySelectorAll('.tp-nav.tp-on')).toHaveLength(1);
  });

  it('C01-U05 controlled: the active item is what the prop says', async () => {
    const { user, onSelect, button } = setup({ active: 'backlog' });
    expect(button('Backlog')).toHaveClass('tp-on');
    await user.click(button('Inbox'));
    expect(onSelect).toHaveBeenCalledWith('inbox');
    expect(button('Backlog')).toHaveClass('tp-on');
    expect(button('Inbox')).not.toHaveClass('tp-on');
  });

  // jsdom has no layout: the weight is read from the stylesheet. .tp-nav is 500 once and no state changes it;
  // the active item is told by the paper chip (card, shadow-seg) and its brand icon, so the label never widens.
  it('C01-U05 the stylesheet marks the active item by colour and a paper chip, never by weight', () => {
    const rules = parseRules(readStylesheet('components.css'));
    const nav = rulesWhere(rules, (s) => /\.tp-nav(?![\w-])/.test(s));
    const base = nav.find((r) => r.selector === '.tp-nav');
    expect(base?.declarations['font-weight']).toBe('500');
    const on = nav.find((r) => r.selector === '.tp-nav.tp-on');
    expect(on?.declarations.background).toBe('var(--card)');
    expect(on?.declarations['box-shadow']).toBe('var(--shadow-seg)');
    expect(rulesWhere(rules, (s) => s === '.tp-nav.tp-on > svg')[0]?.declarations.color).toBe('var(--brand)');
    expect(nav.length).toBeGreaterThan(3);
    for (const r of nav) {
      if (r === base) continue;
      expect(r.declarations, r.selector).not.toHaveProperty('font-weight');
    }
  });

  it('C01-U05 the panel button folds the sidebar to the rail and back', async () => {
    const onCollapsedChange = vi.fn();
    const { user, nav, button } = setup({ collapsible: true, onCollapsedChange });
    expect(nav).toHaveClass('tp-side-c');
    expect(nav).not.toHaveClass('tp-rail');
    expect(nav).not.toHaveClass('tp-rail-fixed');
    const fold = nav.querySelector('.tp-nav-fold');
    expect(fold).not.toBeNull();
    expect(fold).not.toHaveAttribute('aria-hidden');
    expect(fold).not.toHaveAttribute('inert');
    expect(button('Today')).not.toHaveAttribute('aria-label');
    expect(button('Today').closest('.tp-navwrap')).not.toHaveClass('tp-tip');
    expect(within(nav).getByText('This week')).not.toHaveAttribute('aria-hidden');

    await user.click(screen.getByRole('button', { name: 'Collapse sidebar' }));
    expect(nav).toHaveClass('tp-rail');
    expect(nav).not.toHaveClass('tp-rail-fixed');
    expect(onCollapsedChange).toHaveBeenLastCalledWith(true);
    expect(screen.queryByRole('button', { name: 'Collapse sidebar' })).toBeNull();
    // On the rail each item is named by its label and count, the words are hidden and a CSS tip sits beside the icon.
    expect(button('Today')).toHaveAttribute('aria-label', 'Today, 4');
    expect(button('Week')).toHaveAttribute('aria-label', 'Week');
    expect(button('Today').querySelector('.tp-nav-l')).toHaveAttribute('aria-hidden', 'true');
    const wrap = button('Today').closest('.tp-navwrap');
    expect(wrap).toHaveClass('tp-tip', 'tp-right');
    expect(wrap).toHaveAttribute('data-tip', 'Today');
    expect(within(nav).getByText('This week')).toHaveAttribute('aria-hidden', 'true');
    // The week's days fold away.
    expect(fold).toHaveAttribute('aria-hidden', 'true');
    expect(fold).toHaveAttribute('inert');

    await user.click(screen.getByRole('button', { name: 'Expand sidebar' }));
    expect(nav).not.toHaveClass('tp-rail');
    expect(onCollapsedChange).toHaveBeenLastCalledWith(false);
    expect(screen.getByRole('button', { name: 'Collapse sidebar' })).toBeInTheDocument();
    expect(fold).not.toHaveAttribute('aria-hidden');
    expect(fold).not.toHaveAttribute('inert');
    expect(button('Today')).not.toHaveAttribute('aria-label');
    expect(button('Today').closest('.tp-navwrap')).not.toHaveAttribute('data-tip');
  });

  it('C01-U05 collapsed is controlled when given; rail is the fixed tablet form without the panel button', () => {
    const { rerender } = render(<Sidebar items={items} week={week} collapsible collapsed />);
    const nav = screen.getByRole('navigation', { name: 'Main' });
    expect(nav).toHaveClass('tp-rail');
    expect(screen.getByRole('button', { name: 'Expand sidebar' })).toBeInTheDocument();

    rerender(<Sidebar items={items} week={week} collapsible collapsed={false} />);
    expect(nav).not.toHaveClass('tp-rail');
    expect(screen.getByRole('button', { name: 'Collapse sidebar' })).toBeInTheDocument();

    rerender(<Sidebar items={items} week={week} rail />);
    expect(nav).toHaveClass('tp-rail', 'tp-rail-fixed');
    expect(nav).not.toHaveClass('tp-side-c');
    expect(screen.queryByRole('button', { name: /sidebar$/ })).toBeNull();
    expect(nav.querySelector('.tp-nav-fold')).toHaveAttribute('aria-hidden', 'true');
  });

  it('C01-U05 spaces come back as space:<name>, apps as app:<label>, and Add an app calls onAddApp', async () => {
    const onAddApp = vi.fn();
    const { user, onSelect, nav, button } = setup({
      connected: [{ label: 'Jira', count: 2, fresh: true }],
      onAddApp,
    });
    expect(within(nav).getByText('Spaces')).toHaveClass('tp-nav-h');
    expect(within(nav).getByText('Apps')).toHaveClass('tp-nav-h');
    expect(button('Northwind').querySelector('.tp-nav-sw')).toHaveStyle({ backgroundColor: '#2f5fa8' });
    expect(button('Northwind').querySelector('.tp-count')).toHaveTextContent('3');
    await user.click(button('Northwind'));
    expect(onSelect).toHaveBeenLastCalledWith('space:Northwind');
    expect(button('Northwind')).toHaveClass('tp-on');
    expect(button('Northwind')).toHaveAttribute('aria-current', 'page');

    expect(button('Jira').querySelector('svg.tp-jm')).toHaveClass('tp-nav-jd');
    expect(button('Jira').closest('.tp-navwrap')).toHaveClass('tp-appear');
    await user.click(button('Jira'));
    expect(onSelect).toHaveBeenLastCalledWith('app:Jira');

    expect(button('Add an app').closest('.tp-navwrap')).toHaveClass('tp-nav-quiet');
    await user.click(button('Add an app'));
    expect(onAddApp).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledTimes(2);
    expect(button('Add an app')).not.toHaveClass('tp-on');
    expect(button('Jira')).toHaveClass('tp-on');
  });

  it('C01-U05 the Apps section lists only what is connected and goes without apps or onAddApp', () => {
    const { nav } = setup();
    expect(within(nav).queryByText('Apps')).toBeNull();
    expect(within(nav).getByText('Spaces')).toBeInTheDocument();
  });

  it('C01-U05 the week lists the days with a dot per task; the logo, head and footer', () => {
    const { nav, button } = setup({ footer: <span>Foot</span> });
    expect(within(nav).getByRole('img', { name: 'Tudu' })).toBeInTheDocument();
    const mon = button('Mon');
    expect(mon.querySelector('.tp-nav-date')).toHaveTextContent('19');
    expect(mon.querySelector('.tp-nav-date')).toHaveClass('tp-today');
    expect(button('Tue').querySelector('.tp-nav-date')).not.toHaveClass('tp-today');
    expect(within(mon).getByLabelText('3 tasks').querySelectorAll('i')).toHaveLength(3);
    expect(within(button('Tue')).getByLabelText('1 task').querySelectorAll('i')).toHaveLength(1);
    expect(button('Wed').querySelector('.tp-nav-dots')).toBeNull();
    expect(nav.querySelector('.tp-side-foot')).toHaveTextContent('Foot');
  });

  it('C01-U05 sheet is the phone More page without the logo head; head replaces the logo', () => {
    const { rerender } = render(<Sidebar sheet items={items} label="More" />);
    const nav = screen.getByRole('navigation', { name: 'More' });
    expect(nav).toHaveClass('tp-side-sheet');
    expect(nav.querySelector('.tp-side-head')).toBeNull();

    rerender(<Sidebar items={items} head={<b>Northwind</b>} label="More" />);
    expect(nav.querySelector('.tp-side-logo')).toHaveClass('tp-side-custom');
    expect(nav.querySelector('.tp-side-logo')).toHaveTextContent('Northwind');
    expect(screen.queryByRole('img', { name: 'Tudu' })).toBeNull();
  });

  it('Count shows a number, 0 included, and nothing without one', () => {
    const { container, rerender } = render(<Count value={3} tone="brand" />);
    expect(container.firstChild).toHaveClass('tp-count', 'tp-brand');
    expect(container.firstChild).toHaveTextContent('3');
    rerender(<Count value={0} />);
    expect(container.firstChild).toHaveTextContent('0');
    expect(container.firstChild).not.toHaveClass('tp-brand');
    rerender(<Count value={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});
