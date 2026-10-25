import type { Locator, Page } from '@playwright/test';
import { API_URL, expect, signInFresh, test } from '../../fixtures/app';
import { doneList, todoList } from '../../fixtures/backlog';
import { box, hit, hitTitles, openSearch, options, panel, search } from '../../fixtures/search';
import { dayList, fixClock, idle, row, titlesOf } from '../../fixtures/today';

const phone = () => test.info().project.name === 'phone';
const tablet = () => test.info().project.name === 'tablet';

const TODAY = '2026-10-18';
const TOMORROW = '2026-10-19';
const PAST = '2026-10-10';

interface Seeded {
  spaceId: string;
  ids: Record<string, string>;
}

/** The tasks every search test starts with, written straight through sync so the notes and the days are exact. */
async function seed(page: Page): Promise<Seeded> {
  const me = (await (await page.request.get(`${API_URL}/api/me`)).json()) as {
    spaces: Array<{ id: string }>;
  };
  const spaceId = me.spaces[0]!.id;
  const rows: Array<[string, string, string | null, string?]> = [
    ['bill', 'Pay the electricity bill', TODAY],
    ['meera', 'Sync with Meera on onboarding copy', TODAY],
    [
      'passport',
      'Renew passport',
      TODAY,
      '<p>Photos are in the desk drawer. Ask about <b>dietary</b> needs.</p>',
    ],
    ['old', 'Old passport renewal', PAST],
    ['domain', 'Renew the domain', null],
    ['notes', 'Write the release notes', null],
    ['demo', 'Meera’s Quick Add demo', TOMORROW],
    ['staging', 'Run the request status enum migration and backfill on staging', null],
    ['prod', 'Run the request status enum migration on production', null],
  ];
  const ids: Record<string, string> = {};
  let at = Date.parse('2026-10-18T09:00:00.000Z');
  const mutations = rows.map(([key, title, day, notes], i) => {
    ids[key] = crypto.randomUUID();
    at += 1000;
    return {
      id: crypto.randomUUID(),
      type: 'task.create',
      payload: { id: ids[key], spaceId, title, day, position: 1024 * (i + 1), ...(notes ? { notes } : {}) },
      at: new Date(at).toISOString(),
    };
  });
  mutations.push({
    id: crypto.randomUUID(),
    type: 'task.cross',
    payload: { id: ids.notes!, done: true } as never,
    at: new Date(at + 1000).toISOString(),
  });
  const res = await page.request.post(`${API_URL}/api/sync`, { data: { clientId: 'seed', mutations } });
  expect(res.status()).toBe(200);
  await page.reload();
  await expect
    .poll(() => titlesOf(dayList(page)))
    .toEqual(['Pay the electricity bill', 'Sync with Meera on onboarding copy', 'Renew passport']);
  return { spaceId, ids };
}

async function start(page: Page): Promise<Seeded> {
  await signInFresh(page);
  return seed(page);
}

const searchButton = (page: Page) => page.getByRole('button', { name: 'Search tasks' });
const searchTab = (page: Page) =>
  page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Search' });
const heading = (page: Page) => page.getByRole('heading', { level: 1 });

/** The row of a list that is glowing (located by Search). */
function glowing(list: Locator): Locator {
  return list.locator('.tp-item.tp-locate');
}

