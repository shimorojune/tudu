import type { Locator, Page } from '@playwright/test';
import { API_URL, expect, signInFresh, test } from '../../fixtures/app';
import { box, closeTitles, hit, hitTitles, openSearch, options, panel, search } from '../../fixtures/search';
import { joinLink, me, secondPerson, seedTasks, switcher } from '../../fixtures/spaces';
import { dayList, fixClock, idle } from '../../fixtures/today';

const phone = () => test.info().project.name === 'phone';

const TODAY = '2026-10-18';
const TOMORROW = '2026-10-19';

const heading = (page: Page) => page.getByRole('heading', { level: 1 });
const glowing = (list: Locator) => list.locator('.tp-item.tp-locate');
const list = (page: Page) => panel(page).getByRole('listbox', { name: 'Matching tasks' });
/** Embed everything pending now, as the batch after a sync would. */
async function embedded(page: Page): Promise<void> {
  const res = await page.request.post(`${API_URL}/__test/embeddings/drain`);
  expect(res.status()).toBe(200);
}

/** Type words and wait for the word matches and then the close matches to settle. */
async function searchClose(page: Page, words: string): Promise<void> {
  await search(page, words);
  await expect(list(page)).toHaveAttribute('data-similar', /done|error/, { timeout: 10_000 });
}

async function createSpaceApi(page: Page, name: string, invites: string[] = []) {
  const res = await page.request.post(`${API_URL}/api/spaces`, { data: { name, color: '#3d5a80', invites } });
  expect(res.status()).toBe(201);
  return ((await res.json()) as { space: { id: string; slug: string } }).space;
}

/** A person with a few tasks in Personal: a dentist on tomorrow, a paraphrase of it, and two others. */
async function start(page: Page) {
  await signInFresh(page);
  const { spaces } = await me(page);
  const spaceId = spaces[0]!.id;
  const ids = await seedTasks(page, spaceId, [
    { title: 'Pay the electricity bill', day: TODAY },
    { title: 'Dentist appointment', day: TODAY },
    { title: 'Teeth cleaning booked', day: TOMORROW },
    { title: 'Renew passport', day: null },
  ]);
  await embedded(page);
  await page.reload();
  await expect(heading(page)).toHaveText('Sunday');
  return { spaceId, ids };
}

