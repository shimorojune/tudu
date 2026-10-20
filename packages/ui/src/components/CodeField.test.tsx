import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { parseRules, readStylesheet, rulesWhere } from '../test-utils/stylesheet';
import { CodeField } from './CodeField';

const rules = parseRules(readStylesheet('components.css'));
const NAME = 'The 6-digit code';

function boxesOf(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>('.tp-code-b'));
}
/** The box with the ink ring, or -1. */
function ringAt(container: HTMLElement): number {
  return boxesOf(container).findIndex((b) => b.classList.contains('tp-on'));
}
function digitsOf(container: HTMLElement): string {
  return boxesOf(container)
    .map((b) => b.textContent)
    .join('');
}

describe('CodeField', () => {
  it('C01-U01 a digit fills the next box and moves the ring on; non-digits are ignored; backspace steps back; paste fills all six', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { container } = render(<CodeField onChange={onChange} />);
    const input = screen.getByRole('textbox', { name: NAME });
    const boxes = boxesOf(container);
    expect(boxes).toHaveLength(6);
    expect(boxes[2]).toHaveClass('tp-code-mid'); // the gap after the third box
    expect(input).toHaveAttribute('inputmode', 'numeric');
    expect(input).toHaveAttribute('autocomplete', 'one-time-code');
    expect(ringAt(container)).toBe(-1); // no ring until the field has focus

    await user.click(boxes[0]!);
    expect(input).toHaveFocus();
    expect(ringAt(container)).toBe(0);

    await user.keyboard('4');
    expect(digitsOf(container)).toBe('4');
    expect(boxes[0]).toHaveClass('tp-has');
    expect(boxes[0]!.querySelector('.tp-code-d')).toHaveTextContent('4');
    expect(ringAt(container)).toBe(1);
    expect(onChange).toHaveBeenLastCalledWith('4');

    await user.keyboard('a');
    expect(input).toHaveValue('4');
    expect(digitsOf(container)).toBe('4');
    expect(ringAt(container)).toBe(1);

    await user.keyboard('8');
    expect(digitsOf(container)).toBe('48');
    expect(ringAt(container)).toBe(2);
    expect(onChange).toHaveBeenLastCalledWith('48');

    await user.keyboard('{Backspace}');
    expect(input).toHaveValue('4');
    expect(digitsOf(container)).toBe('4');
    expect(boxes[1]).not.toHaveClass('tp-has');
    expect(ringAt(container)).toBe(1);
    expect(onChange).toHaveBeenLastCalledWith('4');

    await user.keyboard('{Backspace}');
    expect(digitsOf(container)).toBe('');
    await user.paste('482913');
    expect(input).toHaveValue('482913');
    expect(digitsOf(container)).toBe('482913');
    expect(ringAt(container)).toBe(5); // full: the ring rests on the last box
    expect(onChange).toHaveBeenLastCalledWith('482913');

    // The ring is ink, never red, and each digit pops in: both from the stylesheet (jsdom has no layout).
    const ring = rulesWhere(rules, (s) => s === '.tp-code-b.tp-on')[0];
    expect(ring?.declarations['box-shadow']).toContain('var(--border-strong)');
    expect(ring?.declarations['box-shadow']).not.toContain('destructive');
    const pop = rulesWhere(rules, (s) => s === '.tp-code-d')[0];
    expect(pop?.declarations.animation).toContain('tp-pop-in 140ms');
  });

  it('C01-U02 six digits complete once; an error edges the row and says so; a new errorKey re-mounts the row (the nudge); disabled rests the boxes', async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    const { container, rerender } = render(<CodeField onComplete={onComplete} />);
    await user.click(screen.getByRole('textbox', { name: NAME }));
    await user.keyboard('48291');
    expect(onComplete).not.toHaveBeenCalled();
    await user.keyboard('3');
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledWith('482913');
    await user.keyboard('7'); // a seventh digit has nowhere to go
    expect(screen.getByRole('textbox', { name: NAME })).toHaveValue('482913');
    expect(onComplete).toHaveBeenCalledTimes(1);

    const root = container.querySelector('.tp-code') as HTMLElement;
    const row = () => container.querySelector('.tp-code-row');
    const first = row();
    expect(root).not.toHaveClass('tp-bad');
    expect(screen.queryByRole('alert')).toBeNull();

    const wrong = 'That code didn’t work. Check the email, or send a new one.';
    rerender(<CodeField onComplete={onComplete} error={wrong} errorKey={1} />);
    expect(root).toHaveClass('tp-bad');
    const help = screen.getByRole('alert');
    expect(help).toHaveClass('tp-help');
    expect(help).toHaveTextContent(wrong);
    expect(help.querySelector('svg')).not.toBeNull(); // the icon
    const input = screen.getByRole('textbox', { name: NAME });
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAttribute('aria-describedby', help.id);
    expect(row()).not.toBe(first); // re-mounted, so the nudge plays
    expect(input).toHaveFocus(); // and the field is ready for another go
    const nudge = rulesWhere(rules, (s) => s === '.tp-code.tp-bad .tp-code-row')[0];
    expect(nudge?.declarations.animation).toContain('tp-code-nudge 260ms');
    const edge = rulesWhere(rules, (s) => s === '.tp-code.tp-bad .tp-code-b')[0];
    expect(edge?.declarations['box-shadow']).toContain('var(--destructive-edge)');

    const second = row();
    rerender(<CodeField onComplete={onComplete} error={wrong} errorKey={2} />);
    expect(row()).not.toBe(second); // the same words again still nudge

    const third = row();
    rerender(<CodeField onComplete={onComplete} errorKey={2} />);
    expect(root).not.toHaveClass('tp-bad');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(row()).toBe(third); // typing on clears the line without losing the field

    rerender(<CodeField onComplete={onComplete} errorKey={2} disabled />);
    expect(screen.getByRole('textbox', { name: NAME })).toBeDisabled();
    expect(root).toHaveClass('tp-off');
    expect(ringAt(container)).toBe(-1);
    const off = rulesWhere(rules, (s) => s === '.tp-code.tp-off .tp-code-b')[0];
    expect(off?.declarations.opacity).toBe('.6');
  });
});
