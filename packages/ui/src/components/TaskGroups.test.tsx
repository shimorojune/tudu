import { NO_PROJECT } from '@tudu/core';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseRules, readStylesheet } from '../test-utils/stylesheet';
import { GroupHeader, TaskGroups, type TaskGroupItem, type TaskGroupsProps } from './TaskGroups';

const rules = parseRules(readStylesheet('components.css'));
const rule = (selector: string) => rules.find((r) => r.selector === selector && !r.context.length)!;

afterEach(() => vi.useRealTimers());

const GROUPS: TaskGroupItem[] = [
  {
    key: 'north',
    name: 'Northwind',
    color: '#5b7c99',
    tasks: [
      { key: 'n1', title: 'Send the invoice' },
      { key: 'n2', title: 'Call Asha', done: true },
      { key: 'n3', title: 'Book the room' },
    ],
  },
  { key: 'plat', name: 'Platform', color: '#8a6f9e', tasks: [{ key: 'p1', title: 'Rotate the keys' }] },
  { key: NO_PROJECT, name: 'No project', tasks: [{ key: 'x1', title: 'Water the plants' }] },
];

function setup(props: Partial<TaskGroupsProps> = {}) {
  const p = {
    onFold: vi.fn(),
    onAdd: vi.fn(),
    onReorder: vi.fn(),
    ...props,
  };
  const ui = (more: Partial<TaskGroupsProps> = {}) => (
    <TaskGroups groups={GROUPS} addLabel="Write the next thing…" resetKey="d1" {...p} {...more} />
  );
  const view = render(ui());
  return { ...view, p, ui, user: userEvent.setup() };
}
const section = (name: string) => screen.getByRole('region', { name });

