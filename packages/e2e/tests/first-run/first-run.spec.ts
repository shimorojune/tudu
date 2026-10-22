import type { Browser, Page } from '@playwright/test';
import { API_URL, codeFor, enterCode, expect, freshEmail, signInFresh, test } from '../../fixtures/app';
import { goodToken, JIRA_SITE } from '../../fixtures/jira';
import { createSpace, joinLink, me } from '../../fixtures/spaces';
import { dayList, fixClock, idle, writeTasks } from '../../fixtures/today';

const desktop = () => test.info().project.name === 'desktop';
const tablet = () => test.info().project.name === 'tablet';
const phone = () => test.info().project.name === 'phone';

/** The card; found by its class, since an open dialog hides the page from the accessibility tree. */
const card = (page: Page) => page.locator('section.tp-gs');
const count = (page: Page) => card(page).locator('.tp-gs-n');
const step = (page: Page, label: string) => card(page).getByRole('button', { name: new RegExp(`^${label}`) });
const toast = (page: Page) => page.locator('.tp-toast');
const settings = (page: Page) => page.getByRole('dialog', { name: 'Settings' });
const quickAdd = (page: Page) => page.getByRole('dialog', { name: 'Quick Add' });

/** A new person, card and all. */
function newcomer(page: Page, email = freshEmail('new')): Promise<string> {
  return signInFresh(page, email, { gettingStarted: true });
}

/** A second browser for someone, signed in by the sign-in page, card and all. */
async function browserFor(
  browser: Browser,
  email = freshEmail('new'),
): Promise<{ page: Page; email: string }> {
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await context.newPage();
  await fixClock(page);
  await signInFresh(page, email, { gettingStarted: true });
  return { page, email };
}

/** Change things through the API, as another device of the same person would. */
async function sync(page: Page, type: string, payload: Record<string, unknown>): Promise<void> {
  const res = await page.request.post(`${API_URL}/api/sync`, {
    data: {
      clientId: 'elsewhere',
      mutations: [{ id: crypto.randomUUID(), type, payload, at: new Date().toISOString() }],
    },
  });
  expect(res.status()).toBe(200);
}
async function nameElsewhere(page: Page, name: string): Promise<void> {
  await sync(page, 'me.rename', { id: (await me(page)).userId, name });
}
async function taskElsewhere(page: Page, title: string, day: string | null = null): Promise<void> {
  const spaceId = (await me(page)).spaces.find((s) => s.kind === 'personal')!.id;
  await sync(page, 'task.create', { id: crypto.randomUUID(), spaceId, title, day, position: 1024 });
}
async function themeElsewhere(page: Page): Promise<void> {
  const res = await page.request.post(`${API_URL}/api/me/getting-started`, { data: { theme: true } });
  expect(res.status()).toBe(200);
}
async function jiraElsewhere(page: Page): Promise<void> {
  const spaceId = (await me(page)).spaces.find((s) => s.kind === 'personal')!.id;
  const res = await page.request.post(`${API_URL}/api/spaces/${spaceId}/jira`, {
    data: { site: JIRA_SITE, token: goodToken() },
  });
  expect(res.status()).toBe(200);
}

/** Save a name in Settings › Account (open), then close Settings. */
async function saveName(page: Page, name: string): Promise<void> {
  const field = page.getByRole('textbox', { name: 'Name' });
  await field.fill(name);
  await field.press('Tab');
  await idle(page);
}

/** Connect the fake Jira in the panel's form. */
async function connectJira(page: Page): Promise<void> {
  const form = page.locator('section.tp-jp');
  await form.getByLabel('Jira address').fill(JIRA_SITE);
  await form.getByLabel('Personal access token').fill(goodToken());
  await form.getByRole('button', { name: 'Connect Jira' }).click();
}

