import type { Locator, Page } from '@playwright/test';
import { API_URL, expect, signInFresh, test } from '../../fixtures/app';
import { goBacklog } from '../../fixtures/backlog';
import { expectFolds, sampleHeights } from '../../fixtures/motion';
import { fixClock, quickAdd, writeTasks } from '../../fixtures/today';

/**
 * The plan is docs/plans/focus-shift-and-sim-exit.md. These ids (`FX-…`) come from that plan, not a chunk.
 * Unlike the rest of the suite these run with motion on: they are about what moves, and how.
 */
test.use({ contextOptions: { reducedMotion: 'no-preference' } });

const THEMES = ['light', 'dark'] as const;

async function inTheme(page: Page, theme: (typeof THEMES)[number]) {
  await page.addInitScript((t) => localStorage.setItem('tudu.theme', t), theme);
}

/** The writing line never moves: its words keep their box before, while Quick Add is open, and after Esc. */
async function expectLineStill(page: Page, sheet: Locator, label: string) {
  const text = sheet.locator('.tp-addtask .tp-addtask-btn').first();
  await expect(text).toHaveText(label);
  const before = await text.boundingBox();
  await text.click();
  const qa = quickAdd(page);
  await expect(qa.getByRole('textbox', { name: 'Task title' })).toBeFocused();
  await expect(page.getByRole('textbox', { name: 'New task' })).toHaveCount(0);
  expect(await text.boundingBox()).toEqual(before);
  await page.keyboard.press('Escape');
  await expect(qa).toHaveCount(0, { timeout: 5000 });
  await expect(text).toHaveText(label);
  expect(await text.boundingBox()).toEqual(before);
}

test.describe('motion', () => {
  test.beforeEach(async ({ page }) => {
    // Four offsets, each two screenshots decoded in the page: WebKit on a CI runner needs more than 30s for that.
    test.slow();
    await fixClock(page);
  });

  for (const theme of THEMES) {
    test(`NI-E07 Today (${theme}): "Write the next thing…" opens Quick Add and the line never moves`, async ({
      page,
    }) => {
      await inTheme(page, theme);
      await signInFresh(page);
      await writeTasks(page, ['Pay the electricity bill']);
      await expectLineStill(page, page.locator('body'), 'Write the next thing…');
    });

    test(`NI-E07 Backlog (${theme}): "Add to the Backlog…" opens Quick Add and the line never moves`, async ({
      page,
    }) => {
      await inTheme(page, theme);
      await signInFresh(page);
      await seedLookAlikes(page);
      await goBacklog(page);
      await expectLineStill(page, page.locator('body'), 'Add to the Backlog…');
    });
  }
});

/** Two backlog tasks a Quick Add title can look like. Written through sync so search has them at once. */
async function seedLookAlikes(page: Page) {
  const me = (await (await page.request.get(`${API_URL}/api/me`)).json()) as {
    spaces: Array<{ id: string }>;
  };
  const spaceId = me.spaces[0]!.id;
  const titles = [
    'Run the request status enum migration and backfill on staging',
    'Run the request status enum migration on production',
  ];
  let at = Date.parse('2026-10-18T09:00:00.000Z');
  const mutations = titles.map((title, i) => ({
    id: crypto.randomUUID(),
    type: 'task.create',
    payload: { id: crypto.randomUUID(), spaceId, title, day: null, position: 1024 * (i + 1) },
    at: new Date((at += 1000)).toISOString(),
  }));
  const res = await page.request.post(`${API_URL}/api/sync`, { data: { clientId: 'seed', mutations } });
  expect(res.status()).toBe(200);
  await page.reload();
  await expect(
    page.getByRole('heading', { name: /^(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)$/ }),
  ).toBeVisible({ timeout: 10_000 });
}

/** Quick Add open with "Looks like tasks you have" showing for a near-duplicate title. */
async function lookAlikesShown(page: Page) {
  await signInFresh(page);
  await seedLookAlikes(page);
  await page.getByRole('button', { name: 'New task' }).first().click();
  const bar = page.getByRole('dialog', { name: 'Quick Add' });
  const line = bar.getByRole('textbox', { name: 'Task title' });
  await expect(line).toBeFocused();
  await line.fill('Run the migration on staging');
  const wrap = bar.locator('.tp-qa-simwrap');
  await expect(wrap).toHaveClass(/tp-on/);
  // the fold in has finished
  await expect.poll(() => wrap.evaluate((e) => e.getBoundingClientRect().height)).toBeGreaterThan(40);
  await page.waitForTimeout(300);
  return { bar, line, wrap };
}

test.describe('motion: Quick Add look-alikes', () => {
  test.beforeEach(async ({ page }) => {
    await fixClock(page);
  });

  test('FX-E04 × folds the block away, then the titles leave the page', async ({ page }) => {
    const { bar, wrap } = await lookAlikesShown(page);
    const heights = await sampleHeights(page, wrap, () =>
      bar.getByRole('button', { name: 'None of these' }).click(),
    );
    expectFolds(heights);
    await expect(wrap.locator('.tp-qa-sim')).toHaveCount(0);
  });

  test('FX-E05 with "1 more" open, × folds the whole block, the open rest with it', async ({ page }) => {
    const { bar, wrap } = await lookAlikesShown(page);
    await bar.getByRole('button', { name: '1 more' }).click();
    await expect(wrap.locator('.tp-qa-sim-rest')).toHaveClass(/tp-on/);
    await page.waitForTimeout(300);
    const heights = await sampleHeights(page, wrap, async () => {
      await bar.getByRole('button', { name: 'None of these' }).click();
      await expect(wrap.locator('.tp-qa-sim-rest')).toHaveClass(/tp-on/);
    });
    expectFolds(heights);
  });

  test('FX-E06 editing the title until nothing matches folds the block', async ({ page }) => {
    const { line, wrap } = await lookAlikesShown(page);
    const heights = await sampleHeights(
      page,
      wrap,
      async () => {
        await line.fill('Buy oat milk');
        await expect(wrap).not.toHaveClass(/tp-on/);
      },
      400,
    );
    expectFolds(heights);
  });

  test('FX-E07 cutting the title under four letters folds the block', async ({ page }) => {
    const { line, wrap } = await lookAlikesShown(page);
    const heights = await sampleHeights(page, wrap, () => line.fill('Run'));
    expectFolds(heights);
  });

  test('FX-E08 a new match after a fold shows its own titles', async ({ page }) => {
    const { bar, line, wrap } = await lookAlikesShown(page);
    await line.fill('Run');
    await expect(wrap).not.toHaveClass(/tp-on/);
    await line.fill('Run the migration on production');
    await expect(wrap).toHaveClass(/tp-on/);
    await expect(bar.locator('.tp-qa-sim-t').first()).toHaveText(
      'Run the request status enum migration on production',
    );
  });

  test('FX-E09 under reduced motion × still hides the block and leaves nothing behind', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const { bar, wrap } = await lookAlikesShown(page);
    await bar.getByRole('button', { name: 'None of these' }).click();
    await expect(wrap).not.toHaveClass(/tp-on/);
    await expect(wrap.locator('.tp-qa-sim')).toHaveCount(0);
    await expect.poll(() => wrap.evaluate((e) => e.getBoundingClientRect().height)).toBe(0);
  });
});
