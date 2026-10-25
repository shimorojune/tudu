import { describe, expect, it } from 'vitest';
import { rowLink, taskLink } from './links';

describe('task links', () => {
  it('C03-U28 a task link is /t/<ID> on whichever Tudu is running; a row without an ID has none', () => {
    expect(taskLink('LM-1', 'https://tudu.ezdev.net')).toBe('https://tudu.ezdev.net/t/LM-1');
    expect(taskLink('LM-1', 'https://staging.tudu.ezdev.net')).toBe('https://staging.tudu.ezdev.net/t/LM-1');
    expect(taskLink('ME-4')).toBe(`${window.location.origin}/t/ME-4`);
    expect(rowLink({ id: 'ME-4' })).toBe(`${window.location.origin}/t/ME-4`);
    expect(rowLink({ id: null })).toBeUndefined();
  });
});
