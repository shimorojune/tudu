import { API_URL, expect, signInFresh, test } from '../../fixtures/app';
import {
  SUNDAY,
  dayList,
  drag,
  fixClock,
  idle,
  ring,
  row,
  rowsOf,
  titlesOf,
  writeTasks,
} from '../../fixtures/today';

const THREE = ['Pay the electricity bill', 'Call Sam at 3pm', 'Book car service'];

test.describe('today', () => {
  test.beforeEach(async ({ page }) => {
    await fixClock(page);
  });

  test('C02-E01 write three tasks on the last line; they keep their order and IDs after a reload', async ({
    page,
  }) => {
    await signInFresh(page);
    await writeTasks(page, THREE);
    const list = dayList(page);
    await expect.poll(() => titlesOf(list)).toEqual(THREE);
    await idle(page);
    await expect(rowsOf(list).locator('.tp-sg-id')).toHaveText(['ME-1', 'ME-2', 'ME-3']);
    await page.reload();
    await expect.poll(() => titlesOf(dayList(page))).toEqual(THREE);
    await expect(rowsOf(dayList(page)).locator('.tp-sg-id')).toHaveText(['ME-1', 'ME-2', 'ME-3']);
  });

  test('C02-E02 crossing one off strikes it in place and counts it; uncrossing undoes it', async ({
    page,
  }) => {
    await signInFresh(page);
    await writeTasks(page, THREE);
    const list = dayList(page);
    await page.getByRole('checkbox', { name: 'Cross off: Call Sam at 3pm' }).click();
    await expect(row(list, 'Call Sam at 3pm').locator('.tp-row')).toHaveClass(/tp-done/);
    await expect.poll(() => titlesOf(list)).toEqual(THREE); // it stays where it was
    await expect(ring(page, '1 of 3 crossed off')).toBeVisible();
    await idle(page);
    await page.reload();
    await expect(page.getByRole('checkbox', { name: 'Cross off: Call Sam at 3pm' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await page.getByRole('checkbox', { name: 'Cross off: Call Sam at 3pm' }).click();
    await expect(ring(page, '0 of 3 crossed off')).toBeVisible();
    await expect(row(dayList(page), 'Call Sam at 3pm').locator('.tp-row')).not.toHaveClass(/tp-done/);
  });

  test('C02-E03 crossing off everything closes the ring: that’s the day', async ({ page }) => {
    await signInFresh(page);
    await writeTasks(page, THREE);
    for (const t of THREE) await page.getByRole('checkbox', { name: `Cross off: ${t}` }).click();
    await expect(ring(page, 'All 3 crossed off')).toBeVisible();
    // the words cross-fade in place; phones say it short
    const words = page.locator('.tp-prog-stack > .tp-on');
    if (test.info().project.name === 'phone') await expect(words).toHaveText('All done');
    else await expect(words).toHaveText('All crossed offThat’s the day');
  });

  test('C02-E04 drag the third task to the top; the order survives a reload', async ({ page }) => {
    await signInFresh(page);
    await writeTasks(page, THREE);
    await page.getByRole('textbox', { name: 'New task' }).press('Escape');
    const list = dayList(page);
    const first = (await rowsOf(list).first().boundingBox())!;
    await drag(page, row(list, 'Book car service'), { x: first.x + 120, y: first.y + 4 });
    await expect
      .poll(() => titlesOf(list))
      .toEqual(['Book car service', 'Pay the electricity bill', 'Call Sam at 3pm']);
    await idle(page);
    await page.reload();
    await expect
      .poll(() => titlesOf(dayList(page)))
      .toEqual(['Book car service', 'Pay the electricity bill', 'Call Sam at 3pm']);
  });

  test('C02-E05 the "+" between two tasks writes one in that slot', async ({ page }) => {
    test.skip(test.info().project.name !== 'desktop', 'the "+" is a desktop control (hover)');
    await signInFresh(page);
    await writeTasks(page, ['Pay the electricity bill', 'Book car service']);
    await page.getByRole('textbox', { name: 'New task' }).press('Escape');
    const list = dayList(page);
    const second = row(list, 'Book car service');
    await second.hover({ position: { x: 300, y: 2 } });
    await second.getByRole('button', { name: 'Add a task here' }).click();
    const here = page.getByPlaceholder('Write a task here…');
    await here.fill('Call Sam at 3pm');
    await here.press('Enter');
    await expect.poll(() => titlesOf(list)).toEqual(THREE);
    await here.press('Escape');
    await idle(page);
    await page.reload();
    await expect.poll(() => titlesOf(dayList(page))).toEqual(THREE);
  });

  test('C02-E06 turn the day with the arrows and the calendar; tasks keep to their day', async ({ page }) => {
    await signInFresh(page);
    await writeTasks(page, ['Sunday’s task']);
    await page.getByRole('button', { name: 'Next day' }).first().click();
    await expect(page.getByText('Tomorrow · Week 43')).toBeVisible();
    await expect(page.getByText('Nothing planned for Monday yet.')).toBeVisible();
    await writeTasks(page, ['Monday’s task']);
    await expect(dayList(page, 'Tasks for Monday 19 October')).toBeVisible();
    await page.getByRole('button', { name: 'Previous day' }).first().click();
    await expect(page.getByText('Today · Week 42')).toBeVisible();
    await expect.poll(() => titlesOf(dayList(page))).toEqual(['Sunday’s task']);
    // the title opens the calendar; a day with tasks has a dot
    await page.getByRole('button', { name: /^Pick a day\. Showing Sunday/ }).click();
    const cal = page.locator('.tp-dh-pop');
    await expect(cal).toBeVisible();
    await cal.getByRole('button', { name: /19 October/ }).click();
    await expect(page.getByText('Tomorrow · Week 43')).toBeVisible();
    await expect.poll(() => titlesOf(dayList(page))).toEqual(['Monday’s task']);
    await page.getByRole('button', { name: 'Back to today' }).first().click();
    await expect(page.getByText('Today · Week 42')).toBeVisible();
    await expect.poll(() => titlesOf(dayList(page))).toEqual(['Sunday’s task']);
  });

  test('C02-E07 two days: drag a task onto tomorrow; it is on tomorrow after a reload', async ({ page }) => {
    test.skip(test.info().project.name !== 'desktop', 'two days side by side is the desk');
    await signInFresh(page);
    await writeTasks(page, THREE);
    await page.getByRole('textbox', { name: 'New task' }).press('Escape');
    await page.getByRole('group', { name: 'Days to show' }).getByRole('button', { name: '2 days' }).click();
    const monday = page.getByRole('region', { name: 'The second day' });
    await expect(monday.getByRole('heading', { name: 'Monday' })).toBeVisible();
    // wait for the second page to finish sliding out before aiming at it
    await expect(page.locator('.tp-spread-second')).toHaveClass(/tp-on/);
    await expect(page.locator('.tp-spread-second')).not.toHaveClass(/tp-moving/);
    const target = monday.locator('.tp-list');
    const box = (await target.boundingBox())!;
    await drag(page, row(dayList(page, 'Tasks for Sunday 18 October'), 'Call Sam at 3pm'), {
      x: box.x + 120,
      y: box.y + 8,
    });
    await expect
      .poll(() => titlesOf(dayList(page, 'Tasks for Monday 19 October')))
      .toEqual(['Call Sam at 3pm']);
    await expect
      .poll(() => titlesOf(dayList(page, 'Tasks for Sunday 18 October')))
      .toEqual(['Pay the electricity bill', 'Book car service']);
    await idle(page);
    await page.reload();
    await expect
      .poll(() => titlesOf(dayList(page, 'Tasks for Monday 19 October')))
      .toEqual(['Call Sam at 3pm']);
    // the switch is remembered; back to one day
    await page
      .getByRole('group', { name: 'Days to show' })
      .getByRole('button', { name: 'Day', exact: true })
      .click();
    await expect(page.getByRole('region', { name: 'The second day' })).toHaveCount(0);
  });

  test('C02-E08 an unfinished task from yesterday is carried to today; keep one, move another', async ({
    page,
  }) => {
    await fixClock(page, new Date(2026, 9, 17, 18, 0)); // Saturday evening
    await signInFresh(page);
    await writeTasks(page, ['Sync with Meera', 'Water the plants', 'Done on Saturday']);
    await page.getByRole('checkbox', { name: 'Cross off: Done on Saturday' }).click();
    // the row was written a moment ago: wait for the tick before asking the outbox, else there is nothing to wait for
    await expect(page.getByRole('checkbox', { name: 'Cross off: Done on Saturday' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await idle(page);
    await fixClock(page, SUNDAY);
    await page.reload();
    await expect(page.getByText('Today · Week 42')).toBeVisible();
    const list = dayList(page, 'Tasks for Sunday 18 October');
    await expect.poll(() => titlesOf(list)).toEqual(['Sync with Meera', 'Water the plants']);
    const pill = (title: string) =>
      row(list, title).getByRole('button', { name: /Carried over from Saturday/ });
    await expect(pill('Sync with Meera')).toHaveText('From Sat');
    // keep it: it stays on today and the marker goes
    await pill('Sync with Meera').click();
    await page
      .getByRole('dialog', { name: 'Carried over from Saturday' })
      .getByRole('button', { name: /^Today/ })
      .click();
    await expect(pill('Sync with Meera')).toHaveCount(0);
    // move the other one to tomorrow
    await pill('Water the plants').click();
    await page
      .getByRole('dialog', { name: 'Carried over from Saturday' })
      .getByRole('button', { name: /^Tomorrow/ })
      .click();
    await expect(page.getByText('Moved to Tomorrow')).toBeVisible();
    await expect.poll(() => titlesOf(list)).toEqual(['Sync with Meera']);
    await idle(page);
    await page.getByRole('button', { name: 'Previous day' }).first().click();
    await expect
      .poll(() => titlesOf(dayList(page, 'Tasks for Saturday 17 October')))
      .toEqual(['Done on Saturday']);
    await page.getByRole('button', { name: 'Back to today' }).first().click();
    await page.getByRole('button', { name: 'Next day' }).first().click();
    await expect
      .poll(() => titlesOf(dayList(page, 'Tasks for Monday 19 October')))
      .toEqual(['Water the plants']);
  });

  test('C02-E09 copying a task ID says so and puts it on the clipboard', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await signInFresh(page);
    await writeTasks(page, ['Pay the electricity bill']);
    await idle(page);
    await page.getByRole('button', { name: 'Copy task ID ME-1' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Copied ME-1' })).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('ME-1');
  });

  test('C02-E10 offline: changes keep working, the banner says so, and they sync when back', async ({
    page,
    context,
  }) => {
    await signInFresh(page);
    await writeTasks(page, ['Written online']);
    await idle(page);
    await context.setOffline(true);
    await expect(page.getByText('You’re offline.')).toBeVisible();
    await writeTasks(page, ['Written offline']);
    await page.getByRole('checkbox', { name: 'Cross off: Written online' }).click();
    await expect(ring(page, '1 of 2 crossed off')).toBeVisible();
    await context.setOffline(false);
    await expect(page.getByText('You’re offline.')).toHaveCount(0);
    await idle(page);
    const me = (await (await page.request.get(`${API_URL}/api/me`)).json()) as {
      spaces: Array<{ id: string }>;
    };
    const day = (await (
      await page.request.get(`${API_URL}/api/spaces/${me.spaces[0]!.id}/days/2026-10-18`)
    ).json()) as { tasks: Array<{ title: string; done: boolean; ref: string }> };
    expect(day.tasks.map((t) => [t.title, t.done, t.ref])).toEqual([
      ['Written online', true, 'ME-1'],
      ['Written offline', false, 'ME-2'],
    ]);
  });

  test('C02-E11 a change in a second tab appears in the first without a reload', async ({
    page,
    context,
  }) => {
    await signInFresh(page);
    await writeTasks(page, ['From the first tab']);
    await idle(page);
    const second = await context.newPage();
    await second.goto('/');
    await writeTasks(second, ['From the second tab']);
    await second.getByRole('checkbox', { name: 'Cross off: From the first tab' }).click();
    await expect
      .poll(() => titlesOf(dayList(page)), { timeout: 10_000 })
      .toEqual(['From the first tab', 'From the second tab']);
    await expect(page.getByRole('checkbox', { name: 'Cross off: From the first tab' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await second.close();
  });

  test('C02-E12 phone: write, cross off, swipe to the next day and back', async ({ page }) => {
    test.skip(test.info().project.name !== 'phone', 'the swipe is the phone’s');
    await signInFresh(page);
    await writeTasks(page, ['Pay the electricity bill', 'Call Sam at 3pm']);
    await page.getByRole('checkbox', { name: 'Cross off: Call Sam at 3pm' }).click();
    await expect(ring(page, '1 of 2 crossed off')).toBeVisible();
    const swipe = async (dx: number) => {
      const cdp = await page.context().newCDPSession(page);
      const y = 640;
      const x0 = dx < 0 ? 330 : 60;
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y }] });
      for (let i = 1; i <= 6; i++)
        await cdp.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [{ x: x0 + (dx * i) / 6, y }],
        });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await cdp.detach();
    };
    await swipe(-200);
    await expect(page.getByText('Tomorrow · Week 43')).toBeVisible();
    await expect(page.getByText('Nothing planned for Monday yet.')).toBeVisible();
    await swipe(200);
    await expect(page.getByText('Today · Week 42')).toBeVisible();
    await expect.poll(() => titlesOf(dayList(page))).toEqual(['Pay the electricity bill', 'Call Sam at 3pm']);
  });

  test('C02-E13 a slow day shows the skeleton; a failed day says so and Try again recovers', async ({
    page,
  }) => {
    await signInFresh(page);
    // a slow day: the header at once, shimmer rows under it
    let release!: () => void;
    const held = new Promise<void>((r) => (release = r));
    await page.route('**/api/spaces/*/days/2026-10-19', async (route) => {
      await held;
      await route.continue();
    });
    await page.getByRole('button', { name: 'Next day' }).first().click();
    await expect(page.getByText('Tomorrow · Week 43')).toBeVisible();
    await expect(page.getByLabel('Loading tasks')).toBeVisible();
    release();
    await expect(page.getByText('Nothing planned for Monday yet.')).toBeVisible();
    await page.unroute('**/api/spaces/*/days/2026-10-19');
    // a failed day
    let fail = true;
    await page.route('**/api/spaces/*/days/2026-10-20', (route) =>
      fail
        ? route.fulfill({ status: 500, body: '{"error":"Something went wrong on the server."}' })
        : route.continue(),
    );
    await page.getByRole('button', { name: 'Next day' }).first().click();
    await expect(page.getByText('This day didn’t load.')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Check your connection. Nothing you wrote is lost.')).toBeVisible();
    fail = false;
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(page.getByText('Nothing planned for Tuesday yet.')).toBeVisible();
  });

  test('C02-E14 dark: write and cross off in the dark theme', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await signInFresh(page);
    await expect(page.locator('html')).toHaveClass(/dark/);
    await writeTasks(page, THREE);
    await page.getByRole('checkbox', { name: 'Cross off: Call Sam at 3pm' }).click();
    await expect(ring(page, '1 of 3 crossed off')).toBeVisible();
    await idle(page);
    await page.reload();
    await expect.poll(() => titlesOf(dayList(page))).toEqual(THREE);
    await expect(page.getByRole('checkbox', { name: 'Cross off: Call Sam at 3pm' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });
});
