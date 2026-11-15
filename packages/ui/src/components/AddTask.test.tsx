import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { parseRules, readStylesheet, rulesWhere } from '../test-utils/stylesheet';
import { AddTask } from './AddTask';

const rules = parseRules(readStylesheet('components.css'));
const HASH_PROJECTS = [
  { id: 'nw', name: 'Northwind', color: '#3d5a80' },
  { id: 'pf', name: 'Platform', color: '#5b7553' },
];

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

  it('C02-U14 the empty box sits on the words’ baseline, not the middle of the line box', () => {
    const line = rulesWhere(rules, (sel) => sel === '.tp-addtask')[0]!;
    expect(line.declarations['align-items']).toBe('baseline');
    const box = rulesWhere(rules, (sel) => sel === '.tp-addtask-box')[0]!;
    expect(box.declarations.transform).toBe('translateY(3px)');
  });

  it('PH-U11 a pick shows the pill; Enter adds with the project; × and ⌫ at the start drop it', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    render(
      <AddTask label="Write the next thing…" autoOpen onAdd={onAdd} hash={{ projects: HASH_PROJECTS }} />,
    );
    const field = screen.getByRole('textbox', { name: 'New task' });
    await user.type(field, 'Plan #nor{Enter}');
    expect(document.querySelector('.tp-hm-pill')).toHaveTextContent('Northwind');
    await user.keyboard('{Enter}');
    expect(onAdd).toHaveBeenLastCalledWith('Plan', 'nw');
    // The line comes back empty, with no pill.
    expect(field).toHaveValue('');
    expect(document.querySelector('.tp-hm-pill')).toBeNull();

    await user.type(field, 'Ship #pla{Enter}');
    await user.click(screen.getByRole('button', { name: 'No project (Platform)' }));
    await waitFor(() => expect(document.querySelector('.tp-hm-pill')).toBeNull());
    expect(field).toHaveFocus();

    await user.type(field, ' #pla{Enter}');
    field.setSelectionRange(0, 0);
    await user.keyboard('{Backspace}');
    expect(document.querySelector('.tp-hm-pill')).toBeNull();
    expect(field).toHaveValue('Ship');
    await user.keyboard('{Enter}');
    expect(onAdd).toHaveBeenLastCalledWith('Ship', null);
  });

  it('PH-U12 a line that starts with a project keeps it after each add; # swaps it', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    render(
      <AddTask
        label="Add to Northwind…"
        autoOpen
        onAdd={onAdd}
        hash={{ projects: HASH_PROJECTS }}
        project={HASH_PROJECTS[0]}
      />,
    );
    const field = screen.getByRole('textbox', { name: 'New task' });
    expect(document.querySelector('.tp-hm-pill')).toHaveTextContent('Northwind');
    await user.type(field, 'Brief{Enter}');
    expect(onAdd).toHaveBeenLastCalledWith('Brief', 'nw');
    expect(document.querySelector('.tp-hm-pill')).toHaveTextContent('Northwind');
    await user.type(field, 'Deploy #pla{Enter}{Enter}');
    expect(onAdd).toHaveBeenLastCalledWith('Deploy', 'pf');
    expect(document.querySelector('.tp-hm-pill')).toHaveTextContent('Northwind');
  });

  it('PH-U11 without projects # is just text and onAdd gets the words alone', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    render(<AddTask label="Write the next thing…" autoOpen onAdd={onAdd} project={HASH_PROJECTS[0]} />);
    await user.type(screen.getByRole('textbox', { name: 'New task' }), 'Buy #milk{Enter}');
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(document.querySelector('.tp-hm-pill')).toBeNull();
    expect(onAdd).toHaveBeenCalledWith('Buy #milk');
    expect(onAdd.mock.calls[0]).toHaveLength(1);
  });
});
