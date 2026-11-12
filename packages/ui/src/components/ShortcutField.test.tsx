import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkShortcut, combo, defaultBindings, problemText, type Combo } from '@tudu/core';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SAVED_HOLD_MS, SAVED_OUT_MS, ShortcutRow, type ShortcutRowProps } from './ShortcutField';

const usual = defaultBindings('mac');
const css = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), '../styles/components.css'),
  'utf8',
);

function row(extra: Partial<ShortcutRowProps> = {}) {
  const onSet = vi.fn<(c: Combo | null) => string | null>(() => null);
  const utils = render(
    <ShortcutRow
      title="New task"
      sub="Brings up Quick Add over whatever you’re doing, in any app."
      value={usual.newTask}
      usual={usual.newTask}
      platform="mac"
      check={(next) => {
        const p = checkShortcut('newTask', next, usual, 'mac');
        return p ? problemText(p, 'mac') : null;
      }}
      onSet={onSet}
      {...extra}
    />,
  );
  const field = () => screen.getByRole('button', { name: /^New task shortcut/ });
  return { onSet, field, ...utils };
}

const caps = (el: HTMLElement) => Array.from(el.querySelectorAll('kbd')).map((k) => k.textContent);
const press = (el: HTMLElement, code: string, key: string, mods: Partial<KeyboardEventInit> = {}) =>
  fireEvent.keyDown(el, { code, key, ...mods });

afterEach(() => vi.useRealTimers());

describe('SK-U06 ShortcutRow', () => {
  it('SK-U06 click listens; held modifiers show; a full press keeps it once; Esc, Tab and blur keep the old keys', async () => {
    const user = userEvent.setup();
    const { onSet, field } = row();
    expect(caps(field())).toEqual(['⇧', '⌘', 'N']);
    expect(field()).toHaveAccessibleName('New task shortcut, Shift Command N. Press to change');
    await user.click(field());
    expect(field()).toHaveClass('tp-rec');
    expect(field()).toHaveTextContent('Press the new keys');
    press(field(), 'ControlLeft', 'Control', { ctrlKey: true });
    press(field(), 'AltLeft', 'Alt', { ctrlKey: true, altKey: true });
    expect(caps(field())).toEqual(['⌃', '⌥']);
    expect(field().querySelector('.tp-kf-caret')).not.toBeNull();
    // Let go of ⌥: its cap goes.
    fireEvent.keyUp(field(), { code: 'AltLeft', key: 'Alt', ctrlKey: true });
    expect(caps(field())).toEqual(['⌃']);
    await act(async () => {
      press(field(), 'KeyT', 't', { ctrlKey: true, altKey: true });
    });
    expect(onSet).toHaveBeenCalledOnce();
    expect(onSet).toHaveBeenCalledWith(combo(['ctrl', 'alt'], 'T'));
    expect(field()).not.toHaveClass('tp-rec');

    for (const leave of [
      () => press(field(), 'Escape', 'Escape'),
      () => press(field(), 'Tab', 'Tab'),
      () => fireEvent.blur(field()),
    ]) {
      onSet.mockClear();
      await user.click(field());
      expect(field()).toHaveClass('tp-rec');
      act(leave);
      expect(field()).not.toHaveClass('tp-rec');
      expect(onSet).not.toHaveBeenCalled();
    }
  });

  it('SK-U06 Delete (or Backspace) while listening turns it off', async () => {
    const user = userEvent.setup();
    const { onSet, field, rerender } = row();
    await user.click(field());
    await act(async () => {
      press(field(), 'Backspace', 'Backspace');
    });
    expect(onSet).toHaveBeenCalledWith(null);
    rerender(
      <ShortcutRow
        title="New task"
        sub="x"
        value={null}
        usual={usual.newTask}
        platform="mac"
        onSet={onSet}
      />,
    );
    expect(field()).toHaveTextContent('Off');
    expect(field()).toHaveAccessibleName('New task shortcut, off. Press to change');
  });

  it('SK-U06 the space row listens for keys plus a number and keeps the keys for 1 to 9', async () => {
    const user = userEvent.setup();
    const onSet = vi.fn(() => null);
    render(
      <ShortcutRow
        title="A space"
        sub="x"
        value={usual.space}
        usual={usual.space}
        platform="mac"
        digit
        check={(next) => {
          const p = checkShortcut('space', next, usual, 'mac');
          return p ? problemText(p, 'mac') : null;
        }}
        onSet={onSet}
      />,
    );
    const field = screen.getByRole('button', { name: /^A space shortcut/ });
    expect(field).toHaveTextContent('⌃1to⌃9');
    expect(field).toHaveAccessibleName('A space shortcut, Control 1 to 9. Press to change');
    await user.click(field);
    expect(field).toHaveTextContent('Press keys + a number');
    press(field, 'AltLeft', 'Alt', { altKey: true });
    expect(field).toHaveTextContent('+ a number');
    press(field, 'KeyK', 'k', { altKey: true, metaKey: true });
    expect(screen.getByRole('alert')).toHaveTextContent('Press it with a number, like ⌃1.');
    await act(async () => {
      press(field, 'Digit4', '4', { altKey: true, metaKey: true });
    });
    expect(onSet).toHaveBeenCalledWith(combo(['alt', 'meta'], '#'));
  });
});

