import { expect, type Locator, type Page } from '@playwright/test';
import { dayList } from './today';

/** Wednesday 14 October 2026, for tests that need days of this week still ahead. */
export const WEDNESDAY = new Date(2026, 9, 14, 10, 0);

/** Go to the week from wherever you are (the sidebar, the rail or the phone's tabs) and wait for its tiles. */
export async function goWeek(page: Page): Promise<void> {
  await page
    .getByRole('button', { name: /^Week(,|$)/ })
    .first()
    .click();
  await expect(page.getByRole('region', { name: 'The week' })).toBeVisible();
  await expect(tile(page, 'Backlog')).toBeVisible();
}

/** A day's tile or section: "Today, Sunday 18 October", "Monday 19 October", "Backlog". */
export function tile(page: Page, name: string | RegExp): Locator {
  return page.getByRole('region', { name, includeHidden: true });
}

/** The eyebrow and words of the week's header. */
export function weekEyebrow(page: Page): Locator {
  return page.getByRole('region', { name: 'The week' }).locator('.tp-dh .tp-eyebrow');
}

/** On tablets and phones a day folds: open it if it is shut. Tiles on the desk are always open. */
export async function openDay(page: Page, name: string | RegExp): Promise<void> {
  const t = tile(page, name);
  const head = t.getByRole('button', { expanded: false });
  if (await head.count()) await head.first().click();
  await expect(t.locator('.tp-wd-fold')).not.toHaveAttribute('inert', '');
}

/** The list inside a tile, found even while the tile's fold is shut. */
export function tileList(page: Page, dayWords: string): Locator {
  return dayList(page, `Tasks for ${dayWords}`);
}

export function backlogList(page: Page): Locator {
  return page.getByRole('list', { name: 'Tasks in the Backlog', includeHidden: true });
}

/** The count at the tile's head: "3 tasks", "2 of 7". */
export function tileCount(page: Page, name: string | RegExp): Locator {
  return tile(page, name).locator('.tp-wd-count');
}

/** The middle of a tile's list, where a dragged row lands at the end. */
export async function dropPoint(page: Page, name: string | RegExp): Promise<{ x: number; y: number }> {
  const list = tile(page, name).locator('.tp-list');
  const box = (await list.boundingBox())!;
  return { x: box.x + Math.min(120, box.width / 2), y: box.y + Math.max(8, box.height - 8) };
}

/** Drag a row straight sideways into another tile, with no vertical move first, as a person does on the week. */
export async function dragAcross(page: Page, from: Locator, to: { x: number; y: number }): Promise<void> {
  const box = (await from.boundingBox())!;
  const x = box.x + Math.min(120, box.width / 2);
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 6, y, { steps: 2 });
  await page.mouse.move(to.x, to.y, { steps: 12 });
  await page.mouse.up();
}
