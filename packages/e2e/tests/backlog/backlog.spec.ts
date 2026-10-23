import type { Locator, Page } from '@playwright/test';
import { API_URL, expect, signInFresh, test } from '../../fixtures/app';
import {
  backlogCount,
  doneList,
  filterChip,
  goBacklog,
  serverBacklog,
  sheet,
  todoList,
  turnTo,
  writeBacklog,
} from '../../fixtures/backlog';
import { dayList, drag, fixClock, idle, row, rowsOf, titlesOf, writeTasks } from '../../fixtures/today';

const THREE = ['Renew passport', 'Clean up the old staging buckets', 'Draft the Q4 hiring plan'];

const phone = () => test.info().project.name === 'phone';
const tablet = () => test.info().project.name === 'tablet';
const desktop = () => test.info().project.name === 'desktop';

function bar(page: Page): Locator {
  return page.getByRole('dialog', { name: 'Quick Add' });
}

function panel(page: Page): Locator {
  return page.getByRole('dialog', { name: 'Task details' });
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

/** Give the task in Quick Add a new project by name. */
async function withNewProject(b: Locator, name: string): Promise<void> {
  await b.getByRole('button', { name: 'Choose a project' }).click();
  await b.locator('.tp-qa-pop').getByRole('menuitem', { name: 'New project…' }).click();
  await b.getByRole('textbox', { name: 'Project name' }).fill(name);
  await b.getByRole('textbox', { name: 'Project name' }).press('Enter');
  await expect(b.getByRole('button', { name: `Project: ${name}` })).toBeVisible();
}

/** Three undated tasks, written from Today through Quick Add, then the Backlog open. */
async function backlogWithThree(page: Page): Promise<void> {
  await signInFresh(page);
  await goBacklog(page);
  await quickAdd(page, THREE[0]!);
  await writeBacklog(page, THREE.slice(1));
  await page.getByRole('textbox', { name: 'New task' }).press('Escape');
  await expect.poll(() => titlesOf(todoList(page))).toEqual(THREE);
}

async function serverTaskDay(page: Page, ref: string): Promise<string | null> {
  const r = (await (await page.request.get(`${API_URL}/api/tasks/ref/${ref}`)).json()) as {
    day: string | null;
  };
  return r.day;
}

test.describe('backlog', () => {
  test.beforeEach(async ({ page }) => {
    await fixClock(page);
  });

  test('C06-E01 open the Backlog: the title and count, the undated tasks in order with their bylines, the writing line', async ({
    page,
  }) => {
    await backlogWithThree(page);
    await expect(sheet(page).getByRole('heading', { name: 'Backlog' })).toBeVisible();
    await expect(backlogCount(page)).toHaveText('3 tasks');
    await expect(filterChip(page)).toHaveText('All projects');
    await expect(sheet(page).getByRole('group', { name: 'View' })).toBeVisible();
    // the same rows as Today: the ID in the byline, no date
    await expect(rowsOf(todoList(page)).locator('.tp-sg-id')).toHaveText(['ME-1', 'ME-2', 'ME-3']);
    await expect(rowsOf(todoList(page)).locator('.tp-sg-due')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Add to the Backlog…' })).toBeVisible();
    // no arrows, no ring
    await expect(sheet(page).getByRole('button', { name: 'Previous day' })).toHaveCount(0);
    await expect(sheet(page).getByRole('img')).toHaveCount(0);
    if (phone())
      await expect(page.getByRole('button', { name: 'More' })).toHaveAttribute('aria-current', 'page');
    expect(await serverBacklog(page)).toEqual(THREE.map((t) => [t, false]));
  });

  test('C06-E02 write on the last line and slot one in with the +; both have no day and survive a reload in order', async ({
    page,
  }) => {
    await backlogWithThree(page);
    const last = row(todoList(page), 'Draft the Q4 hiring plan');
    await expect(last).toHaveClass(/tp-new/);
    if (desktop()) {
      await row(todoList(page), 'Clean up the old staging buckets').hover();
      await row(todoList(page), 'Clean up the old staging buckets')
        .getByRole('button', { name: 'Add a task here' })
        .click();
      const here = page.getByPlaceholder('Write a task here…');
      await here.fill('Book car service');
      await here.press('Enter');
      await expect
        .poll(() => titlesOf(todoList(page)))
        .toEqual([
          'Renew passport',
          'Book car service',
          'Clean up the old staging buckets',
          'Draft the Q4 hiring plan',
        ]);
    }
    await idle(page);
    await page.reload();
    const want = desktop()
      ? ['Renew passport', 'Book car service', 'Clean up the old staging buckets', 'Draft the Q4 hiring plan']
      : THREE;
    await expect.poll(() => titlesOf(todoList(page))).toEqual(want);
    expect(await serverBacklog(page)).toEqual(want.map((t) => [t, false]));
    expect(await serverTaskDay(page, 'ME-2')).toBeNull();
  });

  test('C06-E03 give a task a day with its calendar button: Today first, then Tomorrow; the row folds away with Undo; Today has it', async ({
    page,
  }) => {
    await backlogWithThree(page);
    await page.getByRole('button', { name: 'Plan it for a day: Clean up the old staging buckets' }).click();
    const pop = page.getByRole('dialog', { name: 'Plan it for a day' });
    await expect(pop.getByRole('button', { name: /^(Today|Tomorrow)$/ })).toHaveText(['Today', 'Tomorrow']);
    await pop.getByRole('button', { name: 'Tomorrow' }).click();
    await expect.poll(() => titlesOf(todoList(page))).toEqual(['Renew passport', 'Draft the Q4 hiring plan']);
    await expect(backlogCount(page)).toHaveText('2 tasks');
    await expect(page.locator('.tp-toast')).toHaveText(/Moved to Tomorrow/);
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect.poll(() => titlesOf(todoList(page))).toEqual(THREE);
    await expect(row(todoList(page), 'Clean up the old staging buckets')).toHaveClass(/tp-new/);
    await idle(page);
    expect(await serverTaskDay(page, 'ME-2')).toBeNull();
    // and for good this time
    await page.getByRole('button', { name: 'Plan it for a day: Clean up the old staging buckets' }).click();
    await page
      .getByRole('dialog', { name: 'Plan it for a day' })
      .getByRole('button', { name: 'Tomorrow' })
      .click();
    await expect.poll(() => titlesOf(todoList(page))).toEqual(['Renew passport', 'Draft the Q4 hiring plan']);
    await idle(page);
    expect(await serverTaskDay(page, 'ME-2')).toBe('2026-10-19');
    await page.getByRole('button', { name: 'Today', exact: true }).first().click();
    await page.getByRole('button', { name: 'Next day' }).first().click();
    await expect
      .poll(() => titlesOf(dayList(page, 'Tasks for Monday 19 October')))
      .toEqual(['Clean up the old staging buckets']);
  });

  test('C06-E04 cross one off: it waits, folds away with Undo, the count follows; Crossed off lists it newest first; untick sends it back', async ({
    page,
  }) => {
    await backlogWithThree(page);
    const box = page.getByRole('checkbox', { name: 'Cross off: Clean up the old staging buckets' });
    await box.click();
    // ticked and still here for a beat
    await expect(box).toHaveAttribute('aria-checked', 'true');
    expect(await titlesOf(todoList(page))).toEqual(THREE);
    await expect
      .poll(() => titlesOf(todoList(page)), { timeout: 3000 })
      .toEqual(['Renew passport', 'Draft the Q4 hiring plan']);
    await expect(backlogCount(page)).toHaveText('2 tasks');
    await expect(page.locator('.tp-toast')).toHaveText(/Crossed off/);
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect.poll(() => titlesOf(todoList(page))).toEqual(THREE);
    await expect(
      page.getByRole('checkbox', { name: 'Cross off: Clean up the old staging buckets' }),
    ).toHaveAttribute('aria-checked', 'false');
    // cross off two, the first one first
    await page.getByRole('checkbox', { name: 'Cross off: Renew passport' }).click();
    await expect
      .poll(() => titlesOf(todoList(page)), { timeout: 3000 })
      .toEqual(['Clean up the old staging buckets', 'Draft the Q4 hiring plan']);
    await page.getByRole('checkbox', { name: 'Cross off: Draft the Q4 hiring plan' }).click();
    await expect
      .poll(() => titlesOf(todoList(page)), { timeout: 3000 })
      .toEqual(['Clean up the old staging buckets']);
    await expect(backlogCount(page)).toHaveText('1 task');
    await idle(page);
    await turnTo(page, 'Crossed off');
    await expect(backlogCount(page)).toHaveText('2 crossed off');
    await expect.poll(() => titlesOf(doneList(page))).toEqual(['Draft the Q4 hiring plan', 'Renew passport']);
    await expect(rowsOf(doneList(page)).first().locator('.tp-row')).toHaveClass(/tp-done/);
    await expect(doneList(page).locator('.tp-grip')).toHaveCount(0);
    await page.getByRole('checkbox', { name: 'Cross off: Renew passport' }).click();
    await expect
      .poll(() => titlesOf(doneList(page)), { timeout: 3000 })
      .toEqual(['Draft the Q4 hiring plan']);
    await expect(page.locator('.tp-toast')).toHaveText(/Back in the Backlog/);
    await turnTo(page, 'To do');
    await expect
      .poll(() => titlesOf(todoList(page)))
      .toEqual(['Renew passport', 'Clean up the old staging buckets']);
    await idle(page);
    expect(await serverBacklog(page)).toEqual([
      ['Renew passport', false],
      ['Clean up the old staging buckets', false],
      ['Draft the Q4 hiring plan', true],
    ]);
  });

  test('C06-E05 filter by project: the chip, the menu’s counts, the count in the title, nothing for a project; it survives a reload', async ({
    page,
  }) => {
    await signInFresh(page);
    await goBacklog(page);
    await quickAdd(page, 'Clean up the old staging buckets', (b) => withNewProject(b, 'Platform'));
    await quickAdd(page, 'Fix the flaky date-picker test', async (b) => {
      await b.getByRole('button', { name: 'Choose a project' }).click();
      await b.locator('.tp-qa-pop').getByRole('menuitem', { name: 'Platform' }).click();
    });
    await quickAdd(page, 'Renew passport', (b) => withNewProject(b, 'Home'));
    await writeBacklog(page, ['Draft the Q4 hiring plan']);
    await page.getByRole('textbox', { name: 'New task' }).press('Escape');
    await expect(backlogCount(page)).toHaveText('4 tasks');
    await filterChip(page).click();
    const menu = page.getByRole('menu');
    await expect(menu.getByRole('menuitem')).toHaveText([
      'All projects4',
      'Platform2',
      'Home1',
      'Edit projects…',
    ]);
    await menu.getByRole('menuitem', { name: 'Platform' }).click();
    await expect(filterChip(page)).toHaveText('Platform');
    await expect(filterChip(page).locator('.tp-dot')).toBeVisible();
    await expect(backlogCount(page)).toHaveText('2 tasks in Platform');
    await expect
      .poll(() => titlesOf(todoList(page)))
      .toEqual(['Clean up the old staging buckets', 'Fix the flaky date-picker test']);
    // with the filter on, the + between rows is off
    if (desktop()) await expect(todoList(page).locator('.tp-ins')).toHaveCount(0);
    // crossed off: nothing for Platform
    await turnTo(page, 'Crossed off');
    await expect(backlogCount(page)).toHaveText('0 crossed off in Platform');
    await expect(page.getByText('Nothing here for this project.')).toBeVisible();
    await turnTo(page, 'To do');
    await page.reload();
    await expect(filterChip(page)).toHaveText('Platform');
    await expect(backlogCount(page)).toHaveText('2 tasks in Platform');
    // a project with no task: the way back
    await filterChip(page).click();
    await page.getByRole('menu').getByRole('menuitem', { name: 'Home' }).click();
    await page.getByRole('checkbox', { name: 'Cross off: Renew passport' }).click();
    await expect(page.getByText('Nothing here for this project.')).toBeVisible({ timeout: 3000 });
    await expect(backlogCount(page)).toHaveText('0 tasks in Home');
    await page.getByRole('button', { name: 'Show all projects' }).click();
    await expect(filterChip(page)).toHaveText('All projects');
    await expect(backlogCount(page)).toHaveText('3 tasks');
  });

  test('C06-E06 reorder by drag: the order survives a reload and the server agrees', async ({ page }) => {
    test.skip(
      !desktop(),
      'dragging with the mouse is the desk; press and hold is covered by the row’s unit tests',
    );
    await backlogWithThree(page);
    const list = todoList(page);
    const first = (await rowsOf(list).first().boundingBox())!;
    await drag(page, row(list, 'Draft the Q4 hiring plan'), { x: first.x + 120, y: first.y + 4 });
    const want = ['Draft the Q4 hiring plan', 'Renew passport', 'Clean up the old staging buckets'];
    await expect.poll(() => titlesOf(list)).toEqual(want);
    await idle(page);
    await page.reload();
    await expect.poll(() => titlesOf(todoList(page))).toEqual(want);
    expect(await serverBacklog(page)).toEqual(want.map((t) => [t, false]));
  });

  test('C06-E07 open a task: the panel with Backlog as its way back, Planned reads Backlog, Next and Previous walk the list; a day picked there takes it out; a link opens it here', async ({
    page,
  }) => {
    await backlogWithThree(page);
    await row(todoList(page), 'Clean up the old staging buckets')
      .getByRole('button', { name: 'Clean up the old staging buckets', exact: true })
      .click();
    const p = panel(page);
    await expect(p.getByRole('textbox', { name: 'Task title' })).toHaveValue(
      'Clean up the old staging buckets',
    );
    await expect(page).toHaveURL(/\/backlog\?task=ME-2$/);
    if (phone()) await expect(p.getByRole('button', { name: 'Backlog' })).toBeVisible();
    await expect(p.getByRole('button', { name: 'Planned', exact: true })).toHaveText(/Backlog/);
    await p.getByRole('button', { name: 'Next task' }).click();
    await expect(p.getByRole('textbox', { name: 'Task title' })).toHaveValue('Draft the Q4 hiring plan');
    await p.getByRole('button', { name: 'Previous task' }).click();
    await p.getByRole('button', { name: 'Previous task' }).click();
    await expect(p.getByRole('textbox', { name: 'Task title' })).toHaveValue('Renew passport');
    await expect(page).toHaveURL(/\/backlog\?task=ME-1$/);
    // a day from the panel takes it out of the list
    await p.getByRole('button', { name: 'Planned', exact: true }).click();
    await p.locator('.tp-td-pop').getByRole('button', { name: 'Tomorrow' }).click();
    await expect
      .poll(() => titlesOf(todoList(page)))
      .toEqual(['Clean up the old staging buckets', 'Draft the Q4 hiring plan']);
    await expect(backlogCount(page)).toHaveText('2 tasks');
    if (phone()) await p.getByRole('button', { name: 'Backlog' }).click();
    else await p.getByRole('button', { name: 'Close' }).click();
    await expect(panel(page)).toHaveCount(0);
    await expect(page).toHaveURL(/\/backlog$/);
    // a link to an undated task opens the Backlog
    await idle(page);
    await page.goto('/t/ME-3');
    await expect(page).toHaveURL(/\/backlog\?task=ME-3$/);
    await expect(panel(page).getByRole('textbox', { name: 'Task title' })).toHaveValue(
      'Draft the Q4 hiring plan',
    );
  });

  test('C06-E08 New task from the Backlog: Lands in Backlog and the row washes in; a day picked toasts and Show turns to Today', async ({
    page,
  }) => {
    await signInFresh(page);
    await goBacklog(page);
    await quickAdd(page, 'Renew passport', async (b) => {
      if (!phone()) await expect(b.locator('.tp-qa-lands')).toHaveText('Lands in Backlog');
      await expect(b.getByRole('button', { name: 'Planned for: Backlog' })).toBeVisible();
    });
    await expect.poll(() => titlesOf(todoList(page))).toEqual(['Renew passport']);
    await expect(row(todoList(page), 'Renew passport')).toHaveClass(/tp-new/);
    await expect(page.locator('.tp-toast')).toHaveCount(0);
    await quickAdd(page, 'Call Sam at 3pm', async (b) => {
      await b.getByRole('button', { name: 'Planned for: Backlog' }).click();
      await b.locator('.tp-qa-pop').getByRole('button', { name: 'Tomorrow' }).click();
    });
    await expect(page.locator('.tp-toast')).toHaveText('Added to TomorrowShow');
    await expect.poll(() => titlesOf(todoList(page))).toEqual(['Renew passport']);
    await page.getByRole('button', { name: 'Show', exact: true }).click();
    await expect(page).toHaveURL(/\/me$/);
    await expect
      .poll(() => titlesOf(dayList(page, 'Tasks for Monday 19 October')))
      .toEqual(['Call Sam at 3pm']);
    await expect(row(dayList(page, 'Tasks for Monday 19 October'), 'Call Sam at 3pm')).toHaveClass(/tp-new/);
  });

  test('C06-E09 phone: More shows its page, Backlog opens the sheet with the compact header, the calendar button is there, the round button adds here', async ({
    page,
  }) => {
    test.skip(!phone(), 'the phone’s More tab');
    await signInFresh(page);
    await writeTasks(page, ['Pay the electricity bill']);
    await page.getByRole('button', { name: 'More' }).click();
    await expect(page).toHaveURL(/\/more$/);
    await expect(page.getByRole('heading', { name: 'More' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'More' })).toHaveAttribute('aria-current', 'page');
    await page.getByRole('button', { name: /^Backlog/ }).click();
    await expect(page).toHaveURL(/\/backlog$/);
    await expect(sheet(page).locator('.tp-dh')).toHaveClass(/tp-compact/);
    await expect(page.getByRole('button', { name: 'More' })).toHaveAttribute('aria-current', 'page');
    await page.getByRole('button', { name: 'New task' }).click();
    const b = bar(page);
    await b.getByRole('textbox', { name: 'Task title' }).fill('Renew passport');
    await expect(b.getByRole('button', { name: 'Planned for: Backlog' })).toBeVisible();
    await b.getByRole('button', { name: /^Add( task)?$/ }).click();
    await expect.poll(() => titlesOf(todoList(page))).toEqual(['Renew passport']);
    await expect(row(todoList(page), 'Renew passport')).toHaveClass(/tp-new/);
    const plan = page.getByRole('button', { name: 'Plan it for a day: Renew passport' });
    await expect(plan).toBeVisible();
    await expect(plan).toHaveCSS('opacity', '0.7');
    await plan.click();
    await page
      .getByRole('dialog', { name: 'Plan it for a day' })
      .getByRole('button', { name: 'Today' })
      .click();
    await expect(page.locator('.tp-toast')).toHaveText(/Moved to Today/);
    await expect(backlogCount(page)).toHaveText('Nothing waiting');
    await page.getByRole('button', { name: 'Today', exact: true }).click();
    await expect
      .poll(() => titlesOf(dayList(page, 'Tasks for Sunday 18 October')))
      .toEqual(['Pay the electricity bill', 'Renew passport']);
  });

  test('C06-E10 tablet: the rail, the sheet with the filter and the switch, the 460px panel', async ({
    page,
  }) => {
    test.skip(!tablet(), 'the tablet’s Backlog');
    await backlogWithThree(page);
    await expect(page.getByRole('navigation', { name: 'Main' })).toHaveClass(/tp-rail/);
    await expect(filterChip(page)).toBeVisible();
    await expect(sheet(page).getByRole('group', { name: 'View' })).toBeVisible();
    await expect(sheet(page).locator('.tp-dh')).not.toHaveClass(/tp-compact/);
    await row(todoList(page), 'Renew passport')
      .getByRole('button', { name: 'Renew passport', exact: true })
      .click();
    const p = panel(page);
    await expect(p.getByRole('textbox', { name: 'Task title' })).toHaveValue('Renew passport');
    expect((await p.boundingBox())!.width).toBeLessThanOrEqual(470);
  });

  test('C06-E11 live: a task crossed off, added or given a day in a second tab shows here without a reload', async ({
    page,
    context,
  }) => {
    await backlogWithThree(page);
    await idle(page);
    const second = await context.newPage();
    await second.goto('/backlog');
    await expect.poll(() => titlesOf(todoList(second))).toEqual(THREE);
    await writeBacklog(second, ['From the second tab']);
    await expect
      .poll(() => titlesOf(todoList(page)), { timeout: 10_000 })
      .toEqual([...THREE, 'From the second tab']);
    await second.getByRole('textbox', { name: 'New task' }).press('Escape');
    await second.getByRole('checkbox', { name: 'Cross off: Renew passport' }).click();
    await expect
      .poll(() => titlesOf(todoList(page)), { timeout: 10_000 })
      .toEqual(['Clean up the old staging buckets', 'Draft the Q4 hiring plan', 'From the second tab']);
    await second.getByRole('button', { name: 'Plan it for a day: From the second tab' }).click();
    await second
      .getByRole('dialog', { name: 'Plan it for a day' })
      .getByRole('button', { name: 'Today' })
      .click();
    await expect
      .poll(() => titlesOf(todoList(page)), { timeout: 10_000 })
      .toEqual(['Clean up the old staging buckets', 'Draft the Q4 hiring plan']);
    await expect(backlogCount(page)).toHaveText('2 tasks');
    await second.close();
  });

  test('C06-E12 offline: the banner; cross off, reorder and give a day while offline; the server has it all when back', async ({
    page,
    context,
  }) => {
    await backlogWithThree(page);
    await idle(page);
    await context.setOffline(true);
    await expect(page.getByText('You’re offline.')).toBeVisible();
    await page.getByRole('checkbox', { name: 'Cross off: Renew passport' }).click();
    await expect
      .poll(() => titlesOf(todoList(page)), { timeout: 3000 })
      .toEqual(['Clean up the old staging buckets', 'Draft the Q4 hiring plan']);
    if (desktop()) {
      const list = todoList(page);
      const first = (await rowsOf(list).first().boundingBox())!;
      await drag(page, row(list, 'Draft the Q4 hiring plan'), { x: first.x + 120, y: first.y + 4 });
      await expect
        .poll(() => titlesOf(list))
        .toEqual(['Draft the Q4 hiring plan', 'Clean up the old staging buckets']);
    }
    await page.getByRole('button', { name: 'Plan it for a day: Clean up the old staging buckets' }).click();
    await page
      .getByRole('dialog', { name: 'Plan it for a day' })
      .getByRole('button', { name: 'Today' })
      .click();
    await expect.poll(() => titlesOf(todoList(page))).toEqual(['Draft the Q4 hiring plan']);
    await context.setOffline(false);
    await expect(page.getByText('You’re offline.')).toHaveCount(0);
    await idle(page);
    await expect(page.locator('.tp-toast')).toHaveCount(0);
    await expect(backlogCount(page)).toHaveText('1 task');
    // on the desk the drag put Draft first
    await expect
      .poll(() => serverBacklog(page))
      .toEqual(
        desktop()
          ? [
              ['Draft the Q4 hiring plan', false],
              ['Renew passport', true],
            ]
          : [
              ['Renew passport', true],
              ['Draft the Q4 hiring plan', false],
            ],
      );
    expect(await serverTaskDay(page, 'ME-2')).toBe('2026-10-18');
  });

  test('C06-E13 a held read shows the header with skeleton rows; a failed one says so and Try again recovers', async ({
    page,
  }) => {
    await signInFresh(page);
    let release!: () => void;
    const held = new Promise<void>((r) => (release = r));
    await page.route('**/api/spaces/*/backlog', async (route) => {
      await held;
      await route.continue();
    });
    await goBacklog(page);
    await expect(sheet(page).getByRole('heading', { name: 'Backlog' })).toBeVisible();
    await expect(filterChip(page)).toBeVisible();
    await expect(backlogCount(page)).toHaveCount(0);
    await expect(page.locator('[aria-label="Loading tasks"]').first()).toBeAttached();
    release();
    await expect(page.locator('[aria-label="Loading tasks"]')).toHaveCount(0);
    await expect(backlogCount(page)).toHaveText('Nothing waiting');
    await page.unroute('**/api/spaces/*/backlog');
    await page.route('**/api/spaces/*/backlog', (route) => route.abort());
    await page.reload();
    await expect(page.getByText('Couldn’t load the Backlog.')).toBeVisible();
    await expect(
      page.getByText('Check your connection. Offline, the Backlog shows what was last loaded.'),
    ).toBeVisible();
    await page.unroute('**/api/spaces/*/backlog');
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(page.getByText('Nothing waiting.')).toBeVisible();
  });

  test('C06-E14 empty: Nothing waiting with Add a task opening Quick Add; Nothing crossed off yet in the other view', async ({
    page,
  }) => {
    await signInFresh(page);
    await goBacklog(page);
    await expect(backlogCount(page)).toHaveText('Nothing waiting');
    await expect(page.getByText('Nothing waiting.')).toBeVisible();
    await expect(
      page.getByText(
        'Tasks without a day land here. Give one a day with its calendar button when you’re ready.',
      ),
    ).toBeVisible();
    await turnTo(page, 'Crossed off');
    await expect(backlogCount(page)).toHaveText('Nothing crossed off');
    await expect(page.getByText('Nothing crossed off yet.')).toBeVisible();
    await turnTo(page, 'To do');
    await page.getByRole('button', { name: 'Add a task' }).click();
    const b = bar(page);
    await expect(b.getByRole('textbox', { name: 'Task title' })).toBeFocused();
    await expect(b.getByRole('button', { name: 'Planned for: Backlog' })).toBeVisible();
  });

  test('C06-E15 dark: the Backlog and a cross off in the dark theme', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await backlogWithThree(page);
    await expect(page.locator('html')).toHaveClass(/dark/);
    await expect(backlogCount(page)).toHaveText('3 tasks');
    await page.getByRole('checkbox', { name: 'Cross off: Renew passport' }).click();
    await expect
      .poll(() => titlesOf(todoList(page)), { timeout: 3000 })
      .toEqual(['Clean up the old staging buckets', 'Draft the Q4 hiring plan']);
    await expect(page.locator('.tp-toast')).toHaveText(/Crossed off/);
    await turnTo(page, 'Crossed off');
    await expect.poll(() => titlesOf(doneList(page))).toEqual(['Renew passport']);
  });
});
