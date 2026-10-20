import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { moveItem } from '../lib/reorder';
import { SubtaskList, SUB_LEAVE_MS, type SubtaskItem, type SubtaskListProps } from './SubtaskList';
import { ToastHost } from './Toast';

const THREE: SubtaskItem[] = [
  { key: 'a', title: 'Pull the branch', done: true },
  { key: 'b', title: 'Run it on a clean profile', done: false },
  { key: 'c', title: 'Leave review comments', done: false },
];

const ROW = 38;
function rect(top: number, height = ROW): DOMRect {
  return {
    top,
    bottom: top + height,
    height,
    left: 0,
    right: 400,
    width: 400,
    x: 0,
    y: top,
    toJSON() {},
  } as DOMRect;
}
function layRows(container: HTMLElement) {
  container.querySelectorAll<HTMLElement>('[data-reorder]').forEach((el, i) => {
    el.getBoundingClientRect = () => rect(100 + i * ROW);
  });
}
function pointer(target: Element | Window, type: string, x: number, y: number, pointerType = 'mouse') {
  const ev = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 });
  Object.defineProperty(ev, 'pointerType', { value: pointerType });
  Object.defineProperty(ev, 'pointerId', { value: 1 });
  act(() => {
    target.dispatchEvent(ev);
  });
}

/** A list that keeps its subtasks in state, as the page does through the store. */
function List(props: Partial<SubtaskListProps> & { initial?: SubtaskItem[] }) {
  const [subs, setSubs] = useState(props.initial ?? THREE);
  let n = 0;
  return (
    <>
      <SubtaskList
        variant="panel"
        parentTitle="Review Quick Add PR"
        {...props}
        subtasks={subs}
        onAdd={(t) => {
          setSubs((l) => [...l, { key: `n${n++}${t}`, title: t, done: false }]);
          props.onAdd?.(t);
        }}
        onRename={(s, t) => {
          setSubs((l) => l.map((x) => (x.key === s.key ? { ...x, title: t } : x)));
          props.onRename?.(s, t);
        }}
        onToggle={(s, v) => {
          setSubs((l) => l.map((x) => (x.key === s.key ? { ...x, done: v } : x)));
          props.onToggle?.(s, v);
        }}
        onReorder={(s, from, to) => {
          setSubs((l) => moveItem(l, from, to));
          props.onReorder?.(s, from, to);
        }}
        onDelete={(s, i) => {
          setSubs((l) => l.filter((x) => x.key !== s.key));
          props.onDelete?.(s, i);
        }}
        onRestore={(s, i) => {
          setSubs((l) => {
            const out = [...l];
            out.splice(i, 0, s);
            return out;
          });
          props.onRestore?.(s, i);
        }}
      />
      <ToastHost />
    </>
  );
}

const titles = (c: HTMLElement) =>
  Array.from(c.querySelectorAll('[data-reorder] .tp-sub-text')).map((e) => e.textContent);

afterEach(() => {
  vi.useRealTimers();
  document.documentElement.classList.remove('tp-is-dragging');
});

