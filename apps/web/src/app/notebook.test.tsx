import { render, screen, within } from '@testing-library/react';
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SearchPanel, TopBar } from '@tudu/ui';
import { closeNoteWindow, openNote, useNoteWindow } from './notebook';

describe('C22-U21 the top bar', () => {
  it('C22-U21 has Notebook between Search and Inbox; without it (signed out) there is none', () => {
    const { rerender } = render(
      <TopBar
        onSearch={() => {}}
        searchLabel="Search tasks and notes"
        notebook={{ onNotebook: () => {} }}
        inbox={{ count: 0, onInbox: () => {} }}
      />,
    );
    const names = screen.getAllByRole('button').map((b) => b.getAttribute('aria-label'));
    const at = (n: string) => names.indexOf(n);
    expect(at('Notebook')).toBe(at('Search tasks and notes') + 1);
    expect(at('Inbox')).toBe(at('Notebook') + 1);
    rerender(<TopBar onSearch={() => {}} />);
    expect(screen.queryByRole('button', { name: 'Notebook' })).toBeNull();
  });
});

describe('C22-U22 notes in Search', () => {
  it('C22-U22 come under Notes after the tasks', () => {
    render(
      <SearchPanel
        layer="none"
        initial={{ query: 'offsite', noFocus: true }}
        results={{
          query: 'offsite',
          hits: [
            {
              key: 't1',
              id: 'NW-65',
              title: 'Plan the team offsite agenda',
              where: { label: 'Today', tone: 'today' },
            },
          ],
        }}
        notes={[{ key: 'n1', title: 'Offsite agenda draft', where: 'Northwind / Planning', edited: '4m' }]}
        notesFor="offsite"
      />,
    );
    const text = screen.getByRole('listbox', { name: 'Matching tasks' }).textContent ?? '';
    const task = text.indexOf('Plan the team offsite agenda');
    const heading = text.indexOf('Notes');
    const note = text.indexOf('Offsite agenda draft');
    expect(task).toBeGreaterThanOrEqual(0);
    expect(heading).toBeGreaterThan(task);
    expect(note).toBeGreaterThan(heading);
    expect(
      within(screen.getByRole('listbox')).getByRole('option', { name: /agenda draft/ }).textContent,
    ).toContain('Northwind / Planning');
  });

  it('C22-U22 picking one opens the note window on the desk and the note page on a phone', () => {
    const navigate = vi.fn();
    const { result, rerender } = renderHook(() => useNoteWindow());
    openNote({ id: 'n1' }, false, navigate);
    rerender();
    expect(result.current.open).toBe(true);
    expect(result.current.note).toMatchObject({ id: 'n1', blank: false });
    expect(navigate).not.toHaveBeenCalled();
    closeNoteWindow();
    openNote({ id: 'n1' }, true, navigate);
    expect(navigate).toHaveBeenCalledWith('/notebook/n1');
  });
});