test.describe('close matches', () => {
  test.beforeEach(async ({ page }) => {
    await fixClock(page);
  });

  test('C13-E01 type a word: word hits at once, then Close matches with a paraphrase, no washed words; arrows and Enter pick it and the page turns to its day', async ({
    page,
  }) => {
    await start(page);
    await openSearch(page);
    await search(page, 'dentist');
    await expect.poll(() => hitTitles(page)).toContain('Dentist appointment');
    await expect(list(page)).toHaveAttribute('data-similar', 'done', { timeout: 10_000 });
    await expect(panel(page).locator('.tp-sp-head-sim')).toHaveText('Close matches');
    expect(await closeTitles(page)).toContain('Teeth cleaning booked');
    expect(await closeTitles(page)).not.toContain('Dentist appointment');
    await expect(hit(page, 'Teeth cleaning booked').locator('mark')).toHaveCount(0);
    await expect(hit(page, 'Dentist appointment').locator('mark.tp-hl')).toHaveText(['Dentist']);
    // the arrows walk into the close matches
    await page.keyboard.press('ArrowDown');
    await expect(hit(page, 'Teeth cleaning booked')).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('Enter');
    await expect(panel(page)).toHaveCount(0);
    await expect(heading(page)).toHaveText('Monday');
    await expect(glowing(dayList(page))).toContainText('Teeth cleaning booked');
  });

  test('C13-E02 a close match from another space names it; the pick switches to that space and the row glows', async ({
    page,
  }) => {
    test.skip(phone(), 'the desk and tablet cover the switch; the phone sheet is C13-E09');
    await start(page);
    const nw = await createSpaceApi(page, 'Northwind');
    await seedTasks(page, nw.id, [{ title: 'Book flights to Lisbon', day: TOMORROW }]);
    await embedded(page);
    await openSearch(page);
    await searchClose(page, 'plane tickets to Portugal');
    const row = hit(page, 'Book flights to Lisbon');
    await expect(row).toBeVisible();
    await expect(row.locator('.tp-sh-space')).toHaveText('Northwind');
    await row.click();
    await expect(panel(page)).toHaveCount(0);
    await expect(page).toHaveURL(new RegExp(`/${nw.slug}$`), { timeout: 10_000 });
    await expect(switcher(page)).toContainText('Northwind');
    await expect(heading(page)).toHaveText('Monday');
    await expect(glowing(dayList(page))).toContainText('Book flights to Lisbon', { timeout: 10_000 });
    // in that space the row names no space
    await openSearch(page);
    await searchClose(page, 'plane tickets to Portugal');
    await expect(hit(page, 'Book flights to Lisbon').locator('.tp-sh-space')).toHaveCount(0);
  });

  test('C13-E03 two people in a space: the second’s shared task appears by word and by meaning for the first, their Only me task never, their Personal never', async ({
    page,
    browser,
  }) => {
    await start(page);
    const second = await secondPerson(browser);
    const nw = await createSpaceApi(page, 'Northwind', [second.email]);
    const link = await joinLink(page, second.email);
    const joined = await second.page.request.post(`${API_URL}/api${link}`);
    expect(joined.status()).toBe(200);
    const { spaces } = await me(second.page);
    await seedTasks(second.page, nw.id, [
      { title: 'Dentist appointment for the kids', day: TODAY },
      { title: 'Teeth checkup, keep it quiet', day: TODAY, visibility: 'me' },
    ]);
    await seedTasks(second.page, spaces.find((s) => s.kind === 'personal')!.id, [
      { title: 'Teeth checkup at home', day: TODAY },
    ]);
    await embedded(page);
    await page.goto(`/${nw.slug}`);
    await expect(switcher(page)).toContainText('Northwind');
    await openSearch(page);
    // by word: the shared task of the second person, never the quiet one; search spans every space you are in
    // (chunk 21), so your own Personal dentist shows beside it
    await search(page, 'dentist');
    await expect
      .poll(async () => (await hitTitles(page)).sort())
      .toEqual(['Dentist appointment', 'Dentist appointment for the kids']);
    // by meaning: the same rule
    await box(page).fill('');
    await searchClose(page, 'tooth doctor visit');
    const titles = await closeTitles(page);
    expect(titles).toContain('Dentist appointment for the kids');
    expect(titles).not.toContain('Teeth checkup, keep it quiet');
    expect(titles).not.toContain('Teeth checkup at home');
    await second.context.close();
  });

  test('C13-E04 no word match: Create first, the close match below; Enter opens Quick Add with the words', async ({
    page,
  }) => {
    await start(page);
    await openSearch(page);
    // no word in common with any task, and plainly the dentist by meaning (0.8 to its title, well over the floor)
    await searchClose(page, 'tooth doctor visit');
    await expect(panel(page).locator('.tp-sp-none')).toHaveText('No task matches “tooth doctor visit”.');
    await expect(options(page).first()).toHaveClass(/tp-sh-create/);
    await expect(panel(page).locator('.tp-sp-head-sim')).toHaveText('Close matches');
    expect(await closeTitles(page)).toContain('Dentist appointment');
    await page.keyboard.press('Enter');
    await expect(panel(page)).toHaveCount(0);
    const bar = page.getByRole('dialog', { name: 'Quick Add' });
    await expect(bar.getByRole('textbox', { name: 'Task title' })).toHaveValue('tooth doctor visit');
  });

  test('C13-E05 a task ID typed in full comes first with no close matches; a Jira key typed in full skips them too', async ({
    page,
  }) => {
    await start(page);
    await openSearch(page);
    await search(page, 'ME-2');
    await expect.poll(() => hitTitles(page)).toEqual(['Dentist appointment']);
    await page.waitForTimeout(400);
    await expect(list(page)).toHaveAttribute('data-similar', 'off');
    await expect(panel(page).locator('.tp-sp-head-sim')).toHaveCount(0);
    await box(page).fill('');
    await search(page, 'TUDU-219');
    await page.waitForTimeout(400);
    await expect(list(page)).toHaveAttribute('data-similar', 'off');
    await expect(options(page).first()).toHaveClass(/tp-sh-create/);
    await expect(panel(page).locator('.tp-sp-head-sim')).toHaveCount(0);
  });

  test('C13-E06 the model down: the quiet line, the word matches still there; back up, the heading returns', async ({
    page,
  }) => {
    await start(page);
    const { userId } = await me(page);
    // down for this person only: the other workers' searches keep their model
    expect(
      (await page.request.post(`${API_URL}/__test/embeddings/down`, { data: { userId } })).status(),
    ).toBe(204);
    try {
      await openSearch(page);
      await searchClose(page, 'dentist');
      await expect(list(page)).toHaveAttribute('data-similar', 'error');
      await expect(panel(page).getByRole('status')).toHaveText(
        'Close matches aren’t available right now. Word matches still work.',
      );
      await expect.poll(() => hitTitles(page)).toEqual(['Dentist appointment']);
    } finally {
      expect(
        (await page.request.post(`${API_URL}/__test/embeddings/up`, { data: { userId } })).status(),
      ).toBe(204);
    }
    await box(page).fill('');
    await searchClose(page, 'dentist');
    await expect(list(page)).toHaveAttribute('data-similar', 'done');
    expect(await closeTitles(page)).toContain('Teeth cleaning booked');
  });

  test('C13-E07 Quick Add: a title that means an existing task shows "Looks like a task you have"; a shared-word match still shows; Open goes to the task and keeps the draft', async ({
    page,
  }) => {
    await start(page);
    await page.getByRole('button', { name: 'New task' }).first().click();
    const bar = page.getByRole('dialog', { name: 'Quick Add' });
    const line = bar.getByRole('textbox', { name: 'Task title' });
    await expect(line).toBeFocused();
    await line.fill('Tooth doctor visit');
    const sim = bar.locator('.tp-qa-simwrap');
    await expect(sim).toHaveClass(/tp-on/, { timeout: 10_000 });
    await expect(sim.locator('.tp-qa-sim-t').first()).toHaveText(/Dentist appointment|Teeth cleaning booked/);
    // by shared words too
    await line.fill('Renew my passport');
    await expect(sim.locator('.tp-qa-sim-t').first()).toHaveText('Renew passport', { timeout: 10_000 });
    await expect(sim.locator('.tp-qa-sim-w').first()).toHaveText('Backlog');
    await expect(bar.getByRole('button', { name: /^Add( task)?$/ })).toBeEnabled();
    await sim.getByRole('button', { name: 'Renew passport' }).click();
    await expect(bar).toHaveCount(0);
    await expect(page).toHaveURL(/\/backlog$/);
    await page.getByRole('button', { name: 'New task' }).first().click();
    await expect(line).toHaveValue('Renew my passport');
  });

  test('C13-E08 a task renamed in a second browser context is found by its new meaning here', async ({
    page,
    browser,
  }) => {
    const { ids } = await start(page);
    const context = await browser.newContext({
      reducedMotion: 'reduce',
      storageState: await page.context().storageState(),
    });
    const other = await context.newPage();
    const res = await other.request.post(`${API_URL}/api/sync`, {
      data: {
        clientId: 'other',
        mutations: [
          {
            id: crypto.randomUUID(),
            type: 'task.rename',
            payload: { id: ids['Renew passport'], title: 'Book flights to Lisbon' },
            at: new Date().toISOString(),
          },
        ],
      },
    });
    expect(res.status()).toBe(200);
    await embedded(page);
    await context.close();
    await openSearch(page);
    await searchClose(page, 'plane tickets to Portugal');
    expect(await closeTitles(page)).toContain('Book flights to Lisbon');
    // its old meaning is gone with its old words
    await box(page).fill('');
    await searchClose(page, 'renew my passport');
    expect(await closeTitles(page)).not.toContain('Book flights to Lisbon');
  });

  test('C13-E09 phone: the sheet shows the heading and its rows; a pick turns to the day', async ({
    page,
  }) => {
    test.skip(!phone(), 'the phone sheet');
    await start(page);
    await openSearch(page);
    await searchClose(page, 'tooth doctor visit');
    await expect(panel(page).locator('.tp-sp-head-sim')).toHaveText('Close matches');
    const row = hit(page, 'Teeth cleaning booked');
    await expect(row).toBeVisible();
    await row.click();
    await expect(panel(page)).toHaveCount(0);
    await expect(heading(page)).toHaveText('Monday');
    await expect(glowing(dayList(page))).toContainText('Teeth cleaning booked');
  });

  test('C13-E10 dark: close matches in the dark theme', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await start(page);
    await expect(page.locator('html')).toHaveClass(/dark/);
    await openSearch(page);
    await search(page, 'dentist');
    await expect(list(page)).toHaveAttribute('data-similar', 'done', { timeout: 10_000 });
    await expect(panel(page).locator('.tp-sp-head-sim')).toHaveText('Close matches');
    expect(await closeTitles(page)).toContain('Teeth cleaning booked');
    await hit(page, 'Teeth cleaning booked').click();
    await expect(panel(page)).toHaveCount(0);
    await expect(glowing(dayList(page))).toContainText('Teeth cleaning booked');
    await idle(page);
  });
});
