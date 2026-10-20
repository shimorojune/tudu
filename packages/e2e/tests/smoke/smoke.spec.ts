import { API_URL, expect, test } from '../../fixtures/app';

/** Runs against a deployed environment after each deploy, and against the local servers in CI. */
test('C01-S01 the sign-in page loads and the API answers', async ({ page }) => {
  await page.goto('/sign-in');
  await expect(page.getByRole('heading', { name: 'Sign in to Tudu' })).toBeVisible();
  const health = await page.request.get(`${API_URL}/health`);
  expect(health.ok()).toBe(true);
  expect(((await health.json()) as { ok: boolean }).ok).toBe(true);
});
