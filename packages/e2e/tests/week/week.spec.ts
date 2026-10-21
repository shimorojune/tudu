import type { Locator, Page } from '@playwright/test';
import { API_URL, expect, signInFresh, test } from '../../fixtures/app';
import { dayList, drag, fixClock, idle, ring, row, rowsOf, titlesOf, writeTasks } from '../../fixtures/today';
import {
  WEDNESDAY,
  backlogList,
  dragAcross,
  dropPoint,
  goWeek,
  openDay,
  tile,
  tileCount,
  tileList,
  weekEyebrow,
} from '../../fixtures/week';

const THREE = ['Pay the electricity bill', 'Call Sam at 3pm', 'Book car service'];
const SUNDAY_TILE = 'Today, Sunday 18 October';
const SUNDAY_LIST = 'Sunday 18 October';

const phone = () => test.info().project.name === 'phone';
const desktop = () => test.info().project.name === 'desktop';

function bar(page: Page): Locator {
  return page.getByRole('dialog', { name: 'Quick Add' });
}

/** Open Quick Add, write a title, change what `more` says, add. */
async function quickAdd(page: Page, title: string, more?: (b: Locator) => Promise<void>): Promise<void> {
  await page.getByRole('button', { name: 'New task' }).first().click();
  const b = bar(page);
  const field = b.getByRole('textbox', { name: 'Task title' });
  await expect(field).toBeFocused();
  await field.fill(title);
  if (more) await more(b);
  await b.getByRole('button', { name: /^Add( task)?$/ }).click();
  await expect(bar(page)).toHaveCount(0, { timeout: 5000 });
}

/** The words of an empty day, wherever they show: the folded preview or the open body. */
function nothing(page: Page, name: string | RegExp, words: string): Locator {
  return tile(page, name).getByText(words).filter({ visible: true }).first();
}

async function serverDay(page: Page, day: string | null): Promise<string[]> {
  const me = (await (await page.request.get(`${API_URL}/api/me`)).json()) as {
    spaces: Array<{ id: string }>;
  };
  const path = day ? `days/${day}` : 'backlog';
  const res = (await (
    await page.request.get(`${API_URL}/api/spaces/${me.spaces[0]!.id}/${path}`)
  ).json()) as {
    tasks: Array<{ title: string }>;
  };
  return res.tasks.map((t) => t.title);
}

