import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseRules, readStylesheet, rulesWhere } from '../test-utils/stylesheet';
import { Checkbox } from './Checkbox';

const rules = parseRules(readStylesheet('components.css'));

afterEach(() => vi.useRealTimers());

describe('Checkbox', () => {
  it('C00-U10 click and Space toggle; aria-checked follows', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Checkbox label="Buy milk" onChange={onChange} />);
    const box = screen.getByRole('checkbox', { name: 'Buy milk' });
    expect(box).toHaveAttribute('aria-checked', 'false');
    expect(box).toHaveAttribute('type', 'button');

    await user.click(box);
    expect(box).toHaveAttribute('aria-checked', 'true');
    expect(onChange).toHaveBeenLastCalledWith(true);

    expect(box).toHaveFocus();
    await user.keyboard(' ');
    expect(box).toHaveAttribute('aria-checked', 'false');
    expect(onChange).toHaveBeenLastCalledWith(false);

    await user.keyboard(' ');
    expect(box).toHaveAttribute('aria-checked', 'true');
    expect(onChange).toHaveBeenCalledTimes(3);
  });

  it('C00-U10 disabled does not toggle', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Checkbox label="Buy milk" disabled onChange={onChange} />);
    const box = screen.getByRole('checkbox', { name: 'Buy milk' });
    expect(box).toBeDisabled();
    await user.click(box);
    expect(box).toHaveAttribute('aria-checked', 'false');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('C00-U11 checking plays the tick draw and one sparkle; unchecking plays neither', async () => {
    vi.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<Checkbox label="Buy milk" />);
    const box = screen.getByRole('checkbox', { name: 'Buy milk' });
    const spark = screen.getByTestId('sparkle');
    expect(spark).toHaveClass('tp-spark');
    expect(spark).not.toHaveClass('tp-go');
    expect(spark.querySelectorAll('i')).toHaveLength(5); // five stars, one of them ember

    await user.click(box);
    expect(box).toHaveAttribute('aria-checked', 'true');
    expect(spark).toHaveClass('tp-go');
    act(() => {
      vi.advanceTimersByTime(899);
    });
    expect(spark).toHaveClass('tp-go');
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(spark).not.toHaveClass('tp-go'); // once: it clears itself after 900ms

    await user.click(box);
    expect(box).toHaveAttribute('aria-checked', 'false');
    expect(spark).not.toHaveClass('tp-go');
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(spark).not.toHaveClass('tp-go');
  });

  it('C00-U11 the tick draws in over dur-tick and the sparkle can be turned off', () => {
    // jsdom has no layout: the draw is the stylesheet revealing the ink tick along its clip-path once checked.
    const svg = rulesWhere(rules, (s) => s === '.tp-cb.tp-ink svg');
    expect(svg.some((r) => /clip-path var\(--dur-tick\)/.test(r.declarations.transition ?? ''))).toBe(true);
    const checked = rulesWhere(rules, (s) => s === '.tp-cb.tp-ink[aria-checked="true"] svg')[0];
    expect(checked?.declarations['clip-path']).toBe('inset(-20% -20% -20% 0)');
    // the fill variant draws its stroke the same way
    const stroke = rulesWhere(rules, (s) => s === '.tp-cb svg path')[0];
    expect(stroke?.declarations.transition).toContain('stroke-dashoffset var(--dur-tick)');

    render(<Checkbox label="Quiet" sparkle={false} />);
    expect(screen.queryByTestId('sparkle')).toBeNull();
  });

  it('C00-U12 works controlled and uncontrolled', async () => {
    const user = userEvent.setup();
    // uncontrolled: its own state, starting from defaultChecked
    const { unmount } = render(<Checkbox label="A" defaultChecked />);
    const a = screen.getByRole('checkbox', { name: 'A' });
    expect(a).toHaveAttribute('aria-checked', 'true');
    await user.click(a);
    expect(a).toHaveAttribute('aria-checked', 'false');
    unmount();

    // controlled: reports the wish, shows only what the prop says
    const onChange = vi.fn();
    const { rerender } = render(<Checkbox label="B" checked={false} onChange={onChange} />);
    const b = screen.getByRole('checkbox', { name: 'B' });
    await user.click(b);
    expect(onChange).toHaveBeenCalledWith(true);
    expect(b).toHaveAttribute('aria-checked', 'false');
    rerender(<Checkbox label="B" checked onChange={onChange} />);
    expect(b).toHaveAttribute('aria-checked', 'true');
    await user.click(b);
    expect(onChange).toHaveBeenLastCalledWith(false);
    expect(b).toHaveAttribute('aria-checked', 'true');
  });

  // jsdom has no layout, so the box and its hit area are read from the stylesheet.
  it('C00-U13 the box is 19px and its hit area 44px', () => {
    render(<Checkbox label="Buy milk" />);
    expect(screen.getByRole('checkbox', { name: 'Buy milk' })).toHaveClass('tp-cb', 'tp-ink');

    const box = rulesWhere(rules, (s) => s === '.tp-cb');
    expect(box.some((r) => r.declarations.width === '19px' && r.declarations.height === '19px')).toBe(true);
    expect(box.some((r) => r.declarations.position === 'relative')).toBe(true);
    expect(rulesWhere(rules, (s) => s === '.tp-cb.tp-sm')[0]?.declarations).toMatchObject({ width: '15px', height: '15px' });

    // the hit area: a pseudo-element the size of touch-target, centred on the box, taking no space in the layout
    const hit = rulesWhere(rules, (s) => s === '.tp-cb::before');
    expect(hit).toHaveLength(1);
    expect(hit[0]!.declarations).toMatchObject({
      content: '""',
      position: 'absolute',
      width: 'var(--touch-target)',
      height: 'var(--touch-target)',
      left: '50%',
      top: '50%',
      transform: 'translate(-50%, -50%)',
    });
    const sizes = rulesWhere(parseRules(readStylesheet('tokens-extra.css')), (s) => s === ':root')[0];
    expect(sizes?.declarations['--touch-target']).toBe('44px');
    expect(sizes?.declarations['--checkbox']).toBe('19px');
  });
});
