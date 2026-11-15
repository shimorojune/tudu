import type { Locator, Page } from '@playwright/test';
import { API_URL, expect, signInFresh, test, newTaskButton } from '../../fixtures/app';
import { dayList, fixClock, idle, row, writeTasks } from '../../fixtures/today';

/** Times on Planned and Due, and Planned over several days (docs/plans/task-times.md). */

function panel(page: Page): Locator {
  return page.getByRole('dialog', { name: 'Task details' });
}

async function openTask(page: Page, title: string): Promise<Locator> {
  await row(dayList(page), title).getByRole('button', { name: title }).click();
  const p = panel(page);
  await expect(p.getByRole('textbox', { name: 'Task title' })).toHaveValue(title);
  return p;
}

async function firstTask(page: Page, title: string): Promise<void> {
  await writeTasks(page, [title]);
}

async function serverTask(page: Page, ref: string) {
  const where = (await (await page.request.get(`${API_URL}/api/tasks/ref/${ref}`)).json()) as {
    taskId: string;
    spaceId: string;
  };
  const res = await page.request.get(`${API_URL}/api/spaces/${where.spaceId}/tasks/${where.taskId}`);
  return (await res.json()) as {
    day: string | null;
    until?: string | null;
    time?: { start: string; end: string } | null;
    due: string | null;
    dueAt?: string | null;
  };
}

/** Type a time into a field's parts: "2", "30", "p" is 2:30 PM. */
async function typeTime(field: Locator, keys: string): Promise<void> {
  await field.locator('[data-seg="h"]').focus();
  await field.page().keyboard.type(keys);
}

