import { PERSONAL_SLUG, spaceForSlug, type SpaceSummary } from '@tudu/core';
import { createContext, useContext, type ReactNode } from 'react';

/**
 * The space you are in is the first part of the address: `/me/today` is Personal, `/northwind/week` a team space's
 * week. `/` opens the last space you were in, remembered per browser, and Personal the first time.
 */
const KEY = 'tudu.space';

export type View = 'today' | 'week' | 'backlog' | 'people' | 'inbox' | 'more' | 'settings' | 'jira' | 'apps';

export const VIEW_PATHS: Record<View, string> = {
  today: '',
  week: '/week',
  backlog: '/backlog',
  people: '/people',
  inbox: '/inbox',
  more: '/more',
  settings: '/settings',
  jira: '/jira',
  apps: '/apps',
};

/** The space whose address this is: `me` is Personal, anything else a team space's slug (or one it had). */
export function spaceBySlug(spaces: SpaceSummary[], slug: string): SpaceSummary | undefined {
  return spaceForSlug(spaces, slug)?.space;
}

/** The same path with the space's part of the address put right: `/northwind/week` → `/northwind-labs/week`. */
export function withSlug(pathname: string, slug: string): string {
  return pathname.replace(/^\/[^/]+/, `/${slug}`);
}

/** The path of a view in a space: `/northwind`, `/northwind/week`. The Inbox is every space's: `/inbox`. */
export function spacePath(slug: string, view: View = 'today'): string {
  if (view === 'inbox') return INBOX_PATH;
  return `/${slug}${VIEW_PATHS[view]}`;
}

/** The one Inbox, across every space. */
export const INBOX_PATH = '/inbox';

/**
 * The Inbox's address: `/inbox`, an item `/inbox/<id>`, narrowed to a space `?space=northwind`, on a view
 * `?view=sent`.
 */
export function inboxPath(
  o: { item?: string | null; space?: string | null; view?: string | null } = {},
): string {
  const q = new URLSearchParams();
  if (o.space) q.set('space', o.space);
  if (o.view && o.view !== 'inbox') q.set('view', o.view);
  const qs = q.toString();
  return `${INBOX_PATH}${o.item ? `/${o.item}` : ''}${qs ? `?${qs}` : ''}`;
}

/**
 * Where an old per-space Inbox address goes: the one Inbox narrowed to that team space, keeping the item and view.
 * Personal's never worked, so /me/inbox is the whole Inbox.
 */
export function oldInboxPath(
  space: Pick<SpaceSummary, 'kind' | 'slug'>,
  item?: string | null,
  view?: string | null,
): string {
  return inboxPath({ item, space: space.kind === 'team' ? space.slug : null, view });
}

/** Which view a path inside a space shows: `/northwind/week` is the week; `/inbox` is the Inbox. */
export function viewOf(pathname: string): View {
  if (pathname === INBOX_PATH || pathname.startsWith(`${INBOX_PATH}/`)) return 'inbox';
  const rest = pathname.replace(/^\/[^/]+/, '').replace(/\/$/, '');
  if (rest === '') return 'today';
  const seg = rest.split('/')[1] ?? '';
  return (Object.keys(VIEW_PATHS) as View[]).find((v) => VIEW_PATHS[v] === `/${seg}`) ?? 'today';
}

/**
 * The same view in another space: switching keeps you where you were (a person's page goes back to People). The
 * Inbox is not a space's, so switching from it opens that space's Today.
 */
export function switchPath(pathname: string, slug: string): string {
  const view = viewOf(pathname);
  return spacePath(slug, view === 'inbox' ? 'today' : view);
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