describe('SubtaskList', () => {
  it('C03-U13 Add subtask: Enter adds and keeps writing, Esc stops, blank adds nothing; a title edits in place', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    const onRename = vi.fn();
    const { container } = render(<List onAdd={onAdd} onRename={onRename} />);
    await user.click(screen.getByRole('button', { name: 'Add subtask' }));
    const field = screen.getByRole('textbox', { name: 'New subtask' });
    expect(field).toHaveFocus();
    await user.type(field, 'Approve or request changes{Enter}');
    expect(onAdd).toHaveBeenCalledWith('Approve or request changes');
    expect(screen.getByRole('textbox', { name: 'New subtask' })).toHaveFocus();
    expect(screen.getByRole('textbox', { name: 'New subtask' })).toHaveValue('');
    await user.keyboard('{Enter}');
    expect(onAdd).toHaveBeenCalledTimes(1);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('textbox', { name: 'New subtask' })).toBeNull();
    expect(titles(container)).toEqual([...THREE.map((s) => s.title), 'Approve or request changes']);
    // rename in place: Enter saves, Esc puts the old words back, blank keeps them
    await user.click(screen.getByRole('button', { name: 'Edit subtask: Run it on a clean profile' }));
    const edit = screen.getByRole('textbox', { name: 'Edit subtask' });
    expect(edit).toHaveValue('Run it on a clean profile');
    await user.type(edit, ' twice{Enter}');
    expect(onRename).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'b' }),
      'Run it on a clean profile twice',
    );
    await user.click(screen.getByRole('button', { name: 'Edit subtask: Pull the branch' }));
    await user.keyboard(' now{Escape}');
    expect(onRename).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Edit subtask: Pull the branch' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Edit subtask: Pull the branch' }));
    await user.clear(screen.getByRole('textbox', { name: 'Edit subtask' }));
    await user.keyboard('{Enter}');
    expect(onRename).toHaveBeenCalledTimes(1);
  });

  it('C03-U13 delete folds the line away and a toast offers Undo, which puts it back where it was', () => {
    vi.useFakeTimers();
    const onDelete = vi.fn();
    const onRestore = vi.fn();
    const { container } = render(<List onDelete={onDelete} onRestore={onRestore} />);
    fireEvent.click(screen.getByRole('button', { name: 'Delete subtask: Run it on a clean profile' }));
    const row = container.querySelector('[data-key="b"]')!;
    expect(row).toHaveClass('tp-sub-going');
    expect(screen.getByRole('status')).toHaveTextContent('Subtask deleted');
    act(() => vi.advanceTimersByTime(SUB_LEAVE_MS + 10));
    expect(onDelete).toHaveBeenCalledWith(expect.objectContaining({ key: 'b' }), 1);
    expect(titles(container)).toEqual(['Pull the branch', 'Leave review comments']);
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(onRestore).toHaveBeenCalledWith(expect.objectContaining({ key: 'b' }), 1);
    expect(titles(container)).toEqual(THREE.map((s) => s.title));
  });

  it('C03-U14 crossing off reports the change; a drag reorders and reports the move; a touch needs press and hold', () => {
    vi.useFakeTimers();
    const onToggle = vi.fn();
    const onReorder = vi.fn();
    const { container } = render(<List onToggle={onToggle} onReorder={onReorder} />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Cross off: Run it on a clean profile' }));
    expect(onToggle).toHaveBeenCalledWith(expect.objectContaining({ key: 'b' }), true);
    expect(container.querySelector('[data-key="b"]')).toHaveClass('tp-done');

    layRows(container);
    const third = container.querySelector<HTMLElement>('[data-key="c"]')!;
    const text = within(third).getByText('Leave review comments');
    pointer(text, 'pointerdown', 50, 100 + 2 * ROW + 10);
    pointer(window, 'pointermove', 50, 100 + 2 * ROW + 20);
    expect(third).toHaveClass('tp-dragging');
    pointer(window, 'pointermove', 50, 100);
    pointer(window, 'pointerup', 50, 100);
    expect(onReorder).toHaveBeenCalledWith(expect.objectContaining({ key: 'c' }), 2, 0);
    expect(titles(container)).toEqual([
      'Leave review comments',
      'Pull the branch',
      'Run it on a clean profile',
    ]);

    // a quick swipe on touch scrolls; a press and hold lifts
    layRows(container);
    const first = container.querySelector<HTMLElement>('[data-reorder]')!;
    pointer(within(first).getByText('Leave review comments'), 'pointerdown', 50, 110, 'touch');
    pointer(window, 'pointermove', 50, 140, 'touch');
    expect(first).not.toHaveClass('tp-dragging');
    pointer(window, 'pointerup', 50, 140, 'touch');
    pointer(within(first).getByText('Leave review comments'), 'pointerdown', 50, 110, 'touch');
    act(() => vi.advanceTimersByTime(400));
    expect(first).toHaveClass('tp-dragging');
    pointer(window, 'pointerup', 50, 110, 'touch');
  });

  it('C03-U13 under a row: no tab stops while folded, and the row’s own clothes', () => {
    const { container } = render(<List variant="row" shown={false} />);
    expect(container.querySelector('.tp-subs')).not.toBeNull();
    expect(container.querySelector('.tp-srow')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Add subtask' })).toHaveAttribute('tabindex', '-1');
    expect(screen.getByRole('checkbox', { name: 'Cross off: Pull the branch' })).toHaveAttribute(
      'tabindex',
      '-1',
    );
  });
});