describe('GroupHeader', () => {
  it('C02-U49 caret, dot, name and what is left; a tick when all are crossed off; folds from its title, "+" adds', async () => {
    const onFold = vi.fn();
    const onAdd = vi.fn();
    const user = userEvent.setup();
    const { container, rerender } = render(
      <GroupHeader name="Platform" color="#8a6f9e" left={2} onFold={onFold} onAdd={onAdd} />,
    );
    const title = screen.getByRole('button', { name: 'Platform, 2 left' });
    expect(title).toHaveAttribute('aria-expanded', 'true');
    expect(container.querySelector('.tp-gh-car')).toBeInTheDocument();
    expect((container.querySelector('.tp-gh-dot') as HTMLElement).style.background).not.toBe('');
    expect(container.querySelector('.tp-gh-n')).toHaveTextContent('2');
    // first paint never moves
    expect(container.querySelector('.tp-gh-n')).not.toHaveClass('tp-gh-turn');

    await user.click(title);
    expect(onFold).toHaveBeenLastCalledWith(true);
    title.focus();
    await user.keyboard('{Enter}');
    expect(onFold).toHaveBeenCalledTimes(2);

    await user.click(screen.getByRole('button', { name: 'Add a task to Platform' }));
    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onFold).toHaveBeenCalledTimes(2);

    rerender(<GroupHeader name="Platform" color="#8a6f9e" left={1} folded onFold={onFold} onAdd={onAdd} />);
    expect(screen.getByRole('button', { name: 'Platform, 1 left' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    expect(container.querySelector('.tp-gh-n')).toHaveClass('tp-gh-turn');
    await user.click(screen.getByRole('button', { name: 'Platform, 1 left' }));
    expect(onFold).toHaveBeenLastCalledWith(false);

    rerender(<GroupHeader name="Platform" color="#8a6f9e" left={0} onFold={onFold} />);
    expect(screen.getByRole('button', { name: 'Platform, all crossed off' })).toBeInTheDocument();
    expect(container.querySelector('.tp-gh-n')).toBeNull();
    expect(container.querySelector('.tp-gh-tick')).toHaveClass('tp-gh-turn');
    expect(screen.queryByRole('button', { name: 'Add a task to Platform' })).toBeNull();

    // No project: a hollow ring for a dot
    rerender(<GroupHeader name="No project" left={1} />);
    expect(container.querySelector('.tp-gh-dot')).toHaveClass('tp-gh-none');
  });

  it('C02-U49 the header is a slim 36px line (44px on phones, "+" always shown); marks hang off the name’s baseline', () => {
    expect(rule('.tp-gh').declarations.height).toBe('36px');
    expect(rule('.tp-gh.tp-compact').declarations.height).toBe('44px');
    expect(rule('.tp-gh-add').declarations.opacity).toBe('0');
    expect(rule('.tp-gh:hover .tp-gh-add, .tp-gh-add:focus-visible').declarations.opacity).toBe('1');
    expect(rule('.tp-gh.tp-compact .tp-gh-add').declarations.opacity).toBe('1');
    // baseline-tied: half the x-height up, half the mark's own height down
    expect(rule('.tp-gh-car').declarations['vertical-align']).toBe('calc(12.5px * .355 - 7px)');
    expect(rule('.tp-gh-dot').declarations['vertical-align']).toBe('calc(12.5px * .355 - 4px)');
    expect(rule('.tp-gh-tick').declarations['vertical-align']).toBe('calc(12.5px * .355 - 6.5px)');
    expect(rule('.tp-gh-tick').declarations.color).toBe('var(--success)');
    // the caret points down while open and right when folded
    expect(rule('.tp-gh-car').declarations.transform).toBe('rotate(90deg)');
    expect(rule('.tp-gh-main[aria-expanded="false"] .tp-gh-car').declarations.transform).toBe('none');
    expect(rule('.tp-g-body').declarations.transition).toContain('var(--dur-fold)');
  });
});

describe('TaskGroups', () => {
  it('C02-U50 a header and a list per group in the order given; a folded group is shut and inert; folding reports the key', async () => {
    const { p, user, container } = setup({ folded: ['plat'] });
    expect([...container.querySelectorAll('section.tp-g')].map((s) => s.getAttribute('aria-label'))).toEqual([
      'Northwind',
      'Platform',
      'No project',
    ]);
    const north = section('Northwind');
    expect(within(north).getByRole('button', { name: 'Northwind, 2 left' })).toBeInTheDocument();
    expect(within(north).getByRole('list', { name: 'Northwind tasks' })).toBeInTheDocument();
    expect(within(north).getAllByRole('listitem')).toHaveLength(3);

    const plat = section('Platform');
    expect(plat).toHaveClass('tp-g-folded');
    const body = plat.querySelector('.tp-g-body')!;
    expect(body).toHaveClass('tp-g-shut');
    expect(body).toHaveAttribute('inert');
    expect(north.querySelector('.tp-g-body')).not.toHaveAttribute('inert');

    await user.click(within(north).getByRole('button', { name: 'Northwind, 2 left' }));
    expect(p.onFold).toHaveBeenLastCalledWith('north', true);
    await user.click(within(plat).getByRole('button', { name: 'Platform, 1 left' }));
    expect(p.onFold).toHaveBeenLastCalledWith('plat', false);
  });

  it('C02-U51 "+" opens that project’s own line with the cursor in it; a folded group opens first; Enter writes into the group', async () => {
    const { p, user } = setup({ folded: ['plat'] });
    expect(screen.queryByPlaceholderText('Add to Northwind…')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Add a task to Northwind' }));
    const line = screen.getByPlaceholderText('Add to Northwind…');
    expect(line).toHaveFocus();
    expect(section('Northwind')).toContainElement(line);
    await user.keyboard('Chase the PO{Enter}');
    expect(p.onAdd).toHaveBeenLastCalledWith('Chase the PO', 'north', undefined);
    // the line stays open for the next one
    expect(screen.getByPlaceholderText('Add to Northwind…')).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.queryByPlaceholderText('Add to Northwind…')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Add a task to Platform' }));
    expect(p.onFold).toHaveBeenLastCalledWith('plat', false);
    expect(screen.getByPlaceholderText('Add to Platform…')).toBeInTheDocument();
  });

  it('C02-U52 never two writing lines: one at the foot for No project; its "+" puts the cursor there; it makes way for the last project’s line', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { p, rerender, ui } = setup();
    // No project has no line of its own
    expect(screen.getAllByRole('button', { name: 'Write the next thing…' })).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Add a task to No project' }));
    const end = screen.getByPlaceholderText('Write the next thing…');
    expect(end).toHaveFocus();
    expect(section('No project')).not.toContainElement(end);
    await user.keyboard('Buy stamps{Enter}');
    expect(p.onAdd).toHaveBeenLastCalledWith('Buy stamps', NO_PROJECT);
    await user.keyboard('{Escape}');

    // Northwind is not the last group: its line and the page's are apart, both stay
    await user.click(screen.getByRole('button', { name: 'Add a task to Northwind' }));
    expect(screen.getByRole('button', { name: 'Write the next thing…' })).toBeInTheDocument();
    await user.keyboard('{Escape}');

    // with no "No project" group, Platform is last: while its line is open the page's line is gone
    const two = GROUPS.slice(0, 2);
    rerender(ui({ groups: two }));
    await user.click(screen.getByRole('button', { name: 'Add a task to Platform' }));
    expect(screen.getByPlaceholderText('Add to Platform…')).toHaveFocus();
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(screen.queryByRole('button', { name: 'Write the next thing…' })).toBeNull();
    await user.keyboard('{Escape}');
    expect(screen.getByRole('button', { name: 'Write the next thing…' })).toBeInTheDocument();
  });

  it('C02-U53 rows move inside their group only: Alt with an arrow reports the group and the places in it', async () => {
    const { p, user } = setup();
    const row = within(section('Northwind')).getAllByRole('listitem')[0]!;
    const cb = row.querySelector<HTMLElement>('button.tp-cb')!;
    cb.focus();
    await user.keyboard('{Alt>}{ArrowDown}{/Alt}');
    expect(p.onReorder).toHaveBeenLastCalledWith('north', { key: 'n1', from: 0, to: 1 });
    // the group's last row has nowhere further to go, and never crosses into the next project
    const lastRow = within(section('Northwind')).getAllByRole('listitem')[2]!;
    lastRow.querySelector<HTMLElement>('button.tp-cb')!.focus();
    await user.keyboard('{Alt>}{ArrowDown}{/Alt}');
    expect(p.onReorder).toHaveBeenCalledTimes(1);
  });

  it('C02-U50 a group that loses its last task folds away as a bare header; one that gains its first fades in; a new day does neither', () => {
    vi.useFakeTimers();
    const { rerender, ui, container } = setup();
    rerender(ui({ groups: [GROUPS[0]!, GROUPS[2]!] }));
    const leaving = section('Northwind').parentElement!.nextElementSibling!;
    expect(leaving).toHaveAttribute('aria-hidden', 'true');
    expect(leaving.querySelector('section')).toHaveAttribute('aria-label', 'Platform');
    expect(leaving.querySelectorAll('[role="listitem"]')).toHaveLength(0);
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(container.querySelectorAll('section.tp-g')).toHaveLength(2);

    rerender(ui({ groups: GROUPS }));
    expect(section('Platform')).toHaveClass('tp-g-new');
    expect(section('Northwind')).not.toHaveClass('tp-g-new');

    rerender(ui({ groups: [GROUPS[2]!], resetKey: 'd2' }));
    expect(container.querySelectorAll('section.tp-g')).toHaveLength(1);
    expect(section('No project')).not.toHaveClass('tp-g-new');
  });

  it('C02-U50 without onAdd (Crossed off) there is no "+" and no writing line; showing a task in a folded group opens it', () => {
    const onFold = vi.fn();
    const { rerender } = render(<TaskGroups groups={GROUPS} folded={['plat']} onFold={onFold} static />);
    expect(screen.queryByRole('button', { name: /Add a task to/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Write the next thing…' })).toBeNull();
    rerender(<TaskGroups groups={GROUPS} folded={['plat']} onFold={onFold} static locateKey="p1:1" />);
    expect(onFold).toHaveBeenCalledWith('plat', false);
    fireEvent.click(screen.getByRole('button', { name: 'No project, 1 left' }));
    expect(onFold).toHaveBeenLastCalledWith(NO_PROJECT, true);
  });
});
