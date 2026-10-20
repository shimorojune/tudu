import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { BottomTabs, type BottomTabsProps } from './BottomTabs';
import { Fab } from './Fab';

const items: BottomTabsProps['items'] = [
  { value: 'today', label: 'Today', icon: 'today' },
  { value: 'week', label: 'Week', icon: 'week' },
  { value: 'search', label: 'Search', icon: 'search' },
  { value: 'jira', label: 'Jira', icon: 'jira', badge: 4, fresh: true },
  { value: 'more', label: 'More', icon: 'more' },
];

function setup(extra: Partial<BottomTabsProps> = {}) {
  const user = userEvent.setup();
  const onSelect = vi.fn();
  render(<BottomTabs items={items} onSelect={onSelect} {...extra} />);
  const nav = screen.getByRole('navigation', { name: 'Main' });
  // A badge sits in the same button, so the accessible name is not just the label.
  const tab = (label: string) => {
    const el = within(nav).getByText(label, { selector: '.tp-tab-l' }).closest('button');
    if (!el) throw new Error(`no tab ${label}`);
    return el;
  };
  return { user, onSelect, nav, tab };
}

describe('BottomTabs', () => {
  it('C01-U06 the active tab has tp-on and aria-current="page"; selecting another moves them and calls onSelect', async () => {
    const { user, onSelect, nav, tab } = setup();
    expect(nav).toHaveClass('tp-root', 'tp-tabs');
    expect(within(nav).getAllByRole('button')).toHaveLength(5);
    expect(tab('Today')).toHaveClass('tp-tab', 'tp-on');
    expect(tab('Today')).toHaveAttribute('aria-current', 'page');
    expect(tab('Week')).not.toHaveClass('tp-on');
    expect(tab('Week')).not.toHaveAttribute('aria-current');
    expect(nav.querySelectorAll('.tp-tab.tp-on')).toHaveLength(1);

    await user.click(tab('Week'));
    expect(onSelect).toHaveBeenCalledWith('week');
    expect(tab('Week')).toHaveClass('tp-on');
    expect(tab('Week')).toHaveAttribute('aria-current', 'page');
    expect(tab('Today')).not.toHaveClass('tp-on');
    expect(nav.querySelectorAll('.tp-tab.tp-on')).toHaveLength(1);
  });

  it('C01-U06 defaultActive and active (controlled) pick the tab', async () => {
    const { user, onSelect, tab } = setup({ defaultActive: 'more' });
    expect(tab('More')).toHaveClass('tp-on');
    await user.click(tab('Search'));
    expect(tab('Search')).toHaveClass('tp-on');
    expect(onSelect).toHaveBeenLastCalledWith('search');

    render(<BottomTabs items={items} active="week" onSelect={onSelect} />);
    const [, second] = screen.getAllByRole('navigation', { name: 'Main' });
    const week = within(second!).getByText('Week', { selector: '.tp-tab-l' }).closest('button');
    await user.click(within(second!).getByText('Today', { selector: '.tp-tab-l' }));
    expect(onSelect).toHaveBeenLastCalledWith('today');
    expect(week).toHaveClass('tp-on');
  });

  it('C01-U06 a badge shows the count and reads "<n> new"; the Jira tab draws the Jira mark and fades in', () => {
    const { tab } = setup();
    const badge = within(tab('Jira')).getByLabelText('4 new');
    expect(badge).toHaveClass('tp-tab-b');
    expect(badge).toHaveTextContent('4');
    expect(badge.parentElement).toHaveClass('tp-tab-i');
    expect(tab('Jira').querySelector('svg.tp-jm')).toHaveClass('tp-tab-jd');
    expect(tab('Jira')).toHaveClass('tp-appear');
    expect(tab('Today').querySelector('.tp-tab-b')).toBeNull();
    expect(tab('Today').querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    expect(tab('Today').querySelector('.tp-tab-i svg')).not.toBeNull();
  });

  it('C01-U06 Fab is a button named New task that calls onClick', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const { rerender } = render(<Fab onClick={onClick} />);
    const fab = screen.getByRole('button', { name: 'New task' });
    expect(fab).toHaveClass('tp-root', 'tp-fab');
    expect(fab).toHaveAttribute('type', 'button');
    expect(fab.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    await user.click(fab);
    expect(onClick).toHaveBeenCalledTimes(1);

    rerender(<Fab onClick={onClick} label="Add a task" className="tp-fab-fixed" />);
    expect(screen.getByRole('button', { name: 'Add a task' })).toHaveClass('tp-fab', 'tp-fab-fixed');
  });
});
