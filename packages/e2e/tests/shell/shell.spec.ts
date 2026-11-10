import { expect, signInFresh, test } from '../../fixtures/app';
import { goBacklog } from '../../fixtures/backlog';
import { expectSheetWidth } from '../../fixtures/layout';

test.describe('the shell', () => {
  test('C01-E07 the shell fits the screen: sidebar, rail or tabs', async ({ page }, testInfo) => {
    await signInFresh(page);
    const vp = testInfo.project.name;
    if (vp === 'desktop') {
      const nav = page.getByRole('navigation', { name: 'Main' });
      for (const item of ['Today', 'Week', 'Backlog'])
        await expect(nav.getByRole('button', { name: item })).toBeVisible();
      // The Inbox is one for every space and opens from the top bar, not the sidebar.
      await expect(nav.getByRole('button', { name: 'Inbox' })).toHaveCount(0);
      await expect(page.locator('.tp-tb-inbox')).toBeVisible();
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

  test("C01-E12 the rail's tips stay hidden while the sidebar folds and work once it has settled", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'only the desktop sidebar folds');
    await signInFresh(page);
    const nav = page.getByRole('navigation', { name: 'Main' });
    const today = nav.getByRole('button', { name: /^Today/ });
    for (let round = 0; round < 2; round++) {
      // Watch Today's tip on every frame from the press until the fold has settled.
      await page.evaluate(() => {
        const side = document.querySelector('nav.tp-sidebar')!;
        const wrap = side.querySelector('.tp-navwrap')!;
        const seen: { folding: boolean; opacity: string }[] = [];
        const w = window as unknown as { __fold: typeof seen; __foldDone: boolean };
        w.__fold = seen;
        w.__foldDone = false;
        const t0 = performance.now();
        // Until a frame after the hold has ended (and at most 2 s, so a fold that never settles still fails below).
        const tick = () => {
          const folding = side.classList.contains('tp-side-folding');
          seen.push({ folding, opacity: getComputedStyle(wrap, '::after').opacity });
          const after = seen.some((f) => f.folding) && !folding;
          if (after || performance.now() - t0 > 2000) w.__foldDone = true;
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
      await page.getByRole('button', { name: 'Collapse sidebar' }).click();
      await expect(nav).toHaveClass(/tp-rail/);
      await expect(nav).not.toHaveClass(/tp-side-folding/);
      await expect
        .poll(() => page.evaluate(() => (window as unknown as { __foldDone: boolean }).__foldDone))
        .toBe(true);
      const seen = await page.evaluate(
        () => (window as unknown as { __fold: { folding: boolean; opacity: string }[] }).__fold,
      );
      const during = seen.filter((f) => f.folding);
      expect(during.length).toBeGreaterThan(0);
      for (const f of during) expect(f.opacity).toBe('0');
      // Settled: a hover shows the tip, moving away hides it.
      const wrap = nav.locator('.tp-navwrap').first();
      const tip = () => wrap.evaluate((el) => getComputedStyle(el, '::after').opacity);
      await today.hover();
      await expect.poll(tip).toBe('1');
      await page.mouse.move(700, 400);
      await expect.poll(tip).toBe('0');
      await page.getByRole('button', { name: 'Expand sidebar' }).click();
      await expect(nav).not.toHaveClass(/tp-rail/);
      await expect(wrap).not.toHaveAttribute('data-tip');
    }
  });

  test('C01-E13 the space tile, the nav icons and the panel button share one column', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'only the desktop sidebar folds');
    await signInFresh(page);
    const nav = page.getByRole('navigation', { name: 'Main' });
    const middle = (sel: string) =>
      nav.locator(sel).evaluateAll((els) =>
        els.map((el) => {
          const b = el.getBoundingClientRect();
          return b.left + b.width / 2;
        }),
      );
    const check = async (rail: boolean) => {
      const icons = await middle('.tp-nav > svg');
      expect(icons.length).toBeGreaterThan(1);
      const column = icons[0]!;
      for (const x of icons) expect(Math.abs(x - column)).toBeLessThanOrEqual(0.5);
      const [tile] = await middle('.tp-ssw-b .tp-stile');
      expect(Math.abs(tile! - column)).toBeLessThanOrEqual(0.5);
      if (rail) {
        const [button] = await middle('.tp-ssw-b');
        expect(Math.abs(button! - column)).toBeLessThanOrEqual(0.5);
        const [panel] = await middle('.tp-side-tog svg');
        expect(Math.abs(panel! - column)).toBeLessThanOrEqual(0.5);
      }
    };
    await check(false);
    await page.getByRole('button', { name: 'Collapse sidebar' }).click();
    await expect(nav).toHaveClass(/tp-rail/);
    await expect(nav).not.toHaveClass(/tp-side-folding/);
    await check(true);
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
