import { test as base, expect, type Page } from '@playwright/test';

export const API_URL = process.env.E2E_API_URL ?? 'http://localhost:3456';
let n = 0;

/** A fresh address per test so tests never share a person. */
export function freshEmail(tag = 'person'): string {
  n += 1;
  return `${tag}-${Date.now().toString(36)}-${n}@test.tudu`;
}

/** The latest sign-in code the API mailed to `email`, read from the test outbox. */
export async function codeFor(page: Page, email: string): Promise<string> {
  for (let i = 0; i < 40; i++) {
    const res = await page.request.get(`${API_URL}/__test/outbox/code?to=${encodeURIComponent(email)}`);
    const { code } = (await res.json()) as { code: string | null };
    if (code) return code;
    await page.waitForTimeout(100);
  }
  throw new Error(`no code arrived for ${email}`);
}

/** Type the six digits into the code field. */
export async function enterCode(page: Page, code: string): Promise<void> {
  await page.getByLabel('The 6-digit code').fill(code);
}

/** Walk through sign in for a fresh person and land on the app. */
export async function signInFresh(page: Page, email = freshEmail()): Promise<string> {
  await page.goto('/sign-in');
  await page.getByLabel('Email').fill(email);
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();
  await enterCode(page, await codeFor(page, email));
  await expect(page.getByText('You’re in.')).toBeVisible();
  await expect(
    page.getByRole('heading', { name: /^(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)$/ }),
  ).toBeVisible({ timeout: 10_000 });
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