async function seesNewCard(page: Page): Promise<void> {
  await expect(card(page)).toBeVisible();
  await expect(card(page).getByRole('button', { name: /^Getting started/ })).toBeVisible();
  await expect(count(page)).toHaveText('0 of 4');
  for (const label of [
    'Add your name and photo',
    'Write your first task',
    'Pick light or dark',
    'Bring your Jira issues',
  ])
    await expect(step(page, label)).toBeVisible();
}

/** The four done but Jira, through the API (another device), then a reload. */
async function allButJira(page: Page): Promise<void> {
  await nameElsewhere(page, 'Rohit Raj');
  await taskElsewhere(page, 'Read the brief');
  await themeElsewhere(page);
  await page.reload();
  await expect(count(page)).toHaveText('3 of 4');
}

async function finishWithJira(page: Page): Promise<void> {
  await step(page, 'Bring your Jira issues').click();
  await page.getByRole('dialog', { name: 'Apps' }).getByRole('button', { name: 'Connect Jira' }).click();
  await connectJira(page);
  await expect(card(page)).toContainText('You’re set');
  await expect(count(page)).toHaveText('4 of 4');
  await expect(card(page)).toHaveCount(0, { timeout: 5000 });
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Sunday' })).toBeVisible();
  await expect(card(page)).toHaveCount(0);
  await expect(page.getByText('Nothing planned for today yet.')).toBeVisible();
}

