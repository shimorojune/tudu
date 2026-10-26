import type { SpaceSummary } from '@tudu/core';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useAllScopeValue } from './allSpaces';

const space = (id: string, kind: 'personal' | 'team', name: string, slug: string): SpaceSummary => ({
  id,
  kind,
  name,
  color: null,
  role: 'admin',
  slug,
  prefix: name.slice(0, 2).toUpperCase(),
  members: 1,
  inbox: { toAnswer: 0, unread: 0 },
});
const SPACES = [space('p', 'personal', 'Personal', 'me'), space('n', 'team', 'Northwind', 'northwind')];

describe('useAllScopeValue', () => {
  it('C21-U19 All spaces’ scope holds still while the rest of the address changes', () => {
    // The address as it is when a change is made, not as it was at render.
    let search = 'space=me';
    const edits: string[] = [];
    const setSearch = (edit: (q: URLSearchParams) => void) => {
      const q = new URLSearchParams(search);
      edit(q);
      search = q.toString();
      edits.push(search);
    };
    const { result, rerender } = renderHook(
      ({ slug }: { slug: string | undefined }) => useAllScopeValue(SPACES, slug, setSearch),
      { initialProps: { slug: 'me' as string | undefined } },
    );
    const first = result.current;
    expect(first.filter?.id).toBe('p');
    // A task opens (?task= joins the address); the slug is the same, so is the scope.
    search = 'space=me&task=ME-3';
    for (let i = 0; i < 5; i++) rerender({ slug: 'me' });
    expect(result.current).toBe(first);
    // The filter goes: a new scope, once.
    rerender({ slug: undefined });
    const second = result.current;
    expect(second).not.toBe(first);
    expect(second.filter).toBeNull();
    rerender({ slug: undefined });
    expect(result.current).toBe(second);
    // setFilter keeps whatever ?task= the address has when it runs, even from a scope rendered before it.
    act(() => first.setFilter('n'));
    expect(edits.at(-1)).toBe('space=northwind&task=ME-3');
    act(() => second.setFilter(null));
    expect(edits.at(-1)).toBe('task=ME-3');
  });
});
