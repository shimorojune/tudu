import { expect, signInFresh, test } from '../../fixtures/app';
import { goBacklog } from '../../fixtures/backlog';
import { expectSheetWidth } from '../../fixtures/layout';

test.describe('the shell', () => {
  test('C01-E07 the shell fits the screen: sidebar, rail or tabs', async ({ page }, testInfo) => {
    await signInFresh(page);
    const vp = testInfo.project.name;
    if (vp === 'desktop') {
      const nav = page.getByRole('navigation', { name: 'Main' });
      for (const item of ['Today', 'Week', 'Backlog', 'Inbox'])
        await expect(nav.getByRole('button', { name: item })).toBeVisible();
      await expect(nav.getByText('Personal')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Collapse sidebar' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'New task' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Search tasks' })).toBeVisible();
      await page.getByRole('button', { name: 'Collapse sidebar' }).click();
      await expect(nav).toHaveClass(/tp-rail/);
      await expect(page.getByRole('button', { name: 'Expand sidebar' })).toBeVisible();
      await page.reload();
      await expect(page.getByRole('navigation', { name: 'Main' })).toHaveClass(/tp-rail/);
    } else if (vp === 'tablet') {
      await expect(page.getByRole('navigation', { name: 'Main' })).toHaveClass(/tp-rail/);
      await expect(page.getByRole('button', { name: 'New task' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Collapse sidebar' })).toHaveCount(0);
    } else {
      const tabs = page.getByRole('navigation', { name: 'Main' });
      for (const item of ['Today', 'Week', 'Search', 'More'])
        await expect(tabs.getByRole('button', { name: item })).toBeVisible();
      await expect(page.getByRole('button', { name: 'New task' })).toBeVisible();
      await expect(page.locator('.tp-sidebar')).toHaveCount(0);
    }
    await expect(
      page.getByRole('heading', { name: /^(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)$/ }),
    ).toBeVisible();
  });

  test('C01-E08 the theme is remembered and System follows the computer', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'phone', 'the avatar menu is a desktop and tablet control');
    await signInFresh(page);
    await page.getByRole('button', { name: /^You: / }).click();
    await page.getByRole('group', { name: 'Theme' }).getByRole('button', { name: 'Dark' }).click();
    await expect(page.locator('html')).toHaveClass(/dark/);
    await page.keyboard.press('Escape');
    await page.reload();
    await expect(page.locator('html')).toHaveClass(/dark/);
    await page.getByRole('button', { name: /^You: / }).click();
    await page.getByRole('group', { name: 'Theme' }).getByRole('button', { name: 'System' }).click();
    await page.emulateMedia({ colorScheme: 'light' });
    await expect(page.locator('html')).not.toHaveClass(/dark/);
    await page.emulateMedia({ colorScheme: 'dark' });
    await expect(page.locator('html')).toHaveClass(/dark/);
  });

  test('the day turns with the arrows and comes back to today', async ({ page }) => {
    await signInFresh(page);
    await page.getByRole('button', { name: 'Next day' }).click();
    await expect(page.getByText(/Tomorrow · Week \d+/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Back to today' })).toBeVisible();
    await page.getByRole('button', { name: 'Back to today' }).click();
    await expect(page.getByText(/Today · Week \d+/)).toBeVisible();
  });

  test('C01-E09 one-sheet pages keep the 800px column on the desk: the Backlog stays 800px and centred', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'the desk only');
    await signInFresh(page);
    await goBacklog(page);
    await expectSheetWidth(page, 800);
  });
});
