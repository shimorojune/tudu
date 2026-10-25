import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { POP_LEAVE_MS } from '../lib/linger';
import { SpaceSwitch, SSW_PICK_MS, SSW_SHEET_LEAVE_MS, type SwitchSpace } from './SpaceSwitch';

const picked = () => act(() => new Promise((r) => setTimeout(r, SSW_PICK_MS + 20)));

const SPACES: SwitchSpace[] = [
  { id: 'me', name: 'Personal', personal: true, sub: 'Just you' },
  { id: 'nw', name: 'Northwind', color: '#3d5a80', sub: '19 people', count: 5 },
  { id: 'hm', name: 'Home', color: '#8a5a00', sub: '3 people' },
];

describe('SpaceSwitch', () => {
  it('C08-U02 the name opens the list: tiles, the quiet line, "N new", the tick, Create a space; the dot by the name', async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    const onCreate = vi.fn();
    render(<SpaceSwitch spaces={SPACES} active="me" onPick={onPick} onCreate={onCreate} />);
    const trigger = screen.getByRole('button', { name: /Personal/ });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    // something is new in another space: the brand dot
    expect(screen.getByLabelText('5 new in other spaces')).toHaveClass('tp-ssw-pip');
    expect(screen.queryByRole('menu')).toBeNull();
    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    const menu = screen.getByRole('menu', { name: 'Spaces' });
    const items = within(menu).getAllByRole('menuitemradio');
    expect(items.map((i) => i.textContent)).toEqual([
      'PersonalJust you',
      'NNorthwind19 people5 new',
      'HHome3 people',
    ]);
    expect(items[0]).toHaveAttribute('aria-checked', 'true');
    expect(items[0]!.querySelector('.tp-sswl-ok')).not.toBeNull();
    expect(items[1]!.querySelector('.tp-sswl-c')).toHaveTextContent('5 new');
    expect(items[1]!.querySelector('.tp-stile')).toHaveStyle({ backgroundColor: 'rgb(61, 90, 128)' });
    expect(items[0]!.querySelector('.tp-stile')).toHaveClass('tp-stile-me');
    expect(within(menu).getByRole('menuitem', { name: 'Create a space' })).toBeInTheDocument();
    // picking reports and closes, after the picked row's check has drawn; the one you are in reports nothing
    await user.click(items[1]!);
    expect(onPick).not.toHaveBeenCalled();
    await picked();
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ id: 'nw' }));
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await user.click(trigger);
    await user.click(screen.getAllByRole('menuitemradio')[0]!);
    expect(onPick).toHaveBeenCalledTimes(1);
    // Create a space reports and closes
    await user.click(trigger);
    await user.click(screen.getByRole('menuitem', { name: 'Create a space' }));
    expect(onCreate).toHaveBeenCalledTimes(1);
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('C08-U02 Esc and a click away close it; the rail form shows the tile alone', async () => {
    const user = userEvent.setup();
    render(
      <div>
        <button type="button">Elsewhere</button>
        <SpaceSwitch spaces={SPACES} active="nw" rail />
      </div>,
    );
    const trigger = screen.getByRole('button', { name: 'Space: Northwind' });
    expect(trigger.closest('.tp-ssw')).toHaveClass('tp-ssw-rail');
    await user.click(trigger);
    expect(screen.getByRole('menu', { name: 'Spaces' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveFocus();
    await user.click(trigger);
    await user.click(screen.getByRole('button', { name: 'Elsewhere' }));
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    // the closed list lingers for a beat, then goes
    expect(document.querySelector('.tp-ssw-pop')).toHaveClass('tp-pop-leaving');
    await act(() => new Promise((r) => setTimeout(r, POP_LEAVE_MS + 20)));
    expect(document.querySelector('.tp-ssw-pop')).toBeNull();
    // no dot when nothing is new elsewhere
    expect(screen.queryByLabelText(/new in other spaces/)).toBeNull();
  });

  it('C08-U02 the sheet form rises over a veil, slides down before it reports a pick, and the veil closes it', async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    const settle = () => act(() => new Promise((r) => setTimeout(r, SSW_SHEET_LEAVE_MS + 20)));
    render(<SpaceSwitch variant="sheet" spaces={SPACES} active="me" onPick={onPick} />);
    await user.click(screen.getByRole('button', { name: /Personal/ }));
    const sheet = screen.getByRole('dialog', { name: 'Spaces' });
    expect(sheet).toHaveClass('tp-sswsheet');
    expect(sheet.querySelector('.tp-sswsheet-veil')).not.toBeNull();
    expect(sheet.querySelector('.tp-sswsheet-p .tp-qa-grabber')).not.toBeNull();
    await user.click(within(sheet).getByRole('menuitemradio', { name: /Home/ }));
    await picked();
    expect(sheet).toHaveClass('tp-leaving');
    expect(onPick).not.toHaveBeenCalled();
    await settle();
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ id: 'hm' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    await user.click(screen.getByRole('button', { name: /Personal/ }));
    await user.click(screen.getByRole('dialog').querySelector('.tp-sswsheet-veil')!);
    await settle();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(onPick).toHaveBeenCalledTimes(1);
  });

  it('C21-U11 All spaces is first with a line under it; picking marks the row before onPick, then the name swaps in', async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    const all: SwitchSpace = { id: 'all', all: true, name: 'All spaces', sub: 'Everything that’s yours' };
    const { rerender } = render(<SpaceSwitch spaces={[all, ...SPACES]} active="me" onPick={onPick} />);
    const trigger = screen.getByRole('button', { name: /Personal/ });
    // first paint: no swap animation
    expect(trigger.querySelector('.tp-ssw-id')).not.toHaveClass('tp-ssw-swap');
    await user.click(trigger);
    const menu = screen.getByRole('menu', { name: 'Spaces' });
    const items = within(menu).getAllByRole('menuitemradio');
    expect(items[0]).toHaveTextContent('All spaces');
    expect(items[0]!.querySelector('.tp-stile')).toHaveClass('tp-stile-all');
    // the separator sits between All spaces and the spaces
    const sep = within(menu).getByRole('separator');
    expect(sep).toHaveClass('tp-sswl-sep');
    expect(items[0]!.nextElementSibling).toBe(sep);
    await user.click(items[0]!);
    expect(items[0]).toHaveClass('tp-picked');
    expect(items[0]).toHaveAttribute('aria-checked', 'true');
    expect(items[1]).toHaveAttribute('aria-checked', 'false');
    expect(onPick).not.toHaveBeenCalled();
    // a second click while it draws does nothing more
    await user.click(items[2]!);
    await picked();
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ id: 'all' }));
    rerender(<SpaceSwitch spaces={[all, ...SPACES]} active="all" onPick={onPick} />);
    expect(screen.getByRole('button', { name: /All spaces/ }).querySelector('.tp-ssw-id')).toHaveClass(
      'tp-ssw-swap',
    );
  });
});