describe('SK-U07 ShortcutRow', () => {
  it('SK-U07 a refusal keeps it listening with the reason announced; the next good press clears it', async () => {
    const user = userEvent.setup();
    const { onSet, field } = row();
    await user.click(field());
    press(field(), 'KeyK', 'k');
    expect(screen.getByRole('alert')).toHaveTextContent('Add ⌘, ⌃ or ⌥, so it can’t go off while you type.');
    expect(field()).toHaveClass('tp-rec', 'tp-bad');
    press(field(), 'KeyN', 'n', { altKey: true, metaKey: true });
    expect(screen.getByRole('alert')).toHaveTextContent('⌥⌘N is New note. Pick other keys.');
    press(field(), 'KeyQ', 'q', { metaKey: true });
    expect(screen.getByRole('alert')).toHaveTextContent('⌘Q quits Tudu. Pick other keys.');
    expect(onSet).not.toHaveBeenCalled();
    await act(async () => {
      press(field(), 'KeyT', 't', { ctrlKey: true, altKey: true });
    });
    expect(onSet).toHaveBeenCalledOnce();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('SK-U07 the app refusing it shows its line and leaves the old keys; a standing problem marks the field', async () => {
    const user = userEvent.setup();
    const { field, rerender } = row({
      onSet: async () => 'macOS or another app already uses ⌥Space. Still ⇧⌘N.',
    });
    await user.click(field());
    await act(async () => {
      press(field(), 'Space', ' ', { altKey: true });
    });
    expect(screen.getByRole('alert')).toHaveTextContent(
      'macOS or another app already uses ⌥Space. Still ⇧⌘N.',
    );
    expect(caps(field())).toEqual(['⇧', '⌘', 'N']);
    expect(field()).not.toHaveClass('tp-bad');
    rerender(
      <ShortcutRow
        title="New task"
        sub="x"
        value={usual.newTask}
        usual={usual.newTask}
        platform="mac"
        problem="Another app took ⇧⌘N, so it isn’t working. Pick other keys."
      />,
    );
    // The new row has no refusal of its own, so the standing problem shows.
    await user.click(field());
    act(() => press(field(), 'Escape', 'Escape'));
    expect(screen.getByRole('alert')).toHaveTextContent('Another app took ⇧⌘N');
    expect(field()).toHaveClass('tp-bad');
  });
});

describe('SK-U08 ShortcutRow', () => {
  it('SK-U08 saved: the caps pop in with a tick, which gets tp-out after 1.5s and then leaves', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { field, rerender, onSet } = row();
    fireEvent.click(field());
    await act(async () => {
      press(field(), 'KeyT', 't', { ctrlKey: true, altKey: true });
    });
    rerender(
      <ShortcutRow
        title="New task"
        sub="x"
        value={combo(['ctrl', 'alt'], 'T')}
        usual={usual.newTask}
        platform="mac"
        onSet={onSet}
      />,
    );
    expect(field()).toHaveClass('tp-saved');
    expect(caps(field())).toEqual(['⌃', '⌥', 'T']);
    const tick = () => field().querySelector('.tp-kf-ok');
    expect(tick()).not.toBeNull();
    expect(tick()).not.toHaveClass('tp-out');
    act(() => vi.advanceTimersByTime(SAVED_HOLD_MS + 5));
    expect(tick()).toHaveClass('tp-out');
    act(() => vi.advanceTimersByTime(SAVED_OUT_MS + 5));
    expect(tick()).toBeNull();
    expect(field()).not.toHaveClass('tp-saved');
    // Changed from the usual: the back arrow says where it goes, and puts the usual keys back.
    const back = screen.getByRole('button', { name: 'Back to ⇧⌘N' });
    await act(async () => {
      fireEvent.click(back);
    });
    expect(onSet).toHaveBeenLastCalledWith(usual.newTask);
  });

  it('SK-U08 Reduce motion: the tick and caps have no pop (the stylesheet turns the animations off)', () => {
    const reduce = css.slice(css.indexOf('.tp-kf.tp-rec, .tp-kf.tp-rec kbd, .tp-kf.tp-saved kbd'));
    expect(css).toMatch(
      /@media \(prefers-reduced-motion: reduce\) \{ \.tp-kf\.tp-rec, \.tp-kf\.tp-rec kbd, \.tp-kf\.tp-saved kbd, \.tp-kf-caret \{ animation: none; \}/,
    );
    expect(reduce).toContain('.tp-kf-ok.tp-out { animation: tp-kf-ok-fade 160ms linear forwards; }');
  });

  it('SK-U08 loading shows a shimmer in the field’s place', () => {
    const { container } = render(
      <ShortcutRow title="New note" sub="x" value={null} usual={usual.newNote} platform="mac" loading />,
    );
    expect(container.querySelector('.tp-skel')).not.toBeNull();
    expect(screen.queryByRole('button', { name: /shortcut/ })).toBeNull();
  });
});
