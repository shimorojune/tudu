import type { Page } from '@playwright/test';
import { API_URL, expect, signInFresh, test } from '../../fixtures/app';
import {
  backlogBeside,
  besideList,
  besideSheet,
  dayList,
  drag,
  fixClock,
  idle,
  row,
  titlesOf,
  writeTasks,
} from '../../fixtures/today';

const SUNDAY_TASKS = 'Tasks for Sunday 18 October';
const DAY = ['Pay the electricity bill', 'Call Sam at 3pm'];
const WAITING = ['Renew passport', 'Draft the Q4 hiring plan'];

/** The day's tasks, then the Backlog's, written beside it. */
async function dayAndBacklog(page: Page, waiting: string[] = WAITING) {
  await signInFresh(page);
  await writeTasks(page, DAY);
  await page.getByRole('textbox', { name: 'New task' }).press('Escape');
  const sheet = await backlogBeside(page);
  if (waiting.length) {
    await sheet.getByRole('button', { name: 'Add to the Backlog…' }).click();
    const field = sheet.getByRole('textbox', { name: 'New task' });
    for (const t of waiting) {
      await field.fill(t);
      await field.press('Enter');
      await expect(sheet.getByText(t, { exact: true })).toBeVisible();
    }
    await field.press('Escape');
  }
  await expect.poll(() => titlesOf(besideList(page))).toEqual(waiting);
  await idle(page);
  return sheet;
}

function count(page: Page) {
  return besideSheet(page).locator('.tp-dh-date');
}

async function serverDay(page: Page, ref: string): Promise<string | null> {
  const r = (await (await page.request.get(`${API_URL}/api/tasks/ref/${ref}`)).json()) as {
    day: string | null;
  };
  return r.day;
}

const views = (page: Page) => page.getByRole('group', { name: 'Days to show' });

