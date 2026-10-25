import { expect, type Browser, type BrowserContext, type Locator, type Page } from '@playwright/test';
import { API_URL, codeFor, enterCode, freshEmail, quietFirstRun } from './app';
import { fixClock } from './today';

/** The space switcher's trigger: the space's tile and name at the top of the sidebar, or in the phone's header. */
export function switcher(page: Page): Locator {
  return page.locator('.tp-ssw-b');
}

/** Open the list of spaces (the sheet on phones). */
export async function openSwitcher(page: Page): Promise<Locator> {
  await switcher(page).click();
  const menu = page.getByRole('menu', { name: 'Spaces' });
  await expect(menu).toBeVisible();
  return menu;
}

/** Pick a space from the list by name. */
export async function switchTo(page: Page, name: string): Promise<void> {
  const menu = await openSwitcher(page);
  await menu.getByRole('menuitemradio', { name: new RegExp(`^.?${name}`) }).click();
  await expect(switcher(page)).toContainText(name);
  // The list stays in the page while it closes; a menu opened next must not find its items too (C17-E02).
  await expect(menu).toHaveCount(0);
}

/** Create a team space from the switcher and land on its Today. Returns its slug (the address). */
export async function createSpace(page: Page, name: string, invites: string[] = []): Promise<string> {
  const menu = await openSwitcher(page);
  await menu.getByRole('menuitem', { name: 'Create a space' }).click();
  const dialog = page.getByRole('dialog', { name: 'Create a space' });
  await expect(dialog).toBeVisible();
  // The name field takes the focus a moment after the dialog opens; type once it has, so nothing lands elsewhere.
  await expect(dialog.getByLabel('Space name')).toBeFocused({ timeout: 10_000 });
  await dialog.getByLabel('Space name').fill(name);
  for (const e of invites) {
    await dialog.getByLabel('Invite by email').fill(e);
    await dialog.getByLabel('Invite by email').press('Enter');
    await expect(dialog.getByText(e, { exact: true })).toBeVisible();
  }
  await dialog.getByRole('button', { name: 'Create space' }).click();
  // The new space's address, never /me (the Create call takes a moment).
  await expect(page).toHaveURL(/\/(?!me$)[a-z0-9-]+$/, { timeout: 15_000 });
  await expect(switcher(page)).toContainText(name, { timeout: 10_000 });
  await expect(dialog).toBeHidden();
  return new URL(page.url()).pathname.slice(1);
}

/** The join link mailed to an address, from the test outbox (the newest). */
export async function joinLink(page: Page, email: string): Promise<string> {
  for (let i = 0; i < 40; i++) {
    const res = await page.request.get(`${API_URL}/__test/outbox?to=${encodeURIComponent(email)}`);
    const { mails } = (await res.json()) as { mails: Array<{ subject: string; text: string }> };
    const mail = mails.filter((m) => /invited you/.test(m.subject)).at(-1);
    const m = mail && /\/join\/([A-Za-z0-9_-]+)/.exec(mail.text);
    if (m) return `/join/${m[1]}`;
    await page.waitForTimeout(100);
  }
  throw new Error(`no invite mail for ${email}`);
}

/** Who is signed in on a page, from the API. */
export async function me(
  page: Page,
): Promise<{ userId: string; spaces: Array<{ id: string; slug: string; name: string; kind: string }> }> {
  const res = await page.request.get(`${API_URL}/api/me`);
  const body = (await res.json()) as {
    user: { id: string };
    spaces: Array<{ id: string; slug: string; name: string; kind: string }>;
  };
  return { userId: body.user.id, spaces: body.spaces };
}

/** A second person in their own browser, signed in fresh. */
export async function secondPerson(
  browser: Browser,
  email = freshEmail('second'),
): Promise<{ context: BrowserContext; page: Page; email: string }> {
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await context.newPage();
  // The same Sunday as the first person's, so both see the same week.
  await fixClock(page);
  await page.goto('/sign-in');
  await page.getByLabel('Email').fill(email);
  await page.getByRole('button', { name: 'Continue' }).click();
  await enterCode(page, await codeFor(page, email));
  await expect(
    page.getByRole('heading', { name: /^(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)$/ }),
  ).toBeVisible({ timeout: 10_000 });
  await quietFirstRun(page);
  return { context, page, email };
}

/** Write tasks straight through sync as the page's person, into a space. Returns the task ids by title. */
export async function seedTasks(
  page: Page,
  spaceId: string,
  rows: Array<{ title: string; day: string | null; visibility?: 'me' }>,
  /** When the rows were written; before the page's clock, or its own changes lose to them. */
  from = '2026-10-18T09:00:00.000Z',
): Promise<Record<string, string>> {
  const ids: Record<string, string> = {};
  let at = Date.parse(from);
  const mutations: unknown[] = [];
  for (const [i, r] of rows.entries()) {
    const id = crypto.randomUUID();
    ids[r.title] = id;
    at += 1000;
    mutations.push({
      id: crypto.randomUUID(),
      type: 'task.create',
      payload: { id, spaceId, title: r.title, day: r.day, position: 1024 * (i + 1) },
      at: new Date(at).toISOString(),
    });
    if (r.visibility)
      mutations.push({
        id: crypto.randomUUID(),
        type: 'task.visibility',
        payload: { id, visibility: r.visibility },
        at: new Date(at + 500).toISOString(),
      });
  }
  const res = await page.request.post(`${API_URL}/api/sync`, { data: { clientId: 'seed', mutations } });
  expect(res.status()).toBe(200);
  return ids;
}

/** Go to People: the sidebar or the rail, or More then People on phones. */
export async function goPeople(page: Page): Promise<void> {
  const more = page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'More' });
  if (await more.count()) {
    await more.click();
    await page.getByRole('button', { name: /^People/ }).click();
  } else {
    await page
      .getByRole('navigation', { name: 'Main' })
      .getByRole('button', { name: /^People/ })
      .click();
  }
  await expect(page.getByRole('region', { name: 'People' })).toBeVisible();
}

/** The People list's rows (Everyone and the members). */
export function peopleList(page: Page): Locator {
  return page.getByRole('list', { name: 'People' });
}
