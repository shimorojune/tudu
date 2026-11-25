import type { Page } from '@playwright/test';
import { API_URL, expect, newTaskButton, signInFresh, test } from '../../fixtures/app';
import { createSpace, switchTo } from '../../fixtures/spaces';
import { expectDropSettles, expectGlides, expectLands, sampleBoxes } from '../../fixtures/motion';
import {
  SUNDAY,
  carry,
  dayList,
  drag,
  fixClock,
  idle,
  ring,
  row,
  rowsOf,
  titlesOf,
  twoDays,
  writeTasks,
  quickAdd,
  addInQuickAdd,
  backlogBeside,
  besideList,
  SECOND_DAY_PAGE,
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

  test.describe('with motion', () => {
    test.use({ contextOptions: { reducedMotion: 'no-preference' } });

    test('C02-E42 a dropped row never shows the old order: it settles from where it was let go into its new slot (#113)', async ({
      page,
    }) => {
      await signInFresh(page);
      await writeTasks(page, THREE);
      const list = dayList(page);
      await expectDropSettles(page, list, 'Pay the electricity bill', 'Book car service');
      await expect
        .poll(() => titlesOf(list))
        .toEqual(['Call Sam at 3pm', 'Book car service', 'Pay the electricity bill']);
      await idle(page);
      await page.reload();
      await expect
        .poll(() => titlesOf(dayList(page)))
        .toEqual(['Call Sam at 3pm', 'Book car service', 'Pay the electricity bill']);
    });
  });

  test('NI-E03 nothing in a list is a field: no "+" between rows on hover, no "New task" textbox anywhere', async ({
    page,
  }) => {
    await signInFresh(page);
    await writeTasks(page, ['Pay the electricity bill', 'Book car service']);
    const list = dayList(page);
    await row(list, 'Book car service').hover({ position: { x: 300, y: 2 } });
    await page.waitForTimeout(300);
    await expect(page.getByRole('button', { name: 'Add a task here' })).toHaveCount(0);
    await expect(list.locator('.tp-ins, .tp-insrow')).toHaveCount(0);
    await page.getByRole('button', { name: 'Write the next thing…' }).click();
    await expect(quickAdd(page)).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'New task' })).toHaveCount(0);
  });

  test('NI-E01 "Write the next thing…" opens Quick Add on today; Add puts the row last with the wash; a reload keeps it', async ({
    page,
  }) => {
    await signInFresh(page);
    await writeTasks(page, ['Pay the electricity bill']);
    await page.getByRole('button', { name: 'Write the next thing…' }).click();
    const qa = quickAdd(page);
    await expect(qa.getByRole('button', { name: 'Planned for: Today' })).toBeVisible();
    await addInQuickAdd(page, 'Call Sam at 3pm');
    const list = dayList(page);
    await expect.poll(() => titlesOf(list)).toEqual(['Pay the electricity bill', 'Call Sam at 3pm']);
    await expect(row(list, 'Call Sam at 3pm')).toHaveClass(/tp-new/);
    await idle(page);
    await page.reload();
    await expect.poll(() => titlesOf(dayList(page))).toEqual(['Pay the electricity bill', 'Call Sam at 3pm']);
  });

  test('NI-E04 two days: the second day’s line opens Quick Add on tomorrow; the Backlog beside the day opens on Backlog', async ({
    page,
  }) => {
    test.skip(test.info().project.name !== 'desktop', 'two sheets side by side are the desk’s');
    await signInFresh(page);
    await writeTasks(page, ['Pay the electricity bill']);
    const second = await twoDays(page);
    await writeTasks(page, ['Monday’s task'], second);
    await expect(dayList(page, 'Tasks for Monday 19 October').getByText('Monday’s task')).toBeVisible();
    await expect
      .poll(() => titlesOf(dayList(page, 'Tasks for Sunday 18 October')))
      .toEqual(['Pay the electricity bill']);
    const beside = await backlogBeside(page);
    await writeTasks(page, ['Some day'], beside);
    await writeTasks(page, ['Some other day'], beside);
    await expect.poll(() => titlesOf(besideList(page))).toEqual(['Some day', 'Some other day']);
  });

  test('NI-E06 keyboard: Enter on the line opens Quick Add; Esc closes it with nothing made and focus back on the line', async ({
    page,
  }) => {
    test.skip(test.info().project.name === 'phone', 'a keyboard on the desk and tablets');
    await signInFresh(page);
    await writeTasks(page, ['Pay the electricity bill']);
    const line = page.getByRole('button', { name: 'Write the next thing…' });
    await line.focus();
    await page.keyboard.press('Enter');
    const qa = quickAdd(page);
    await expect(qa.getByRole('textbox', { name: 'Task title' })).toBeFocused();
    await qa.getByRole('textbox', { name: 'Task title' }).fill('Not this one');
    await page.keyboard.press('Escape');
    await expect(qa).toHaveCount(0, { timeout: 5000 });
    await expect(line).toBeFocused();
    await expect.poll(() => titlesOf(dayList(page))).toEqual(['Pay the electricity bill']);
    await page.keyboard.press('Enter');
    await expect(qa.getByRole('textbox', { name: 'Task title' })).toBeFocused();
  });

  test('NI-E09 an empty day: New task opens Quick Add on that day, and no line sits under the empty state', async ({
    page,
  }) => {
    await signInFresh(page);
    await writeTasks(page, ['Sunday’s task']);
    await page.getByRole('button', { name: 'Next day' }).first().click();
    await expect(page.getByText('Nothing planned for Monday yet.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Write the next thing…' })).toHaveCount(0);
    await page.locator('.tp-empty').getByRole('button', { name: 'New task' }).click();
    await expect(quickAdd(page).getByRole('button', { name: 'Planned for: Tomorrow' })).toBeVisible();
    await addInQuickAdd(page, 'Monday’s task');
    await expect(dayList(page, 'Tasks for Monday 19 October').getByText('Monday’s task')).toBeVisible();
  });

  test('NI-E13 after Quick Add was open in another space, the line writes into the space you are in', async ({
    page,
  }) => {
    test.skip(test.info().project.name !== 'desktop', 'the same Quick Add on every size');
    await signInFresh(page);
    await createSpace(page, 'Northwind');
    // Open and close it once while Northwind is the space.
    await newTaskButton(page).click();
    await expect(quickAdd(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(quickAdd(page)).toHaveCount(0);
    await switchTo(page, 'Personal');
    await writeTasks(page, ['Tidy the buckets']);
    await idle(page);
    await page.reload();
    await expect(dayList(page).getByText('Tidy the buckets', { exact: true })).toBeVisible();
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
    await page.getByRole('group', { name: 'Days to show' }).getByRole('button', { name: '2 days' }).click();
    const monday = page.getByRole('region', { name: 'The second day' });
    await expect(monday.getByRole('heading', { name: 'Monday' })).toBeVisible();
    // wait for the second page to finish sliding out before aiming at it
    await expect(page.locator(SECOND_DAY_PAGE)).toHaveClass(/tp-on/);
    await expect(page.locator(SECOND_DAY_PAGE)).not.toHaveClass(/tp-moving/);
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

  test('C02-E09 the row’s ID copies the task’s link: it says so, the clipboard holds it, and the link opens the task', async ({
    page,
    context,
  }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await signInFresh(page);
    await writeTasks(page, ['Pay the electricity bill']);
    await idle(page);
    await page.getByRole('button', { name: 'Copy link to ME-1' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Link copied' })).toBeVisible();
    const link = await page.evaluate(() => navigator.clipboard.readText());
    expect(link).toBe(`${new URL(page.url()).origin}/t/ME-1`);
    await page.goto(link);
    await expect(page.getByRole('textbox', { name: 'Task title' })).toHaveValue('Pay the electricity bill');
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

const SUNDAY_TASKS = 'Tasks for Sunday 18 October';
const MONDAY_TASKS = 'Tasks for Monday 19 October';

/** Three tasks on Sunday, Monday beside it; "Call Sam at 3pm" (the middle row) held over Monday's list. */
async function holdOverMonday(page: Page) {
  await signInFresh(page);
  await writeTasks(page, THREE);
  await idle(page);
  const monday = await twoDays(page);
  const sunday = dayList(page, SUNDAY_TASKS);
  const moved = (await row(sunday, 'Call Sam at 3pm').getAttribute('data-key'))!;
  const below = (await row(sunday, 'Book car service').getAttribute('data-key'))!;
  const box = (await monday.locator('.tp-list').boundingBox())!;
  await carry(page, row(sunday, 'Call Sam at 3pm'), { x: box.x + 120, y: box.y + 8 });
  await expect(monday.locator('.tp-list')).toHaveClass(/tp-drop-on/);
  return {
    monday,
    selectors: {
      card: '.tp-drag-ghost',
      row: `[aria-label="${MONDAY_TASKS}"] [data-reorder][data-key="${moved}"]`,
      below: `[aria-label="${SUNDAY_TASKS}"] [data-reorder][data-key="${below}"]`,
    },
  };
}

async function expectMoved(page: Page) {
  await expect.poll(() => titlesOf(dayList(page, MONDAY_TASKS))).toEqual(['Call Sam at 3pm']);
  await expect
    .poll(() => titlesOf(dayList(page, SUNDAY_TASKS)))
    .toEqual(['Pay the electricity bill', 'Book car service']);
}

test.describe('today, a drop on the other day', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!['desktop', 'webkit'].includes(test.info().project.name), 'two days side by side is the desk');
    await fixClock(page);
  });

  test.describe('with motion', () => {
    // The rest of the suite runs with reduced motion; these are about what moves after the drop, and how.
    test.use({ contextOptions: { reducedMotion: 'no-preference' } });

    test('C02-E15 two days: let go over tomorrow and the card glides onto its new row while the row under the gap glides up; the server agrees', async ({
      page,
    }) => {
      const { monday, selectors } = await holdOverMonday(page);
      const frames = await sampleBoxes(page, selectors, () => page.mouse.up());
      expectLands(frames);
      // "Book car service" closes the gap over several frames, never in one jump
      expectGlides(frames.map((f) => f.below!.y));
      // nothing is left behind: the wash and the ink line are gone, no row keeps a style from the move
      await expect(monday.locator('.tp-list')).not.toHaveClass(/tp-drop-on|tp-drop-off/);
      await expect(monday.locator('.tp-drop-line')).toHaveCount(0);
      await expect(
        page.locator('[data-reorder][style*="margin"], [data-reorder][style*="visibility"]'),
      ).toHaveCount(0);
      await expectMoved(page);
      await idle(page);
      await page.reload();
      await expectMoved(page);
    });

    // 1024 is the narrowest desk: the day header is at its tightest there
    for (const width of [1440, 1024]) {
      test(`C02-E17 a day that gets its first task by a drop: the top of its list stays where it was (${width} wide)`, async ({
        page,
      }) => {
        await page.setViewportSize({ width, height: 900 });
        const { monday } = await holdOverMonday(page);
        const list = monday.locator('.tp-list');
        const before = (await list.boundingBox())!.y;
        const tops: number[] = [];
        await page.mouse.up();
        for (let i = 0; i < 12; i++) {
          tops.push((await list.boundingBox())!.y);
          await page.waitForTimeout(50);
        }
        await expectMoved(page);
        expect(
          tops.every((y) => Math.abs(y - before) < 1),
          `the list's top, 50ms apart: ${tops.map(Math.round).join(' ')} (was ${Math.round(before)})`,
        ).toBe(true);
      });
    }
  });

  test('C02-E16 reduced motion: the same drop has no glide, the task is on tomorrow at once', async ({
    page,
  }) => {
    const { selectors } = await holdOverMonday(page);
    const frames = await sampleBoxes(page, selectors, () => page.mouse.up(), 500);
    const landed = frames.filter((f) => f.row);
    expect(landed.length).toBeGreaterThan(0);
    // once the row is on Monday there is no lifted copy and the row is painted
    expect(landed.every((f) => !f.card && !f.row!.hidden)).toBe(true);
    // the row under the gap is in one place before and one after, nowhere in between
    const ys = new Set(frames.map((f) => Math.round(f.below!.y)));
    expect(ys.size, `places: ${[...ys].join(' ')}`).toBeLessThanOrEqual(2);
    await expectMoved(page);
  });
});

test.describe('today, due today', () => {
  test('C02-E43 "Due today" is amber and "Overdue" is red, in light and in dark (#121)', async ({ page }) => {
    test.skip(test.info().project.name !== 'desktop', 'a colour is the same at every size');
    await fixClock(page);
    await signInFresh(page);
    const me = (await (await page.request.get(`${API_URL}/api/me`)).json()) as {
      spaces: Array<{ id: string; kind: string }>;
    };
    const space = me.spaces.find((s) => s.kind === 'personal')!.id;
    const ids = { today: crypto.randomUUID(), late: crypto.randomUUID(), later: crypto.randomUUID() };
    let at = Date.parse('2026-10-18T08:00:00.000Z');
    const stamp = () => new Date((at += 1000)).toISOString();
    const make = (id: string, title: string, due: string, position: number) => [
      {
        id: crypto.randomUUID(),
        type: 'task.create',
        payload: { id, spaceId: space, title, day: '2026-10-18', position },
        at: stamp(),
      },
      { id: crypto.randomUUID(), type: 'task.due', payload: { id, due }, at: stamp() },
    ];
    const res = await page.request.post(`${API_URL}/api/sync`, {
      data: {
        clientId: 'seed',
        mutations: [
          ...make(ids.today, 'Call the bank', '2026-10-18', 1024),
          ...make(ids.late, 'Renew the passport', '2026-10-16', 2048),
          ...make(ids.later, 'Book the dentist', '2026-10-23', 3072),
        ],
      },
    });
    expect(res.status()).toBe(200);

    const check = async () => {
      const due = (title: string) => row(dayList(page), title).locator('.tp-sg-due');
      await expect(due('Call the bank')).toHaveText('Due today');
      await expect(due('Call the bank')).toHaveClass(/tp-dt/);
      await expect(due('Call the bank')).not.toHaveClass(/tp-od/);
      await expect(due('Renew the passport')).toHaveText('Overdue since Fri');
      await expect(due('Renew the passport')).toHaveClass(/tp-od/);
      await expect(due('Book the dentist')).toHaveText('Due Fri');
      /** A theme colour as the browser computes it, from a probe inside the app's root. */
      const ink = (name: string) =>
        page.evaluate((v) => {
          const probe = document.createElement('span');
          probe.style.color = `var(${v})`;
          document.querySelector('.tp-root')!.appendChild(probe);
          const c = getComputedStyle(probe).color;
          probe.remove();
          return c;
        }, name);
      const color = (title: string) => due(title).evaluate((el) => getComputedStyle(el).color);
      const [warning, destructive, muted] = [
        await ink('--warning'),
        await ink('--destructive'),
        await ink('--muted-foreground'),
      ];
      expect(new Set([warning, destructive, muted]).size).toBe(3);
      await expect.poll(() => color('Call the bank')).toBe(warning);
      await expect.poll(() => color('Renew the passport')).toBe(destructive);
      await expect.poll(() => color('Book the dentist')).toBe(muted);
      return warning;
    };
    await page.reload();
    await expect(page.locator('html')).not.toHaveClass(/dark/);
    const light = await check();
    await page.evaluate(() => localStorage.setItem('tudu.theme', 'dark'));
    await page.reload();
    await expect(page.locator('html')).toHaveClass(/dark/);
    const dark = await check();
    expect(dark).not.toBe(light);
  });
});
