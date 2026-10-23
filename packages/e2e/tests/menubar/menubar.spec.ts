import type { Locator, Page } from '@playwright/test';
import { API_URL, expect, signInFresh, test } from '../../fixtures/app';
import { calls, emit, installFake, teamOfTwo } from '../../fixtures/desktop';
import { createSpace, me, seedTasks } from '../../fixtures/spaces';
import { dayList, fixClock, idle, row, SUNDAY } from '../../fixtures/today';

/**
 * Today from the menu bar: the page the macOS app's sheet holds (/menubar), against a fake of the app that records
 * what the sheet asks for (fixtures/desktop.ts). The real tick and window are tested by the desktop group in
 * packages/e2e/mac. One size: the sheet is 360 wide wherever it is.
 */
test.beforeEach(() => {
  test.skip(test.info().project.name !== 'desktop', 'the sheet is one size');
});

const SUN = '2026-10-18';
const SAT = '2026-10-17';
const MON = '2026-10-19';

/** The sheet: the same session as `page`, its own page at /menubar, the fake saying "menubar". */
async function sheet(page: Page, at: Date = SUNDAY): Promise<Page> {
  const m = await page.context().newPage();
  await m.clock.setFixedTime(at);
  await installFake(m, { window: 'menubar' });
  await m.goto('/menubar');
  return m;
}

const list = (m: Page, space: string) => m.getByRole('list', { name: `Today in ${space}` });
const item = (l: Locator, title: string) => l.getByRole('listitem').filter({ hasText: title });
const ring = (m: Page, words: string) => m.getByRole('img', { name: `${words} crossed off` });

async function personalId(page: Page): Promise<string> {
  return (await me(page)).spaces.find((s) => s.kind === 'personal')!.id;
}

/** Signed in on the desk (the fake saying "main"), with three tasks today in Personal, one carried from Saturday. */
async function threeToday(page: Page): Promise<{ m: Page; id: string; ids: Record<string, string> }> {
  // Signed in on Saturday evening, so Saturday's open task is carried when Sunday's list is first read.
  await fixClock(page, new Date(2026, 9, 17, 18, 0));
  await installFake(page);
  await signInFresh(page);
  const id = await personalId(page);
  const ids = await seedTasks(page, id, [
    { title: 'Book the dentist', day: SAT },
    { title: 'Send the invoice', day: SUN },
    { title: 'Water the plants', day: SUN },
  ]);
  await fixClock(page);
  await page.reload();
  await expect(page.getByText('Today · Week 42')).toBeVisible();
  return { m: await sheet(page), id, ids };
}

async function dayOf(page: Page, spaceId: string, day: string) {
  const res = await page.request.get(`${API_URL}/api/spaces/${spaceId}/days/${day}`);
  return ((await res.json()) as { tasks: Array<{ title: string; done: boolean }> }).tasks;
}

async function e01(page: Page) {
  const { m } = await threeToday(page);
  await expect(m.getByRole('heading', { name: 'Sunday' })).toBeVisible();
  await expect(m.getByText('Today · Week 42')).toBeVisible();
  await expect(m.getByText('18 October')).toBeVisible();
  await expect(ring(m, '0 of 3')).toBeVisible();
  const l = list(m, 'Personal');
  await expect(l.getByRole('listitem')).toHaveCount(3);
  // One space: one plain list, no heading over it.
  await expect(m.locator('.tp-mb-gh')).toHaveCount(0);
  // The byline as Today writes it: carried from Saturday.
  await expect(item(l, 'Book the dentist')).toContainText('From Sat');
  await item(l, 'Send the invoice').getByRole('checkbox').click();
  await expect(ring(m, '1 of 3')).toBeVisible();
  // Struck through where it is: the order holds.
  await expect(item(l, 'Send the invoice')).toHaveClass(/tp-done/);
  await expect(l.getByRole('listitem').nth(1)).toContainText('Send the invoice');
  await idle(m);
  return m;
}

