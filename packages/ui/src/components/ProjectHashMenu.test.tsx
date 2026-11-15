import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { HashProject } from '../lib/projectHash';
import { AddTask, type AddTaskHash } from './AddTask';

const PROJECTS: HashProject[] = [
  { id: 'nw', name: 'Northwind', color: '#3d5a80' },
  { id: 'pf', name: 'Platform', color: '#5b7553' },
  { id: 'hm', name: 'Home', color: '#a35d3d' },
  { id: 'pl', name: 'Plants', color: '#7a6a9e' },
];

function Line(p: { hash?: Partial<AddTaskHash>; onAdd?: (text: string, projectId?: string | null) => void }) {
  return (
    <AddTask
      label="Write the next thing…"
      autoOpen
      onAdd={p.onAdd}
      hash={{ projects: PROJECTS, spaceName: 'Northwind', ...p.hash }}
    />
  );
}

const field = () => screen.getByRole('textbox', { name: 'New task' });
const menu = () => screen.queryByRole('listbox', { name: 'Projects' });
/** The menu that is open now (a closed one lingers a beat as it eases out). */
const openMenu = () => document.querySelector('.tp-hm-pop:not(.tp-pop-leaving) [role="listbox"]');
const rows = () => screen.getAllByRole('option').map((o) => o.textContent);
const lit = () =>
  screen.getAllByRole('option').find((o) => o.getAttribute('aria-selected') === 'true')?.textContent;
const pill = () => document.querySelector('.tp-hm-pill');

afterEach(() => vi.restoreAllMocks());