test.describe('times', () => {
  test.skip(({ isMobile }) => isMobile, 'the panel flows differ on phones; TT-E10 covers the phone');

  test('TT-E01 Planned › Add a time, type 2:30 PM: the row reads 2:30 to 3:30 PM and a reload keeps it', async ({
    page,
  }) => {
    await fixClock(page);
    await signInFresh(page);
    await firstTask(page, 'Quick Add demo');
    const p = await openTask(page, 'Quick Add demo');
    await p.getByRole('button', { name: 'Planned', exact: true }).click();
    const pop = p.locator('.tp-td-pop');
    await pop.getByRole('button', { name: 'Add a time' }).click();
    await typeTime(pop.getByRole('group', { name: /^Starts at/ }), '230p');
    await expect(row(dayList(page), 'Quick Add demo').locator('.tp-sg-time')).toHaveText('2:30 to 3:30 PM');
    await idle(page);
    await page.reload();
    await expect(row(dayList(page), 'Quick Add demo').locator('.tp-sg-time')).toHaveText('2:30 to 3:30 PM');
    expect((await serverTask(page, 'ME-1')).time).toEqual({ start: '14:30', end: '15:30' });
  });

  test('TT-E02 end before start: the red line, nothing saved; fixing it saves', async ({ page }) => {
    await fixClock(page);
    await signInFresh(page);
    await firstTask(page, 'Write the brief');
    const p = await openTask(page, 'Write the brief');
    await p.getByRole('button', { name: 'Planned', exact: true }).click();
    const pop = p.locator('.tp-td-pop');
    await pop.getByRole('button', { name: 'Add a time' }).click();
    await idle(page);
    const before = (await serverTask(page, 'ME-1')).time;
    const end = pop.getByRole('group', { name: /^Ends at/ });
    await end.locator('[data-seg="h"]').focus();
    await page.keyboard.press('ArrowDown');
    await expect(end).toHaveClass(/tp-bad/);
    await expect(pop.getByText('It has to end after it starts')).toBeVisible();
    await idle(page);
    expect((await serverTask(page, 'ME-1')).time).toEqual(before);
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ArrowUp');
    await expect(end).not.toHaveClass(/tp-bad/);
    await idle(page);
    const t = (await serverTask(page, 'ME-1')).time!;
    expect(t.start).toBe(before!.start);
    expect(t.end > before!.end).toBe(true);
  });

  test('TT-E03 Several days Sun 18 to Wed 21: on each day with Day n of 4, tinted from day 2', async ({
    page,
  }) => {
    await fixClock(page);
    await signInFresh(page);
    await firstTask(page, 'Run the offsite');
    const p = await openTask(page, 'Run the offsite');
    await p.getByRole('button', { name: 'Planned', exact: true }).click();
    const pop = p.locator('.tp-td-pop');
    await pop.getByRole('switch', { name: 'Several days' }).click();
    await pop.getByRole('button', { name: /^21 October/ }).click();
    await expect(p.getByRole('button', { name: 'Planned', exact: true })).toContainText(
      'Sun 18 to Wed 21 Oct',
    );
    const r = row(dayList(page), 'Run the offsite');
    await expect(r.locator('.tp-sg-time')).toHaveText('Day 1 of 4');
    await idle(page);
    expect(await serverTask(page, 'ME-1')).toMatchObject({ day: '2026-10-18', until: '2026-10-21' });
    await p.getByRole('button', { name: 'Close' }).click();
    await page.getByRole('button', { name: 'Next day' }).click();
    await page.getByRole('button', { name: 'Next day' }).click();
    const r3 = row(dayList(page, /Tuesday 20 October/), 'Run the offsite');
    await expect(r3.locator('.tp-sg-time')).toHaveText('Day 3 of 4');
    await expect(r3.locator('.tp-row')).toHaveClass(/tp-span-on/);
  });

  test('TT-E06 Due presets and Due at 5 PM: the pill turns Overdue at 5:00, not at midnight', async ({
    page,
  }) => {
    await page.clock.install({ time: new Date(2026, 9, 18, 16, 58, 30) });
    await signInFresh(page);
    await firstTask(page, 'Send the signed contract');
    const p = await openTask(page, 'Send the signed contract');
    await p.getByRole('button', { name: 'Due', exact: true }).click();
    const pop = p.locator('.tp-td-pop');
    await expect(pop.getByRole('button', { name: 'No date' })).toBeVisible();
    await pop.getByRole('button', { name: 'Today' }).click();
    await p.getByRole('button', { name: 'Due', exact: true }).click();
    await pop.getByRole('button', { name: 'Add a time' }).click();
    // the next full hour today: 5 PM
    const r = row(dayList(page), 'Send the signed contract');
    await expect(r.locator('.tp-sg-due')).toHaveText('Due today 5 PM');
    await page.clock.runFor(2 * 60_000);
    await expect(r.locator('.tp-sg-due')).toHaveText('Overdue since 5 PM');
    await expect(r.locator('.tp-sg-due')).toHaveClass(/tp-od/);
  });

  test('TT-E07 Quick Add with a Planned time and a Due time makes the task with both', async ({ page }) => {
    await page.clock.setFixedTime(new Date(2026, 9, 18, 14, 10));
    await signInFresh(page);
    await newTaskButton(page).click();
    const b = page.getByRole('dialog', { name: 'Quick Add' });
    await b.getByRole('textbox', { name: 'Task title' }).fill('Book the room');
    await b.getByRole('button', { name: /^Planned for:/ }).click();
    await b.locator('.tp-qa-pop').getByRole('button', { name: 'Add a time' }).click();
    await page.keyboard.press('Escape');
    await b.getByRole('button', { name: 'Add a due date' }).click();
    await b.locator('.tp-qa-pop:not(.tp-pop-leaving)').getByRole('button', { name: 'Add a time' }).click();
    await expect(b.locator('.tp-qa-lands')).toContainText('Lands on Today at 3 PM');
    await b.getByRole('textbox', { name: 'Task title' }).press('Enter');
    await expect(b).toHaveCount(0, { timeout: 5000 });
    await idle(page);
    expect(await serverTask(page, 'ME-1')).toMatchObject({
      time: { start: '15:00', end: '16:00' },
      due: '2026-10-18',
      dueAt: '15:00',
    });
  });
});
