import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProjectFilter } from './ProjectFilter';

const PROJECTS = [
  { id: 'nw', name: 'Northwind', color: '#3d5a80', count: 3 },
  { id: 'pf', name: 'Platform', color: '#5b7553', count: 4 },
  { id: 'hm', name: 'Home', color: '#8a5a00', count: 0 },
];

afterEach(cleanup);

describe('C06-U01 ProjectFilter', () => {
  it('reads All projects with the mark, or the chosen project with its dot', () => {
    const { rerender } = render(<ProjectFilter projects={PROJECTS} total={7} value={null} />);
    const chip = screen.getByRole('button', { name: 'Project: all projects' });
    expect(chip).toHaveTextContent('All projects');
    expect(chip.querySelector('svg')).toBeInTheDocument();
    expect(chip.querySelector('.tp-dot')).toBeNull();
    rerender(<ProjectFilter projects={PROJECTS} total={7} value="pf" />);
    const on = screen.getByRole('button', { name: 'Project: Platform' });
    expect(on).toHaveTextContent('Platform');
    expect((on.querySelector('.tp-dot') as HTMLElement).style.background).toBe('rgb(91, 117, 83)');
  });

  it('opens a menu of every project with its count, and picking reports the id or null', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ProjectFilter projects={PROJECTS} total={7} value="pf" onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: 'Project: Platform' }));
    const menu = await screen.findByRole('menu');
    const items = screen.getAllByRole('menuitem');
    expect(items.map((i) => i.textContent)).toEqual(['All projects7', 'Northwind3', 'Platform4', 'Home0']);
    expect(menu).toHaveTextContent('Project');
    expect((items[1]!.querySelector('.tp-dot') as HTMLElement).style.background).toBe('rgb(61, 90, 128)');
    await user.click(items[1]!);
    expect(onChange).toHaveBeenCalledWith('nw');
    await user.click(screen.getByRole('button', { name: 'Project: Platform' }));
    await user.click((await screen.findAllByRole('menuitem'))[0]!);
    expect(onChange).toHaveBeenLastCalledWith(null);
  });
});
