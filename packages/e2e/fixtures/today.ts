import { expect, type Locator, type Page } from '@playwright/test';

/** Sunday 18 October 2026, mid-morning: the day every Today test starts on unless it says otherwise. */
export const SUNDAY = new Date(2026, 9, 18, 10, 0);

/** Fix the clock (timers keep running) so "today" is the same day on every run. */
export async function fixClock(page: Page, at: Date = SUNDAY): Promise<void> {
  await page.clock.setFixedTime(at);
}

/**
 * Wait until every change has reached the server (the outbox is empty). The page's answer is a promise, which
 * waitForFunction would take for a truthy value at once, so this polls and awaits it.
 */
export async function idle(page: Page): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate(
          async () =>
            (await (window as unknown as { __tudu?: { idle(): Promise<boolean> } }).__tudu?.idle()) === true,
        ),
      { timeout: 15_000, intervals: [100] },
    )
    .toBe(true);
}

/** The list on a day's sheet: "Tasks for Sunday 18 October". Found even under an open panel's veil. */
export function dayList(page: Page, day: RegExp | string = /^Tasks for /): Locator {
  return page.getByRole('list', { name: day, includeHidden: true });
}

/** The rows of a list, task rows only. */
export function rowsOf(list: Locator): Locator {
  return list.locator('[data-reorder]');
}

export function row(list: Locator, title: string): Locator {
  return rowsOf(list).filter({ has: list.page().getByText(title, { exact: true }) });
}

/** The task titles of a list, in order. */
export async function titlesOf(list: Locator): Promise<string[]> {
  return rowsOf(list).locator('.tp-strike').allTextContents();
}

/** Write tasks on the day's last line (opening it from the empty state when the day has none). */
export async function writeTasks(
  page: Page,
  titles: string[],
  sheet: Locator = page.locator('body'),
): Promise<void> {
  const field = sheet.getByRole('textbox', { name: 'New task' });
  const empty = sheet.getByRole('button', { name: 'Add a task' });
  const line = sheet.getByRole('button', { name: 'Write the next thing…' });
  // the day may still be loading: wait for the empty state, the writing line, or the open field
  await expect(field.or(empty).or(line).first()).toBeVisible();
  if (await empty.isVisible()) await empty.click();
  else if (!(await field.isVisible())) await line.first().click();
  for (const t of titles) {
    await field.fill(t);
    await field.press('Enter');
    await expect(sheet.getByText(t, { exact: true })).toBeVisible();
  }
}

/** The progress ring of the first sheet: "1 of 3 crossed off". */
export function ring(page: Page, name: string | RegExp): Locator {
  return page.getByRole('img', { name });
}

/** Drag with the mouse from one element to a point, in small steps, as a person does. */
export async function drag(page: Page, from: Locator, to: { x: number; y: number }): Promise<void> {
  const box = (await from.boundingBox())!;
  const x = box.x + Math.min(120, box.width / 2);
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y + 6, { steps: 2 });
  await page.mouse.move(to.x, to.y, { steps: 12 });
  await page.mouse.up();
}
