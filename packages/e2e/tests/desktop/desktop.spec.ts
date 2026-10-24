import type { Page } from '@playwright/test';
import { expect, signInFresh, test } from '../../fixtures/app';
import {
  badge,
  calls,
  emit,
  inAppWithTeam,
  installFake,
  READY,
  setFake,
  signInHere,
  teamOfTwo,
} from '../../fixtures/desktop';
import { goInbox, pane, rows, section, sendRequest, inboxPip } from '../../fixtures/inbox';
import { connectByApi, issueRow, JIRA_SITE, openJira } from '../../fixtures/jira';
import { createSpace, switchTo } from '../../fixtures/spaces';
import { dayList, fixClock, idle, row } from '../../fixtures/today';

/**
 * The web app's side of the macOS app, against a fake of the app (fixtures/desktop.ts). The real app is tested by
 * the desktop group in packages/e2e/mac. Desk size only: the app's window is never narrower than 900px.
 */
test.beforeEach(() => {
  test.skip(test.info().project.name !== 'desktop', 'the app window is desk sized');
});

const ITEM = 'Tudu is ready: version 0.38.0';
const updates = (page: Page) => section(page, 'Updates');
const appRow = (page: Page) => updates(page).getByRole('article', { name: ITEM });

/** The floating window: the same session as `page`, its own page at /quick-add, the fake saying "floating". */
async function floating(page: Page): Promise<Page> {
  const f = await page.context().newPage();
  await fixClock(f);
  await installFake(f, { window: 'floating' });
  await f.goto('/quick-add');
  return f;
}

async function newVersion(page: Page) {
  await expect.poll(() => inboxPip(page)).toBe(1);
  await goInbox(page);
  await expect(appRow(page)).toBeVisible();
  await expect(appRow(page).getByLabel('New')).toBeVisible();
  await expect(appRow(page)).toContainText('The floating bar keeps your draft');
  await appRow(page).getByRole('button').click();
  await expect(pane(page)).toContainText(ITEM);
  await expect(pane(page).locator('li')).toHaveText([
    'The floating bar keeps your draft',
    'Search finds a task by its key',
  ]);
  await expect(pane(page).getByRole('button', { name: 'What’s new' })).toBeVisible();
  await expect(pane(page).getByRole('button', { name: 'Restart to update' })).toBeVisible();
  await expect(appRow(page).getByLabel('New')).toHaveCount(0);
  await expect.poll(() => inboxPip(page)).toBe(0);
}

async function floatingAdd(page: Page, title: string) {
  const f = await floating(page);
  const line = f.getByRole('textbox', { name: 'Task title' });
  await line.fill(title);
  await f.getByRole('button', { name: 'Add task' }).click();
  await expect(f.getByRole('button', { name: 'Added' })).toBeVisible();
  // The tick shows, then the window is put away.
  await expect.poll(async () => (await calls(f, 'hideFloating')).length).toBe(1);
  // The desk shows it as it arrives, no reload.
  await expect(row(dayList(page), title)).toBeVisible({ timeout: 10_000 });
  return f;
}

