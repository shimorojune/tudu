import { spacePath } from './space';

/** What to do once Settings closes again: Quick Add asks to come back with its draft. */
let afterSettings: (() => void) | null = null;

/** Settings closed: run what was waiting on it, once. */
export function settingsClosed(): void {
  const run = afterSettings;
  afterSettings = null;
  run?.();
}

/**
 * Where "Edit projects…" goes: Settings › Space for that space, over its Today on the desk and tablets, the Space
 * page on phones. On the space you are on, the dialog opens over the page you are on.
 */
export function editProjectsHref(
  slug: string,
  here: { slug: string; pathname: string; searchStr: string },
  phone: boolean,
): string {
  if (phone) return `/${slug}/settings/space#projects`;
  if (slug !== here.slug) return `${spacePath(slug)}?settings=space#projects`;
  const q = new URLSearchParams(here.searchStr);
  q.set('settings', 'space');
  return `${here.pathname}?${q.toString()}#projects`;
}

/** Bring the Projects block into view once Settings has drawn it (it may take a frame or two to mount): `#projects`. */
export function scrollToProjects(tries = 30): void {
  const el = document.getElementById('projects');
  if (el) {
    el.scrollIntoView({ block: 'start' });
    return;
  }
  if (tries > 0) requestAnimationFrame(() => scrollToProjects(tries - 1));
}

/** "Edit projects…": go to the space's Projects, and run `then` when Settings closes (desk and tablets). */
export function editProjects(go: (href: string) => void, href: string, then?: () => void): void {
  afterSettings = then ?? null;
  go(href);
}
