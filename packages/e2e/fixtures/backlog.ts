import { expect, type Locator, type Page } from '@playwright/test';
import { API_URL } from './app';
import { writeTasks } from './today';

/** Go to the Backlog from wherever you are: the sidebar or the rail, or More then Backlog on phones. */
export async function goBacklog(page: Page): Promise<void> {
  const more = page.getByRole('button', { name: 'More' });
  if (await more.count()) {
    await more.click();
    await page.getByRole('button', { name: /^Backlog/ }).click();
  } else {
    await page
      .getByRole('button', { name: /^Backlog(,|$)/ })
      .first()
      .click();
  }
  await expect(sheet(page)).toBeVisible();
}

/** The Backlog's sheet. */
export function sheet(page: Page): Locator {
  return page.getByRole('region', { name: 'The Backlog' });
}

/** The count beside the title: "4 tasks", "Nothing waiting", "3 crossed off". */
export function backlogCount(page: Page): Locator {
  return sheet(page).locator('.tp-dh-date');
}

/** The To do list. */
export function todoList(page: Page): Locator {
  return page.getByRole('list', { name: 'Tasks in the Backlog', includeHidden: true });
}

/** The Crossed off list. */
export function doneList(page: Page): Locator {
  return page.getByRole('list', { name: 'Crossed off in the Backlog', includeHidden: true });
}

/** Turn the sheet to a view. */
export async function turnTo(page: Page, view: 'To do' | 'Crossed off'): Promise<void> {
  await sheet(page).getByRole('group', { name: 'View' }).getByRole('button', { name: view }).click();
}

/** Write tasks from the Backlog's writing line (or its empty state's New task): Quick Add on no day, once each. */
export async function writeBacklog(page: Page, titles: string[]): Promise<void> {
  await writeTasks(page, titles, sheet(page), /^Add to .*Backlog…$/);
}

/** The titles the server has in the Backlog, in order, crossed-off ones marked. */
export async function serverBacklog(page: Page): Promise<Array<[string, boolean]>> {
  const me = (await (await page.request.get(`${API_URL}/api/me`)).json()) as {
    spaces: Array<{ id: string }>;
  };
  const res = (await (
    await page.request.get(`${API_URL}/api/spaces/${me.spaces[0]!.id}/backlog`)
  ).json()) as { tasks: Array<{ title: string; done: boolean }> };
  return res.tasks.map((t) => [t.title, t.done]);
}
