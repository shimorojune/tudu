import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { parseRules, readStylesheet, rulesWhere } from '../test-utils/stylesheet';
import { AddTask } from './AddTask';

const rules = parseRules(readStylesheet('components.css'));

describe('AddTask', () => {
  it('NI-U01 a button that opens Quick Add: click, Enter and Space call onOpen, and it never becomes a field', async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    render(<AddTask label="Write the next thing…" onOpen={onOpen} />);
    const line = screen.getByRole('button', { name: 'Write the next thing…' });
    expect(line).toHaveAttribute('aria-haspopup', 'dialog');
    await user.click(line);
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(line).toBeInTheDocument();
    line.focus();
    await user.keyboard('{Enter}');
    await user.keyboard(' ');
    expect(onOpen).toHaveBeenCalledTimes(3);
    expect(screen.queryByRole('textbox')).toBeNull();
    // nothing in the stylesheet is left for a field
    expect(rulesWhere(rules, (sel) => sel.includes('tp-addtask-input'))).toHaveLength(0);
  });

  it('C02-U14 the empty box sits on the words’ baseline, not the middle of the line box', () => {
    const line = rulesWhere(rules, (sel) => sel === '.tp-addtask')[0]!;
    expect(line.declarations['align-items']).toBe('baseline');
    const box = rulesWhere(rules, (sel) => sel === '.tp-addtask-box')[0]!;
    expect(box.declarations.transform).toBe('translateY(3px)');
  });
});