test.describe('today, the Backlog beside', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!['desktop', 'webkit'].includes(test.info().project.name), 'the Backlog beside is the desk’s');
    await fixClock(page);
  });

  test('C02-E18 the switch reads Backlog · Day · 2 days; Backlog opens on the day’s left, survives a reload, Day folds it', async ({
    page,
  }) => {
    await signInFresh(page);
    await expect(views(page).getByRole('button')).toHaveText(['Backlog', 'Day', '2 days']);
    const sheet = await backlogBeside(page);
    await expect(sheet.getByRole('heading', { name: 'Backlog' })).toBeVisible();
    await expect(sheet.getByText('No day', { exact: true })).toBeVisible();
    await expect(count(page)).toHaveText('Nothing waiting');
    const day = page.getByRole('region', { name: 'The day', exact: true });
    const b = (await sheet.boundingBox())!;
    const d = (await day.boundingBox())!;
    expect(b.x + b.width).toBeLessThanOrEqual(d.x);
    await page.reload();
    await expect(besideSheet(page)).toBeVisible();
    await expect(views(page).getByRole('button', { name: 'Backlog' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await views(page).getByRole('button', { name: 'Day', exact: true }).click();
    await expect(besideSheet(page)).toHaveCount(0);
  });

  test('C02-E19 drag a task into the Backlog and another out onto the day; the counts follow and the server agrees', async ({
    page,
  }) => {
    const sheet = await dayAndBacklog(page);
    await expect(count(page)).toHaveText('2 tasks');
    // the day → the Backlog, onto its top
    const top = (await besideList(page).boundingBox())!;
    await drag(page, row(dayList(page, SUNDAY_TASKS), 'Call Sam at 3pm'), { x: top.x + 120, y: top.y + 8 });
    await expect.poll(() => titlesOf(besideList(page))).toEqual(['Call Sam at 3pm', ...WAITING]);
    await expect.poll(() => titlesOf(dayList(page, SUNDAY_TASKS))).toEqual(['Pay the electricity bill']);
    await expect(count(page)).toHaveText('3 tasks');
    // the Backlog → the day, under its one task
    const dayBox = (await dayList(page, SUNDAY_TASKS).boundingBox())!;
    await drag(page, row(besideList(page), 'Renew passport'), {
      x: dayBox.x + 120,
      y: dayBox.y + dayBox.height + 4,
    });
    await expect
      .poll(() => titlesOf(dayList(page, SUNDAY_TASKS)))
      .toEqual(['Pay the electricity bill', 'Renew passport']);
    await expect
      .poll(() => titlesOf(besideList(page)))
      .toEqual(['Call Sam at 3pm', 'Draft the Q4 hiring plan']);
    await expect(count(page)).toHaveText('2 tasks');
    await idle(page);
    expect(await serverDay(page, 'ME-2')).toBeNull();
    expect(await serverDay(page, 'ME-3')).toBe('2026-10-18');
    await page.reload();
    await expect
      .poll(() => titlesOf(besideList(page)))
      .toEqual(['Call Sam at 3pm', 'Draft the Q4 hiring plan']);
    void sheet;
  });

  test('C02-E20 by click: a Backlog row’s calendar button plans it for today with Undo; Planned › Backlog sends a day’s task across', async ({
    page,
  }) => {
    await dayAndBacklog(page);
    await page.getByRole('button', { name: 'Plan it for a day: Renew passport' }).click();
    await page
      .getByRole('dialog', { name: 'Plan it for a day' })
      .getByRole('button', { name: 'Today' })
      .click();
    await expect.poll(() => titlesOf(dayList(page, SUNDAY_TASKS))).toEqual([...DAY, 'Renew passport']);
    await expect.poll(() => titlesOf(besideList(page))).toEqual(['Draft the Q4 hiring plan']);
    await expect(page.locator('.tp-toast')).toHaveText(/Moved to Today/);
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect.poll(() => titlesOf(besideList(page))).toEqual(WAITING);
    await expect.poll(() => titlesOf(dayList(page, SUNDAY_TASKS))).toEqual(DAY);

    // a day's task, from its panel: Planned › Backlog lands it in the sheet beside
    await row(dayList(page, SUNDAY_TASKS), 'Call Sam at 3pm')
      .getByText('Call Sam at 3pm', { exact: true })
      .click();
    const panel = page.getByRole('dialog', { name: 'Task details' });
    await panel.getByRole('button', { name: 'Planned', exact: true }).click();
    await panel.locator('.tp-td-pop').getByRole('button', { name: 'Backlog' }).click();
    await expect.poll(() => titlesOf(besideList(page))).toContain('Call Sam at 3pm');
    await expect.poll(() => titlesOf(dayList(page, SUNDAY_TASKS))).toEqual(['Pay the electricity bill']);
  });

  test.describe('with motion', () => {
    test.use({ contextOptions: { reducedMotion: 'no-preference' } });

    test('C02-E21 2 days → Backlog: the second day folds away before the Backlog opens; the day never grows past one day', async ({
      page,
    }) => {
      await signInFresh(page);
      const day = page.getByRole('region', { name: 'The day', exact: true });
      const one = (await day.boundingBox())!.width;
      await views(page).getByRole('button', { name: '2 days' }).click();
      await expect(page.getByRole('region', { name: 'The second day' })).toBeVisible();
      await expect(page.locator('.tp-spread-start .tp-spread .tp-spread-second')).not.toHaveClass(
        /tp-moving/,
      );
      await page.waitForTimeout(400);
      // sample every frame for a second: [second day's page width, Backlog page width, the day's width]
      const frames = await page.evaluate(async () => {
        const pick = (s: string) => document.querySelector<HTMLElement>(s);
        const out: Array<[number, number, number]> = [];
        const w = (el: HTMLElement | null) => (el ? el.getBoundingClientRect().width : 0);
        const click = Array.from(
          document.querySelectorAll<HTMLButtonElement>('[aria-label="Days to show"] button'),
        ).find((b) => b.textContent === 'Backlog')!;
        click.click();
        const t0 = performance.now();
        while (performance.now() - t0 < 1000) {
          await new Promise((r) => requestAnimationFrame(r));
          out.push([
            w(pick('.tp-spread-start .tp-spread .tp-spread-second')),
            w(pick('.tp-spread-start > .tp-spread-second')),
            w(pick('[aria-label="The day"]')),
          ]);
        }
        return out;
      });
      const firstBacklog = frames.findIndex((f) => f[1] > 1);
      expect(firstBacklog, 'the Backlog opened').toBeGreaterThan(0);
      // by the time the Backlog page starts to grow, the second day's page is gone
      expect(frames.slice(firstBacklog).every((f) => f[0] < 1)).toBe(true);
      expect(Math.max(...frames.map((f) => f[2]))).toBeLessThanOrEqual(one + 1);
      await expect(besideSheet(page)).toBeVisible();
    });
  });

  test('C02-E22 states: an empty Backlog says Nothing waiting and still takes a drop; a failed load says so, the day works, Try again loads it', async ({
    page,
  }) => {
    const sheet = await dayAndBacklog(page, []);
    await expect(count(page)).toHaveText('Nothing waiting');
    await expect(sheet.getByText('Nothing waiting.', { exact: true })).toBeVisible();
    const list = (await besideList(page).boundingBox())!;
    await drag(page, row(dayList(page, SUNDAY_TASKS), 'Call Sam at 3pm'), { x: list.x + 120, y: list.y + 8 });
    await expect.poll(() => titlesOf(besideList(page))).toEqual(['Call Sam at 3pm']);
    await expect(count(page)).toHaveText('1 task');
    await expect(sheet.getByText('Nothing waiting.', { exact: true })).toHaveCount(0);
    await idle(page);

    // the Backlog fails to load: its sheet says so, the day still works
    let fail = true;
    await page.route('**/api/spaces/*/backlog*', (route) =>
      fail
        ? route.fulfill({ status: 500, body: '{"error":"Something went wrong on the server."}' })
        : route.continue(),
    );
    await page.reload();
    await expect(besideSheet(page).getByText('The Backlog didn’t load.')).toBeVisible({ timeout: 15_000 });
    await expect(besideSheet(page).getByText('Check your connection. Your day is still here.')).toBeVisible();
    await writeTasks(page, ['Still works'], page.getByRole('region', { name: 'The day', exact: true }));
    fail = false;
    await besideSheet(page).getByRole('button', { name: 'Try again' }).click();
    await expect.poll(() => titlesOf(besideList(page))).toEqual(['Call Sam at 3pm']);
  });

  test('C02-E23 offline: a task moved into the Backlog moves at once and reaches the server when back', async ({
    page,
    context,
  }) => {
    await dayAndBacklog(page);
    await context.setOffline(true);
    await expect(page.getByText('You’re offline.')).toBeVisible();
    await expect(page.getByText('You’re offline.')).toHaveCount(1);
    const top = (await besideList(page).boundingBox())!;
    await drag(page, row(dayList(page, SUNDAY_TASKS), 'Pay the electricity bill'), {
      x: top.x + 120,
      y: top.y + 8,
    });
    await expect.poll(() => titlesOf(besideList(page))).toEqual(['Pay the electricity bill', ...WAITING]);
    await context.setOffline(false);
    await idle(page);
    await expect.poll(() => serverDay(page, 'ME-1'), { timeout: 15_000 }).toBeNull();
  });

  test('C02-E24 turning the day keeps the Backlog beside; a task planned from it lands on the day shown', async ({
    page,
  }) => {
    await dayAndBacklog(page);
    await page
      .getByRole('region', { name: 'The day', exact: true })
      .getByRole('button', { name: 'Next day' })
      .click();
    await expect(
      page.getByRole('region', { name: 'The day', exact: true }).getByRole('heading', { name: 'Monday' }),
    ).toBeVisible();
    await expect(besideSheet(page)).toBeVisible();
    const monday = dayList(page, 'Tasks for Monday 19 October');
    const day = page.getByRole('region', { name: 'The day', exact: true });
    await expect(day.locator('.tp-list')).toBeAttached();
    const box = (await day.locator('.tp-list').boundingBox())!;
    await drag(page, row(besideList(page), 'Renew passport'), { x: box.x + 120, y: box.y + 8 });
    await expect.poll(() => titlesOf(monday)).toEqual(['Renew passport']);
    await idle(page);
    expect(await serverDay(page, 'ME-3')).toBe('2026-10-19');
  });
});

test.describe('today, no Backlog beside', () => {
  test.beforeEach(async ({ page }) => {
    await fixClock(page);
  });

  test('C02-E25 tablets and phones have no Backlog choice; All spaces’ switch is Day · 2 days', async ({
    page,
  }) => {
    await signInFresh(page);
    const name = test.info().project.name;
    if (name === 'tablet' || name === 'phone') {
      await expect(page.getByRole('heading', { name: 'Sunday' }).first()).toBeVisible();
      await expect(views(page)).toHaveCount(0);
      return;
    }
    test.skip(name !== 'desktop', 'one desk is enough');
    // All spaces needs a second space
    const made = await page.request.post(`${API_URL}/api/spaces`, {
      data: { name: 'Northwind', color: '#3d5a80', invites: [] },
    });
    expect(made.status()).toBe(201);
    await page.goto('/all');
    await expect(page).toHaveURL(/\/all(\?|$)/);
    await expect(views(page).getByRole('button')).toHaveText(['Day', '2 days']);
  });
});