describe('the # project menu', () => {
  it('PH-U04 typing # opens it with the space heading and the first row lit; letters narrow it, matched part bold', async () => {
    const user = userEvent.setup();
    render(<Line />);
    expect(menu()).toBeNull();
    await user.type(field(), 'Review notes #');
    expect(menu()).not.toBeNull();
    expect(screen.getByText('Projects in Northwind')).toBeInTheDocument();
    expect(rows()).toEqual(['Northwind', 'Platform', 'Home', 'Plants']);
    expect(lit()).toBe('Northwind');
    expect(field()).toHaveAttribute('aria-expanded', 'true');
    await user.type(field(), 'pla');
    expect(rows()).toEqual(['Platform', 'Plants']);
    expect(lit()).toBe('Platform');
    expect(screen.getAllByRole('option')[0]!.querySelector('b')?.textContent).toBe('Pla');
    expect(field()).toHaveAttribute('aria-activedescendant', screen.getAllByRole('option')[0]!.id);
  });

  it('PH-U04 a # before a digit or inside a word is just text', async () => {
    const user = userEvent.setup();
    render(<Line />);
    await user.type(field(), 'Fix #92');
    expect(openMenu()).toBeNull();
    await user.clear(field());
    await user.type(field(), 'Learn C#');
    expect(openMenu()).toBeNull();
  });

  it('PH-U05 up and down wrap; Enter and Tab pick; a click picks; Enter never reaches the line’s own add', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    render(<Line onAdd={onAdd} />);
    await user.type(field(), 'Call #');
    await user.keyboard('{ArrowUp}');
    expect(lit()).toBe('Plants');
    await user.keyboard('{ArrowDown}');
    expect(lit()).toBe('Northwind');
    await user.keyboard('{ArrowDown}{Enter}');
    expect(onAdd).not.toHaveBeenCalled();
    expect(field()).toHaveValue('Call');
    expect(pill()).toHaveTextContent('Platform');
    await waitFor(() => expect(openMenu()).toBeNull());

    await user.type(field(), ' #ho');
    await user.keyboard('{Tab}');
    expect(pill()).toHaveTextContent('Home');
    expect(field()).toHaveFocus();
    expect(field()).toHaveValue('Call');

    await user.type(field(), ' #');
    await user.click(screen.getByRole('option', { name: 'Northwind' }));
    expect(pill()).toHaveTextContent('Northwind');
    expect(field()).toHaveValue('Call');
    await user.keyboard('{Enter}');
    expect(onAdd).toHaveBeenCalledWith('Call', 'nw');
  });

  it('PH-U06 Esc closes and keeps the #; that # stays closed while typing on; a new # opens', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    render(<Line onAdd={onAdd} />);
    await user.type(field(), 'Tag #urgent');
    await user.keyboard('{Escape}');
    // The line stays open: Esc was the menu's.
    expect(field()).toHaveValue('Tag #urgent');
    await waitFor(() => expect(openMenu()).toBeNull());
    await user.type(field(), 'ly');
    expect(openMenu()).toBeNull();
    await user.type(field(), ' #');
    expect(openMenu()).not.toBeNull();
    await user.keyboard('{Escape}{Enter}');
    expect(onAdd).toHaveBeenCalledWith('Tag #urgently #', null);
  });

  it('PH-U07 a space right after an exact name picks it; after part of a name it types the space', async () => {
    const user = userEvent.setup();
    render(<Line />);
    await user.type(field(), 'Water #home ');
    expect(pill()).toHaveTextContent('Home');
    expect(field()).toHaveValue('Water');
    await user.type(field(), ' #pla ');
    expect(field()).toHaveValue('Water #pla ');
    expect(pill()).toHaveTextContent('Home');
  });

  it('PH-U08 no match offers New project; it makes one and picks it; over 60 characters says so', async () => {
    const user = userEvent.setup();
    const onNew = vi.fn(() => 'gd');
    const onAdd = vi.fn();
    render(<Line onAdd={onAdd} hash={{ onNew }} />);
    await user.type(field(), 'Seeds #garden');
    expect(screen.getByText('No project called garden')).toBeInTheDocument();
    expect(rows()).toEqual(['New project Garden']);
    await user.keyboard('{Enter}');
    expect(onNew).toHaveBeenCalledWith('Garden', expect.stringMatching(/^#|var\(/));
    expect(pill()).toHaveTextContent('Garden');
    await user.keyboard('{Enter}');
    expect(onAdd).toHaveBeenCalledWith('Seeds', 'gd');

    // A part that matches never offers a new one.
    await user.type(field(), '#pla');
    expect(rows()).toEqual(['Platform', 'Plants']);
    await user.clear(field());
    await user.type(field(), `#${'a'.repeat(61)}`);
    await user.keyboard('{Enter}');
    expect(screen.getByRole('alert')).toHaveTextContent('Project names can be up to 60 characters.');
    expect(onNew).toHaveBeenCalledTimes(1);
  });

  it('PH-U09 an empty space says how to make one; while loading three quiet rows and Enter waits', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    const { unmount } = render(<Line onAdd={onAdd} hash={{ projects: [] }} />);
    await user.type(field(), 'Book #');
    expect(
      screen.getByText('No projects in Northwind yet. Write a name after the # to make one.'),
    ).toBeInTheDocument();
    unmount();

    render(<Line onAdd={onAdd} hash={{ loading: true }} />);
    await user.type(field(), 'Book #');
    expect(screen.getByLabelText('Loading projects')).toHaveAttribute('aria-busy', 'true');
    expect(document.querySelectorAll('.tp-hm-skl')).toHaveLength(3);
    await user.keyboard('{Enter}');
    expect(onAdd).not.toHaveBeenCalled();
    expect(field()).toHaveValue('Book #');
  });

  it('PH-U10 opens above when the scrolling box has no room below and more above', async () => {
    const user = userEvent.setup();
    const rect = (top: number, bottom: number) =>
      ({
        top,
        bottom,
        left: 0,
        right: 600,
        width: 600,
        height: bottom - top,
        x: 0,
        y: top,
        toJSON: () => ({}),
      }) as DOMRect;
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      if (this.classList.contains('tp-addtask-input')) return rect(560, 600);
      if (this.dataset.scroll !== undefined) return rect(0, 604);
      return rect(0, 0);
    });
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (this: HTMLElement) {
      return this.classList.contains('tp-hm') ? 180 : 0;
    });
    render(
      <div data-scroll="" style={{ overflowY: 'auto' }}>
        <Line />
      </div>,
    );
    await user.type(field(), 'Low on the page #');
    await act(async () => {});
    expect(document.querySelector('.tp-hm-pop')).toHaveClass('tp-up');
  });

  it('PH-U10 with room below it opens under the line', async () => {
    const user = userEvent.setup();
    render(<Line />);
    await user.type(field(), '#');
    expect(document.querySelector('.tp-hm-pop')).not.toHaveClass('tp-up');
  });
});