test.describe('search', () => {
  test.beforeEach(async ({ page }) => {
    await fixClock(page);
  });

  test('C07-E01 open from the top bar: the box focused and the icon lit; the hint the first time; Esc and the veil close; × clears', async ({
    page,
  }) => {
    await start(page);
    await openSearch(page);
    if (phone()) await expect(searchTab(page)).toHaveAttribute('aria-current', 'page');
    else await expect(searchButton(page)).toHaveClass(/tp-on/);
    await expect(panel(page).locator('.tp-sp-hint')).toHaveText(
      'Search your tasks by title, task ID, Jira key or note.',
    );
    await expect(options(page)).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(panel(page)).toHaveCount(0);
    if (!phone()) await expect(searchButton(page)).not.toHaveClass(/tp-on/);
    await openSearch(page);
    await box(page).fill('pass');
    await panel(page).getByRole('button', { name: 'Clear' }).click();
    await expect(box(page)).toHaveValue('');
    await expect(box(page)).toBeFocused();
    if (phone()) {
      await panel(page).getByRole('button', { name: 'Cancel' }).click();
    } else {
      await page.locator('.tp-sp-veil').click({ position: { x: 10, y: 10 } });
    }
    await expect(panel(page)).toHaveCount(0);
  });

  test('C07-E02 type: rows follow the keys, best match first with the words marked, a note match shows its line, Today in brand; the ID in full comes first', async ({
    page,
  }) => {
    await start(page);
    await openSearch(page);
    await search(page, 'passport');
    await expect.poll(() => hitTitles(page)).toEqual(['Renew passport', 'Old passport renewal']);
    const first = hit(page, 'Renew passport');
    await expect(first.locator('mark.tp-hl')).toHaveText(['passport']);
    await expect(first.locator('.tp-sh-where')).toHaveText('Today');
    await expect(first.locator('.tp-sh-where')).toHaveClass(/tp-today/);
    await expect(first.locator('.tp-sh-id')).toHaveText('ME-3');
    await expect(hit(page, 'Old passport renewal').locator('.tp-sh-where')).toHaveText('Sat 10 Oct');
    await expect(first).toHaveAttribute('aria-selected', 'true');
    // every key: the words as a phrase now sit in one title, which takes the lead
    await search(page, 'passport ren');
    await expect.poll(() => hitTitles(page)).toEqual(['Old passport renewal', 'Renew passport']);
    await search(page, 'renew');
    await expect
      .poll(() => hitTitles(page))
      .toEqual(['Renew passport', 'Renew the domain', 'Old passport renewal']);
    // a note match shows a line of it
    await search(page, 'dietary');
    await expect.poll(() => hitTitles(page)).toEqual(['Renew passport']);
    await expect(hit(page, 'Renew passport').locator('.tp-sh-snip')).toHaveText(
      '…the desk drawer. Ask about dietary needs.',
    );
    await expect(hit(page, 'Renew passport').locator('.tp-sh-snip mark')).toHaveText('dietary');
    // a better title match outranks a title that merely holds the word; the crossed-off one sits below
    await search(page, 'meera');
    await expect
      .poll(() => hitTitles(page))
      .toEqual(['Meera’s Quick Add demo', 'Sync with Meera on onboarding copy']);
    await expect(hit(page, 'Meera’s Quick Add demo').locator('.tp-sh-where')).toHaveText('Tomorrow');
    await search(page, 'notes');
    await expect.poll(() => hitTitles(page)).toEqual(['Write the release notes']);
    await expect(hit(page, 'Write the release notes')).toHaveClass(/tp-done/);
    await expect(hit(page, 'Write the release notes').locator('.tp-sh-where')).toHaveText(
      'Backlog · crossed off',
    );
    // the ID in full
    await search(page, 'ME-7');
    await expect.poll(() => hitTitles(page)).toEqual(['Meera’s Quick Add demo']);
  });

  test('C07-E03 pick a result on a day: the panel goes, the page turns to that day, the row glows; arrows and Enter pick too', async ({
    page,
  }) => {
    await start(page);
    await openSearch(page);
    await search(page, 'passport');
    await hit(page, 'Old passport renewal').click();
    await expect(panel(page)).toHaveCount(0);
    await expect(heading(page)).toHaveText('Saturday');
    await expect.poll(() => titlesOf(dayList(page))).toEqual(['Old passport renewal']);
    await expect(glowing(dayList(page))).toHaveCount(1);
    await expect(glowing(dayList(page))).toContainText('Old passport renewal');
    // back to today by the keyboard: the second row
    await openSearch(page);
    await search(page, 'meera');
    await expect.poll(() => hitTitles(page)).toHaveLength(2);
    await page.keyboard.press('ArrowDown');
    await expect(hit(page, 'Sync with Meera on onboarding copy')).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('Enter');
    await expect(panel(page)).toHaveCount(0);
    await expect(heading(page)).toHaveText('Sunday');
    await expect(glowing(dayList(page))).toContainText('Sync with Meera on onboarding copy');
  });

  test('C07-E04 pick a Backlog result: the Backlog with the row glowing; a crossed-off one lands in Crossed off', async ({
    page,
  }) => {
    await start(page);
    await openSearch(page);
    await search(page, 'domain');
    await hit(page, 'Renew the domain').click();
    await expect(page).toHaveURL(/\/backlog$/);
    await expect(todoList(page)).toBeVisible();
    await expect(glowing(todoList(page))).toContainText('Renew the domain');
    await openSearch(page);
    await search(page, 'release');
    await hit(page, 'Write the release notes').click();
    await expect(panel(page)).toHaveCount(0);
    await expect(doneList(page)).toBeVisible();
    await expect(glowing(doneList(page))).toContainText('Write the release notes');
    await expect(
      page.getByRole('group', { name: 'View' }).getByRole('button', { name: 'Crossed off' }),
    ).toHaveAttribute('aria-pressed', 'true');
  });

  test('C07-E05 create: no match, Create first, Enter opens Quick Add with the words; Add lands it on today with the wash', async ({
    page,
  }) => {
    await start(page);
    await openSearch(page);
    await search(page, 'Clean the gutters');
    await expect(panel(page).locator('.tp-sp-none')).toHaveText('No task matches “Clean the gutters”.');
    await expect(options(page).first()).toHaveClass(/tp-sh-create/);
    await expect(options(page)).toHaveCount(1);
    await page.keyboard.press('Enter');
    await expect(panel(page)).toHaveCount(0);
    const bar = page.getByRole('dialog', { name: 'Quick Add' });
    await expect(bar.getByRole('textbox', { name: 'Task title' })).toHaveValue('Clean the gutters');
    await expect(bar.getByRole('textbox', { name: 'Task title' })).toBeFocused();
    await bar.getByRole('button', { name: /^Add( task)?$/ }).click();
    await expect(bar).toHaveCount(0, { timeout: 5000 });
    await expect(row(dayList(page), 'Clean the gutters')).toHaveClass(/tp-new/);
    await idle(page);
    const where = (await (await page.request.get(`${API_URL}/api/tasks/ref/ME-10`)).json()) as {
      day: string;
    };
    expect(where.day).toBe(TODAY);
    // the words joined the recent searches
    await openSearch(page);
    await expect(box(page)).toHaveValue('Clean the gutters');
    await box(page).fill('');
    await expect(panel(page).getByRole('option', { name: 'Clean the gutters' })).toHaveClass(/tp-sh-query/);
  });

  test('C07-E06 recents: the reopened panel has the search selected; an empty box lists Recent searches and Recently opened; Clear; both survive a reload; a deleted task is gone', async ({
    page,
  }) => {
    const { ids } = await start(page);
    await openSearch(page);
    await search(page, 'meera');
    await hit(page, 'Sync with Meera on onboarding copy').click();
    await expect(panel(page)).toHaveCount(0);
    await openSearch(page);
    await search(page, 'domain');
    await hit(page, 'Renew the domain').click();
    await expect(page).toHaveURL(/\/backlog$/);
    await openSearch(page);
    await expect(box(page)).toHaveValue('domain');
    expect(await box(page).evaluate((el: HTMLInputElement) => [el.selectionStart, el.selectionEnd])).toEqual([
      0, 6,
    ]);
    await expect.poll(() => hitTitles(page)).toEqual(['Renew the domain']);
    // typing replaces the selected words
    await page.keyboard.type('bill');
    await expect(box(page)).toHaveValue('bill');
    await box(page).fill('');
    const heads = panel(page).locator('.tp-sp-head');
    await expect(heads).toHaveText(['Recent searchesClear', 'Recently opened']);
    await expect(options(page)).toHaveText([
      'domain',
      'meera',
      /^Renew the domain/,
      /^Sync with Meera on onboarding copy/,
    ]);
    // a recent search runs again
    await panel(page).getByRole('option', { name: 'meera', exact: true }).click();
    await expect(box(page)).toHaveValue('meera');
    await expect.poll(() => hitTitles(page)).toHaveLength(2);
    await page.keyboard.press('Escape');
    // a reload keeps both; a task deleted meanwhile is gone from Recently opened
    const del = await page.request.post(`${API_URL}/api/sync`, {
      data: {
        clientId: 'seed',
        mutations: [
          {
            id: crypto.randomUUID(),
            type: 'task.delete',
            payload: { id: ids.domain },
            at: '2026-10-18T10:00:00.000Z',
          },
        ],
      },
    });
    expect(del.status()).toBe(200);
    await page.reload();
    await openSearch(page);
    await expect(box(page)).toHaveValue('');
    await expect(options(page)).toHaveText(['domain', 'meera', /^Sync with Meera on onboarding copy/]);
    await panel(page).locator('.tp-sp-headbtn', { hasText: 'Clear' }).click();
    await expect(heads).toHaveText(['Recently opened']);
    await expect(options(page)).toHaveCount(1);
    await page.reload();
    await openSearch(page);
    await expect(heads).toHaveText(['Recently opened']);
  });

  test('C07-E07 Quick Add: "Looks like a task you have" for a near-duplicate title, "N more", × hides; the title goes to the task and the draft stays', async ({
    page,
  }) => {
    await start(page);
    await page.getByRole('button', { name: 'New task' }).first().click();
    const bar = page.getByRole('dialog', { name: 'Quick Add' });
    const line = bar.getByRole('textbox', { name: 'Task title' });
    await expect(line).toBeFocused();
    await line.fill('Run the migration on staging');
    const sim = bar.locator('.tp-qa-simwrap');
    await expect(sim).toHaveClass(/tp-on/);
    await expect(sim.locator('.tp-qa-sim-k')).toHaveText('Looks like tasks you have');
    await expect(sim.locator('.tp-qa-sim-t').first()).toHaveText(
      'Run the request status enum migration and backfill on staging',
    );
    await expect(sim.locator('.tp-qa-sim-w').first()).toHaveText('Backlog');
    const more = bar.getByRole('button', { name: '1 more' });
    await expect(more).toHaveAttribute('aria-expanded', 'false');
    await more.click();
    await expect(sim.locator('.tp-qa-sim-rest')).toHaveClass(/tp-on/);
    await expect(sim.locator('.tp-qa-sim-t').nth(1)).toHaveText(
      'Run the request status enum migration on production',
    );
    await bar.getByRole('button', { name: 'None of these' }).click();
    await expect(sim).not.toHaveClass(/tp-on/);
    await expect(line).toBeFocused();
    // the closest look-alike first (since chunk 13 meaning may add others under "N more"): the title takes you
    // there and keeps the draft
    await line.fill('Sync with Meera about the onboarding copy');
    await expect(sim).toHaveClass(/tp-on/);
    await expect(sim.locator('.tp-qa-sim-k')).toHaveText(/^Looks like (a task|tasks) you have$/);
    await expect(sim.locator('.tp-qa-sim-t').first()).toHaveText('Sync with Meera on onboarding copy');
    await expect(sim.locator('.tp-qa-sim-w').first()).toHaveText('Today');
    await expect(bar.getByRole('button', { name: /^Add( task)?$/ })).toBeEnabled();
    await sim.getByRole('button', { name: 'Sync with Meera on onboarding copy' }).click();
    await expect(bar).toHaveCount(0);
    await expect(heading(page)).toHaveText('Sunday');
    await expect(glowing(dayList(page))).toContainText('Sync with Meera on onboarding copy');
    await page.getByRole('button', { name: 'New task' }).first().click();
    await expect(line).toHaveValue('Sync with Meera about the onboarding copy');
  });

  test('C07-E08 phone: the Search tab opens the sheet with the tab lit, Cancel closes; the byline wraps; a pick turns to the day', async ({
    page,
  }) => {
    test.skip(!phone(), 'the phone has the Search tab');
    await start(page);
    await searchTab(page).click();
    await expect(box(page)).toBeFocused();
    await expect(panel(page)).toHaveClass(/tp-sp-phone/);
    await expect(searchTab(page)).toHaveAttribute('aria-current', 'page');
    await expect(page.locator('.tp-sp-veil')).toHaveCount(1);
    await panel(page).getByRole('button', { name: 'Cancel' }).click();
    await expect(panel(page)).toHaveCount(0);
    await expect(searchTab(page)).not.toHaveAttribute('aria-current', 'page');
    await searchTab(page).click();
    await search(page, 'passport');
    expect(
      await hit(page, 'Renew passport')
        .locator('.tp-sh-by')
        .evaluate((el) => getComputedStyle(el).flexWrap),
    ).toBe('wrap');
    await hit(page, 'Old passport renewal').click();
    await expect(panel(page)).toHaveCount(0);
    await expect(heading(page)).toHaveText('Saturday');
    await expect(glowing(dayList(page))).toContainText('Old passport renewal');
    await expect(
      page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Today' }),
    ).toHaveAttribute('aria-current', 'page');
  });

  test('C07-E09 tablet: the icon in the compact bar opens the 620px panel', async ({ page }) => {
    test.skip(!tablet(), 'the tablet has the compact bar');
    await start(page);
    await expect(page.locator('.tp-topbar')).toHaveClass(/tp-compact/);
    await openSearch(page);
    expect((await panel(page).boundingBox())!.width).toBe(620);
    await search(page, 'passport');
    await expect.poll(() => hitTitles(page)).toHaveLength(2);
  });

  test('C07-E10 offline and failing: the quiet line with Try again, the recents still there; back online the search runs', async ({
    page,
    context,
  }) => {
    await start(page);
    await openSearch(page);
    await search(page, 'meera');
    await hit(page, 'Sync with Meera on onboarding copy').click();
    await expect(panel(page)).toHaveCount(0);
    await context.setOffline(true);
    await openSearch(page);
    await box(page).fill('passport');
    // The close-matches line can show beside it while offline; this is the search's own.
    const quiet = panel(page).getByRole('status').filter({ hasText: 'Couldn’t search right now.' });
    await expect(quiet).toHaveText('Couldn’t search right now.Try again');
    await expect(panel(page).locator('.tp-sp-load')).toHaveCount(0);
    await box(page).fill('');
    await expect(panel(page).getByRole('option', { name: 'meera', exact: true })).toBeVisible();
    await box(page).fill('passport');
    await expect(quiet).toBeVisible();
    await context.setOffline(false);
    await panel(page).getByRole('button', { name: 'Try again' }).click();
    await expect.poll(() => hitTitles(page)).toEqual(['Renew passport', 'Old passport renewal']);
    await expect(quiet).toHaveCount(0);
  });

  test('C07-E11 loading: a held search shows the skeleton rows and never a spinner', async ({ page }) => {
    await start(page);
    let release!: () => void;
    const held = new Promise<void>((r) => (release = r));
    await page.route('**/api/search?q=*', async (route) => {
      await held;
      await route.continue();
    });
    await openSearch(page);
    await box(page).fill('passport');
    await expect(panel(page).locator('.tp-sp-load')).toBeVisible();
    await expect(panel(page).locator('.tp-sp-skel')).toHaveCount(3);
    await expect(panel(page).locator('.tp-spin')).toHaveCount(0);
    await expect(options(page)).toHaveCount(0);
    release();
    await expect.poll(() => hitTitles(page)).toEqual(['Renew passport', 'Old passport renewal']);
    await expect(panel(page).locator('.tp-sp-load')).toHaveCount(0);
  });

  test('C07-E12 dark: searching and the recents in the dark theme', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await start(page);
    await expect(page.locator('html')).toHaveClass(/dark/);
    await openSearch(page);
    await search(page, 'passport');
    await expect.poll(() => hitTitles(page)).toEqual(['Renew passport', 'Old passport renewal']);
    await expect(hit(page, 'Renew passport').locator('mark.tp-hl')).toHaveText(['passport']);
    await hit(page, 'Renew passport').click();
    await expect(panel(page)).toHaveCount(0);
    await expect(glowing(dayList(page))).toContainText('Renew passport');
    await openSearch(page);
    await expect(box(page)).toHaveValue('passport');
    await box(page).fill('');
    await expect(panel(page).locator('.tp-sp-head')).toHaveText(['Recent searchesClear', 'Recently opened']);
    await expect(options(page)).toHaveText(['passport', /^Renew passport/]);
  });

  test('C10-E21 search after the move to links: a key finds its task first; off in a space, its task is still found by key', async ({
    page,
  }) => {
    test.skip(phone() || tablet(), 'the same search on every size');
    await fixClock(page);
    await signInFresh(page);
    const mine = (await (await page.request.get(`${API_URL}/api/me`)).json()) as {
      spaces: Array<{ id: string; kind: string }>;
    };
    const spaceId = mine.spaces.find((x) => x.kind === 'personal')!.id;
    const at = '2026-10-18T09:00:00.000Z';
    const a = crypto.randomUUID();
    const b = crypto.randomUUID();
    const res = await page.request.post(`${API_URL}/api/sync`, {
      data: {
        clientId: 'seed',
        mutations: [
          {
            id: crypto.randomUUID(),
            type: 'task.create',
            at,
            payload: { id: a, spaceId, title: 'TUDU-226 notes for later', day: TODAY, position: 1024 },
          },
          {
            id: crypto.randomUUID(),
            type: 'task.create',
            at,
            payload: { id: b, spaceId, title: 'Fix the picker', day: TODAY, position: 2048 },
          },
          {
            id: crypto.randomUUID(),
            type: 'task.link',
            at: '2026-10-18T09:01:00.000Z',
            payload: { id: b, provider: 'jira', key: 'TUDU-226' },
          },
        ],
      },
    });
    expect(res.status()).toBe(200);
    // Jira is not connected at all: the key is the task's own, so search finds it by key all the same.
    await page.reload();
    await openSearch(page);
    await search(page, 'tudu-226');
    await expect.poll(() => hitTitles(page)).toEqual(['Fix the picker', 'TUDU-226 notes for later']);
    await expect(hit(page, 'Fix the picker').locator('.tp-sh-jira')).toHaveText('TUDU-226');
  });
});
