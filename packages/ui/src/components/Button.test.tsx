import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseRules, readStylesheet, rulesWhere } from '../test-utils/stylesheet';
import { Button } from './Button';

const rules = parseRules(readStylesheet('components.css'));
const ruleFor = (selector: string) => rulesWhere(rules, (s) => s === selector);

/** A DOMRect of the given width, for the width easing (jsdom measures everything as 0). */
function rect(width: number): DOMRect {
  return {
    x: 0,
    y: 0,
    width,
    height: 38,
    top: 0,
    left: 0,
    right: width,
    bottom: 38,
    toJSON: () => ({}),
  } as DOMRect;
}

afterEach(() => vi.restoreAllMocks());

describe('Button', () => {
  it('C00-U05 default is ink; secondary, quiet (ghost) and danger (destructive) render their variants', () => {
    const { rerender } = render(<Button>New task</Button>);
    const btn = screen.getByRole('button', { name: 'New task' });
    expect(btn).toHaveAttribute('type', 'button');
    expect(btn).toHaveClass('tp-btn', 'tp-btn-primary');
    expect(btn).toHaveAttribute('data-mode', 'idle');
    for (const variant of ['secondary', 'quiet', 'danger'] as const) {
      rerender(<Button variant={variant}>New task</Button>);
      expect(btn).toHaveClass('tp-btn', `tp-btn-${variant}`);
      expect(btn).not.toHaveClass('tp-btn-primary');
    }
    rerender(<Button size="sm">New task</Button>);
    expect(btn).toHaveClass('tp-btn-primary', 'tp-sm');
    // Ink means the primary fill is --primary, and danger is a tint with red text: there is no solid red button.
    expect(ruleFor('.tp-btn-primary').some((r) => r.declarations.background === 'var(--primary)')).toBe(true);
    expect(
      ruleFor('.tp-btn-danger').some(
        (r) =>
          r.declarations.background === 'var(--destructive-soft)' &&
          r.declarations.color === 'var(--destructive)',
      ),
    ).toBe(true);
  });

  // jsdom has no layout and no :active styling, so the press is read from the stylesheet: every rule for a pressed
  // button may change colour (opacity, background) and nothing else.
  it('C00-U06 pressing changes colour only: the press rules set no transform and no font-weight', () => {
    const press = rulesWhere(rules, (s) => s.includes('.tp-btn') && s.includes(':active'));
    expect(press.length).toBeGreaterThan(0);
    expect(press.some((r) => r.declarations.opacity === '.86')).toBe(true); // the tint
    for (const r of press) {
      expect(r.declarations, r.selector).not.toHaveProperty('font-weight');
      expect(r.declarations, r.selector).not.toHaveProperty('font-size');
      expect(r.declarations, r.selector).not.toHaveProperty('padding');
      expect(r.declarations.transform ?? 'none', r.selector).toBe('none');
    }
    // and nothing is set up to animate a transform on the button at all
    const transitions = ruleFor('.tp-btn')
      .map((r) => r.declarations.transition ?? '')
      .join(' ');
    expect(transitions).toContain('background-color');
    expect(transitions).toContain('opacity');
    expect(transitions).not.toContain('transform');
  });

  it('C00-U07 loading shows the spinner and the label, ignores clicks and keeps its width', async () => {
    let width = 100;
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(() => rect(width));
    const onClick = vi.fn();
    const user = userEvent.setup();
    const { rerender } = render(<Button onClick={onClick}>Save</Button>);
    const btn = screen.getByRole('button', { name: 'Save' });
    expect(btn.querySelector('.tp-spin')).toBeNull();

    rerender(
      <Button onClick={onClick} loading>
        Save
      </Button>,
    );
    expect(btn.querySelector('svg.tp-spin')).not.toBeNull(); // the spinner
    expect(btn).toHaveTextContent('Save'); // the label stays without a loading label
    expect(btn).toHaveClass('tp-busy', 'tp-indet');
    expect(btn).toHaveAttribute('data-mode', 'busy');
    expect(btn).toHaveAttribute('aria-busy', 'true');
    expect(btn).toHaveAttribute('aria-disabled', 'true');
    expect(btn).not.toBeDisabled(); // never greyed out: it only ignores clicks
    await user.click(btn);
    expect(onClick).not.toHaveBeenCalled();
    // the same measured width: nothing to ease, no inline width, so the button holds its place
    expect(btn.style.width).toBe('');

    // a wider label eases from the old width to the one the new label needs, so text is never cut off
    width = 130;
    rerender(
      <Button onClick={onClick} loading loadingLabel="Saving your changes">
        Save
      </Button>,
    );
    expect(btn).toHaveTextContent('Saving your changes');
    expect(btn.style.width).toBe('130px');
    fireEvent.transitionEnd(btn, { propertyName: 'width' });
    expect(btn.style.width).toBe('');

    // back to idle: clickable again
    rerender(<Button onClick={onClick}>Save</Button>);
    expect(btn).not.toHaveAttribute('aria-busy');
    await user.click(btn);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('C00-U08 disabled is not clickable and announces disabled', async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(
      <Button disabled onClick={onClick}>
        Delete
      </Button>,
    );
    const btn = screen.getByRole('button', { name: 'Delete' });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute('disabled');
    await user.click(btn);
    expect(onClick).not.toHaveBeenCalled();
    // the only greyed-out state
    const disabled = ruleFor('.tp-btn[disabled]')[0];
    expect(disabled?.declarations).toMatchObject({ opacity: '.45', cursor: 'not-allowed' });
  });
});
