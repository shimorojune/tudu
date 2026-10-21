import { PERSONAL_SLUG, type SpaceSummary } from '@tudu/core';
import { createContext, useContext, type ReactNode } from 'react';

/**
 * The space you are in is the first part of the address: `/me/today` is Personal, `/northwind/week` a team space's
 * week. `/` opens the last space you were in, remembered per browser, and Personal the first time.
 */
const KEY = 'tudu.space';

export type View = 'today' | 'week' | 'backlog' | 'people' | 'inbox' | 'more';

export const VIEW_PATHS: Record<View, string> = {
  today: '',
  week: '/week',
  backlog: '/backlog',
  people: '/people',
  inbox: '/inbox',
  more: '/more',
};

/** The space whose address this is: `me` is Personal, anything else a team space's slug. */
export function spaceBySlug(spaces: SpaceSummary[], slug: string): SpaceSummary | undefined {
  if (slug === PERSONAL_SLUG) return spaces.find((s) => s.kind === 'personal');
  return spaces.find((s) => s.kind === 'team' && s.slug === slug);
}

/** The path of a view in a space: `/northwind`, `/northwind/week`. */
export function spacePath(slug: string, view: View = 'today'): string {
  return `/${slug}${VIEW_PATHS[view]}`;
}

/** Which view a path inside a space shows: `/northwind/week` is the week. */
export function viewOf(pathname: string): View {
  const rest = pathname.replace(/^\/[^/]+/, '').replace(/\/$/, '');
  if (rest === '') return 'today';
  const seg = rest.split('/')[1] ?? '';
  return (Object.keys(VIEW_PATHS) as View[]).find((v) => VIEW_PATHS[v] === `/${seg}`) ?? 'today';
}

/** The same view in another space: switching keeps you where you were (a person's page goes back to People). */
export function switchPath(pathname: string, slug: string): string {
  return spacePath(slug, viewOf(pathname));
}

export function rememberSpace(slug: string): void {
  try {
    localStorage.setItem(KEY, slug);
  } catch {
    /* fine: it lasts for this visit */
  }
}

/** The last space you were in, or null. A space you are no longer in is dropped. */
export function lastSpace(spaces?: SpaceSummary[]): string | null {
  let slug: string | null;
  try {
    slug = localStorage.getItem(KEY);
  } catch {
    return null;
  }
  if (!slug) return null;
  if (spaces && !spaceBySlug(spaces, slug)) {
    forgetSpace();
    return null;
  }
  return slug;
}

export function forgetSpace(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* fine */
  }
}

/** Where `/` goes: the last space, else Personal. */
export function homePath(spaces: SpaceSummary[]): string {
  return spacePath(lastSpace(spaces) ?? PERSONAL_SLUG);
}

const Ctx = createContext<SpaceSummary | null>(null);

export function SpaceProvider({ space, children }: { space: SpaceSummary; children: ReactNode }) {
  return <Ctx.Provider value={space}>{children}</Ctx.Provider>;
}

/** The space the page is in. */
export function useSpace(): SpaceSummary {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSpace needs a SpaceProvider');
  return v;
}

/** The space the page is in, or null outside one (the floating Quick Add). */
export function useSpaceMaybe(): SpaceSummary | null {
  return useContext(Ctx);
}
