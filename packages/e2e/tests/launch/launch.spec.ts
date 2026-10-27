import type { Page } from '@playwright/test';
import { expect, signInFresh, test } from '../../fixtures/app';

/**
 * Opening Tudu on the web: the launch mark (#boot) while the app loads (canvas K-Launch, chunk 11). The suite runs
 * with reduced motion, so the mark fades in after 300ms rather than drawing in; the motion itself is a CSS concern
 * checked by C11-U19. Desk size only: the mark is the same on every size.
 */
test.beforeEach(() => {
  test.skip(test.info().project.name !== 'desktop', 'one size is enough');
});

/** When the mark was first painted visible and when it left, in ms from the page's start, watched every frame. */
async function watchBoot(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { __boot: { seen?: number; gone?: number } };
    w.__boot = {};
    const tick = () => {
      const el = document.getElementById('boot');
      if (!el) {
        if (document.readyState !== 'loading') {
          w.__boot.gone ??= performance.now();
          return;
        }
      } else if (w.__boot.seen === undefined && Number(getComputedStyle(el).opacity) > 0) {
        w.__boot.seen = performance.now();
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

const boot = (page: Page) =>
  page.evaluate(() => (window as unknown as { __boot: { seen?: number; gone?: number } }).__boot);

/** Hold Tudu's "who am I" answer, so the app can't draw its first page for `ms`. */
async function holdMe(page: Page, ms: number): Promise<void> {
  await page.route('**/api/me', async (route) => {
    await new Promise((r) => setTimeout(r, ms));
    await route.continue();
  });
}

test.describe('opening Tudu', () => {
  test('C11-E19 slow: the mark shows after 300ms, never before, then leaves once the app draws; dark in the dark palette', async ({
    page,
  }) => {
    await signInFresh(page);
    await watchBoot(page);
    await holdMe(page, 2_000);
    await page.goto('/');
    await expect(page.locator('#boot')).toHaveCSS('opacity', '1');
    const { seen } = await boot(page);
    expect(seen).toBeGreaterThanOrEqual(290);
    await expect(page.getByRole('status', { name: 'Opening Tudu' })).toBeVisible();
    // The app arrives and the mark is gone.
    await expect(page.getByRole('heading', { name: /day$/ })).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('#boot')).toHaveCount(0);

    // Dark: the mark is drawn in the dark palette.
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.evaluate(() => localStorage.setItem('tudu.theme', 'dark'));
    await page.reload();
    await expect(page.locator('#boot')).toHaveCSS('opacity', '1');
    await expect(page.locator('#boot')).toHaveCSS('background-color', 'rgb(17, 18, 17)');
    await expect(page.locator('#boot .tl-box')).toHaveCSS('fill', 'rgb(29, 28, 26)');
    await expect(page.locator('#boot .tl-sheet')).toHaveCSS('fill', 'rgb(255, 106, 74)');
    await expect(page.locator('#boot')).toHaveCount(0, { timeout: 10_000 });
  });

  test('C11-E20 the mark is never seen in the first 300ms; held 7s it says Still opening Tudu…; Less motion holds it still', async ({
    page,
  }) => {
    await signInFresh(page);
    await watchBoot(page);
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /day$/ })).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('#boot')).toHaveCount(0);
    const quick = await boot(page);
    // Whatever this machine's speed: the mark only ever shows from 300ms on, and a start quicker than that never sees it.
    if (quick.seen !== undefined) expect(quick.seen).toBeGreaterThanOrEqual(290);
    if (quick.gone !== undefined && quick.gone < 290) expect(quick.seen).toBeUndefined();

    await holdMe(page, 7_500);
    await page.reload();
    const slow = page.locator('#boot .tl-slow');
    await expect(slow).toHaveText('Still opening Tudu…');
    await expect(slow).toHaveCSS('opacity', '0');
    await expect(slow).toHaveCSS('opacity', '1', { timeout: 7_000 });
    // Reduced motion (the suite's setting): nothing moves but the fades.
    const moving = await page.evaluate(() =>
      document
        .getElementById('boot')!
        .getAnimations({ subtree: true })
        .map((a) => (a as CSSAnimation).animationName)
        .filter((n) => !['tl-fade', 'tl-rise'].includes(n)),
    );
    expect(moving).toEqual([]);
    await expect(page.locator('#boot')).toHaveCount(0, { timeout: 10_000 });
  });

  test('C11-E21 signed out, the mark gives way to Sign in; from the Mac app’s loader it carries on held', async ({
    page,
  }) => {
    await watchBoot(page);
    await holdMe(page, 1_500);
    await page.goto('/');
    await expect(page.locator('#boot')).toHaveCSS('opacity', '1');
    await expect(page.getByRole('heading', { name: 'Sign in to Tudu' })).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('#boot')).toHaveCount(0);

    // The Mac app launched a second ago and its loader already shows the mark: this page carries it on at once.
    await page.addInitScript(() => {
      (window as unknown as { __TUDU_LOOK__: unknown }).__TUDU_LOOK__ = {
        theme: 'light',
        lessMotion: false,
        launchedAt: Date.now() - 1_000,
      };
    });
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-boot', 'held');
    await expect(page.locator('#boot')).toHaveCSS('opacity', '1');
    const { seen } = await boot(page);
    expect(seen).toBeLessThan(290);
    await expect(page.locator('#boot')).toHaveCount(0, { timeout: 10_000 });
  });
});
