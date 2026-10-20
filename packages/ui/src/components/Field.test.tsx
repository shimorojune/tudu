import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { declarationsFor, parseRules, readStylesheet, rulesWhere } from '../test-utils/stylesheet';
import { Field } from './Field';

const rules = parseRules(readStylesheet('components.css'));

describe('Field', () => {
  it('C00-U21 focus shows the ink edge; an error shows the red edge, the message and aria-invalid', async () => {
    const user = userEvent.setup();
    const { rerender, container } = render(<Field label="Email" placeholder="you@example.com" />);
    const input = screen.getByRole('textbox', { name: 'Email' });
    const field = container.querySelector('label.tp-field') as HTMLElement;
    expect(field).toContainElement(input);
    expect(field).toHaveAttribute('for', input.id);
    expect(input).not.toHaveAttribute('aria-invalid');
    expect(field.matches(':focus-within')).toBe(false);

    await user.click(input);
    expect(input).toHaveFocus();
    expect(field.matches(':focus-within')).toBe(true);
    // The edge is drawn by the stylesheet (jsdom has no layout): at rest the ring colour is border-strong (ink) and
    // :focus-within draws it 1px wide on a card fill, with a 4px halo.
    const base = rulesWhere(rules, (s) => s === '.tp-field')[0];
    expect(base?.declarations['--tp-ring']).toBe('var(--border-strong)');
    const focus = rulesWhere(rules, (s) => s === '.tp-field:focus-within')[0];
    expect(focus?.declarations['box-shadow']).toContain('0 0 0 1px var(--tp-ring)');
    expect(focus?.declarations['box-shadow']).toContain('0 0 0 4px var(--tp-halo)');
    expect(focus?.declarations.background).toBe('var(--card)');

    rerender(<Field label="Email" placeholder="you@example.com" error="That address does not look right" />);
    expect(field).toHaveClass('tp-bad');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    const message = screen.getByRole('alert');
    expect(message).toHaveTextContent('That address does not look right');
    expect(message).toHaveClass('tp-help');
    expect(message.querySelector('svg')).not.toBeNull(); // the icon
    expect(input).toHaveAttribute('aria-describedby', message.id);
    // the same edge, ring and halo in red
    const bad = rulesWhere(rules, (s) => s === '.tp-field.tp-bad')[0];
    expect(bad?.declarations).toMatchObject({
      '--tp-edge': 'var(--destructive-edge)',
      '--tp-ring': 'var(--destructive)',
      '--tp-halo': 'var(--destructive-soft)',
    });

    rerender(<Field label="Email" placeholder="you@example.com" />);
    expect(field).not.toHaveClass('tp-bad');
    expect(input).not.toHaveAttribute('aria-invalid');
    expect(input).not.toHaveAttribute('aria-describedby');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  // jsdom has no layout, so the ellipsis is read from the stylesheet: the rules that match the rendered input.
  it('C00-U22 long values end in an ellipsis', () => {
    const long =
      'A very long value that goes on well past the width of the field and must not be cut off hard';
    render(<Field label="Title" defaultValue={long} />);
    const input = screen.getByRole('textbox', { name: 'Title' });
    expect(input).toHaveValue(long);
    const applied = declarationsFor(rules, input);
    expect(applied['text-overflow']).toBe('ellipsis');
    expect(applied['min-width']).toBe('0'); // the input may shrink inside the field, so the ellipsis has a reason to appear
  });
});
