import { describe, expect, it, vi } from 'vitest';
import { guardDrop } from './dropGuard';

const drag = (type: string, types: string[], handled = false) => {
  const dataTransfer = { types, dropEffect: 'copy' };
  return { type, defaultPrevented: handled, dataTransfer, preventDefault: vi.fn() };
};
const guard = (e: ReturnType<typeof drag>) => guardDrop(e as unknown as DragEvent);

describe('C22-U52 a file dropped where nothing takes it', () => {
  it('C22-U52 is stopped, and the pointer says no drop over it', () => {
    const drop = drag('drop', ['Files']);
    guard(drop);
    expect(drop.preventDefault).toHaveBeenCalled();
    const over = drag('dragover', ['Files']);
    guard(over);
    expect(over.preventDefault).toHaveBeenCalled();
    expect(over.dataTransfer.dropEffect).toBe('none');
  });

  it('C22-U52 one an editor handled is left alone, and a drag with no files is ignored', () => {
    const handled = drag('drop', ['Files'], true);
    guard(handled);
    expect(handled.preventDefault).not.toHaveBeenCalled();
    const text = drag('dragover', ['text/plain']);
    guard(text);
    expect(text.preventDefault).not.toHaveBeenCalled();
    expect(text.dataTransfer.dropEffect).toBe('copy');
  });
});
