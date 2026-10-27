import { render, screen, within } from '@testing-library/react';
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SearchPanel, TopBar } from '@tudu/ui';
import { closeNoteWindow, NOTE_WINDOW_MIN, openNote, resizeFrame, useNoteWindow } from './notebook';

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

describe('C22-U62 resizing the browser note window', () => {
  const f = { x: 200, y: 100, w: 600, h: 460 };
  const VW = 1440;
  const VH = 900;
  const r = (edge: Parameters<typeof resizeFrame>[1], dx: number, dy: number) =>
    resizeFrame(f, edge, dx, dy, VW, VH);

  it('C22-U62 each edge and corner moves its own edges; the opposite ones stay put', () => {
    expect(r('e', 40, 99)).toEqual({ ...f, w: 640 });
    expect(r('s', 99, 40)).toEqual({ ...f, h: 500 });
    expect(r('w', -40, 99)).toEqual({ ...f, x: 160, w: 640 });
    expect(r('n', 99, -40)).toEqual({ ...f, y: 60, h: 500 });
    expect(r('ne', 40, -40)).toEqual({ x: 200, y: 60, w: 640, h: 500 });
    expect(r('nw', -40, -40)).toEqual({ x: 160, y: 60, w: 640, h: 500 });
    expect(r('se', 40, 40)).toEqual({ x: 200, y: 100, w: 640, h: 500 });
    expect(r('sw', -40, 40)).toEqual({ x: 160, y: 100, w: 640, h: 500 });
  });

  it("C22-U62 never smaller than 420×320, never closer than 8px to the page's edges", () => {
    expect(r('se', -900, -900)).toEqual({ ...f, w: NOTE_WINDOW_MIN.w, h: NOTE_WINDOW_MIN.h });
    const w = r('w', 900, 0);
    expect([w.x + w.w, w.w]).toEqual([800, 420]);
    const n = r('n', 0, 900);
    expect([n.y + n.h, n.h]).toEqual([560, 320]);
    expect(r('nw', -900, -900)).toEqual({ x: 8, y: 8, w: 792, h: 552 });
    expect(r('se', 5000, 5000)).toEqual({ x: 200, y: 100, w: VW - 8 - 200, h: VH - 8 - 100 });
  });
});
