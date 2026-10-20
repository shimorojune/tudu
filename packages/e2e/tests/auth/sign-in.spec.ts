import { API_URL, codeFor, enterCode, expect, freshEmail, signInFresh, test } from '../../fixtures/app';

test.describe('sign in', () => {
  test('C01-E01 a new person signs in with a code and lands on the empty Today', async ({ page }) => {
    const email = freshEmail('new');
    await page.goto('/');
    await expect(page).toHaveURL(/\/sign-in$/);
    await expect(page.getByRole('heading', { name: 'Sign in to Tudu' })).toBeVisible();
    await page.getByLabel('Email').fill(email);
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();
    await expect(page.getByText(email)).toBeVisible();
    await enterCode(page, await codeFor(page, email));
    await expect(page.getByText('You’re in.')).toBeVisible();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByText('Nothing planned for today yet.')).toBeVisible();
    await expect(page.getByText(/Today · Week \d+/)).toBeVisible();
  });

  test('C01-E02 a returning person signs in again', async ({ page, context }) => {
    const email = await signInFresh(page);
    await context.clearCookies();
    await page.goto('/');
    await expect(page).toHaveURL(/\/sign-in$/);
    await page.getByLabel('Email').fill(email);
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();
    const codes = await page.request.get(`${API_URL}/__test/outbox?to=${encodeURIComponent(email)}`);
    expect(((await codes.json()) as { mails: unknown[] }).mails).toHaveLength(2);
    await enterCode(page, await codeFor(page, email));
    await expect(page.getByText('Nothing planned for today yet.')).toBeVisible();
  });

  test('C01-E03 a wrong code nudges and lets you retry', async ({ page }) => {
    const email = freshEmail();
    await page.goto('/sign-in');
    await page.getByLabel('Email').fill(email);
    await page.getByRole('button', { name: 'Continue' }).click();
    const real = await codeFor(page, email);
    await enterCode(page, real === '000000' ? '111111' : '000000');
    await expect(page.getByText('That code didn’t work. Check the email, or send a new one.')).toBeVisible();
    await expect(page.getByLabel('The 6-digit code')).toHaveValue('');
    await enterCode(page, real);
    await expect(page.getByText('Nothing planned for today yet.')).toBeVisible();
  });

  test('C01-E04 an expired code says so and a new one works', async ({ page }) => {
    const email = freshEmail();
    await page.goto('/sign-in');
    await page.getByLabel('Email').fill(email);
    await page.getByRole('button', { name: 'Continue' }).click();
    const old = await codeFor(page, email);
    await page.request.post(`${API_URL}/__test/outbox/expire`, { data: { email } });
    await enterCode(page, old);
    await expect(
      page.getByText('That code has expired. Send a new one; it takes a few seconds.'),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Send a new code' }).click();
    await expect(page.getByText(/A new code is on its way/)).toBeVisible();
    const fresh = await codeFor(page, email, old);
    await enterCode(page, fresh);
    await expect(page.getByText('Nothing planned for today yet.')).toBeVisible();
  });

  test('C01-E05 too many tries locks the code and a new one is offered', async ({ page }) => {
    const email = freshEmail();
    await page.goto('/sign-in');
    await page.getByLabel('Email').fill(email);
    await page.getByRole('button', { name: 'Continue' }).click();
    const real = await codeFor(page, email);
    const wrong = real === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++) {
      await enterCode(page, wrong);
      await expect(page.getByText(/didn’t work|Too many tries/)).toBeVisible();
      await expect(page.getByLabel('The 6-digit code')).toHaveValue('');
    }
    await expect(page.getByText('Too many tries. Send a new code and use that one.')).toBeVisible();
    await expect(page.getByLabel('The 6-digit code')).toBeDisabled();
    await page.getByRole('button', { name: 'Send a new code' }).click();
    await expect(page.getByLabel('The 6-digit code')).toBeEnabled();
    await enterCode(page, await codeFor(page, email, real));
    await expect(page.getByText('Nothing planned for today yet.')).toBeVisible();
  });

  test('C01-E06 on a phone the form stands alone', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'phone', 'phone only');
    await page.goto('/sign-in');
    await expect(page.getByRole('heading', { name: 'Sign in to Tudu' })).toBeVisible();
    await expect(page.locator('.tp-auth-art')).toHaveCount(0);
    await expect(page.locator('.tp-auth')).toHaveClass(/tp-auth-phone/);
  });

  test('C01-E09 sign out returns to sign in and back does not reveal the app', async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name === 'phone',
      'phones sign out from Settings, which arrives with chunk 09',
    );
    await signInFresh(page);
    // a second page in the history, so there is somewhere to go back to
    await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Week' }).click();
    await expect(page).toHaveURL(/\/week$/);
    await page.getByRole('button', { name: /^You: / }).click();
    await page.getByRole('menuitem', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/sign-in$/);
    await expect(page.getByRole('heading', { name: 'Sign in to Tudu' })).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(/\/sign-in/);
    await expect(page.getByRole('heading', { name: 'Sign in to Tudu' })).toBeVisible();
    await expect(page.getByText('The week is on its way.')).toHaveCount(0);
  });

  test('C01-E10 signing in returns you to where you were going', async ({ page }) => {
    const email = freshEmail();
    await page.goto('/week');
    await expect(page).toHaveURL(/\/sign-in\?next=%2Fweek$/);
    await page.getByLabel('Email').fill(email);
    await page.getByRole('button', { name: 'Continue' }).click();
    await enterCode(page, await codeFor(page, email));
    await expect(page).toHaveURL(/\/week$/);
    await expect(page.getByText('The week is on its way.')).toBeVisible();
  });
});

test.describe('sign in, dark', () => {
  test.use({ colorScheme: 'dark' });
  test('C01-E11 the sign-in page and Today in dark', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('tudu.theme', 'dark'));
    await page.goto('/sign-in');
    await expect(page.locator('html')).toHaveClass(/dark/);
    await signInFresh(page);
    await expect(page.locator('html')).toHaveClass(/dark/);
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor)).toBe(
      'rgb(17, 18, 17)',
    );
  });
});