test.describe('week', () => {
  test.beforeEach(async ({ page }) => {
    await fixClock(page);
  });

  test('C05-E01 the week: seven tiles and the Backlog, today marked, the heading, and today’s tasks in its tile', async ({
    page,
  }) => {
    await signInFresh(page);
    await writeTasks(page, THREE);
    await goWeek(page);
    await expect(weekEyebrow(page)).toHaveText(phone() ? 'This week' : 'This week · Week 42');
    const head = page.getByRole('region', { name: 'The week' });
    await expect(head.getByRole('heading', { name: '12 – 18' })).toBeVisible();
    await expect(head.locator('.tp-dh-date')).toHaveText('October');
    for (const name of [
      'Monday 12 October',
      'Tuesday 13 October',
      'Wednesday 14 October',
      'Thursday 15 October',
      'Friday 16 October',
      'Saturday 17 October',
      SUNDAY_TILE,
      'Backlog',
    ])
      await expect(tile(page, name)).toBeVisible();
    const today = tile(page, SUNDAY_TILE);
    await expect(today).toHaveClass(/tp-wd-today/);
    await expect(today.locator('.tp-wd-eb')).toHaveText('Today');
    await expect(today.locator('.tp-wd-day')).toHaveText('Sunday');
    await expect(today.locator('.tp-wd-date')).toHaveText('18 Oct');
    await expect(tileCount(page, SUNDAY_TILE)).toHaveText('3 tasks');
    await expect.poll(() => titlesOf(tileList(page, SUNDAY_LIST))).toEqual(THREE);
    // brief rows: no ID in the byline
    await expect(rowsOf(tileList(page, SUNDAY_LIST)).locator('.tp-sg-id')).toHaveCount(0);
    await expect(tile(page, 'Saturday 17 October')).toHaveClass(/tp-wd-past/);
    await expect(nothing(page, 'Saturday 17 October', 'Nothing planned')).toBeVisible();
    await expect(tile(page, 'Backlog')).toHaveClass(/tp-wd-quiet/);
    await expect(nothing(page, 'Backlog', 'Nothing waiting')).toBeVisible();
    await expect(ring(page, '0 of 3 crossed off')).toBeVisible();
  });

  test('C05-E02 drag a task from today to Thursday: it is in Thursday’s tile, both counts follow, and it stays there', async ({
    page,
  }) => {
    test.skip(!desktop(), 'tiles side by side are the desk');
    await fixClock(page, WEDNESDAY);
    await signInFresh(page);
    await writeTasks(page, THREE);
    await page.getByRole('textbox', { name: 'New task' }).press('Escape');
    await goWeek(page);
    const wed = 'Today, Wednesday 14 October';
    await expect(tileCount(page, wed)).toHaveText('3 tasks');
    // straight sideways, no vertical move first
    await dragAcross(
      page,
      row(tileList(page, 'Wednesday 14 October'), 'Call Sam at 3pm'),
      await dropPoint(page, 'Thursday 15 October'),
    );
    await expect.poll(() => titlesOf(tileList(page, 'Thursday 15 October'))).toEqual(['Call Sam at 3pm']);
    await expect
      .poll(() => titlesOf(tileList(page, 'Wednesday 14 October')))
      .toEqual(['Pay the electricity bill', 'Book car service']);
    await expect(tileCount(page, wed)).toHaveText('2 tasks');
    await expect(tileCount(page, 'Thursday 15 October')).toHaveText('1 task');
    await expect(ring(page, '0 of 3 crossed off')).toBeVisible();
    await idle(page);
    await page.reload();
    await expect.poll(() => titlesOf(tileList(page, 'Thursday 15 October'))).toEqual(['Call Sam at 3pm']);
    expect(await serverDay(page, '2026-10-15')).toEqual(['Call Sam at 3pm']);
    // Today's sheet agrees
    await page.getByRole('button', { name: 'Today', exact: true }).first().click();
    await expect
      .poll(() => titlesOf(dayList(page, 'Tasks for Wednesday 14 October')))
      .toEqual(['Pay the electricity bill', 'Book car service']);
  });

  test('C05-E03 drag from the Backlog onto a day, and from a day into the Backlog; both survive a reload', async ({
    page,
  }) => {
    test.skip(!desktop(), 'dragging between tiles is the desk');
    await signInFresh(page);
    await writeTasks(page, ['Pay the electricity bill', 'Book car service']);
    await page.getByRole('textbox', { name: 'New task' }).press('Escape');
    await quickAdd(page, 'Renew passport', async (b) => {
      await b.getByRole('button', { name: 'Planned for: Today' }).click();
      await b.locator('.tp-qa-pop').getByRole('button', { name: 'Backlog' }).click();
    });
    await goWeek(page);
    await expect.poll(() => titlesOf(backlogList(page))).toEqual(['Renew passport']);
    await expect(tileCount(page, 'Backlog')).toHaveText('1 task');
    await drag(page, row(backlogList(page), 'Renew passport'), await dropPoint(page, SUNDAY_TILE));
    await expect
      .poll(() => titlesOf(tileList(page, SUNDAY_LIST)))
      .toEqual(['Pay the electricity bill', 'Book car service', 'Renew passport']);
    await expect(nothing(page, 'Backlog', 'Nothing waiting')).toBeVisible();
    await drag(page, row(tileList(page, SUNDAY_LIST), 'Book car service'), await dropPoint(page, 'Backlog'));
    await expect.poll(() => titlesOf(backlogList(page))).toEqual(['Book car service']);
    await expect
      .poll(() => titlesOf(tileList(page, SUNDAY_LIST)))
      .toEqual(['Pay the electricity bill', 'Renew passport']);
    await idle(page);
    await page.reload();
    await expect.poll(() => titlesOf(backlogList(page))).toEqual(['Book car service']);
    await expect
      .poll(() => titlesOf(tileList(page, SUNDAY_LIST)))
      .toEqual(['Pay the electricity bill', 'Renew passport']);
    expect(await serverDay(page, null)).toEqual(['Book car service']);
  });

  test('C05-E04 cross off in a tile: the strike, the tile’s count and the week ring follow; uncross it', async ({
    page,
  }) => {
    await signInFresh(page);
    await writeTasks(page, THREE);
    await goWeek(page);
    await page.getByRole('checkbox', { name: 'Cross off: Call Sam at 3pm' }).click();
    await expect(row(tileList(page, SUNDAY_LIST), 'Call Sam at 3pm').locator('.tp-row')).toHaveClass(
      /tp-done/,
    );
    await expect(tileCount(page, SUNDAY_TILE)).toHaveText('1 of 3');
    await expect(ring(page, '1 of 3 crossed off')).toBeVisible();
    await idle(page);
    await page.getByRole('checkbox', { name: 'Cross off: Call Sam at 3pm' }).click();
    await expect(tileCount(page, SUNDAY_TILE)).toHaveText('3 tasks');
    await expect(ring(page, '0 of 3 crossed off')).toBeVisible();
    await idle(page);
    await page.reload();
    await expect(page.getByRole('checkbox', { name: 'Cross off: Call Sam at 3pm' })).toHaveAttribute(
      'aria-checked',
      'false',
    );
  });

  test('C05-E05 turn the week with the arrows; Back to this week returns', async ({ page }) => {
    await signInFresh(page);
    await goWeek(page);
    await page.getByRole('button', { name: 'Next week' }).click();
    await expect(weekEyebrow(page)).toHaveText(phone() ? 'Next week' : 'Next week · Week 43');
    await expect(page.getByRole('heading', { name: '19 – 25' })).toBeVisible();
    await expect(tile(page, 'Monday 19 October')).toBeVisible();
    await expect(tile(page, 'Sunday 25 October')).toBeVisible();
    await expect(tile(page, SUNDAY_TILE)).toHaveCount(0);
    await page.getByRole('button', { name: 'Next week' }).click();
    await expect(weekEyebrow(page)).toHaveText(phone() ? 'In 2 weeks' : 'In 2 weeks · Week 44');
    await expect(page.getByRole('heading', { name: '26 Oct – 1 Nov' })).toBeVisible();
    const back = page.getByRole('button', { name: 'Back to this week' });
    await expect(back).toBeVisible();
    await back.click();
    await expect(weekEyebrow(page)).toHaveText(phone() ? 'This week' : 'This week · Week 42');
    await expect(tile(page, SUNDAY_TILE)).toBeVisible();
    await page.getByRole('button', { name: 'Previous week' }).click();
    await expect(weekEyebrow(page)).toHaveText(phone() ? 'Last week' : 'Last week · Week 41');
  });

  test('C05-E06 pick a week from the picker: dots on days with tasks, the chosen week’s tiles, This week returns', async ({
    page,
  }) => {
    await signInFresh(page);
    await writeTasks(page, ['Pay the electricity bill']);
    await goWeek(page);
    await page.getByRole('button', { name: 'Pick a week. Showing 12 – 18 October' }).click();
    const picker = page.getByRole('group', { name: 'Pick a week' });
    await expect(picker).toBeVisible();
    const thisWeek = picker.getByRole('button', { name: 'Week 42, 12 – 18 October' });
    await expect(thisWeek).toHaveAttribute('aria-pressed', 'true');
    await expect(thisWeek.locator('.tp-wkp-d.tp-today i')).toHaveCount(1);
    await expect(picker.getByRole('button', { name: 'Week 43, 19 – 25 October' }).locator('i')).toHaveCount(
      0,
    );
    await picker.getByRole('button', { name: 'Week 43, 19 – 25 October' }).click();
    await expect(picker).toHaveCount(0);
    await expect(weekEyebrow(page)).toHaveText(phone() ? 'Next week' : 'Next week · Week 43');
    await expect(tile(page, 'Monday 19 October')).toBeVisible();
    await page.getByRole('button', { name: 'Pick a week. Showing 19 – 25 October' }).click();
    await page.getByRole('group', { name: 'Pick a week' }).getByRole('button', { name: 'This week' }).click();
    await expect(weekEyebrow(page)).toHaveText(phone() ? 'This week' : 'This week · Week 42');
    await expect(tile(page, SUNDAY_TILE)).toBeVisible();
  });

  test('C05-E07 open a task from a tile: the panel, prev and next walk the tile; move it to the Backlog from Planned', async ({
    page,
  }) => {
    await signInFresh(page);
    await writeTasks(page, THREE);
    await goWeek(page);
    await idle(page);
    await row(tileList(page, SUNDAY_LIST), 'Call Sam at 3pm').locator('.tp-strike').click();
    const p = page.getByRole('dialog', { name: 'Task details' });
    await expect(p.getByRole('textbox', { name: 'Task title' })).toHaveValue('Call Sam at 3pm');
    await expect(page).toHaveURL(/\/week\?task=ME-2$/);
    if (phone()) await expect(p.locator('.tp-td-back')).toHaveText('Week');
    await p.getByRole('button', { name: 'Next task' }).click();
    await expect(p.getByRole('textbox', { name: 'Task title' })).toHaveValue('Book car service');
    await expect(p.getByRole('button', { name: 'Next task' })).toHaveCount(0);
    await p.getByRole('button', { name: 'Previous task' }).click();
    await p.getByRole('button', { name: 'Previous task' }).click();
    await expect(p.getByRole('textbox', { name: 'Task title' })).toHaveValue('Pay the electricity bill');
    await expect(p.getByRole('button', { name: 'Previous task' })).toHaveCount(0);
    await p.getByRole('button', { name: 'Planned', exact: true }).click();
    await p.locator('.tp-td-pop').getByRole('button', { name: 'Move to the Backlog' }).click();
    await expect(page.locator('.tp-toast')).toHaveText(/Moved to the Backlog/);
    // and the toast goes on its own (the app runs in StrictMode, which once kept it)
    await expect(page.locator('.tp-toast')).toHaveCount(0, { timeout: 5000 });
    await expect
      .poll(() => titlesOf(tileList(page, SUNDAY_LIST)))
      .toEqual(['Call Sam at 3pm', 'Book car service']);
    await expect.poll(() => titlesOf(backlogList(page))).toEqual(['Pay the electricity bill']);
    await expect(tileCount(page, 'Backlog')).toHaveText('1 task');
    if (phone()) await expect(p.locator('.tp-td-back')).toHaveText('Backlog');
    if (phone()) await p.locator('.tp-td-back').click();
    else await p.getByRole('button', { name: 'Close' }).click();
    await expect(page).toHaveURL(/\/week$/);
    // a reload with the task in the address opens it again
    await page.goto('/week?task=ME-1');
    await expect(
      page.getByRole('dialog', { name: 'Task details' }).getByRole('textbox', { name: 'Task title' }),
    ).toHaveValue('Pay the electricity bill');
  });

  test('C05-E08 New task on next week lands on its Monday and washes in that tile', async ({ page }) => {
    await signInFresh(page);
    await goWeek(page);
    await page.getByRole('button', { name: 'Next week' }).click();
    await expect(tile(page, 'Monday 19 October')).toBeVisible();
    await quickAdd(page, 'Meera’s demo', async (b) => {
      // Monday 19 October is tomorrow, so the chip says so
      await expect(b.getByRole('button', { name: 'Planned for: Tomorrow' })).toBeVisible();
      if (!phone()) await expect(b.locator('.tp-qa-lands')).toHaveText('Lands on Tomorrow');
    });
    const monday = tileList(page, 'Monday 19 October');
    await expect.poll(() => titlesOf(monday)).toEqual(['Meera’s demo']);
    await expect(row(monday, 'Meera’s demo')).toHaveClass(/tp-new/);
    await expect(page.locator('.tp-toast')).toHaveCount(0);
    await expect(tileCount(page, 'Monday 19 October')).toHaveText('1 task');
    // from this week, a task for a day outside it says so, and Show turns the week to it
    await page.getByRole('button', { name: 'Back to this week' }).click();
    await quickAdd(page, 'Dentist at 4pm', async (b) => {
      await b.getByRole('button', { name: 'Planned for: Today' }).click();
      await b.locator('.tp-qa-pop').getByRole('button', { name: 'Tomorrow' }).click();
    });
    await expect(page.locator('.tp-toast')).toHaveText('Added to TomorrowShow');
    await page.getByRole('button', { name: 'Show', exact: true }).click();
    await expect(weekEyebrow(page)).toHaveText(phone() ? 'Next week' : 'Next week · Week 43');
    await expect
      .poll(() => titlesOf(tileList(page, 'Monday 19 October')))
      .toEqual(['Meera’s demo', 'Dentist at 4pm']);
    await idle(page);
    expect(await serverDay(page, '2026-10-19')).toEqual(['Meera’s demo', 'Dentist at 4pm']);
  });

  test('C05-E09 tablet: days fold; today is open, others shut with a preview; a day you open stays open; the Backlog folds', async ({
    page,
  }) => {
    test.skip(
      test.info().project.name !== 'tablet',
      'the folding days are tablets and phones; the phone has its own case',
    );
    await signInFresh(page);
    await writeTasks(page, THREE);
    await page.getByRole('checkbox', { name: 'Cross off: Book car service' }).click();
    await goWeek(page);
    const today = tile(page, SUNDAY_TILE);
    await expect(today.getByRole('button', { expanded: true })).toBeVisible();
    await expect.poll(() => titlesOf(tileList(page, SUNDAY_LIST))).toEqual(THREE);
    const sat = tile(page, 'Saturday 17 October');
    const satHead = sat.getByRole('button', { expanded: false });
    await expect(satHead).toBeVisible();
    await expect(sat.locator('.tp-wd-peek')).toHaveText('Nothing planned');
    await expect(sat.locator('.tp-wd-fold')).toHaveAttribute('inert', '');
    // the preview of a day with tasks: its open ones on one line
    await today.getByRole('button', { expanded: true }).click();
    await expect(today.locator('.tp-wd-peek')).toHaveText('Pay the electricity bill · Call Sam at 3pm');
    await expect(today.getByRole('button', { expanded: false })).toBeVisible();
    await today.getByRole('button', { expanded: false }).click();
    await satHead.click();
    await expect(sat.getByRole('button', { expanded: true })).toBeVisible();
    await expect(sat.locator('.tp-wd-fold')).not.toHaveAttribute('inert', '');
    await expect(sat.locator('.tp-wd-none')).toBeVisible();
    await page.reload();
    await expect(tile(page, 'Saturday 17 October').getByRole('button', { expanded: true })).toBeVisible();
    await expect(tile(page, SUNDAY_TILE).getByRole('button', { expanded: true })).toBeVisible();
    await expect(tile(page, 'Friday 16 October').getByRole('button', { expanded: false })).toBeVisible();
    const backlog = tile(page, 'Backlog');
    await expect(backlog.getByRole('button', { expanded: false })).toBeVisible();
    await expect(backlog.locator('.tp-wd-peek')).toHaveText('Nothing waiting');
    await backlog.getByRole('button', { expanded: false }).click();
    await expect(backlog.getByRole('button', { expanded: true })).toBeVisible();
  });

  test('C05-E10 phone: the compact header; open a day; plan a Backlog task for today; the round button adds to today', async ({
    page,
  }) => {
    test.skip(!phone(), 'the phone’s week');
    await signInFresh(page);
    await writeTasks(page, ['Pay the electricity bill']);
    await quickAdd(page, 'Renew passport', async (b) => {
      await b.getByRole('button', { name: 'Planned for: Today' }).click();
      await b.locator('.tp-qa-pop').getByRole('button', { name: 'Backlog' }).click();
    });
    await goWeek(page);
    await expect(weekEyebrow(page)).toHaveText('This week');
    await expect(page.getByRole('region', { name: 'The week' }).locator('.tp-dh')).toHaveClass(/tp-compact/);
    await expect(tile(page, SUNDAY_TILE).getByRole('button', { expanded: true })).toBeVisible();
    await expect(tile(page, 'Thursday 15 October').getByRole('button', { expanded: false })).toBeVisible();
    await openDay(page, 'Thursday 15 October');
    await expect(tile(page, 'Thursday 15 October').locator('.tp-wd-none')).toBeVisible();
    await openDay(page, 'Backlog');
    await expect.poll(() => titlesOf(backlogList(page))).toEqual(['Renew passport']);
    await page.getByRole('button', { name: 'Plan it for a day: Renew passport' }).click();
    await page
      .getByRole('dialog', { name: 'Plan it for a day' })
      .getByRole('button', { name: 'Today' })
      .click();
    await expect(page.locator('.tp-toast')).toHaveText(/Moved to Today/);
    await expect
      .poll(() => titlesOf(tileList(page, SUNDAY_LIST)))
      .toEqual(['Pay the electricity bill', 'Renew passport']);
    await expect(tile(page, 'Backlog').locator('.tp-wd-none')).toHaveText('Nothing waiting');
    await quickAdd(page, 'Call Sam at 3pm');
    await expect
      .poll(() => titlesOf(tileList(page, SUNDAY_LIST)))
      .toEqual(['Pay the electricity bill', 'Renew passport', 'Call Sam at 3pm']);
    await expect(row(tileList(page, SUNDAY_LIST), 'Call Sam at 3pm')).toHaveClass(/tp-new/);
  });

  test('C05-E11 live: a task added and a move made in a second tab show in the first week without a reload', async ({
    page,
    context,
  }) => {
    await signInFresh(page);
    await writeTasks(page, ['From the first tab']);
    await goWeek(page);
    await idle(page);
    const second = await context.newPage();
    await second.goto('/');
    await writeTasks(second, ['From the second tab']);
    await expect
      .poll(() => titlesOf(tileList(page, SUNDAY_LIST)), { timeout: 10_000 })
      .toEqual(['From the first tab', 'From the second tab']);
    await expect(tileCount(page, SUNDAY_TILE)).toHaveText('2 tasks');
    // moved to the Backlog over there: both tiles here follow
    await second.getByRole('textbox', { name: 'New task' }).press('Escape');
    await row(dayList(second, 'Tasks for Sunday 18 October'), 'From the first tab')
      .locator('.tp-strike')
      .click();
    const p = second.getByRole('dialog', { name: 'Task details' });
    await p.getByRole('button', { name: 'Planned', exact: true }).click();
    await p.locator('.tp-td-pop').getByRole('button', { name: 'Move to the Backlog' }).click();
    await expect.poll(() => titlesOf(backlogList(page)), { timeout: 10_000 }).toEqual(['From the first tab']);
    await expect.poll(() => titlesOf(tileList(page, SUNDAY_LIST))).toEqual(['From the second tab']);
    await second.close();
  });

  test('C05-E12 offline: cross off and move in the week; the banner shows; the server has both when back', async ({
    page,
    context,
  }) => {
    await signInFresh(page);
    await writeTasks(page, THREE);
    await goWeek(page);
    await idle(page);
    await context.setOffline(true);
    await expect(page.getByText('You’re offline.')).toBeVisible();
    await page.getByRole('checkbox', { name: 'Cross off: Call Sam at 3pm' }).click();
    await expect(tileCount(page, SUNDAY_TILE)).toHaveText('1 of 3');
    if (desktop()) {
      await drag(
        page,
        row(tileList(page, SUNDAY_LIST), 'Book car service'),
        await dropPoint(page, 'Backlog'),
      );
      await expect.poll(() => titlesOf(backlogList(page))).toEqual(['Book car service']);
    }
    await context.setOffline(false);
    await expect(page.getByText('You’re offline.')).toHaveCount(0);
    await idle(page);
    // nothing was refused, and the lists still show the changes once the server has answered
    await expect(page.locator('.tp-toast')).toHaveCount(0);
    await expect(tileCount(page, SUNDAY_TILE)).toHaveText(desktop() ? '1 of 2' : '1 of 3');
    await expect
      .poll(() => serverDay(page, '2026-10-18'))
      .toEqual(desktop() ? ['Pay the electricity bill', 'Call Sam at 3pm'] : THREE);
    if (desktop()) await expect.poll(() => serverDay(page, null)).toEqual(['Book car service']);
  });

  test('C05-E13 a slow week shows the tiles with skeleton rows; a failed week says so and Try again recovers', async ({
    page,
  }) => {
    await signInFresh(page);
    let release!: () => void;
    const held = new Promise<void>((r) => (release = r));
    await page.route('**/api/spaces/*/weeks/*', async (route) => {
      await held;
      await route.continue();
    });
    await page
      .getByRole('button', { name: /^Week(,|$)/ })
      .first()
      .click();
    await expect(tile(page, SUNDAY_TILE)).toBeVisible();
    await expect(tile(page, SUNDAY_TILE).locator('.tp-wd-day')).toHaveText('Sunday');
    await expect(page.locator('[aria-label="Loading tasks"]').first()).toBeAttached();
    // today's list is known from the day page already; the six other days and the Backlog wait
    expect(await page.locator('[aria-label="Loading tasks"]').count()).toBeGreaterThanOrEqual(
      desktop() ? 7 : 1,
    );
    release();
    await expect(page.locator('[aria-label="Loading tasks"]')).toHaveCount(0);
    await page.unroute('**/api/spaces/*/weeks/*');
    // a failed week
    await page.route('**/api/spaces/*/weeks/*', (route) => route.abort());
    await page.reload();
    await expect(page.getByText('Couldn’t load this week.')).toBeVisible();
    await expect(
      page.getByText('Check your connection. Anything you already see stays as it is.'),
    ).toBeVisible();
    await page.unroute('**/api/spaces/*/weeks/*');
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(page.getByText('Couldn’t load this week.')).toHaveCount(0);
    await expect(tile(page, SUNDAY_TILE)).toBeVisible();
    await expect(tile(page, 'Backlog')).toBeVisible();
  });

  test('C05-E14 a past day keeps what was crossed off there and refuses a drop; a very full day scrolls inside its tile', async ({
    page,
  }) => {
    test.skip(!desktop(), 'dragging between tiles is the desk');
    await signInFresh(page);
    const twelve = Array.from({ length: 12 }, (_, i) => `Task number ${i + 1}`);
    await writeTasks(page, twelve);
    await page.getByRole('textbox', { name: 'New task' }).press('Escape');
    // yesterday: one task, crossed off there
    await page.getByRole('button', { name: 'Previous day' }).first().click();
    await expect(page.getByText('Yesterday · Week 42')).toBeVisible();
    await writeTasks(page, ['Water the plants']);
    await page.getByRole('textbox', { name: 'New task' }).press('Escape');
    await page.getByRole('checkbox', { name: 'Cross off: Water the plants' }).click();
    await idle(page);
    await goWeek(page);
    const sat = tile(page, 'Saturday 17 October');
    await expect(sat).toHaveClass(/tp-wd-past/);
    await expect.poll(() => titlesOf(tileList(page, 'Saturday 17 October'))).toEqual(['Water the plants']);
    await expect(tileCount(page, 'Saturday 17 October')).toHaveText('1 of 1');
    await expect(tileCount(page, SUNDAY_TILE)).toHaveText('12 tasks');
    // the drop is refused: no tint while over it, nothing moves
    const target = sat.locator('.tp-list');
    const box = (await target.boundingBox())!;
    const from = row(tileList(page, SUNDAY_LIST), 'Task number 1');
    const fb = (await from.boundingBox())!;
    await page.mouse.move(fb.x + 100, fb.y + fb.height / 2);
    await page.mouse.down();
    await page.mouse.move(fb.x + 100, fb.y + fb.height / 2 + 8, { steps: 2 });
    await page.mouse.move(box.x + 100, box.y + box.height - 4, { steps: 12 });
    await expect(target).not.toHaveClass(/tp-drop-on/);
    await page.mouse.up();
    await expect.poll(() => titlesOf(tileList(page, 'Saturday 17 October'))).toEqual(['Water the plants']);
    await expect(rowsOf(tileList(page, SUNDAY_LIST))).toHaveCount(12);
    // twelve tasks: the tile's body scrolls, the tile keeps its height
    const body = tile(page, SUNDAY_TILE).locator('.tp-wd-body');
    expect(await body.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
    const tiles = page.locator('.tp-wk-tiles .tp-wd-tile');
    const heights = await tiles.evaluateAll((els) =>
      els.map((e) => Math.round(e.getBoundingClientRect().height)),
    );
    expect(Math.max(...heights) - Math.min(...heights)).toBeLessThanOrEqual(1);
  });

  test('C05-E15 dark: the week, a cross off and a drag in the dark theme', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await signInFresh(page);
    await expect(page.locator('html')).toHaveClass(/dark/);
    await writeTasks(page, THREE);
    await page.getByRole('textbox', { name: 'New task' }).press('Escape');
    await goWeek(page);
    await expect(weekEyebrow(page)).toHaveText(phone() ? 'This week' : 'This week · Week 42');
    await expect.poll(() => titlesOf(tileList(page, SUNDAY_LIST))).toEqual(THREE);
    await page.getByRole('checkbox', { name: 'Cross off: Call Sam at 3pm' }).click();
    await expect(tileCount(page, SUNDAY_TILE)).toHaveText('1 of 3');
    if (desktop()) {
      await drag(
        page,
        row(tileList(page, SUNDAY_LIST), 'Book car service'),
        await dropPoint(page, 'Backlog'),
      );
      await expect.poll(() => titlesOf(backlogList(page))).toEqual(['Book car service']);
    }
    await idle(page);
    await page.reload();
    await expect(page.getByRole('checkbox', { name: 'Cross off: Call Sam at 3pm' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });
});
