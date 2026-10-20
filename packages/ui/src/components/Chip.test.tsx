import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseRules, readStylesheet, rulesWhere } from '../test-utils/stylesheet';
import { Chip } from './Chip';

/** A DOMRect of the given width, for the width easing (jsdom measures everything as 0). */
function rect(width: number): DOMRect {
  return {
    x: 0,
    y: 0,
    width,
    height: 28,
    top: 0,
    left: 0,
    right: width,
    bottom: 28,
    toJSON: () => ({}),
  } as DOMRect;
}

afterEach(() => vi.restoreAllMocks());

describe('Chip', () => {
  it('C00-U30 a changed label eases the width from the old size to the new one', () => {
    let width = 80;
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(() => rect(width));
    // The forced reflow between the two widths is `offsetWidth`; record what the width was at that moment.
    const atReflow: string[] = [];
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(function (this: HTMLElement) {
      atReflow.push(this.style.width);
      return width;
    });

    const { rerender, container } = render(<Chip label="Northwind" color="#2f5fa8" />);
    const chip = container.querySelector('.tp-chip') as HTMLElement;
    expect(chip).toHaveTextContent('Northwind');
    expect(chip.querySelector('.tp-dot')).not.toBeNull();
    expect(chip.style.width).toBe('');
    expect(chip).not.toHaveClass('tp-sizing');

    width = 120;
    rerender(<Chip label="Northwind Traders" color="#2f5fa8" />);
    expect(chip).toHaveTextContent('Northwind Traders');
    expect(chip).toHaveClass('tp-sizing');
    expect(atReflow).toEqual(['80px']); // pinned at the old width first
    expect(chip.style.width).toBe('120px'); // then sent to the new one, so the transition carries it over

    fireEvent.transitionEnd(chip, { propertyName: 'width' });
    expect(chip.style.width).toBe('');
    expect(chip).not.toHaveClass('tp-sizing');

    // the stylesheet animates the width while tp-sizing is on (jsdom has no layout, so this reads the rule)
    const sizing = rulesWhere(parseRules(readStylesheet('app.css')), (s) => s === '.tp-chip.tp-sizing')[0];
    expect(sizing?.declarations.transition).toContain('width var(--dur-arrive) var(--ease-settle)');
    expect(sizing?.declarations.overflow).toBe('hidden');
  });

  it('C00-U30 the same label does not move, and clear calls onClear', async () => {
    const user = userEvent.setup();
    const onClear = vi.fn();
    const { rerender, container } = render(<Chip label="Northwind" onClear={onClear} />);
    const chip = container.querySelector('.tp-chip') as HTMLElement;
    rerender(<Chip label="Northwind" onClear={onClear} />);
    expect(chip).not.toHaveClass('tp-sizing');

    await user.click(screen.getByRole('button', { name: 'Clear filter Northwind' }));
    expect(onClear).toHaveBeenCalledTimes(1);

    rerender(<Chip label="Northwind" />);
    expect(screen.queryByRole('button')).toBeNull(); // no onClear, no clear button
  });
});
