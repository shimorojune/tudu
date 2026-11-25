import type { Locator, Page } from '@playwright/test';
import { API_URL, expect, signInFresh, test } from '../../fixtures/app';
import { calls, emit, installFake, READY, teamOfTwo, updaterSays } from '../../fixtures/desktop';
import { sendRequest } from '../../fixtures/inbox';
import { createSpace, me, seedTasks } from '../../fixtures/spaces';
import { dayList, drag, fixClock, idle, row, SUNDAY, titlesOf } from '../../fixtures/today';

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
async function sheet(
  page: Page,
  at: Date = SUNDAY,
  init: Parameters<typeof installFake>[1] = {},
): Promise<Page> {
  const m = await page.context().newPage();
  await m.clock.setFixedTime(at);
  await installFake(m, { window: 'menubar', ...init });
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

  test('C20-E10 two spaces: each heading’s space tile is 20px', async ({ page, browser }) => {
    const m = await e02(page, browser);
    const tiles = m.locator('.tp-mb-gh .tp-stile');
    await expect(tiles).toHaveCount(2);
    for (const i of [0, 1]) {
      expect(await tiles.nth(i).boundingBox()).toMatchObject({ width: 20, height: 20 });
    }
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
    await expect(m.getByText('Ticks and moves save here and go when you’re back.')).toBeVisible();
    await item(list(m, 'Personal'), 'Water the plants').getByRole('checkbox').click();
    await expect(ring(m, '1 of 3')).toBeVisible();
    await page.context().setOffline(false);
    await expect(m.getByText('Ticks and moves save here and go when you’re back.')).toHaveCount(0);
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

  test('C11-E15 ⋯ › Check for updates… checks and opens Settings › This Mac on the desk; with a version ready, ⋯ › Restart to update', async ({
    page,
  }) => {
    const { m } = await threeToday(page);
    await m.getByRole('button', { name: 'More' }).click();
    await expect(m.getByRole('menuitem').first()).toHaveText('Check for updates…');
    await m.getByRole('menuitem', { name: 'Check for updates…' }).click();
    expect((await calls(m, 'checkUpdate')).map((c) => c.args)).toEqual([[true]]);
    expect((await calls(m, 'showMain')).map((c) => c.args)).toEqual([['updates']]);
    // The app hands the desk the request: Settings › This Mac over the page it is on.
    await emit(page, 'go', 'updates');
    await expect(page).toHaveURL(/[?&]settings=mac/);
    await expect(
      page.getByRole('dialog', { name: 'Settings' }).getByRole('region', { name: 'Updates' }),
    ).toBeVisible();

    await updaterSays(m, { lastResult: 'ready', ready: READY });
    // The ⋯ only opens again once the last one has finished leaving: a click during its 120 ms exit is dropped.
    await expect(m.getByRole('menu')).toHaveCount(0);
    await m.getByRole('button', { name: 'More' }).click();
    const first = m.getByRole('menuitem').first();
    await expect(first).toContainText('Restart to update');
    await expect(first).toContainText('0.38.0');
    await first.click();
    expect(await calls(m, 'installUpdate')).toHaveLength(1);
  });

  test('C20-E20 New note’s tooltip shows ⌥⌘N when the app has it, and New note alone from an older app', async ({
    page,
  }) => {
    await fixClock(page);
    await installFake(page);
    await signInFresh(page);
    const m = await sheet(page, SUNDAY, { info: { noteShortcut: '⌥⌘N' } });
    const note = m.getByRole('button', { name: 'New note' });
    await expect(note).toHaveAttribute('aria-keyshortcuts', 'Alt+Meta+N');
    await note.hover();
    await expect(m.getByRole('tooltip')).toHaveText(/^New note\s+⌥⌘N$/);
    await note.click();
    expect((await calls(m, 'openNote')).map((c) => c.args)).toEqual([[null, null]]);

    const old = await sheet(page);
    const plain = old.getByRole('button', { name: 'New note' });
    expect(await plain.getAttribute('aria-keyshortcuts')).toBeNull();
    await plain.hover();
    await expect(old.getByRole('tooltip')).toHaveText('New note');
  });

  test('C11-E16 dark: the ⋯ with Check for updates…', async ({ page }) => {
    await dark(page);
    const { m } = await threeToday(page);
    await expect(m.locator('html')).toHaveClass(/dark/);
    await m.getByRole('button', { name: 'More' }).click();
    await expect(m.getByRole('menuitem').first()).toHaveText('Check for updates…');
  });

  test('MC-E01 what is new in the Inbox: a line under the heading that opens the desk on the Inbox; none, no line', async ({
    page,
    browser,
  }) => {
    const { space, b, aId } = await teamOfTwo(page, browser);
    const quiet = await sheet(page);
    await expect(quiet.getByRole('heading', { name: 'Sunday' })).toBeVisible();
    await expect(quiet.getByRole('button', { name: /new in your Inbox/ })).toHaveCount(0);

    await sendRequest(b.page, space.id, aId, 'Proofread the brochure');
    const m = await sheet(page);
    const line = m.getByRole('button', { name: '1 new in your Inbox, open the Inbox' });
    await expect(line).toBeVisible();
    await line.click();
    expect((await calls(m, 'showMain')).map((c) => c.args)).toEqual([['/inbox']]);
    await b.context.close();
  });

  test('C20-E21 the sheet follows the theme picked on the desk, with no reload: live, missed while away, and System', async ({
    page,
  }) => {
    await page.context().addInitScript(() => {
      if (!localStorage.getItem('tudu.theme')) localStorage.setItem('tudu.theme', 'light');
    });
    const { m } = await threeToday(page);
    const html = m.locator('html');
    const card = m.locator('.tp-root.tp-mb');
    const bg = () => card.evaluate((el) => getComputedStyle(el).backgroundColor);
    await expect(html).not.toHaveClass(/dark/);
    const lightBg = await bg();
    const loads = await m.evaluate(() => performance.getEntriesByType('navigation').length);

    const pick = async (name: 'Light' | 'Dark' | 'System') => {
      await page.getByRole('button', { name: /^You: / }).click();
      await page.getByRole('group', { name: 'Theme' }).getByRole('button', { name }).click();
      await page.keyboard.press('Escape');
    };
    // Rohit's sequence from #74: Dark, Light, Dark again; the sheet matches after each.
    await pick('Dark');
    await expect(html).toHaveClass(/dark/);
    await expect.poll(bg).not.toBe(lightBg);
    await pick('Light');
    await expect(html).not.toHaveClass(/dark/);
    await expect.poll(bg).toBe(lightBg);
    await pick('Dark');
    await expect(html).toHaveClass(/dark/);

    // A pick the hidden sheet never heard (stored behind its back): the next show takes it up.
    await emit(m, 'menubar:hidden');
    await m.evaluate(() => localStorage.setItem('tudu.theme', 'light'));
    await expect(html).toHaveClass(/dark/);
    await emit(m, 'menubar:shown');
    await expect(html).not.toHaveClass(/dark/);

    // System follows the Mac's own appearance.
    await m.emulateMedia({ colorScheme: 'dark' });
    await pick('System');
    await expect(html).toHaveClass(/dark/);
    await m.emulateMedia({ colorScheme: 'light' });
    await expect(html).not.toHaveClass(/dark/);

    // All of it without the page loading again, and the sheet never speaks for the app's look.
    expect(await m.evaluate(() => performance.getEntriesByType('navigation').length)).toBe(loads);
    expect(await calls(m, 'setAppearance')).toHaveLength(0);
  });

  test('C20-E22 Less motion flipped on the desk reaches the sheet and the floating Quick Add with no reload', async ({
    page,
  }) => {
    const { m } = await threeToday(page);
    const f = await page.context().newPage();
    await fixClock(f);
    await installFake(f, { window: 'floating' });
    await f.goto('/quick-add');
    await expect(f.getByRole('textbox', { name: 'Task title' })).toBeVisible();
    await expect(m.locator('html')).not.toHaveAttribute('data-motion', 'less');
    await expect(f.locator('html')).not.toHaveAttribute('data-motion', 'less');

    const lessMotion = async () => {
      await page.getByRole('button', { name: /^You: / }).click();
      await page.getByRole('menuitem', { name: 'Settings' }).click();
      const d = page.getByRole('dialog', { name: 'Settings' });
      await d
        .getByRole('navigation', { name: 'Settings' })
        .getByRole('button', { name: /^Appearance/ })
        .click();
      await d.getByRole('switch', { name: 'Less motion' }).click();
      await page.keyboard.press('Escape');
    };
    await lessMotion();
    await expect(m.locator('html')).toHaveAttribute('data-motion', 'less');
    await expect(f.locator('html')).toHaveAttribute('data-motion', 'less');
    await lessMotion();
    await expect(m.locator('html')).not.toHaveAttribute('data-motion', 'less');
    await expect(f.locator('html')).not.toHaveAttribute('data-motion', 'less');
  });

  // ---- The sheet's height, heading, shadow and order (#123, #122) -------------------------------------------

  /** The sheet at the Mac window's size: 360 x 600, with `data-app='menubar'` set as the app sets it. */
  async function inWindow(m: Page): Promise<Page> {
    await m.setViewportSize({ width: 360, height: 600 });
    await expect(m.locator('html')).toHaveAttribute('data-app', 'menubar');
    return m;
  }
  const sheetTitles = (m: Page, space: string) => list(m, space).locator('.tp-mb-t').allTextContents();
  const serverTitles = async (m: Page, spaceId: string) => (await dayOf(m, spaceId, SUN)).map((t) => t.title);

  test('C20-E23 a full day in the app’s window: the page never scrolls, the list does, the sheet stops 16px short', async ({
    page,
  }) => {
    await fixClock(page);
    await installFake(page);
    await signInFresh(page);
    const id = await personalId(page);
    await seedTasks(
      page,
      id,
      // Twelve rows fit the window with room to spare; thirty do not.
      Array.from({ length: 30 }, (_, i) => ({ title: `Task number ${i + 1}`, day: SUN })),
    );
    const m = await inWindow(await sheet(page));
    await expect(list(m, 'Personal').getByRole('listitem')).toHaveCount(30);
    // At rest: while the app rises into place (220ms) it sits a few pixels low and the page is held from scrolling.
    await expect(m.locator('#root')).not.toHaveClass(/tl-arrive/);
    const sizes = await m.evaluate(() => {
      const page = document.scrollingElement!;
      const body = document.querySelector('.tp-mb-b')!;
      // For the message when the page is too tall: what reaches below the window.
      const low = [...document.querySelectorAll<HTMLElement>('body *')]
        .filter((e) => !e.closest('.tp-mb-b') && e.getBoundingClientRect().bottom > window.innerHeight + 0.5)
        .map((e) => {
          const r = e.getBoundingClientRect();
          return `${e.tagName}.${String(e.className).slice(0, 40)} ${Math.round(r.top)}..${Math.round(r.bottom)} ${getComputedStyle(e).position}`;
        });
      return {
        page: page.scrollHeight,
        window: window.innerHeight,
        list: body.scrollHeight - body.clientHeight,
        sheet: document.querySelector('.tp-root.tp-mb')!.getBoundingClientRect().height,
        low: low.slice(0, 12).join('\n'),
      };
    });
    expect(sizes.window).toBe(600);
    expect(sizes.page, sizes.low).toBeLessThanOrEqual(sizes.window);
    expect(sizes.list).toBeGreaterThan(0);
    expect(sizes.sheet).toBeLessThanOrEqual(584);
    // A wheel over the heading moves nothing: there is no second bar.
    await m.getByRole('heading', { name: 'Sunday' }).hover();
    await m.mouse.wheel(0, 400);
    expect(await m.evaluate(() => document.scrollingElement!.scrollTop)).toBe(0);
  });

  test('C20-E24 Scrambled on at 360px: the eyebrow, the day and the date stay one line and the heading keeps its height', async ({
    page,
  }) => {
    const { m } = await threeToday(page);
    await inWindow(m);
    const measure = () =>
      m.evaluate(() => {
        const h = (sel: string) => document.querySelector(sel)!.getBoundingClientRect().height;
        const top = (sel: string) => document.querySelector(sel)!.getBoundingClientRect().top;
        return {
          head: h('.tp-mb-h'),
          eyebrow: h('.tp-mb-eb'),
          day: h('.tp-mb-day h2'),
          date: h('.tp-mb-day span'),
          dayTop: top('.tp-mb-day h2'),
          ringTop: top('.tp-mb-h > :last-child'),
        };
      });
    await expect(m.getByRole('button', { name: /^Scrambled/ })).toHaveCount(0);
    const off = await measure();
    expect(off.day).toBe(26);
    await m.evaluate(() => localStorage.setItem('tudu.scramble', '0123456789abcdef0123456789abcdef'));
    await m.reload();
    const pill = m.getByRole('button', { name: /^Scrambled/ });
    await expect(pill).toBeVisible();
    // On the eyebrow's line, never in the heading row beside the ring.
    await expect(m.locator('.tp-mb-eb > .tp-scr-pill')).toHaveCount(1);
    await expect(m.locator('.tp-mb-h > .tp-scr-pill')).toHaveCount(0);
    expect((await pill.boundingBox())!.height).toBe(20);
    expect(await measure()).toEqual(off);
    await m.evaluate(() => localStorage.removeItem('tudu.scramble'));
  });

  test('C20-E25 in the app the sheet’s shadow stays inside the window’s clear edge; in a plain tab it keeps the pop shadow', async ({
    page,
  }) => {
    const { m } = await threeToday(page);
    await inWindow(m);
    /** How far each layer of a computed box-shadow reaches past the box: offset + spread + half the blur. */
    const reach = (p: Page) =>
      p.evaluate(() => {
        const card = document.querySelector('.tp-root.tp-mb')!;
        const probe = document.createElement('div');
        probe.style.boxShadow = 'var(--shadow-pop), 0 0 0 1px var(--line)';
        card.appendChild(probe);
        const pop = getComputedStyle(probe).boxShadow;
        probe.remove();
        const shadow = getComputedStyle(card).boxShadow;
        const layers = shadow.split(/,(?![^(]*\))/).map((layer) => {
          const [x = 0, y = 0, blur = 0, spread = 0] = (layer.match(/-?[\d.]+px/g) ?? []).map(parseFloat);
          return Math.max(Math.abs(x), Math.abs(y)) + spread + blur / 2;
        });
        return { shadow, pop, layers: layers.length, far: Math.max(...layers) };
      });
    const app = await reach(m);
    expect(app.layers).toBe(3);
    expect(app.far).toBeLessThanOrEqual(8);
    expect(app.shadow).not.toBe(app.pop);
    // A plain tab (no app around the page): nothing cuts the shadow, so it stays the deep one.
    const tab = await page.context().newPage();
    await tab.clock.setFixedTime(SUNDAY);
    await tab.goto('/menubar');
    await expect(list(tab, 'Personal')).toBeVisible();
    await expect(tab.locator('html')).not.toHaveAttribute('data-app', /./);
    const plain = await reach(tab);
    expect(plain.shadow).toBe(plain.pop);
    expect(plain.far).toBeGreaterThan(8);
  });

  test('C20-E26 drag the third row above the first, then ⌥↑: the sheet, the server and the desk show the new order', async ({
    page,
  }) => {
    const { m, id } = await threeToday(page);
    const l = list(m, 'Personal');
    await expect(l.getByRole('listitem')).toHaveCount(3);
    const [a, b, c] = (await sheetTitles(m, 'Personal')) as [string, string, string];
    // Every row carries the grip; a plain click on a title still opens the task.
    await expect(l.locator('[data-reorder] > .tp-grip')).toHaveCount(3);
    const first = (await item(l, a).boundingBox())!;
    // Pressed on the title itself (the whole row drags, not only the grip) and carried above the first row.
    await drag(m, item(l, c), { x: first.x + 120, y: first.y + 2 });
    await expect.poll(() => sheetTitles(m, 'Personal')).toEqual([c, a, b]);
    // The drop opened nothing and ticked nothing.
    expect(await calls(m, 'openTask')).toHaveLength(0);
    await expect(ring(m, '0 of 3')).toBeVisible();
    await idle(m);
    expect(await serverTitles(m, id)).toEqual([c, a, b]);
    await expect.poll(() => titlesOf(dayList(page))).toEqual([c, a, b]);

    // ⌥↑ on a focused title moves its row one place and keeps the keyboard on it.
    const title = m.getByRole('button', { name: `Open ${b} in Tudu` });
    await title.focus();
    await m.keyboard.press('Alt+ArrowUp');
    await expect.poll(() => sheetTitles(m, 'Personal')).toEqual([c, b, a]);
    await expect(title).toBeFocused();
    await idle(m);
    expect(await serverTitles(m, id)).toEqual([c, b, a]);
    await expect.poll(() => titlesOf(dayList(page))).toEqual([c, b, a]);
    // A click that doesn't move is still a click.
    await title.click();
    expect(await calls(m, 'openTask')).toHaveLength(1);
  });

  test('C20-E27 Northwind, someone else’s task on the same day: your moves stay among yours and theirs is untouched', async ({
    page,
    browser,
  }) => {
    const { slug, space, b } = await teamOfTwo(page, browser);
    await seedTasks(page, space.id, [
      { title: 'Mine one', day: SUN },
      { title: 'Mine two', day: SUN },
      { title: 'Mine three', day: SUN },
    ]);
    // Theirs sits between my first and my second in the space's numbers (1024, 1536, 2048, 3072). The server
    // gives each person their own tasks of a day, so it is on their day and never on mine.
    const theirs = crypto.randomUUID();
    const res = await b.page.request.post(`${API_URL}/api/sync`, {
      data: {
        clientId: 'seed',
        mutations: [
          {
            id: crypto.randomUUID(),
            type: 'task.create',
            payload: { id: theirs, spaceId: space.id, title: 'Their own thing', day: SUN, position: 1536 },
            at: '2026-10-18T09:00:30.000Z',
          },
        ],
      },
    });
    expect(res.status()).toBe(200);
    expect(await serverTitles(page, space.id)).toEqual(['Mine one', 'Mine two', 'Mine three']);
    expect(await serverTitles(b.page, space.id)).toEqual(['Their own thing']);
    await page.goto(`/${slug}`);
    await expect(dayList(page)).toBeVisible();
    const m = await sheet(page);
    const l = list(m, 'Northwind');
    await expect.poll(() => sheetTitles(m, 'Northwind')).toEqual(['Mine one', 'Mine two', 'Mine three']);
    // My third goes above my first.
    const first = (await item(l, 'Mine one').boundingBox())!;
    await drag(m, item(l, 'Mine three'), { x: first.x + 120, y: first.y + 2 });
    const moved = ['Mine three', 'Mine one', 'Mine two'];
    await expect.poll(() => sheetTitles(m, 'Northwind')).toEqual(moved);
    await idle(m);
    expect(await serverTitles(m, space.id)).toEqual(moved);
    await expect.poll(() => titlesOf(dayList(page))).toEqual(moved);
    // It goes back to the end of mine, past the place theirs holds.
    await m.getByRole('button', { name: 'Open Mine three in Tudu' }).focus();
    await m.keyboard.press('Alt+ArrowDown');
    await m.keyboard.press('Alt+ArrowDown');
    const back = ['Mine one', 'Mine two', 'Mine three'];
    await expect.poll(() => sheetTitles(m, 'Northwind')).toEqual(back);
    await idle(m);
    expect(await serverTitles(m, space.id)).toEqual(back);
    // Their day never changed.
    expect(await serverTitles(b.page, space.id)).toEqual(['Their own thing']);
    await b.context.close();
  });

  test('C20-E28 offline, a moved row stays moved; back online the server has the new order', async ({
    page,
  }) => {
    const { m, id } = await threeToday(page);
    const l = list(m, 'Personal');
    await expect(l.getByRole('listitem')).toHaveCount(3);
    const [a, b, c] = (await sheetTitles(m, 'Personal')) as [string, string, string];
    await idle(m);
    await page.context().setOffline(true);
    await expect(m.getByText('Ticks and moves save here and go when you’re back.')).toBeVisible();
    await m.getByRole('button', { name: `Open ${a} in Tudu` }).focus();
    await m.keyboard.press('Alt+ArrowDown');
    await expect.poll(() => sheetTitles(m, 'Personal')).toEqual([b, a, c]);
    // It stays where it was put while offline, and nothing says it failed.
    await m.waitForTimeout(600);
    expect(await sheetTitles(m, 'Personal')).toEqual([b, a, c]);
    await expect(m.getByRole('alert')).toHaveCount(0);
    await page.context().setOffline(false);
    await expect(m.getByText('Ticks and moves save here and go when you’re back.')).toHaveCount(0);
    await idle(m);
    expect(await serverTitles(m, id)).toEqual([b, a, c]);
    expect(await sheetTitles(m, 'Personal')).toEqual([b, a, c]);
  });
});
