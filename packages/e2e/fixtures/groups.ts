import { expect, type Locator, type Page } from '@playwright/test';
import { API_URL } from './app';

export interface SeedRow {
  title: string;
  /** "2026-10-18", or null for the Backlog. */
  day: string | null;
  /** A project by name; made on first use. Left out: no project. */
  project?: string;
  done?: boolean;
}

/**
 * Write projects and tasks straight through sync as the page's person, into their first space (Personal) or
 * `spaceId`, in the order given. Returns the ids by title and by project name, and the projects in the space's own
 * order (the order the groups take). Reload the page to see them.
 */
export async function seedProjects(
  page: Page,
  rows: SeedRow[],
  spaceId?: string,
): Promise<{
  spaceId: string;
  tasks: Record<string, string>;
  projects: Record<string, string>;
  order: string[];
}> {
  const me = (await (await page.request.get(`${API_URL}/api/me`)).json()) as {
    spaces: Array<{ id: string }>;
  };
  const space = spaceId ?? me.spaces[0]!.id;
  const tasks: Record<string, string> = {};
  const projects: Record<string, string> = {};
  // Before the page's clock (Sunday 18 October, 10:00), or the page's own changes lose to them.
  let at = Date.parse('2026-10-18T08:00:00.000Z');
  const stamp = () => new Date((at += 1000)).toISOString();
  const mutations: unknown[] = [];
  for (const r of rows) {
    if (r.project && !projects[r.project]) {
      projects[r.project] = crypto.randomUUID();
      mutations.push({
        id: crypto.randomUUID(),
        type: 'project.create',
        payload: { id: projects[r.project], spaceId: space, name: r.project },
        at: stamp(),
      });
    }
  }
  for (const [i, r] of rows.entries()) {
    const id = crypto.randomUUID();
    tasks[r.title] = id;
    mutations.push({
      id: crypto.randomUUID(),
      type: 'task.create',
      payload: {
        id,
        spaceId: space,
        title: r.title,
        day: r.day,
        position: 1024 * (i + 1),
        ...(r.project ? { projectId: projects[r.project] } : {}),
      },
      at: stamp(),
    });
    if (r.done)
      mutations.push({
        id: crypto.randomUUID(),
        type: 'task.cross',
        payload: { id, done: true },
        at: stamp(),
      });
  }
  const res = await page.request.post(`${API_URL}/api/sync`, { data: { clientId: 'seed', mutations } });
  expect(res.status()).toBe(200);
  const listed = (await (await page.request.get(`${API_URL}/api/spaces/${space}/projects`)).json()) as {
    projects: Array<{ name: string }>;
  };
  return { spaceId: space, tasks, projects, order: listed.projects.map((p) => p.name) };
}

/** The My order | By project switch of a sheet (the page's first when none is given). */
export function orderSwitch(scope: Page | Locator): Locator {
  return scope.getByRole('group', { name: 'Order' }).first();
}

/** Turn a sheet to By project or back to My order. */
export async function orderBy(scope: Page | Locator, view: 'My order' | 'By project'): Promise<void> {
  await orderSwitch(scope).getByRole('button', { name: view }).click();
}

/** A project's group on a sheet: its header and its rows. */
export function group(scope: Page | Locator, name: string): Locator {
  return scope.locator(`section.tp-g:has(.tp-gh-name:text-is("${name}"))`);
}

/** A group's header button: "Platform, 2 left". */
export function groupHeader(scope: Page | Locator, name: string): Locator {
  return group(scope, name).locator('.tp-gh-main');
}

/** The group names of a sheet, in order. */
export async function groupNames(scope: Page | Locator): Promise<string[]> {
  return scope.locator('.tp-fold:not([aria-hidden="true"]) > section.tp-g .tp-gh-name').allTextContents();
}

/** The task titles under a group, in order. */
export async function groupTitles(scope: Page | Locator, name: string): Promise<string[]> {
  return group(scope, name).locator('[data-reorder] .tp-strike').allTextContents();
}

/** The titles the server has for a day (or the Backlog with null) in a space, in order, with their project ids. */
export async function serverList(
  page: Page,
  spaceId: string,
  day: string | null,
): Promise<Array<{ title: string; projectId: string | null; done: boolean }>> {
  const url = day
    ? `${API_URL}/api/spaces/${spaceId}/days/${day}`
    : `${API_URL}/api/spaces/${spaceId}/backlog`;
  const res = (await (await page.request.get(url)).json()) as {
    tasks: Array<{ title: string; projectId: string | null; done: boolean; day: string | null }>;
  };
  return res.tasks.map((t) => ({ title: t.title, projectId: t.projectId, done: t.done }));
}