async function e02(page: Page, browser: Parameters<typeof teamOfTwo>[1]) {
  const { slug, space, b } = await teamOfTwo(page, browser);
  const personal = await personalId(page);
  await seedTasks(page, personal, [{ title: 'Call Mum', day: SUN }]);
  await seedTasks(page, space.id, [{ title: 'Review the brief', day: SUN }]);
  // Someone else's task on the shared page is theirs, never on your sheet.
  await seedTasks(b.page, space.id, [{ title: 'Their own thing', day: SUN }]);
  // A space with nothing today is left out.
  await page.goto('/me');
  await createSpace(page, 'Quiet Co');
  const m = await sheet(page);
  await expect(list(m, 'Personal')).toBeVisible();
  await expect(m.getByRole('list')).toHaveCount(2);
  const groups = m.locator('.tp-mb-g');
  await expect(groups.nth(0)).toContainText('Personal');
  await expect(groups.nth(1)).toContainText('Northwind');
  await expect(groups.nth(0).locator('.tp-mb-gh')).toContainText('0 of 1');
  await expect(groups.nth(1).locator('.tp-mb-gh')).toContainText('0 of 1');
  await expect(list(m, 'Northwind')).toContainText('Review the brief');
  await expect(m.getByText('Their own thing')).toHaveCount(0);
  await expect(m.getByText('Quiet Co')).toHaveCount(0);
  await expect(ring(m, '0 of 2')).toBeVisible();
  expect(slug).toBeTruthy();
  await b.context.close();
  return m;
}

const dark = async (page: Page) =>
  page.context().addInitScript(() => {
    if (!localStorage.getItem('tudu.theme')) localStorage.setItem('tudu.theme', 'dark');
  });

