import { expect, test } from '../../fixtures/console';

/**
 * Chunk 00 · the kit page. Group `kit`. Each test loads the page fresh and checks it is whole: no console
 * errors, both themes paint, and the layout holds at phone width.
 */
test.describe('kit page', () => {
  test('C00-E01 loads in light with no console errors', async ({ page }) => {
    await page.addInitScript(() => {
      if (!localStorage.getItem('tudu.theme')) localStorage.setItem('tudu.theme', 'light');
    });
    await page.goto('/kit');
    await expect(page.getByRole('heading', { name: 'The kit' })).toBeVisible();
    await expect(page.locator('html')).not.toHaveClass(/dark/);
    // every section is on the page
    for (const id of [
      'theme',
      'type',
      'colour',
      'shape',
      'motion',
      'logo',
      'controls',
      'feedback',
      'layers',
    ]) {
      await expect(page.locator(`#${id}`)).toBeAttached();
    }
    await expect(page.getByRole('button', { name: 'New task' }).first()).toBeVisible();
  });

  test('C00-E02 loads in dark with no console errors', async ({ page }) => {
    await page.addInitScript(() => {
      if (!localStorage.getItem('tudu.theme')) localStorage.setItem('tudu.theme', 'dark');
    });
    await page.goto('/kit');
    await expect(page.getByRole('heading', { name: 'The kit' })).toBeVisible();
    await expect(page.locator('html')).toHaveClass(/dark/);
    const bg = await page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor);
    expect(bg).toBe('rgb(17, 18, 17)');
  });

  test('C00-E03 has no horizontal scroll at phone width', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/kit');
    await expect(page.getByRole('heading', { name: 'The kit' })).toBeVisible();
    const overflow = await page.evaluate(() => {
      const root = document.querySelector('.scroll-page') as HTMLElement;
      return {
        scroll: root.scrollWidth,
        client: root.clientWidth,
        doc: document.documentElement.scrollWidth,
        win: window.innerWidth,
      };
    });
    expect(overflow.scroll).toBeLessThanOrEqual(overflow.client);
    expect(overflow.doc).toBeLessThanOrEqual(overflow.win);
  });

  test('C00-E04 a menu near the bottom of the window opens upward', async ({ page }) => {
    await page.goto('/kit#feedback');
    const trigger = page.getByRole('button', { name: 'Menu' }).first();
    await trigger.scrollIntoViewIfNeeded();
    // put the trigger near the bottom edge, then open
    const box = await trigger.boundingBox();
    const viewport = page.viewportSize()!;
    await page.evaluate(
      (y) => {
        const root = document.querySelector('.scroll-page') as HTMLElement;
        root.scrollTop += y;
      },
      box!.y + box!.height - viewport.height + 40,
    );
    await trigger.click();
    // The kit's space switchers are open menus too: this is the floating one.
    const menu = page.locator('.tp-menu-pop[role="menu"]');
    await expect(menu).toBeVisible();
    await expect(menu).toHaveAttribute('data-side', 'top');
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
  });

  test('C00-E05 the theme switch cross-fades and is remembered', async ({ page }) => {
    await page.addInitScript(() => {
      if (!localStorage.getItem('tudu.theme')) localStorage.setItem('tudu.theme', 'light');
    });
    await page.goto('/kit');
    await page.getByRole('group', { name: 'Theme' }).getByRole('button', { name: 'Dark' }).click();
    await expect(page.locator('html')).toHaveClass(/dark/);
    expect(await page.evaluate(() => localStorage.getItem('tudu.theme'))).toBe('dark');
    await page.reload();
    await expect(page.locator('html')).toHaveClass(/dark/);
  });
});
