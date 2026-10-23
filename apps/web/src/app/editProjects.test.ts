import { afterEach, describe, expect, it, vi } from 'vitest';
import { editProjects, editProjectsHref, settingsClosed } from './editProjects';

afterEach(() => settingsClosed());

describe('Edit projects…', () => {
  it('C18-U07 goes to Settings › Space on Projects: over this page here, over the space’s Today elsewhere, the Space page on phones; Quick Add comes back once when Settings closes', () => {
    const here = { slug: 'northwind', pathname: '/northwind/backlog', searchStr: '?task=NW-3' };
    expect(editProjectsHref('northwind', here, false)).toBe(
      '/northwind/backlog?task=NW-3&settings=space#projects',
    );
    expect(editProjectsHref('me', here, false)).toBe('/me?settings=space#projects');
    expect(editProjectsHref('northwind', here, true)).toBe('/northwind/settings/space#projects');
    const go = vi.fn();
    const back = vi.fn();
    editProjects(go, '/me?settings=space#projects', back);
    expect(go).toHaveBeenCalledWith('/me?settings=space#projects');
    expect(back).not.toHaveBeenCalled();
    settingsClosed();
    expect(back).toHaveBeenCalledTimes(1);
    settingsClosed();
    expect(back).toHaveBeenCalledTimes(1);
  });
});