test.describe('menubar', () => {
  test('C20-E01 Personal with three tasks: the head, the ring, the rows and their bylines; a tick counts and stays in place', async ({
    page,
  }) => {
    const m = await e01(page);
    // The tick reached the server, through the same outbox as the desk's.
    const id = await personalId(page);
    expect((await dayOf(m, id, SUN)).find((t) => t.title === 'Send the invoice')?.done).toBe(true);
  });

  test('C20-E02 Personal and Northwind: two headed groups in order; an empty space is absent; someone else’s task never shows', async ({
    page,
    browser,
  }) => {
    await e02(page, browser);
  });

  test('C20-E03 live: a task added on another device and a tick made on the desk show on the sheet within a second', async ({
    page,
  }) => {
    const { m, id } = await threeToday(page);
    await expect(ring(m, '0 of 3')).toBeVisible();
    // Another device of yours adds one.
    await seedTasks(page, id, [{ title: 'Buy oat milk', day: SUN }]);
    await expect(item(list(m, 'Personal'), 'Buy oat milk')).toBeVisible({ timeout: 2_000 });
    await row(dayList(page), 'Water the plants').getByRole('checkbox').click();
    await expect(item(list(m, 'Personal'), 'Water the plants')).toHaveClass(/tp-done/, { timeout: 2_000 });
    await expect(ring(m, '1 of 4')).toBeVisible();
  });

  test('C20-E04 what a click asks of the app: openTask, summon, showMain and feedback; the desk opens the form', async ({
    page,
  }) => {
    const { m } = await threeToday(page);
    await m.getByRole('button', { name: 'Open Send the invoice in Tudu' }).click();
    const [open] = await calls(m, 'openTask');
    expect(open!.args[0]).toMatch(/^\/me\?task=ME-\d+$/);
    await m.getByRole('button', { name: /^New task/ }).click();
    expect(await calls(m, 'summon')).toHaveLength(1);
    await m.getByRole('button', { name: 'Open Tudu' }).click();
    expect((await calls(m, 'showMain')).map((c) => c.args)).toEqual([[null]]);
    await m.getByRole('button', { name: 'More' }).click();
    await m.getByRole('menuitem', { name: /Send feedback/ }).click();
    expect(await calls(m, 'feedback')).toHaveLength(1);
    // The app hands the desk what openTask and feedback ask for: the task's panel, the form.
    await page.goto('/me');
    await expect(page.getByText('Today · Week 42')).toBeVisible();
    await emit(page, 'go', open!.args[0]);
    await expect(page).toHaveURL(/\?task=ME-\d+$/);
    await expect(page.getByRole('dialog', { name: 'Task details' })).toContainText('Send the invoice');
    await emit(page, 'go', 'feedback');
    await expect(page.getByRole('dialog', { name: 'Send feedback' })).toBeVisible();
    // Esc in the sheet puts it away.
    await m.keyboard.press('Escape');
    await m.keyboard.press('Escape');
    expect((await calls(m, 'hideMenubar')).length).toBeGreaterThan(0);
  });

  test('C20-E05 nothing today: the lines say what is true, and only that', async ({ page }) => {
    await fixClock(page);
    await installFake(page);
    await signInFresh(page);
    const id = await personalId(page);
    await seedTasks(
      page,
      id,
      Array.from({ length: 12 }, (_, i) => ({ title: `Someday ${i + 1}`, day: null })),
    );
    const m = await sheet(page);
    await expect(m.getByRole('heading', { name: 'Nothing planned for today.' })).toBeVisible();
    await expect(m.getByText('The Backlog has 12 waiting for a day.')).toBeVisible();
    await expect(m.getByText(/Tomorrow has/)).toHaveCount(0);
    await expect(m.getByRole('button', { name: 'New task' })).toBeVisible();
    await seedTasks(page, id, [
      { title: 'Mon one', day: MON },
      { title: 'Mon two', day: MON },
      { title: 'Mon three', day: MON },
    ]);
    await emit(m, 'menubar:shown');
    await expect(m.getByText('Tomorrow has 3. The Backlog has 12 waiting for a day.')).toBeVisible();
  });

  test('C20-E06 offline: the line shows, and a tick made offline reaches the server on reconnect', async ({
    page,
  }) => {
    const { m, id } = await threeToday(page);
    await expect(ring(m, '0 of 3')).toBeVisible();
    await page.context().setOffline(true);
    await expect(m.getByText('Ticks save here and go when you’re back.')).toBeVisible();
    await item(list(m, 'Personal'), 'Water the plants').getByRole('checkbox').click();
    await expect(ring(m, '1 of 3')).toBeVisible();
    await page.context().setOffline(false);
    await expect(m.getByText('Ticks save here and go when you’re back.')).toHaveCount(0);
    await idle(m);
    expect((await dayOf(m, id, SUN)).find((t) => t.title === 'Water the plants')?.done).toBe(true);
  });

  test('C20-E07 signed out: the sentence, Open Tudu, and ⋯ with Quit Tudu alone', async ({ page }) => {
    await fixClock(page);
    await installFake(page, { window: 'menubar' });
    await page.goto('/menubar');
    await expect(page.getByRole('heading', { name: 'Sign in to see your day.' })).toBeVisible();
    await expect(page.getByText('Your tasks show here once you are signed in on this Mac.')).toBeVisible();
    await page.getByRole('button', { name: 'Open Tudu' }).click();
    expect(await calls(page, 'showMain')).toHaveLength(1);
    await page.getByRole('button', { name: 'More' }).click();
    await expect(page.getByRole('menuitem')).toHaveCount(1);
    await page.getByRole('menuitem', { name: /Quit Tudu/ }).click();
    expect(await calls(page, 'quit')).toHaveLength(1);
  });

  test('C20-E08 at 02:00 the sheet still shows the day before, as the desk does', async ({ page }) => {
    await fixClock(page);
    await installFake(page);
    await signInFresh(page);
    const id = await personalId(page);
    await seedTasks(page, id, [{ title: 'Sunday’s one', day: SUN }]);
    // The desk was on Sunday; it is now 02:00 on Monday.
    const m = await sheet(page, new Date(2026, 9, 19, 2, 0));
    await expect(m.getByRole('heading', { name: 'Sunday' })).toBeVisible();
    await expect(item(list(m, 'Personal'), 'Sunday’s one')).toBeVisible();
  });

  test('C20-E09 dark: E01 and E02 again; the kit shows every state light and dark', async ({
    page,
    browser,
  }) => {
    await dark(page);
    const m = await e01(page);
    await expect(m.locator('html')).toHaveClass(/dark/);
    await page.context().clearCookies();
    const other = await browser.newContext({
      reducedMotion: 'reduce',
      viewport: { width: 1440, height: 900 },
    });
    const p2 = await other.newPage();
    await dark(p2);
    const m2 = await e02(p2, browser);
    await expect(m2.locator('html')).toHaveClass(/dark/);
    await other.close();

    await page.goto('/kit#menu-bar');
    for (const [title, check] of [
      ['Menu bar, one space', (l: Locator) => expect(l.getByRole('listitem')).toHaveCount(3)],
      ['Menu bar, two spaces', (l: Locator) => expect(l.locator('.tp-mb-gh')).toHaveCount(2)],
      ['Menu bar, offline', (l: Locator) => expect(l.getByText('You’re offline.')).toBeVisible()],
      [
        'Menu bar, nothing today',
        (l: Locator) => expect(l.getByText('Nothing planned for today.')).toBeVisible(),
      ],
      ['Menu bar, signed out', (l: Locator) => expect(l.getByText('Sign in to see your day.')).toBeVisible()],
    ] as const) {
      const block = page.getByRole('region', { name: title, exact: true });
      for (const i of [0, 1]) await check(block.locator('.kit-desk').nth(i));
    }
  });
});