test.describe('desktop', () => {
  test('C11-E01 in the app the sidebar’s head leaves room for the lights and the top bar drags; the web has neither', async ({
    page,
    browser,
  }) => {
    await fixClock(page);
    await installFake(page);
    await signInFresh(page);
    await expect(page.locator('html')).toHaveAttribute('data-app', 'desktop');
    const side = page.locator('.app-side .tp-sidebar');
    await expect(side).toHaveCSS('padding-top', '50px');
    await expect(page.locator('.app-drag-strip')).toHaveAttribute('data-tauri-drag-region', '');
    await expect(page.locator('header.tp-topbar')).toHaveAttribute('data-tauri-drag-region', '');
    await expect(page.locator('.tp-topbar .tp-tb-sp')).toHaveAttribute('data-tauri-drag-region', '');
    // The app tells the app who is signed in.
    await expect.poll(async () => (await calls(page, 'setSignedIn')).at(-1)?.args).toEqual([true]);

    const web = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
    const w = await web.newPage();
    await fixClock(w);
    await signInFresh(w);
    await expect(w.locator('html')).not.toHaveAttribute('data-app', /./);
    await expect(w.locator('.app-side .tp-sidebar')).toHaveCSS('padding-top', '22px');
    await expect(w.locator('[data-tauri-drag-region]')).toHaveCount(0);
    await web.close();
  });

  test('C11-E02 a new version: the count rises, Updates shows it with the dot, opening reads it, a reload keeps it read', async ({
    page,
  }) => {
    await inAppWithTeam(page, { update: READY });
    await expect.poll(() => badge(page)).toBe(1);
    await newVersion(page);
    await expect.poll(() => badge(page)).toBe(0);
    await page.reload();
    await expect(appRow(page)).toBeVisible();
    await expect(appRow(page).getByLabel('New')).toHaveCount(0);
    await expect.poll(() => inboxPip(page)).toBe(0);
    // What's new keeps you on the item.
    await pane(page).getByRole('button', { name: 'What’s new' }).click();
    await expect(pane(page)).toContainText(ITEM);
  });

  test('C11-E03 Restart to update says Restarting… and relaunches once; a refused restart toasts and frees the button', async ({
    page,
  }) => {
    await inAppWithTeam(page, { update: READY });
    await goInbox(page);
    await appRow(page).getByRole('button').click();
    await pane(page).getByRole('button', { name: 'Restart to update' }).click();
    await expect(pane(page).getByRole('button', { name: /Restarting…/ })).toBeVisible();
    await pane(page)
      .getByRole('button', { name: /Restarting…/ })
      .click({ force: true });
    expect(await calls(page, 'installUpdate')).toHaveLength(1);

    await page.reload();
    await setFake(page, { refuseRestart: true });
    await appRow(page).getByRole('button').click();
    await pane(page).getByRole('button', { name: 'Restart to update' }).click();
    await expect(page.locator('.tp-toast')).toContainText(
      'Couldn’t restart. Quit and open Tudu again to finish.',
    );
    await expect(pane(page).getByRole('button', { name: 'Restart to update' })).toBeEnabled();
  });

  test('C11-E04 the floating page: Add task, the tick, then hide; the task on Today live; Esc and a click outside hide; the draft stays', async ({
    page,
  }) => {
    await fixClock(page);
    await installFake(page);
    await signInFresh(page);
    const f = await floatingAdd(page, 'Call the venue');
    // No note under the bar in the app.
    await expect(f.getByText(/floats over whatever you are doing/)).toHaveCount(0);

    const line = f.getByRole('textbox', { name: 'Task title' });
    await line.fill('Half a thought');
    await f.keyboard.press('Escape');
    await expect.poll(async () => (await calls(f, 'hideFloating')).length).toBe(2);
    await f
      .locator('body')
      .click({ position: { x: 5, y: 5 } })
      .catch(() => {});
    await line.evaluate((el) => (el as HTMLInputElement).blur());
    await emit(f, 'floating:shown');
    await expect(line).toBeFocused();
    await expect(line).toHaveValue('Half a thought');
    // The clear part around the bar.
    const before = (await calls(f, 'hideFloating')).length;
    await f.locator('.app-floating-bar').click({ position: { x: 4, y: 4 } });
    await expect.poll(async () => (await calls(f, 'hideFloating')).length).toBe(before + 1);
  });

  test('C11-E05 not signed in: the floating page asks the desk for Sign in and hides; after signing in there, the bar works', async ({
    page,
  }) => {
    await fixClock(page);
    await installFake(page);
    await page.goto('/sign-in');
    await expect.poll(async () => (await calls(page, 'setSignedIn')).at(-1)?.args).toEqual([false]);
    const f = await floating(page);
    // The floating window never turns into Sign in itself.
    await expect(f).toHaveURL(/\/quick-add$/);
    await expect(f.locator('.app-floating')).toHaveCount(0);
    await emit(f, 'floating:shown');
    await expect.poll(async () => calls(f, 'showMain')).toEqual([{ name: 'showMain', args: ['/sign-in'] }]);
    // The desk was asked to show Sign in; there you sign in.
    await emit(page, 'go', '/sign-in');
    await signInHere(page);
    await expect.poll(async () => (await calls(page, 'setSignedIn')).at(-1)?.args).toEqual([true]);
    await emit(f, 'floating:shown');
    await f.getByRole('textbox', { name: 'Task title' }).fill('Book the dentist');
    await f.getByRole('button', { name: 'Add task' }).click();
    await expect.poll(async () => (await calls(f, 'hideFloating')).length).toBe(1);
    await expect(row(dayList(page), 'Book the dentist')).toBeVisible({ timeout: 10_000 });
  });

  test('C11-E06 links in the app: Open in Jira goes to the opener; a chip saves to Downloads; the badge follows the Inbox', async ({
    page,
    browser,
  }) => {
    const { space, b, aId } = await teamOfTwo(page, browser);
    // Open in Jira: handed to the app, never a new window.
    await connectByApi(page, space.id);
    await page.reload();
    await openJira(page);
    await issueRow(page, 'TUDU-212').click();
    let popups = 0;
    page.on('popup', () => (popups += 1));
    await page.getByRole('button', { name: 'Open TUDU-212 in Jira' }).click();
    await expect
      .poll(async () => calls(page, 'openExternal'))
      .toEqual([{ name: 'openExternal', args: [`${JIRA_SITE}/browse/TUDU-212`] }]);
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');

    // An attachment chip in a task's notes.
    await page.getByRole('button', { name: 'New task' }).first().click();
    const qa = page.getByRole('dialog', { name: 'New task' });
    await qa.getByRole('textbox', { name: 'Task title' }).fill('Read the plan');
    await qa.locator('input[type=file]').setInputFiles({
      name: 'Q3 plan.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.alloc(2048, 1),
    });
    await expect(qa.locator('.tp-qa-file')).not.toHaveClass(/tp-qa-file-up/);
    await qa.getByRole('button', { name: 'Add task' }).click();
    await expect(qa).toHaveCount(0, { timeout: 5000 });
    await idle(page);
    await row(dayList(page), 'Read the plan').getByRole('button', { name: 'Read the plan' }).click();
    const chip = page.getByRole('dialog', { name: 'Task details' }).locator('a.tp-att');
    await chip.click();
    await expect(page.locator('.tp-toast')).toContainText('Saved to Downloads.');
    expect(await calls(page, 'saveDownload')).toEqual([
      { name: 'saveDownload', args: ['Q3 plan.pdf', 2048] },
    ]);
    expect(popups).toBe(0);
    await page.keyboard.press('Escape');

    // The dock badge: a task sent to you makes it 1.
    await expect.poll(() => badge(page)).toBe(0);
    await sendRequest(b.page, space.id, aId, 'Proofread the brochure');
    await expect.poll(() => badge(page), { timeout: 10_000 }).toBe(1);
    await b.context.close();
  });

  test('C11-E07 two spaces: the version is in both Inboxes, counted once on the dock; read in one, read in both', async ({
    page,
  }) => {
    await inAppWithTeam(page, { update: READY }, 'Northwind');
    await createSpace(page, 'Acme');
    await expect.poll(() => badge(page)).toBe(1);
    await goInbox(page);
    await expect(appRow(page).getByLabel('New')).toBeVisible();
    await switchTo(page, 'Northwind');
    await goInbox(page);
    await expect(appRow(page).getByLabel('New')).toBeVisible();
    await appRow(page).getByRole('button').click();
    await expect(pane(page)).toContainText(ITEM);
    await expect.poll(() => badge(page)).toBe(0);
    await switchTo(page, 'Acme');
    await goInbox(page);
    await expect(appRow(page)).toBeVisible();
    await expect(appRow(page).getByLabel('New')).toHaveCount(0);
    await expect(rows(updates(page))).toHaveCount(1);
  });

  test('C11-E08 dark: a new version and the floating page', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.addInitScript(() => {
      if (!localStorage.getItem('tudu.theme')) localStorage.setItem('tudu.theme', 'dark');
    });
    await inAppWithTeam(page, { update: READY });
    await expect(page.locator('.tp-desk, html').first()).toBeVisible();
    await newVersion(page);
    await expect(pane(page).locator('.tp-ix-av-app')).toBeVisible();
    await page.goto(page.url().replace(/\/inbox.*$/, ''));
    const f = await floatingAdd(page, 'Water the plants');
    await expect(f.locator('.tp-desk')).toHaveAttribute('data-theme', 'dark');
  });

  test('C11-E09 the floating page follows the theme picked on the desk: open, and put away until the summon', async ({
    page,
  }) => {
    await fixClock(page);
    await installFake(page);
    await signInFresh(page);
    const f = await floating(page);
    const desk = f.locator('.tp-desk');
    await expect(desk).toHaveAttribute('data-theme', 'light');

    const pick = async (name: 'Light' | 'Dark' | 'System') => {
      await page.getByRole('button', { name: /^You: / }).click();
      await page.getByRole('group', { name: 'Theme' }).getByRole('button', { name }).click();
      await page.keyboard.press('Escape');
    };
    // Dark on the desk with the bar open.
    await pick('Dark');
    await expect(page.locator('html')).toHaveClass(/dark/);
    await expect(desk).toHaveAttribute('data-theme', 'dark');
    await expect(f.locator('html')).toHaveClass(/dark/);

    // Put away, Light on the desk, then the summon.
    await f.keyboard.press('Escape');
    await expect.poll(async () => (await calls(f, 'hideFloating')).length).toBe(1);
    await pick('Light');
    await emit(f, 'floating:shown');
    await expect(desk).toHaveAttribute('data-theme', 'light');
    await expect(f.locator('html')).not.toHaveClass(/dark/);
  });

  test('C17-E04 the floating page says where: it starts on the desk’s last space, and a task sent to Northwind lands there', async ({
    page,
  }) => {
    test.skip(test.info().project.name !== 'desktop', 'the floating bar is the Mac’s');
    await inAppWithTeam(page);
    // The desk was last on Northwind.
    const f = await floating(page);
    const line = f.locator('.tp-qa-toline');
    await expect(line).toHaveText(/^In.*Northwind.*for.*Me$/);
    await f.getByRole('button', { name: 'Space: Northwind' }).click();
    await f.getByRole('menuitemradio', { name: /Personal/ }).click();
    await expect(line).toHaveText(/^In.*Personal.*for/);
    await f.getByRole('textbox', { name: 'Task title' }).fill('From the floating bar');
    await f.getByRole('button', { name: 'Add task' }).click();
    await expect.poll(async () => (await calls(f, 'hideFloating')).length).toBe(1);
    await switchTo(page, 'Personal');
    await expect(row(dayList(page), 'From the floating bar')).toBeVisible({ timeout: 10_000 });
  });
});

