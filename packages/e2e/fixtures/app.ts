import { randomBytes } from 'node:crypto';
import { test as base, expect, type Page } from '@playwright/test';

export const API_URL = process.env.E2E_API_URL ?? `http://localhost:${process.env.E2E_API_PORT ?? '3456'}`;
let n = 0;

/**
 * A fresh address per test so tests never share a person. Workers run in parallel, so the time and a counter are
 * not enough on their own: a random part keeps two workers from picking the same address in the same millisecond.
 */
export function freshEmail(tag = 'person'): string {
  n += 1;
  return `${tag}-${Date.now().toString(36)}-${randomBytes(3).toString('hex')}-${n}@test.tudu`;
}

/**
 * The latest sign-in code the API mailed to `email`, read from the test outbox. Pass `newerThan` (an earlier code)
 * after asking for a new one, so the old one still in the outbox is never mistaken for it.
 */
export async function codeFor(page: Page, email: string, newerThan?: string): Promise<string> {
  for (let i = 0; i < 40; i++) {
    const res = await page.request.get(`${API_URL}/__test/outbox/code?to=${encodeURIComponent(email)}`);
    const { code } = (await res.json()) as { code: string | null };
    if (code && code !== newerThan) return code;
    await page.waitForTimeout(100);
  }
  throw new Error(`no ${newerThan ? 'new ' : ''}code arrived for ${email}`);
}

/** Type the six digits into the code field. */
export async function enterCode(page: Page, code: string): Promise<void> {
  await page.getByLabel('The 6-digit code').fill(code);
}

/**
 * Hide Getting started the way × does (the app's own hook: the server hears it), without the toast. Every test signs
 * in a new person, who would meet the card and Today's welcome; only the first-run group keeps them.
 */
export async function quietFirstRun(page: Page): Promise<void> {
  type Hook = { __tudu?: { firstRun?: { hide(): Promise<void> } } };
  await expect
    .poll(() => page.evaluate(() => typeof (window as unknown as Hook).__tudu?.firstRun?.hide === 'function'))
    .toBe(true);
  await page.evaluate(() => (window as unknown as Hook).__tudu!.firstRun!.hide());
}

/** Walk through sign in for a fresh person and land on the app; Getting started is hidden unless asked for. */
export async function signInFresh(
  page: Page,
  email = freshEmail(),
  opts: { gettingStarted?: boolean } = {},
): Promise<string> {
  await page.goto('/sign-in');
  await page.getByLabel('Email').fill(email);
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();
  await enterCode(page, await codeFor(page, email));
  // "You’re in." shows for well under a second; C01-E01 checks it. Here only the landing matters.
  await expect(
    page.getByRole('heading', { name: /^(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)$/ }),
  ).toBeVisible({ timeout: 10_000 });
  if (!opts.gettingStarted) await quietFirstRun(page);
  return email;
}

export const test = base.extend<{ cleanConsole: string[] }>({
  cleanConsole: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on('console', (msg) => {
        if (msg.type() === 'error') errors.push(msg.text());
      });
      page.on('pageerror', (err) => errors.push(err.message));
      await use(errors);
      // a 401 on /api/me before sign in is expected and logged by the browser as a network error
      expect(
        errors.filter((e) => !/401|Failed to load resource/.test(e)),
        'console errors',
      ).toEqual([]);
    },
    { auto: true },
  ],
});
export { expect };
