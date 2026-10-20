import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Menu, type MenuProps } from './Menu';

function setup(extra: Partial<MenuProps> = {}) {
  const user = userEvent.setup();
  const onMove = vi.fn();
  const onDelete = vi.fn();
  render(
    <div>
      <button type="button">Elsewhere</button>
      <Menu
        label="Task actions"
        heading="Task"
        items={[
          { label: 'Move to tomorrow', hint: 'Tue', onSelect: onMove },
          false,
          { label: 'Delete task', danger: true, onSelect: onDelete },
        ]}
        {...extra}
      >
        <button type="button">More</button>
      </Menu>
    </div>,
  );
  return { user, onMove, onDelete, trigger: screen.getByRole('button', { name: 'More' }) };
}

// jsdom has no layout, so floating-ui sees a 0x0 viewport and 0x0 boxes. Give it real numbers: a sized viewport,
// a trigger at a known place, and a popper of a known size (floating-ui falls back to offsetWidth/offsetHeight).
const proto = HTMLElement.prototype;
const offsetWidth = Object.getOwnPropertyDescriptor(proto, 'offsetWidth')!;
const offsetHeight = Object.getOwnPropertyDescriptor(proto, 'offsetHeight')!;

function sizeViewport(width: number, height: number) {
  Object.defineProperty(document.documentElement, 'clientWidth', { configurable: true, get: () => width });
  Object.defineProperty(document.documentElement, 'clientHeight', { configurable: true, get: () => height });
}
function placeTrigger(el: Element, r: { x: number; y: number; width: number; height: number }) {
  el.getBoundingClientRect = () =>
    ({ ...r, top: r.y, left: r.x, right: r.x + r.width, bottom: r.y + r.height, toJSON: () => r }) as DOMRect;
}
function sizePopper(width: number, height: number) {
  const isPopper = (el: HTMLElement) => el.hasAttribute('data-radix-popper-content-wrapper');
  Object.defineProperty(proto, 'offsetWidth', {
    configurable: true,
    get(this: HTMLElement) {
      return isPopper(this) ? width : 0;
    },
  });
  Object.defineProperty(proto, 'offsetHeight', {
    configurable: true,
    get(this: HTMLElement) {
      return isPopper(this) ? height : 0;
    },
  });
}

describe('Menu', () => {
  afterEach(() => {
    Reflect.deleteProperty(document.documentElement, 'clientWidth');
    Reflect.deleteProperty(document.documentElement, 'clientHeight');
    Object.defineProperty(proto, 'offsetWidth', offsetWidth);
    Object.defineProperty(proto, 'offsetHeight', offsetHeight);
  });

  it('C00-U18 a click on the trigger opens the menu with its items', async () => {
    const { user, trigger } = setup();
    expect(screen.queryByRole('menu')).toBeNull();

    await user.click(trigger);
    const menu = screen.getByRole('menu', { name: 'Task actions' });
    expect(menu).toHaveClass('tp-menu');
    expect(within(menu).getByText('Task')).toHaveClass('tp-mh');
    const items = within(menu).getAllByRole('menuitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('Move to tomorrow');
    expect(items[0]).toHaveTextContent('Tue');
    expect(items[1]).toHaveTextContent('Delete task');
    expect(items[1]).toHaveClass('tp-mi-danger');
  });

  it('C00-U18 arrow keys move the highlight and Enter picks', async () => {
    const { user, onMove, onDelete, trigger } = setup();
    await user.click(trigger);
    const [first, second] = within(screen.getByRole('menu')).getAllByRole('menuitem');

    await user.keyboard('{ArrowDown}');
    expect(first).toHaveAttribute('data-highlighted');
    expect(second).not.toHaveAttribute('data-highlighted');

    await user.keyboard('{ArrowDown}');
    expect(second).toHaveAttribute('data-highlighted');
    expect(first).not.toHaveAttribute('data-highlighted');

    await user.keyboard('{ArrowUp}');
    expect(first).toHaveAttribute('data-highlighted');

    await user.keyboard('{Enter}');
    expect(onMove).toHaveBeenCalledTimes(1);
    expect(onDelete).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
  });

  it('C00-U18 Escape closes it', async () => {
    const onOpenChange = vi.fn();
    const { user, onMove, trigger } = setup({ onOpenChange });
    await user.click(trigger);
    expect(onOpenChange).toHaveBeenLastCalledWith(true);

    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
    expect(onMove).not.toHaveBeenCalled();
  });

  it('C00-U18 a click outside closes it', async () => {
    const { user, onMove, onDelete, trigger } = setup();
    await user.click(trigger);
    expect(screen.getByRole('menu')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Elsewhere' }));
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    expect(onMove).not.toHaveBeenCalled();
    expect(onDelete).not.toHaveBeenCalled();
  });

  it('C00-U19 opens upward when there is no room below', async () => {
    const { user, trigger } = setup();
    sizeViewport(1024, 768);
    placeTrigger(trigger, { x: 400, y: 748, width: 100, height: 20 });
    sizePopper(160, 200);

    await user.click(trigger);
    const menu = screen.getByRole('menu');
    await waitFor(() => expect(menu).toHaveAttribute('data-side', 'top'));
    expect(menu).toHaveAttribute('data-align', 'end');
  });

  it('C00-U19 opens downward when there is room below', async () => {
    const { user, trigger } = setup();
    sizeViewport(1024, 768);
    placeTrigger(trigger, { x: 400, y: 100, width: 100, height: 20 });
    sizePopper(160, 200);

    await user.click(trigger);
    const menu = screen.getByRole('menu');
    await waitFor(() => expect(menu).toHaveAttribute('data-side', 'bottom'));
    expect(menu).toHaveAttribute('data-align', 'end');
  });
});
