import { request as pwRequest, type Locator, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { API_URL, codeFor, enterCode, expect, freshEmail, signInFresh, test } from '../../fixtures/app';
import {
  createSpace,
  goPeople,
  joinLink,
  me,
  peopleList,
  secondPerson,
  seedTasks,
  switcher,
} from '../../fixtures/spaces';
import { dayList, fixClock, idle } from '../../fixtures/today';

const phone = () => test.info().project.name === 'phone';
const tablet = () => test.info().project.name === 'tablet';

const dialog = (page: Page) => page.getByRole('dialog', { name: 'Settings' });
const nav = (page: Page) => page.getByRole('navigation', { name: 'Settings' });

/** Settings from the avatar's menu, over the page you are on; then a section. */
async function openSettings(
  page: Page,
  section?: 'Account' | 'Appearance' | 'Space' | 'Members',
): Promise<Locator> {
  const d = dialog(page);
  const item = page.getByRole('menuitem', { name: 'Settings' });
  // Right after sign in the shell can still be settling, and once on CI (tablet) the menu's Settings click opened
  // nothing. Open the menu again if it went, and click again until the dialog shows.
  await expect(async () => {
    if (!(await d.isVisible())) {
      if (!(await item.isVisible())) await page.getByRole('button', { name: /^You: / }).click();
      await item.click({ timeout: 2_000 });
    }
    await expect(d).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 10_000 });
  if (section)
    await nav(page)
      .getByRole('button', { name: new RegExp(`^${section}`) })
      .click();
  return d;
}

/** Two people in one fresh team space: `a` made it on `page`, `b` joined in a second browser. */
async function team(page: Page, browser: Parameters<typeof secondPerson>[0], name = 'Northwind') {
  await signInFresh(page);
  const b = await secondPerson(browser);
  const slug = await createSpace(page, name, [b.email]);
  await b.page.goto(await joinLink(page, b.email));
  await b.page.getByRole('button', { name: `Join ${name}` }).click();
  await expect(b.page).toHaveURL(new RegExp(`/${slug}$`), { timeout: 10_000 });
  const mine = await me(page);
  const space = mine.spaces.find((s) => s.slug === slug)!;
  return { slug, space, b, aId: mine.userId, bId: (await me(b.page)).userId };
}

/** Name someone through the outbox, as Settings would. */
async function nameAs(page: Page, userId: string, name: string) {
  const res = await page.request.post(`${API_URL}/api/sync`, {
    data: {
      clientId: 'seed',
      mutations: [
        {
          id: crypto.randomUUID(),
          type: 'me.rename',
          payload: { id: userId, name },
          at: new Date().toISOString(),
        },
      ],
    },
  });
  expect(res.status()).toBe(200);
}

/** A person who joins a space without a browser: sign in and join through the API. */
async function joinByApi(page: Page, spaceId: string, name: string): Promise<void> {
  const email = freshEmail(name.toLowerCase());
  await page.request.post(`${API_URL}/api/spaces/${spaceId}/invites`, { data: { emails: [email] } });
  const token = (await joinLink(page, email)).split('/').pop()!;
  const ctx = await pwRequest.newContext({
    extraHTTPHeaders: { origin: new URL(test.info().project.use.baseURL ?? 'http://localhost:5173').origin },
  });
  await ctx.post(`${API_URL}/api/auth/email-otp/send-verification-otp`, { data: { email, type: 'sign-in' } });
  const code = await codeFor(page, email);
  expect((await ctx.post(`${API_URL}/api/auth/sign-in/email-otp`, { data: { email, otp: code } })).ok()).toBe(
    true,
  );
  const meRes = (await (await ctx.get(`${API_URL}/api/me`)).json()) as { user: { id: string } };
  await ctx.post(`${API_URL}/api/sync`, {
    data: {
      clientId: 'seed',
      mutations: [
        {
          id: crypto.randomUUID(),
          type: 'me.rename',
          payload: { id: meRes.user.id, name },
          at: new Date().toISOString(),
        },
      ],
    },
  });
  expect((await ctx.post(`${API_URL}/api/join/${token}`)).ok()).toBe(true);
  await ctx.dispose();
}

// A 1×1 PNG.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

test.describe('settings', () => {
  test.beforeEach(async ({ page }) => {
    await fixClock(page);
  });

  test('C09-E01 open from the avatar over Today; the list for Personal; each section; the address; reload; Esc', async ({
    page,
  }) => {
    test.skip(phone(), 'phones have the Settings page (E11)');
    await signInFresh(page);
    await openSettings(page);
    await expect(page).toHaveURL(/\/me\?settings=account$/);
    await expect(nav(page).getByRole('button')).toHaveText([
      'Account',
      'Appearance',
      'Working hours',
      'Apps',
      'AI access',
      'Space',
    ]);
    await expect(dialog(page).getByRole('heading', { level: 1 })).toHaveText('Account');
    for (const [label, key, title] of [
      ['Appearance', 'appearance', 'Appearance'],
      ['Space', 'space', 'Personal'],
    ] as const) {
      await nav(page).getByRole('button', { name: label }).click();
      await expect(page).toHaveURL(new RegExp(`settings=${key}$`));
      await expect(dialog(page).getByRole('heading', { level: 1 })).toHaveText(title);
    }
    await expect(dialog(page).getByText('Yours alone. Nothing here is shared.')).toBeVisible();
    await page.reload();
    await expect(dialog(page)).toBeVisible();
    await expect(dialog(page).getByRole('heading', { level: 1 })).toHaveText('Personal');
    await page.keyboard.press('Escape');
    await expect(dialog(page)).toBeHidden();
    await expect(page).toHaveURL(/\/me$/);
    await expect(page.getByRole('heading', { name: 'Sunday' })).toBeVisible();
  });

  test('C09-E02 Account: the name saves on leaving and the avatar follows; a photo shows on the avatar; Remove', async ({
    page,
  }) => {
    test.skip(phone() || tablet(), 'the same section on every size');
    await signInFresh(page);
    const d = await openSettings(page, 'Account');
    const name = d.getByRole('textbox', { name: 'Name' });
    await name.fill('Rohit Raj');
    await name.press('Tab');
    await idle(page);
    // the page under the dialog is hidden from the accessibility tree while Settings is open
    await expect(page.locator('.tp-acct-b')).toHaveAttribute('aria-label', 'You: Rohit Raj');
    await expect(page.locator('.tp-acct-b .tp-avatar')).toHaveText('RR');
    await d
      .getByLabel('Choose a photo')
      .setInputFiles({ name: 'me.png', mimeType: 'image/png', buffer: PNG });
    await expect(page.locator('.tp-acct-b .tp-avatar img')).toBeVisible({ timeout: 10_000 });
    await expect(d.locator('.tp-set-photo img')).toBeVisible();
    await d.getByRole('button', { name: 'Remove your photo' }).click();
    await expect(page.locator('.tp-acct-b .tp-avatar img')).toHaveCount(0);
    await expect(page.locator('.tp-acct-b .tp-avatar')).toHaveText('RR');
  });

  test('C09-E03 email: Change, a code to the new address, it changes; signing in with the new address works', async ({
    page,
  }) => {
    test.skip(phone() || tablet(), 'the same section on every size');
    await signInFresh(page);
    const next = freshEmail('moved');
    const d = await openSettings(page, 'Account');
    await d.getByRole('button', { name: 'Change your email' }).click();
    await d.getByRole('textbox', { name: 'New email' }).fill(next);
    await d.getByRole('button', { name: 'Send code' }).click();
    await expect(d.getByText(`A 6-digit code went to ${next}`)).toBeVisible();
    const changeCode = await codeFor(page, next);
    await d.getByLabel('Code from the new address').fill(changeCode);
    await expect(page.locator('.tp-toast')).toContainText(`Your email is now ${next}.`, { timeout: 15_000 });
    await expect(dialog(page).getByRole('heading', { level: 1 })).toHaveText('Account');
    await expect(d.locator('.tp-set-h p')).toHaveText(next, { timeout: 10_000 });
    await d.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/sign-in/);
    await page.getByLabel('Email').fill(next);
    await page.getByRole('button', { name: 'Continue' }).click();
    await enterCode(page, await codeFor(page, next, changeCode));
    await expect(page.getByRole('heading', { name: 'Sunday' })).toBeVisible({ timeout: 10_000 });
  });

  test('C09-E04 Appearance: Dark paints the page and the avatar menu agrees; Less motion survives a reload', async ({
    page,
  }) => {
    test.skip(phone() || tablet(), 'the same section on every size');
    await signInFresh(page);
    const d = await openSettings(page, 'Appearance');
    await d.getByRole('radio', { name: 'Dark' }).click();
    await expect(page.locator('html')).toHaveClass(/dark/);
    const less = d.getByRole('switch', { name: 'Less motion' });
    await less.click();
    await expect(page.locator('html')).toHaveAttribute('data-motion', 'less');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-motion', 'less');
    await expect(dialog(page).getByRole('switch', { name: 'Less motion' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await page.keyboard.press('Escape');
    await expect(dialog(page)).toBeHidden();
    await page.getByRole('button', { name: /^You: / }).click();
    await expect(
      page.getByRole('group', { name: 'Theme' }).getByRole('button', { name: 'Dark' }),
    ).toHaveAttribute('aria-pressed', 'true');
  });

  test('C09-E05 rename the space: tile, sidebar and address follow; the old address lands; a colleague sees it live; IDs keep NW', async ({
    page,
    browser,
  }) => {
    test.skip(phone() || tablet(), 'the same section on every size');
    const { space, slug, b } = await team(page, browser);
    await seedTasks(page, space.id, [{ title: 'Ship the brochure', day: '2026-10-18' }]);
    const d = await openSettings(page, 'Space');
    const field = d.getByRole('textbox', { name: 'Space name' });
    await field.fill('Northwind Labs');
    await expect(d.locator('.tp-set-name .tp-stile')).toHaveText('NL');
    await field.press('Enter');
    await idle(page);
    // Other tests make spaces called Northwind too, so the new address is whichever one was free.
    await expect
      .poll(async () => (await me(page)).spaces.find((s) => s.id === space.id)!.slug)
      .not.toBe(slug);
    const next = (await me(page)).spaces.find((s) => s.id === space.id)!.slug;
    expect(next).toMatch(/^northwind-labs(-\d+)?$/);
    await expect(page).toHaveURL(new RegExp(`/${next}\\?settings=space$`), { timeout: 10_000 });
    await expect(switcher(page)).toContainText('Northwind Labs');
    await expect(switcher(b.page)).toContainText('Northwind Labs', { timeout: 10_000 });
    await expect(b.page).toHaveURL(new RegExp(`/${next}$`));
    await page.keyboard.press('Escape');
    await page.goto(`/${slug}/week`);
    await expect(page).toHaveURL(new RegExp(`/${next}/week$`));
    await page.goto(`/${next}`);
    await expect(dayList(page).locator('.tp-sg-id')).toHaveText(['NW-1']);
    await b.context.close();
  });

  test('C09-E07 roles: make a colleague admin, they get the menus; back to member; your own row has none', async ({
    page,
    browser,
  }) => {
    test.skip(phone() || tablet(), 'the same section on every size');
    const { aId, bId, b } = await team(page, browser);
    await nameAs(page, aId, 'Rohit');
    await nameAs(b.page, bId, 'Meera');
    const d = await openSettings(page, 'Members');
    await expect(d.getByRole('button', { name: /^Rohit: / })).toHaveCount(0);
    await d.getByRole('button', { name: 'Meera: Member' }).click();
    await page.getByRole('menuitemradio', { name: /^Admin/ }).click();
    await expect(page.locator('.tp-toast')).toContainText('Meera is an admin now.');
    await expect(d.getByRole('button', { name: 'Meera: Admin' })).toBeVisible();
    const bd = await openSettings(b.page, 'Members');
    await expect(bd.getByRole('button', { name: 'Rohit: Admin' })).toBeVisible({ timeout: 10_000 });
    await d.getByRole('button', { name: 'Meera: Admin' }).click();
    await page.getByRole('menuitemradio', { name: /^Member/ }).click();
    await expect(d.getByRole('button', { name: 'Meera: Member' })).toBeVisible();
    await expect(bd.getByRole('button', { name: /^Rohit: / })).toHaveCount(0, { timeout: 10_000 });
    await b.context.close();
  });

  test('C09-E08 remove with Undo, then for real: they land on Personal; their shared task is marked Left; a waiting request declines', async ({
    page,
    browser,
  }) => {
    test.skip(phone() || tablet(), 'the same flow on every size');
    const { space, slug, aId, bId, b } = await team(page, browser);
    await nameAs(b.page, bId, 'Meera');
    await seedTasks(b.page, space.id, [{ title: 'Meera’s brief', day: '2026-10-18' }]);
    await page.request.post(`${API_URL}/api/sync`, {
      data: {
        clientId: 'seed',
        mutations: [
          {
            id: crypto.randomUUID(),
            type: 'request.send',
            payload: {
              id: crypto.randomUUID(),
              spaceId: space.id,
              toId: bId,
              title: 'Review the copy',
              askedDay: '2026-10-19',
            },
            at: new Date().toISOString(),
          },
        ],
      },
    });
    void aId;
    const d = await openSettings(page, 'Members');
    const remove = async () => {
      await d.getByRole('button', { name: 'Meera: Member' }).click();
      await page.getByRole('menuitem', { name: `Remove from Northwind` }).click();
      const ask = page.getByRole('dialog', { name: 'Remove Meera?' });
      await ask.getByRole('button', { name: 'Remove Meera' }).click();
      await expect(page.locator('.tp-toast')).toContainText('Meera was removed from Northwind.');
    };
    await remove();
    await expect(b.page).toHaveURL(/\/me$/, { timeout: 10_000 });
    await page.locator('.tp-toast').getByRole('button', { name: 'Undo' }).click();
    await expect(d.getByRole('button', { name: 'Meera: Member' })).toBeVisible({ timeout: 10_000 });
    await b.page.goto(`/${slug}`);
    await expect(switcher(b.page)).toContainText('Northwind');
    await remove();
    await expect(b.page).toHaveURL(/\/me$/, { timeout: 10_000 });
    await expect(b.page.locator('.tp-toast')).toContainText('You were removed from Northwind');
    await dialog(page).getByRole('button', { name: 'Close' }).click();
    await expect(dialog(page)).toBeHidden();
    await goPeople(page);
    await expect(peopleList(page).getByRole('listitem', { name: 'Meera, left' })).toBeVisible();
    const sent = (await (
      await page.request.get(`${API_URL}/api/spaces/${space.id}/inbox?view=sent`)
    ).json()) as {
      sent: Array<{ state: string; reason: string | null }>;
    };
    expect(sent.sent[0]).toMatchObject({ state: 'declined' });
    expect(sent.sent[0]!.reason).toMatch(/was removed from Northwind/);
    await b.context.close();
  });

  test('C09-E09 leave: the last admin is told first; a member leaves and lands on Personal; the space is gone from their list', async ({
    page,
    browser,
  }) => {
    test.skip(phone() || tablet(), 'the same flow on every size');
    const { slug, b } = await team(page, browser);
    const d = await openSettings(page, 'Space');
    await d.getByRole('button', { name: 'Leave' }).click();
    const told = page.getByRole('dialog', { name: 'Make someone admin first' });
    await expect(told).toBeVisible();
    await told.getByRole('button', { name: 'Go to Members' }).click();
    await expect(page).toHaveURL(/settings=members$/);
    const bd = await openSettings(b.page, 'Space');
    await bd.getByRole('button', { name: 'Leave' }).click();
    await b.page
      .getByRole('dialog', { name: 'Leave Northwind?' })
      .getByRole('button', { name: 'Leave Northwind' })
      .click();
    await expect(b.page).toHaveURL(/\/me$/, { timeout: 10_000 });
    await expect(b.page.locator('.tp-toast')).toContainText('You left Northwind.');
    await switcher(b.page).click();
    await expect(b.page.getByRole('menu', { name: 'Spaces' }).getByRole('menuitemradio')).toHaveCount(1);
    await b.page.keyboard.press('Escape');
    await b.page.goto(`/${slug}`);
    await expect(b.page).toHaveURL(/\/me$/);
    await b.context.close();
  });

  test('C09-E10 delete: the wrong name keeps the button off; the right one deletes; everyone lands on Personal; the old address goes home', async ({
    page,
    browser,
  }) => {
    test.skip(phone() || tablet(), 'the same flow on every size');
    const { slug, b, aId } = await team(page, browser);
    await nameAs(page, aId, 'Rohit');
    const d = await openSettings(page, 'Space');
    await d.getByRole('button', { name: 'Delete…' }).click();
    const ask = page.getByRole('dialog', { name: 'Delete Northwind?' });
    const go = ask.getByRole('button', { name: 'Delete Northwind' });
    await ask.getByRole('textbox', { name: 'Type Northwind to confirm' }).fill('northwind');
    await expect(go).toBeDisabled();
    await ask.getByRole('textbox', { name: 'Type Northwind to confirm' }).fill('Northwind');
    await go.click();
    await expect(page).toHaveURL(/\/me$/, { timeout: 10_000 });
    await expect(page.locator('.tp-toast')).toContainText('Northwind was deleted.');
    await expect(b.page).toHaveURL(/\/me$/, { timeout: 10_000 });
    await expect(b.page.locator('.tp-toast')).toContainText('Northwind was deleted by Rohit.');
    await page.goto(`/${slug}/week`);
    await expect(page).toHaveURL(/\/me$/);
    await b.context.close();
  });

  test('C09-E11 phone: the avatar opens the Settings page; a section pushes in and ‹ Settings goes back; More lists it; Sign out', async ({
    page,
  }) => {
    test.skip(!phone(), 'phone only');
    await signInFresh(page);
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await expect(page).toHaveURL(/\/me\/settings$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Settings');
    await nav(page)
      .getByRole('button', { name: /^Appearance/ })
      .click();
    await expect(page).toHaveURL(/\/me\/settings\/appearance$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Appearance');
    await expect(page.getByRole('radiogroup', { name: 'Theme' })).toBeVisible();
    await page.locator('.tp-set-back').click();
    await expect(page).toHaveURL(/\/me\/settings$/);
    // More lists Settings too, and keeps More lit
    await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'More' }).click();
    await page.locator('.app-more-item', { hasText: 'Settings' }).click();
    await expect(page).toHaveURL(/\/me\/settings$/);
    // the desk's ?settings= turns into the page
    await page.goto('/me?settings=space');
    await expect(page).toHaveURL(/\/me\/settings\/space$/);
    await page.locator('.tp-set-back').click();
    await nav(page)
      .getByRole('button', { name: /^Account/ })
      .click();
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/sign-in/);
  });

  test('C09-E12 tablet: the dialog nearly full width from the avatar; Find someone past eight people', async ({
    page,
  }) => {
    test.skip(!tablet(), 'tablet only');
    await signInFresh(page);
    const slug = await createSpace(page, 'Harbour');
    const space = (await me(page)).spaces.find((s) => s.slug === slug)!;
    for (const n of ['Ana', 'Ben', 'Chloe', 'Dan', 'Elena', 'Femi', 'Gita', 'Hugo'])
      await joinByApi(page, space.id, n);
    await page.reload();
    const d = await openSettings(page, 'Members');
    const box = (await d.boundingBox())!;
    expect(box.width).toBeGreaterThan(760);
    const find = d.getByRole('searchbox', { name: 'Find someone' });
    // Long enough that no member's random e-mail (base36 time, hex) matches too.
    await find.fill('gita');
    await expect(d.getByRole('list', { name: 'Members' }).getByRole('listitem')).toHaveCount(1);
    await find.fill('zed');
    await expect(d.getByText('No one called “zed” in Harbour.')).toBeVisible();
  });

  test('C09-E13 offline: a space and a project renamed offline say so and land when back; Settings and the role menu in dark', async ({
    page,
    browser,
    context,
  }) => {
    test.skip(phone() || tablet(), 'the same flow on every size');
    await page.addInitScript(() => {
      if (!localStorage.getItem('tudu.theme')) localStorage.setItem('tudu.theme', 'dark');
    });
    const { space, bId, b } = await team(page, browser);
    await nameAs(b.page, bId, 'Meera');
    await expect(page.locator('html')).toHaveClass(/dark/);
    const pid = crypto.randomUUID();
    await page.request.post(`${API_URL}/api/sync`, {
      data: {
        clientId: 'seed',
        mutations: [
          {
            id: crypto.randomUUID(),
            type: 'project.create',
            payload: { id: pid, spaceId: space.id, name: 'Launch' },
            at: new Date().toISOString(),
          },
        ],
      },
    });
    const d = await openSettings(page, 'Space');
    await context.setOffline(true);
    await expect(d.getByText('Saves when you’re back.')).toBeVisible({ timeout: 15_000 });
    const field = d.getByRole('textbox', { name: 'Space name' });
    await field.fill('Northwind Two');
    await field.press('Enter');
    await expect(switcher(page)).toContainText('Northwind Two');
    await d.getByRole('button', { name: 'Edit Launch, No open tasks' }).click();
    // The editor is a popup over Settings.
    const pname = page.getByRole('textbox', { name: 'Project name' });
    await pname.fill('Launch week');
    await pname.press('Enter');
    await context.setOffline(false);
    await idle(page);
    await expect(d.getByText('Saves when you’re back.')).toBeHidden({ timeout: 15_000 });
    const after = (await me(page)).spaces.find((s) => s.id === space.id)!;
    expect(after.name).toBe('Northwind Two');
    const projects = (await (
      await page.request.get(`${API_URL}/api/spaces/${space.id}/projects`)
    ).json()) as {
      projects: Array<{ name: string }>;
    };
    expect(projects.projects.map((p) => p.name)).toEqual(['Launch week']);
    // dark: the dialog and the role menu paint on the dark surfaces
    await nav(page)
      .getByRole('button', { name: /^Members/ })
      .click();
    await d.getByRole('button', { name: 'Meera: Member' }).click();
    const menu = page.getByRole('menu');
    await expect(menu).toBeVisible();
    const bg = await menu.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(bg).not.toBe('rgb(255, 255, 255)');
    await page.keyboard.press('Escape');
    await b.context.close();
  });

  test.describe('the version at the foot of the list', () => {
    const VERSION = (
      JSON.parse(readFileSync(new URL('../../../../package.json', import.meta.url), 'utf8')) as {
        version: string;
      }
    ).version;
    const RELEASE = `https://github.com/shimorojune/tudu/releases/tag/tudu-${VERSION}`;
    const versionLink = (page: Page) =>
      page.getByRole('link', { name: `Tudu ${VERSION}. Open its release on GitHub` });

    test('C09-E14 "Tudu <version>" at the foot of Settings opens its release in a new tab; tablet and phone too', async ({
      page,
    }) => {
      await signInFresh(page);
      if (phone()) {
        await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'More' }).click();
        await page.locator('.app-more-item', { hasText: 'Settings' }).click();
        await expect(page).toHaveURL(/\/me\/settings$/);
      } else await openSettings(page);
      const link = versionLink(page);
      await expect(link).toBeVisible();
      await expect(link).toHaveText(`Tudu${VERSION}`);
      await expect(link).toHaveAttribute('href', RELEASE);
      await expect(link.locator('.tp-ver-dot')).toHaveCount(0);
      // the last thing in the list (desk and tablet: the foot of the side list)
      if (!phone())
        expect(
          await link.evaluate(
            (el) => el.parentElement?.classList.contains('tp-set-side') && !el.nextElementSibling,
          ),
        ).toBe(true);
      const tab = page.context().waitForEvent('page');
      await link.click();
      const opened = await tab;
      expect(opened.url()).toBe(RELEASE);
      await opened.close();
    });

    test('C09-E15 hover shows the arrow; Tab reaches it with the focus ring; less motion only fades it', async ({
      page,
    }) => {
      test.skip(phone(), 'no hover on a phone: the arrow always shows there (E14)');
      await signInFresh(page);
      await openSettings(page);
      const link = versionLink(page);
      const arrow = link.locator('.tp-ver-arrow');
      await expect(arrow).toHaveCSS('opacity', '0');
      await link.hover();
      await expect(arrow).toHaveCSS('opacity', '1');
      await page.mouse.move(0, 0);
      await expect(arrow).toHaveCSS('opacity', '0');
      await link.focus();
      await page.keyboard.press('Shift+Tab');
      await page.keyboard.press('Tab');
      await expect(link).toBeFocused();
      await expect(arrow).toHaveCSS('opacity', '1');
      await expect(link).not.toHaveCSS('box-shadow', 'none');
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await expect(arrow).toHaveCSS('transition-property', 'opacity');
    });

    test('C09-E16 dark: the line takes the dark muted colour', async ({ page }) => {
      test.skip(phone() || tablet(), 'the same row on every size');
      await signInFresh(page);
      const d = await openSettings(page, 'Appearance');
      const name = versionLink(page).locator('.tp-ver-name');
      const muted = () =>
        page.evaluate(() => {
          const probe = document.createElement('span');
          probe.style.color = 'var(--muted-foreground)';
          document.querySelector('.tp-set-side')!.appendChild(probe);
          const c = getComputedStyle(probe).color;
          probe.remove();
          return c;
        });
      const light = await name.evaluate((el) => getComputedStyle(el).color);
      expect(light).toBe(await muted());
      await d.getByRole('radio', { name: 'Dark' }).click();
      await expect(page.locator('html')).toHaveClass(/dark/);
      await expect.poll(() => name.evaluate((el) => getComputedStyle(el).color)).not.toBe(light);
      await expect.poll(() => name.evaluate((el) => getComputedStyle(el).color)).toBe(await muted());
    });
  });
});
