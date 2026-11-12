import { describe, expect, it } from 'vitest';
import {
  ariaCombo,
  caps,
  checkShortcut,
  combo,
  comboFromEvent,
  defaultBindings,
  formatCombo,
  fromAccelerator,
  matchAppShortcut,
  problemText,
  readBindings,
  spaceForNumber,
  spokenCombo,
  toAccelerator,
  type KeyLike,
} from './shortcuts';

function ev(code: string, mods: Partial<KeyLike> = {}): KeyLike {
  return { code, ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, ...mods };
}

describe('shortcuts', () => {
  it('SK-U01 reads the physical key: letters, digits from the row and the numpad, named keys, never a lone modifier', () => {
    // An AZERTY keyboard sends key "a" for the key in Q's place; the code is what counts.
    expect(comboFromEvent({ ...ev('KeyQ', { metaKey: true }), key: 'a' })).toEqual({
      mods: ['meta'],
      key: 'Q',
    });
    expect(comboFromEvent(ev('Digit2', { ctrlKey: true }))).toEqual({ mods: ['ctrl'], key: '2' });
    expect(comboFromEvent(ev('Numpad7', { ctrlKey: true }))).toEqual({ mods: ['ctrl'], key: '7' });
    expect(comboFromEvent(ev('Space', { altKey: true }))).toEqual({ mods: ['alt'], key: 'Space' });
    expect(comboFromEvent(ev('F5', { ctrlKey: true }))?.key).toBe('F5');
    expect(comboFromEvent(ev('ShiftLeft', { shiftKey: true }))).toBeNull();
    expect(comboFromEvent(ev('MetaLeft', { metaKey: true }))).toBeNull();
  });

  it('SK-U02 writes keys in macOS order on a Mac and as words elsewhere', () => {
    const d = defaultBindings('mac');
    expect(formatCombo(d.newTask!, 'mac')).toBe('⇧⌘N');
    expect(formatCombo(d.newNote!, 'mac')).toBe('⌥⌘N');
    expect(formatCombo(d.allSpaces!, 'mac')).toBe('⌃0');
    expect(formatCombo(combo(['meta', 'shift', 'alt', 'ctrl'], 'K'), 'mac')).toBe('⌃⌥⇧⌘K');
    expect(caps(d.space!, 'mac', '9')).toEqual(['⌃', '9']);
    expect(formatCombo(combo(['meta', 'shift'], 'N'), 'other')).toBe('Shift+Win+N');
    expect(formatCombo(defaultBindings('other').allSpaces!, 'other')).toBe('Alt+0');
    expect(ariaCombo(d.newTask!)).toBe('Shift+Meta+N');
    expect(spokenCombo(d.newTask!, 'mac')).toBe('Shift Command N');
    expect(spokenCombo(d.space!, 'mac')).toBe('Control 1 to 9');
  });

  it('SK-U03 refuses no modifier, Shift alone, reserved keys, keys another shortcut has, and a space key with no number', () => {
    const all = defaultBindings('mac');
    const say = (id: Parameters<typeof checkShortcut>[0], c: ReturnType<typeof combo>) => {
      const p = checkShortcut(id, c, all, 'mac');
      return p ? problemText(p, 'mac') : null;
    };
    expect(say('newTask', combo([], 'K'))).toBe('Add ⌘, ⌃ or ⌥, so it can’t go off while you type.');
    expect(say('newTask', combo(['shift'], 'K'))).toBe('Add ⌘, ⌃ or ⌥, so it can’t go off while you type.');
    expect(say('newTask', combo(['meta'], 'Q'))).toBe('⌘Q quits Tudu. Pick other keys.');
    expect(say('newTask', combo(['alt', 'meta'], 'N'))).toBe('⌥⌘N is New note. Pick other keys.');
    expect(say('newTask', combo(['ctrl'], '0'))).toBe('⌃0 is All spaces. Pick other keys.');
    expect(say('allSpaces', combo(['ctrl'], '2'))).toBe('⌃2 already goes to a space. Pick other keys.');
    expect(say('space', combo(['ctrl'], 'K'))).toBe('Press it with a number, like ⌃1.');
    expect(say('space', combo(['alt', 'meta'], '4'))).toBeNull();
    expect(say('newTask', combo(['ctrl', 'alt'], 'T'))).toBeNull();
    // Its own keys again are fine.
    expect(say('newTask', combo(['shift', 'meta'], 'N'))).toBeNull();
    // A From anywhere key on a digit the space keys use.
    const moved = { ...all, newTask: combo(['alt', 'meta'], '3') };
    expect(checkShortcut('space', combo(['alt', 'meta'], '1'), moved, 'mac')).toEqual({
      kind: 'taken',
      by: 'newTask',
      keys: '⌥⌘3',
    });
    expect(problemText({ kind: 'modifier' }, 'other')).toBe(
      'Add Ctrl or Alt, so it can’t go off while you type.',
    );
  });

  it('SK-U04 goes to and from the plugin’s accelerators', () => {
    const d = defaultBindings('mac');
    for (const c of [
      d.newTask!,
      d.newNote!,
      d.allSpaces!,
      combo(['ctrl', 'alt'], 'Space'),
      combo(['meta'], '↑'),
      combo(['ctrl'], 'F5'),
      combo(['alt'], ','),
    ])
      expect(fromAccelerator(toAccelerator(c))).toEqual(c);
    expect(toAccelerator(d.newTask!)).toBe('Shift+Super+KeyN');
    expect(fromAccelerator('CommandOrControl+Shift+N')).toEqual(d.newTask);
    expect(fromAccelerator('CommandOrControl+Alt+N')).toEqual(d.newNote);
    expect(fromAccelerator('Hyper+N')).toBeNull();
    expect(fromAccelerator('')).toBeNull();
  });

  it('SK-U05 a number is a place in the switcher: 0 is All spaces when it is there, 1 the first after it', () => {
    const list = [{ id: 'all', all: true }, { id: 'me' }, { id: 'nw' }, { id: 'ac' }];
    expect(spaceForNumber(list, 0)?.id).toBe('all');
    expect(spaceForNumber(list, 1)?.id).toBe('me');
    expect(spaceForNumber(list, 3)?.id).toBe('ac');
    expect(spaceForNumber(list, 4)).toBeNull();
    expect(spaceForNumber([{ id: 'me' }], 0)).toBeNull();
    const ten = [{ id: 'all', all: true }, ...Array.from({ length: 10 }, (_, i) => ({ id: `s${i}` }))];
    expect(spaceForNumber(ten, 9)?.id).toBe('s8');
    expect(spaceForNumber(ten, 10)).toBeNull();
  });

  it('SK-U05 matches an in-app press to All spaces or a space number, exactly', () => {
    const d = defaultBindings('mac');
    expect(matchAppShortcut(ev('Digit0', { ctrlKey: true }), d)).toEqual({ to: 'all' });
    expect(matchAppShortcut(ev('Digit3', { ctrlKey: true }), d)).toEqual({ to: 'space', n: 3 });
    expect(matchAppShortcut(ev('Digit3', { ctrlKey: true, shiftKey: true }), d)).toBeNull();
    expect(matchAppShortcut(ev('Digit3', { metaKey: true }), d)).toBeNull();
    expect(matchAppShortcut(ev('Digit3', { ctrlKey: true }), { ...d, space: null })).toBeNull();
  });

  it('SK-U12 reads stored bindings, falling back to the usual keys for anything broken', () => {
    const d = defaultBindings('mac');
    expect(readBindings(null, 'mac')).toEqual(d);
    expect(readBindings('nope', 'mac')).toEqual(d);
    expect(readBindings({ allSpaces: { mods: ['bogus'], key: '0' } }, 'mac')).toEqual(d);
    const r = readBindings({ allSpaces: { mods: ['meta', 'alt'], key: '0' }, space: null }, 'mac');
    expect(r.allSpaces).toEqual({ mods: ['alt', 'meta'], key: '0' });
    expect(r.space).toBeNull();
    expect(r.newTask).toEqual(d.newTask);
  });
});
