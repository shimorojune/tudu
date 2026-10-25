import { afterEach, describe, expect, it, vi } from 'vitest';
import { copyText } from './clipboard';

const set = (value: unknown) => Object.defineProperty(navigator, 'clipboard', { value, configurable: true });

afterEach(() => set(undefined));

describe('copyText', () => {
  it('C02-U28 true once the clipboard has it; false when it refuses, throws or is missing', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    set({ writeText });
    await expect(copyText('https://tudu.test/t/ME-1')).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith('https://tudu.test/t/ME-1');
    set({ writeText: () => Promise.reject(new Error('denied')) });
    await expect(copyText('x')).resolves.toBe(false);
    set({
      writeText: () => {
        throw new Error('not allowed');
      },
    });
    await expect(copyText('x')).resolves.toBe(false);
    set(undefined);
    await expect(copyText('x')).resolves.toBe(false);
  });
});
