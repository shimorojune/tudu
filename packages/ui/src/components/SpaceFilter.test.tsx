import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SpaceFilter } from './SpaceFilter';

const SPACES = [
  { id: 'me', name: 'Personal', initials: 'P', personal: true, count: 0 },
  { id: 'nw', name: 'Northwind', initials: 'N', color: '#3d5a80', count: 3 },
  { id: 'pf', name: 'Pilot Farm', initials: 'PF', color: '#5b7553', count: 1 },
];

afterEach(cleanup);

describe('C08-U19 SpaceFilter', () => {
  it('reads All spaces, or the chosen space with its tile', () => {
    const { rerender } = render(<SpaceFilter spaces={SPACES} total={5} value={null} />);
    expect(screen.getByRole('button', { name: 'Space: all spaces' })).toHaveTextContent('All spaces');
    rerender(<SpaceFilter spaces={SPACES} total={5} value="nw" />);
    const on = screen.getByRole('button', { name: 'Space: Northwind' });
    expect(on).toHaveTextContent('Northwind');
    expect(on).toHaveClass('tp-sf-pill', 'tp-set');
    expect(on.querySelector('.tp-stile')).not.toBeNull();
  });

  it('lists All spaces and then each space with its count; picking reports the id or null', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<SpaceFilter spaces={SPACES} total={5} value={null} onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: 'Space: all spaces' }));
    const items = await screen.findAllByRole('menuitem');
    expect(items.map((i) => i.textContent)).toEqual([
      'All spaces5',
      'Personal0',
      'NNorthwind3',
      'PFPilot Farm1',
    ]);
    await user.click(items[2]!);
    expect(onChange).toHaveBeenCalledWith('nw');
    await user.click(screen.getByRole('button', { name: 'Space: all spaces' }));
    await user.click((await screen.findAllByRole('menuitem'))[0]!);
    expect(onChange).toHaveBeenLastCalledWith(null);
  });
});