test.describe('This Mac', () => {
  const dialog = (page: Page) => page.getByRole('dialog', { name: 'Settings' });
  const nav = (page: Page) => page.getByRole('navigation', { name: 'Settings' });
  const openThisMac = async (page: Page) => {
    await page.getByRole('button', { name: /^You: / }).click();
    await page.getByRole('menuitem', { name: 'Settings' }).click();
    await expect(dialog(page)).toBeVisible();
    await nav(page)
      .getByRole('button', { name: /^This Mac/ })
      .click();
    await expect(dialog(page).getByRole('heading', { level: 1 })).toHaveText('This Mac');
  };
  const loginSwitch = (page: Page) => dialog(page).getByRole('switch', { name: 'Open at login' });

  test('C16-E01 Settings › This Mac is only in the app: Open at login asks the app, waits for macOS, opens Login Items', async ({
    page,
  }) => {
    await fixClock(page);
    await signInFresh(page);
    await page.getByRole('button', { name: /^You: / }).click();
    await page.getByRole('menuitem', { name: 'Settings' }).click();
    await expect(nav(page).getByRole('button', { name: /^Appearance/ })).toBeVisible();
    await expect(nav(page).getByRole('button', { name: /^This Mac/ })).toHaveCount(0);

    await installFake(page, { loginAnswer: 'approval' });
    await page.goto('/');
    await openThisMac(page);
    expect(await calls(page, 'thisMac')).toHaveLength(1);
    await expect(loginSwitch(page)).toHaveAttribute('aria-checked', 'false');
    await loginSwitch(page).click();
    await expect(dialog(page)).toContainText('macOS needs you to allow Tudu');
    await expect(loginSwitch(page)).toHaveAttribute('aria-checked', 'true');
    await dialog(page).getByRole('button', { name: 'Open Login Items' }).click();
    expect((await calls(page, 'setOpenAtLogin')).map((c) => c.args)).toEqual([[true]]);
    expect(await calls(page, 'openLoginItems')).toHaveLength(1);

    // macOS says no: the switch goes back off and says so.
    await setFake(page, { loginAnswer: 'refused' });
    await loginSwitch(page).click();
    await expect(dialog(page)).toContainText('macOS didn’t allow it.');
    await expect(loginSwitch(page)).toHaveAttribute('aria-checked', 'false');
  });

  test('C16-E02 Show Tudu in the Dock: the choice goes to the app at once and reads back when Settings opens again', async ({
    page,
  }) => {
    await fixClock(page);
    await installFake(page, { thisMac: { openAtLogin: 'on', dock: 'open' } });
    await signInFresh(page);
    await openThisMac(page);
    await expect(loginSwitch(page)).toHaveAttribute('aria-checked', 'true');
    const dock = dialog(page).getByRole('group', { name: 'Show Tudu in the Dock' });
    await expect(dock.getByRole('button', { name: 'While the window is open' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await dock.getByRole('button', { name: 'Always' }).click();
    expect((await calls(page, 'setDock')).map((c) => c.args)).toEqual([['always']]);

    await dialog(page).getByRole('button', { name: 'Close' }).click();
    await expect(dialog(page)).toHaveCount(0);
    await openThisMac(page);
    expect(await calls(page, 'thisMac')).toHaveLength(2);
    await expect(
      dialog(page)
        .getByRole('group', { name: 'Show Tudu in the Dock' })
        .getByRole('button', { name: 'Always' }),
    ).toHaveAttribute('aria-pressed', 'true');
  });
});

test.describe('the version in Settings', () => {
  const dialog = (page: Page) => page.getByRole('dialog', { name: 'Settings' });
  const openSettings = async (page: Page) => {
    await page.getByRole('button', { name: /^You: / }).click();
    await page.getByRole('menuitem', { name: 'Settings' }).click();
    await expect(dialog(page)).toBeVisible();
  };

  test('C11-E10 Tudu Staging: the app’s own name and version with the dot; the click goes to the app’s opener', async ({
    page,
  }) => {
    await fixClock(page);
    await installFake(page, {
      info: { track: 'staging', name: 'Tudu Staging', version: '0.37.1-staging.132' },
    });
    await signInFresh(page);
    await openSettings(page);
    const link = dialog(page).getByRole('link', {
      name: /^Tudu Staging 0\.37\.1-staging\.132, a staging build/,
    });
    await expect(link).toHaveText('Tudu Staging0.37.1-staging.132');
    await expect(link.locator('.tp-ver-dot')).toBeVisible();
    const tabs = page.context().pages().length;
    await link.click();
    await expect
      .poll(async () => (await calls(page, 'openExternal')).map((c) => c.args[0]))
      .toEqual(['https://github.com/shimorojune/tudu/releases#release-staging']);
    expect(page.context().pages()).toHaveLength(tabs);
  });

  test('C11-E11 Tudu Test: the version is plain text, no link and no dot', async ({ page }) => {
    await fixClock(page);
    await installFake(page, { info: { track: 'test', name: 'Tudu Test', version: '0.37.0' } });
    await signInFresh(page);
    await openSettings(page);
    const line = dialog(page).locator('.tp-set-ver');
    await expect(line).toHaveText('Tudu Test0.37.0');
    await expect(dialog(page).getByRole('link', { name: /^Tudu Test/ })).toHaveCount(0);
    await expect(line.locator('.tp-ver-dot')).toHaveCount(0);
  });
});