test.describe('first run', () => {
  test.beforeEach(async ({ page }) => {
    await fixClock(page);
  });

  test('C12-E01 a new person: Welcome to Tudu on Today, the card in the corner on every page', async ({
    page,
  }) => {
    test.skip(!desktop(), 'tablet in E13, phone in E12');
    await newcomer(page);
    await expect(page.getByText('Welcome to Tudu.', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add a task' })).toBeVisible();
    await seesNewCard(page);
    const box = (await card(page).boundingBox())!;
    expect(box.x + box.width).toBeGreaterThan(1440 - 40);
    expect(box.y + box.height).toBeGreaterThan(900 - 40);
    for (const view of ['Week', 'Backlog']) {
      await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: view }).click();
      await expect(count(page)).toHaveText('0 of 4');
    }
  });

  test('C12-E02 Add your name and photo: Account, a saved name ticks it and Today greets you by name', async ({
    page,
  }) => {
    test.skip(!desktop(), 'tablet in E13, phone in E12');
    await newcomer(page);
    await step(page, 'Add your name and photo').click();
    await expect(page).toHaveURL(/\?settings=account$/);
    await saveName(page, 'Rohit Raj');
    await expect(count(page)).toHaveText('1 of 4');
    await page.keyboard.press('Escape');
    await expect(settings(page)).toBeHidden();
    await expect(page.getByText('Welcome to Tudu, Rohit.', { exact: true })).toBeVisible();
    await page.reload();
    await expect(count(page)).toHaveText('1 of 4');
    await expect(step(page, 'Add your name and photo')).toHaveClass(/tp-done/);
  });

  test('C12-E03 Write your first task: Quick Add ticks it; the line does too', async ({ page, browser }) => {
    test.skip(!desktop(), 'tablet in E13, phone in E12');
    await newcomer(page);
    await step(page, 'Write your first task').click();
    const bar = quickAdd(page);
    await bar.getByRole('textbox', { name: 'Task title' }).fill('Call the printer');
    await bar.getByRole('button', { name: /^Add( task)?$/ }).click();
    await expect(bar).toHaveCount(0, { timeout: 5000 });
    await expect(count(page)).toHaveText('1 of 4');
    await expect(step(page, 'Write your first task')).toHaveClass(/tp-done/);
    await expect(dayList(page).getByText('Call the printer', { exact: true })).toBeVisible();
    await expect(page.getByText('Welcome to Tudu.', { exact: true })).toHaveCount(0);

    // Someone else writes on the day's line instead.
    const b = await browserFor(browser);
    await writeTasks(b.page, ['Book the room']);
    await expect(count(b.page)).toHaveText('1 of 4');
    await idle(b.page);
    await b.page.reload();
    await expect(count(b.page)).toHaveText('1 of 4');
    await b.page.context().close();
  });

  test('C12-E04 Pick light or dark: Appearance or the avatar menu ticks it, and it stays', async ({
    page,
    browser,
  }) => {
    test.skip(!desktop(), 'tablet in E13, phone in E12');
    await newcomer(page);
    await step(page, 'Pick light or dark').click();
    await expect(page).toHaveURL(/\?settings=appearance$/);
    await settings(page).getByRole('radio', { name: 'Dark' }).click();
    await expect(page.locator('html')).toHaveClass(/dark/);
    await expect(count(page)).toHaveText('1 of 4');
    await page.keyboard.press('Escape');
    await page.reload();
    await expect(count(page)).toHaveText('1 of 4');
    await expect(page.locator('html')).toHaveClass(/dark/);

    const b = await browserFor(browser);
    await b.page.getByRole('button', { name: /^You: / }).click();
    await b.page.getByRole('group', { name: 'Theme' }).getByRole('button', { name: 'Dark' }).click();
    await expect(b.page.locator('html')).toHaveClass(/dark/);
    await b.page.keyboard.press('Escape');
    await expect(count(b.page)).toHaveText('1 of 4');
    await expect
      .poll(async () => (await b.page.request.get(`${API_URL}/api/me`)).json())
      .toMatchObject({
        gettingStarted: { done: { theme: true } },
      });
    await b.page.context().close();
  });

  test('C12-E05 Bring your Jira issues: Apps, Connect ticks it; with the rest done, You’re set and it leaves', async ({
    page,
  }) => {
    test.skip(!desktop(), 'tablet in E13, phone in E12');
    await newcomer(page);
    await allButJira(page);
    await finishWithJira(page);
  });

  test('C12-E06 Hide: × closes it for good, everywhere, and the welcome goes with it', async ({
    page,
    browser,
  }) => {
    test.skip(!desktop(), 'the same card on every size');
    const email = await newcomer(page);
    await expect(page.getByText('Welcome to Tudu.', { exact: true })).toBeVisible();
    await card(page).getByRole('button', { name: 'Hide' }).click();
    await expect(toast(page)).toContainText('Hidden. Everything it pointed to is in Settings.');
    await expect(card(page)).toHaveCount(0);
    await expect(page.getByText('Nothing planned for today yet.')).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Sunday' })).toBeVisible();
    await expect(card(page)).toHaveCount(0);
    const b = await browserFor(browser, email);
    await expect(card(b.page)).toHaveCount(0);
    await expect(b.page.getByText('Nothing planned for today yet.')).toBeVisible();
    await b.page.context().close();
  });

  test('C12-E07 Folding: the title folds it to one line and back, and the fold is remembered', async ({
    page,
  }) => {
    test.skip(!desktop(), 'phones start folded (E12)');
    await newcomer(page);
    const title = card(page).getByRole('button', { name: /^Getting started/ });
    await expect(title).toHaveAttribute('aria-expanded', 'true');
    await title.click();
    await expect(title).toHaveAttribute('aria-expanded', 'false');
    await expect(card(page)).toHaveClass(/tp-collapsed/);
    await page.reload();
    await expect(title).toHaveAttribute('aria-expanded', 'false');
    await title.click();
    await expect(title).toHaveAttribute('aria-expanded', 'true');
    await step(page, 'Write your first task').click();
    await expect(quickAdd(page)).toBeVisible();
  });

  test('C12-E08 Returning: Welcome back by name, the card where it was; a hidden card stays hidden', async ({
    page,
  }) => {
    test.skip(!desktop(), 'the same on every size');
    const email = await newcomer(page);
    await nameElsewhere(page, 'Rohit Raj');
    await writeTasks(page, ['Water the plants']);
    await idle(page);
    const signBackIn = async () => {
      await page.getByRole('button', { name: /^You: / }).click();
      await page.getByRole('menuitem', { name: 'Sign out' }).click();
      await expect(page).toHaveURL(/\/sign-in$/);
      const before = await codeFor(page, email);
      await page.getByLabel('Email').fill(email);
      await page.getByRole('button', { name: 'Continue' }).click();
      await enterCode(page, await codeFor(page, email, before));
      await expect(page.getByRole('heading', { name: 'Sunday' })).toBeVisible({ timeout: 10_000 });
    };
    await signBackIn();
    await expect(toast(page)).toContainText('Welcome back, Rohit.');
    await expect(page.getByText(/^Welcome to Tudu/)).toHaveCount(0);
    await expect(count(page)).toHaveText('2 of 4');

    await card(page).getByRole('button', { name: 'Hide' }).click();
    await expect(card(page)).toHaveCount(0);
    await signBackIn();
    await expect(toast(page)).toContainText('Welcome back, Rohit.');
    await expect(card(page)).toHaveCount(0);
  });

  test('C12-E09 Joining by invite as a new person: the joined toast, Welcome to Northwind and who is here', async ({
    page,
    browser,
  }) => {
    test.skip(!desktop(), 'the join flow is the same on every size');
    await signInFresh(page);
    await nameElsewhere(page, 'Meera Nair');
    const other = freshEmail('invitee');
    const slug = await createSpace(page, 'Northwind', [other]);
    const context = await browser.newContext({ reducedMotion: 'reduce' });
    const b = await context.newPage();
    await fixClock(b);
    await b.goto(await joinLink(page, other));
    await b.getByRole('button', { name: 'Sign in to join' }).click();
    await enterCode(b, await codeFor(b, other));
    await expect(b).toHaveURL(new RegExp(`/${slug}$`), { timeout: 10_000 });
    await expect(toast(b)).toContainText('You joined Northwind. Meera is here.');
    await expect(b.getByText('Welcome to Northwind.', { exact: true })).toBeVisible();
    await expect(
      b.getByText('Meera is here. What you add in Northwind can be shared with them; Personal stays yours.'),
    ).toBeVisible();
    await expect(count(b)).toHaveText('0 of 4');
    await b.goto('/me');
    await expect(b.getByText('Welcome to Tudu.', { exact: true })).toBeVisible();
    await context.close();
  });

  test('C12-E10 Joining as a returning person with the card hidden: the toast, no card, a plain day', async ({
    page,
    browser,
  }) => {
    test.skip(!desktop(), 'the join flow is the same on every size');
    await signInFresh(page);
    await nameElsewhere(page, 'Meera Nair');
    const context = await browser.newContext({ reducedMotion: 'reduce' });
    const b = await context.newPage();
    await fixClock(b);
    const email = await signInFresh(b);
    const slug = await createSpace(page, 'Northwind', [email]);
    await b.goto(await joinLink(page, email));
    await b.getByRole('button', { name: 'Join Northwind' }).click();
    await expect(b).toHaveURL(new RegExp(`/${slug}$`), { timeout: 10_000 });
    await expect(toast(b)).toContainText('You joined Northwind. Meera is here.');
    await expect(card(b)).toHaveCount(0);
    await expect(b.getByText('Nothing planned for today yet.')).toBeVisible();
    await context.close();
  });

  test('C12-E11 Done elsewhere: a name saved on another device ticks here; the fourth there clears it here', async ({
    page,
    browser,
  }) => {
    test.skip(!desktop(), 'the same on every size');
    const email = await newcomer(page);
    const b = await browserFor(browser, email);
    await b.page.getByRole('button', { name: /^You: / }).click();
    await b.page.getByRole('menuitem', { name: 'Settings' }).click();
    await saveName(b.page, 'Rohit Raj');
    await page.reload();
    await expect(count(page)).toHaveText('1 of 4');
    await expect(step(page, 'Add your name and photo')).toHaveClass(/tp-done/);

    await taskElsewhere(b.page, 'Read the brief');
    await themeElsewhere(b.page);
    await jiraElsewhere(b.page);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Sunday' })).toBeVisible();
    await expect(card(page)).toHaveCount(0);
    await b.page.context().close();
  });

  test('C12-E12 Phone: folded beside New task; each row to its page, the card out of the way there', async ({
    page,
  }) => {
    test.skip(!phone(), 'phone only');
    await newcomer(page);
    const title = card(page).getByRole('button', { name: /^Getting started/ });
    await expect(title).toHaveAttribute('aria-expanded', 'false');
    await expect(card(page)).toHaveClass(/tp-gs-phone/);
    const fab = (await page.getByRole('button', { name: 'New task' }).boundingBox())!;
    const box = (await card(page).boundingBox())!;
    expect(box.x + box.width).toBeLessThan(fab.x);
    await title.click();
    await expect(title).toHaveAttribute('aria-expanded', 'true');

    await step(page, 'Add your name and photo').click();
    await expect(page).toHaveURL(/\/me\/settings\/account$/);
    await expect(card(page)).toHaveCount(0);
    await saveName(page, 'Rohit Raj');
    await page.goto('/me');
    await expect(count(page)).toHaveText('1 of 4');

    await step(page, 'Write your first task').click();
    await expect(quickAdd(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(quickAdd(page)).toHaveCount(0);

    await step(page, 'Pick light or dark').click();
    await expect(page).toHaveURL(/\/me\/settings\/appearance$/);
    await expect(card(page)).toHaveCount(0);
    await page.getByRole('radio', { name: 'Dark' }).click();
    await page.goto('/me');
    await expect(count(page)).toHaveText('2 of 4');

    await step(page, 'Bring your Jira issues').click();
    await expect(page).toHaveURL(/\/me\/apps$/);
    await expect(card(page)).toHaveCount(0);
    await page.goto('/me');
    await expect(step(page, 'Pick light or dark')).toHaveClass(/tp-done/);
  });

  test('C12-E13 Tablet: the card over the rail’s page; Settings and Quick Add from its rows; a name ticks it', async ({
    page,
  }) => {
    test.skip(!tablet(), 'tablet only');
    await newcomer(page);
    await seesNewCard(page);
    await step(page, 'Write your first task').click();
    await expect(quickAdd(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(quickAdd(page)).toHaveCount(0);
    await step(page, 'Add your name and photo').click();
    await expect(settings(page)).toBeVisible();
    await saveName(page, 'Rohit Raj');
    await expect(count(page)).toHaveText('1 of 4');
    await page.keyboard.press('Escape');
    await expect(page.getByText('Welcome to Tudu, Rohit.', { exact: true })).toBeVisible();
  });

  test('C12-E15 the kit shows Getting started in its four states, light and dark', async ({ page }) => {
    test.skip(!desktop(), 'the width check is C00-E03');
    await page.goto('/kit#first-run');
    const section = page.locator('section#first-run');
    for (const state of ['New', 'Two done', 'Folded', 'You’re set'])
      await expect(section.getByRole('region', { name: state, exact: true }).locator('.tp-gs')).toHaveCount(
        2,
      );
    await expect(section.locator('.tp-gs.tp-collapsed')).toHaveCount(2);
    await expect(section.locator('.tp-gs.tp-all')).toHaveCount(2);
  });
});

test.describe('first run, dark', () => {
  test.use({ colorScheme: 'dark' });
  test.beforeEach(async ({ page }) => {
    await fixClock(page);
    await page.addInitScript(() => {
      if (!localStorage.getItem('tudu.theme')) localStorage.setItem('tudu.theme', 'dark');
    });
  });

  test('C12-E14 a new person in dark: the welcome and the card, then You’re set', async ({ page }) => {
    test.skip(!desktop(), 'desktop only');
    await newcomer(page);
    await expect(page.locator('html')).toHaveClass(/dark/);
    await expect(page.getByText('Welcome to Tudu.', { exact: true })).toBeVisible();
    await seesNewCard(page);
    await allButJira(page);
    await finishWithJira(page);
  });
});
