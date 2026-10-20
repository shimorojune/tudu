import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { parseRules, readStylesheet, rulesWhere } from '../test-utils/stylesheet';
import { AddTask } from './AddTask';

const rules = parseRules(readStylesheet('components.css'));

describe('AddTask', () => {
  it('C02-U14 serif until the first keystroke; Enter adds and keeps writing, Esc stops, blank adds nothing', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    const onClose = vi.fn();
    render(<AddTask label="Write the next thing…" onAdd={onAdd} onClose={onClose} />);
    await user.click(screen.getByRole('button', { name: 'Write the next thing…' }));
    const field = screen.getByRole('textbox', { name: 'New task' });
    expect(field).toHaveFocus();
    expect(field).toHaveAttribute('placeholder', 'Write the next thing…');
    // while empty the field itself is in the placeholder's serif, so the caret sits at its first letter
    const empty = rulesWhere(rules, (s) => s === '.tp-root .tp-addtask-input:placeholder-shown')[0]!;
    expect(empty.declarations['font-family']).toBe('var(--font-serif)');
    expect(rulesWhere(rules, (s) => s === '.tp-root .tp-addtask-input')[0]!.declarations['font-family']).toBe(
      'var(--font-sans)',
    );

    await user.type(field, '   {Enter}');
    expect(onAdd).not.toHaveBeenCalled();
    await user.type(field, 'Water the plants{Enter}');
    expect(onAdd).toHaveBeenCalledWith('Water the plants');
    expect(field).toHaveValue('');
    expect(field).toHaveFocus();
    await user.type(field, 'Call the bank{Enter}');
    expect(onAdd).toHaveBeenCalledTimes(2);

    await user.type(field, 'Not this one{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.getByRole('button', { name: 'Write the next thing…' })).toBeInTheDocument();
    expect(onAdd).toHaveBeenCalledTimes(2);
  });

  it('opens when its key changes and keeps what was written when you click away', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    const { rerender } = render(<AddTask label="Write the next thing…" onAdd={onAdd} />);
    expect(screen.queryByRole('textbox')).toBeNull();
    rerender(<AddTask label="Write the next thing…" onAdd={onAdd} openKey={1} />);
    const field = screen.getByRole('textbox', { name: 'New task' });
    await user.type(field, 'Half a thought');
    await user.click(document.body);
    expect(onAdd).toHaveBeenCalledWith('Half a thought');
    // going back to no key does not open it again
    rerender(<AddTask label="Write the next thing…" onAdd={onAdd} openKey={null} />);
    expect(screen.queryByRole('textbox')).toBeNull();
  });
});
