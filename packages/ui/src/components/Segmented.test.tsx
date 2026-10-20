import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { parseRules, readStylesheet, rulesWhere } from '../test-utils/stylesheet';
import { Segmented } from './Segmented';

const items = [
  { value: 'day', label: 'Day' },
  { value: 'two', label: '2 days' },
  { value: 'week', label: 'Week' },
];

describe('Segmented', () => {
  it('C00-U20 click and arrow keys change the value and move focus', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Segmented label="View" items={items} defaultValue="day" onChange={onChange} />);
    const group = screen.getByRole('group', { name: 'View' });
    const [day, two, week] = within(group).getAllByRole('button') as [HTMLElement, HTMLElement, HTMLElement];
    expect(day).toHaveTextContent('Day');
    expect(day).toHaveAttribute('aria-pressed', 'true');
    expect(two).toHaveAttribute('aria-pressed', 'false');
    expect(week).toHaveAttribute('aria-pressed', 'false');
    // one tab stop: the chosen item
    expect(day).toHaveAttribute('tabindex', '0');
    expect(two).toHaveAttribute('tabindex', '-1');

    await user.click(two);
    expect(two).toHaveAttribute('aria-pressed', 'true');
    expect(day).toHaveAttribute('aria-pressed', 'false');
    expect(onChange).toHaveBeenLastCalledWith('two');

    await user.keyboard('{ArrowRight}');
    expect(week).toHaveAttribute('aria-pressed', 'true');
    expect(week).toHaveFocus();
    expect(onChange).toHaveBeenLastCalledWith('week');

    await user.keyboard('{ArrowRight}'); // wraps
    expect(day).toHaveAttribute('aria-pressed', 'true');
    expect(day).toHaveFocus();

    await user.keyboard('{ArrowLeft}'); // wraps back
    expect(week).toHaveAttribute('aria-pressed', 'true');
    expect(week).toHaveFocus();

    await user.keyboard('{Home}');
    expect(day).toHaveAttribute('aria-pressed', 'true');
    expect(day).toHaveFocus();

    await user.keyboard('{End}');
    expect(week).toHaveAttribute('aria-pressed', 'true');
    expect(week).toHaveFocus();
    expect(onChange).toHaveBeenCalledTimes(6);
    expect(onChange.mock.calls.map((c) => c[0])).toEqual(['two', 'week', 'day', 'week', 'day', 'week']);
  });

  it('C00-U20 controlled: the value is what the prop says', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Segmented label="View" items={items} value="week" onChange={onChange} />);
    const [day, , week] = screen.getAllByRole('button') as [HTMLElement, HTMLElement, HTMLElement];
    expect(week).toHaveAttribute('aria-pressed', 'true');
    await user.click(day);
    expect(onChange).toHaveBeenCalledWith('day');
    expect(week).toHaveAttribute('aria-pressed', 'true');
    expect(day).toHaveAttribute('aria-pressed', 'false');
  });

  // jsdom has no layout: the weight is read from the stylesheet. Labels are 500 once and no state changes that.
  it('C00-U20 the active item keeps its font weight', () => {
    const rules = parseRules(readStylesheet('components.css'));
    const seg = rulesWhere(rules, (s) => s.includes('.tp-seg') && s.includes('button'));
    const base = seg.find((r) => r.selector === '.tp-seg button');
    expect(base?.declarations['font-weight']).toBe('500');
    const pressed = seg.filter((r) => r.selector.includes('aria-pressed'));
    expect(pressed.length).toBeGreaterThan(0);
    for (const r of seg) {
      if (r === base) continue;
      expect(r.declarations, r.selector).not.toHaveProperty('font-weight');
    }
    // the thumb moves instead: it slides and resizes over dur-panel-in
    const thumb = rulesWhere(rules, (s) => s === '.tp-seg-thumb')[0];
    expect(thumb?.declarations.transition).toContain('transform var(--dur-panel-in) var(--ease-settle)');
  });
});
