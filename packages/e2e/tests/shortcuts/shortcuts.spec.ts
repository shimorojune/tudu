import type { Page } from '@playwright/test';
import { API_URL, expect, signInFresh, test } from '../../fixtures/app';
import { openSearch } from '../../fixtures/search';
import { openSwitcher, switcher } from '../../fixtures/spaces';

/**
 * Settings › Shortcuts and the space keys (#60, #57; docs/plans/shortcuts.md, SK-E). The browser says it is a Mac,
 * so the keys read ⌃0 and ⌃1 to ⌃9; the words used elsewhere (Alt) are covered by the unit tests.
 */
const project = () => test.info().project.name;

type Space = { id: string; slug: string; name: string };

async function makeSpace(page: Page, name: string, color: string): Promise<Space> {
  const res = await page.request.post(`${API_URL}/api/spaces`, { data: { name, color, invites: [] } });
  expect(res.status()).toBe(201);
  return ((await res.json()) as { space: Space }).space;
}

/** You, in Personal, Northwind and Acme Studio (in that order in the list), on Personal's `view`. */
async function threeSpaces(page: Page, view = '') {
  await signInFresh(page);
  const nw = await makeSpace(page, 'Northwind', '#3d5a80');
  const ac = await makeSpace(page, 'Acme Studio', '#a0613d');
  await page.goto(`/me${view}`);
  await expect(switcher(page)).toContainText('Personal');
  return { nw, ac };
}

const dialog = (page: Page) => page.getByRole('dialog', { name: 'Settings' });
const field = (page: Page, name: string) =>
  dialog(page).getByRole('button', { name: new RegExp(`^${name} shortcut`) });

async function openShortcuts(page: Page) {
  const url = new URL(page.url());
  url.searchParams.set('settings', 'keys');
  await page.goto(url.pathname + url.search);
  await expect(dialog(page).getByRole('heading', { level: 1 })).toHaveText('Shortcuts');
}

async function closeSettings(page: Page) {
  await page.keyboard.press('Escape');
  await expect(dialog(page)).toHaveCount(0);
}

test.describe('SK shortcuts', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(Navigator.prototype, 'platform', { get: () => 'MacIntel' });
    });
  });

  test('SK-E01 ⌃0 opens All spaces, ⌃2 the second team space, ⌃1 Personal, on Week each time', async ({
    page,
  }) => {
    test.skip(project() !== 'desktop', 'the desk’s keyboard');
    const { nw } = await threeSpaces(page, '/week');
    await page.keyboard.press('Control+0');
    await expect(page).toHaveURL(/\/all\/week$/);
    await expect(switcher(page)).toContainText('All spaces');
    // ⌃2 is the second space after All spaces: Northwind (Personal is ⌃1).
    await page.keyboard.press('Control+2');
    await expect(page).toHaveURL(new RegExp(`/${nw.slug}/week$`));
    await expect(switcher(page)).toContainText('Northwind');
    await page.keyboard.press('Control+1');
    await expect(page).toHaveURL(/\/me\/week$/);
    await expect(switcher(page)).toContainText('Personal');
    // The key of the space you are in does nothing; a number past the list neither.
    await page.keyboard.press('Control+1');
    await page.keyboard.press('Control+7');
    await expect(page).toHaveURL(/\/me\/week$/);
  });

  test('SK-E02 on People in a team space, ⌃1 (Personal, which has none) lands on Today', async ({ page }) => {
    test.skip(project() !== 'desktop', 'the desk’s keyboard');
    const { nw } = await threeSpaces(page);
    await page.goto(`/${nw.slug}/people`);
    await expect(switcher(page)).toContainText('Northwind');
    await page.keyboard.press('Control+1');
    await expect(switcher(page)).toContainText('Personal');
    await expect(page).toHaveURL(/\/me$/);
  });

  test('SK-E03 typing in the writing line, ⌃2 switches and leaves no character in the field', async ({
    page,
  }) => {
    test.skip(project() !== 'desktop', 'the desk’s keyboard');
    const { nw } = await threeSpaces(page);
    const empty = page.getByRole('button', { name: 'Add a task' });
    const line = page.getByRole('button', { name: 'Write the next thing…' });
    await expect(empty.or(line).first()).toBeVisible();
    await ((await empty.isVisible()) ? empty : line.first()).click();
    const text = page.getByRole('textbox', { name: 'New task' });
    await text.fill('Buy stamps');
    const typed = page.evaluate(
      () =>
        new Promise<string>((done) => {
          const f = document.activeElement as HTMLInputElement | HTMLTextAreaElement;
          window.addEventListener('keyup', () => done(f.value ?? f.textContent ?? ''), {
            once: true,
            capture: true,
          });
        }),
    );
    await page.keyboard.press('Control+2');
    expect(await typed).toBe('Buy stamps');
    await expect(page).toHaveURL(new RegExp(`/${nw.slug}$`));
  });

  test('SK-E04 with Quick Add, Search or Settings open, ⌃2 does nothing', async ({ page }) => {
    test.skip(project() !== 'desktop', 'the desk’s keyboard');
    await threeSpaces(page);
    await page.getByRole('button', { name: 'New task' }).first().click();
    const qa = page.getByRole('dialog', { name: 'New task' });
    await expect(qa).toBeVisible();
    await page.keyboard.press('Control+2');
    await expect(page).toHaveURL(/\/me$/);
    await page.keyboard.press('Escape');
    await expect(qa).toHaveCount(0);

    await openSearch(page);
    await page.keyboard.press('Control+2');
    await expect(page).toHaveURL(/\/me$/);
    await page.keyboard.press('Escape');

    await openShortcuts(page);
    await page.keyboard.press('Control+2');
    await expect(page).toHaveURL(/\/me\?settings=keys$/);
    await expect(switcher(page)).toContainText('Personal');
  });

  test('SK-E05 set All spaces to ⌥⌘0: it works after a reload; the back arrow puts ⌃0 back', async ({
    page,
  }) => {
    test.skip(project() !== 'desktop', 'the desk’s keyboard');
    await threeSpaces(page);
    await openShortcuts(page);
    const all = field(page, 'All spaces');
    await expect(all).toHaveText('⌃0');
    await all.click();
    await expect(all).toHaveText('Press the new keys');
    await page.keyboard.press('Alt+Meta+0');
    await expect(all).toHaveText('⌥⌘0');
    await expect(dialog(page).getByRole('button', { name: 'Back to ⌃0' })).toBeVisible();
    await closeSettings(page);
    await page.reload();
    await expect(switcher(page)).toContainText('Personal');
    await page.keyboard.press('Control+0');
    await expect(page).toHaveURL(/\/me$/);
    await page.keyboard.press('Alt+Meta+0');
    await expect(page).toHaveURL(/\/all$/);

    await openShortcuts(page);
    await dialog(page).getByRole('button', { name: 'Back to ⌃0' }).click();
    await expect(field(page, 'All spaces')).toHaveText('⌃0');
    await expect(dialog(page).getByRole('button', { name: 'Back to ⌃0' })).toHaveCount(0);
  });

  test('SK-E06 refusals: a bare letter, ⌘Q, a digit under the space keys; each says why and keeps listening', async ({
    page,
  }) => {
    test.skip(project() !== 'desktop', 'the desk’s keyboard');
    await threeSpaces(page);
    await openShortcuts(page);
    const all = field(page, 'All spaces');
    await all.click();
    const alert = dialog(page).getByRole('alert');
    await page.keyboard.press('k');
    await expect(alert).toHaveText('Add ⌘, ⌃ or ⌥, so it can’t go off while you type.');
    await page.keyboard.press('Meta+q');
    await expect(alert).toHaveText('⌘Q quits Tudu. Pick other keys.');
    await page.keyboard.press('Control+2');
    await expect(alert).toHaveText('⌃2 already goes to a space. Pick other keys.');
    await expect(all).toHaveClass(/tp-rec/);
    // The next good press clears it.
    await page.keyboard.press('Control+Alt+a');
    await expect(all).toHaveText('⌃⌥A');
    await expect(alert).toHaveCount(0);
  });

  test('SK-E07 Delete turns the space keys off: ⌃2 does nothing and the list shows no number keys', async ({
    page,
  }) => {
    test.skip(project() !== 'desktop', 'the desk’s keyboard');
    await threeSpaces(page);
    await openShortcuts(page);
    const space = field(page, 'A space');
    await expect(space).toHaveText('⌃1to⌃9');
    await space.click();
    await page.keyboard.press('Delete');
    await expect(space).toHaveText('Off');
    await closeSettings(page);
    await page.keyboard.press('Control+2');
    await expect(page).toHaveURL(/\/me$/);
    const menu = await openSwitcher(page);
    await expect(menu.locator('.tp-sswl-k')).toHaveText(['⌃0']);
  });

  test('SK-E08 the space list shows ⌃0 to ⌃3 beside the spaces', async ({ page }) => {
    test.skip(project() !== 'desktop', 'the desk’s keyboard');
    await threeSpaces(page);
    const menu = await openSwitcher(page);
    await expect(menu.locator('.tp-sswl-k')).toHaveText(['⌃0', '⌃1', '⌃2', '⌃3']);
    await expect(menu.getByRole('menuitemradio', { name: /Northwind/ })).toHaveAttribute(
      'aria-keyshortcuts',
      'Control+2',
    );
    // With the list open, the key picks the row as a click would.
    await page.keyboard.press('Control+3');
    await expect(switcher(page)).toContainText('Acme Studio');
  });

  test('SK-E09 the web has no From anywhere rows and says where they live; phones list no Shortcuts', async ({
    page,
  }) => {
    test.skip(project() === 'tablet', 'the desk and the phone cover it');
    await signInFresh(page);
    if (project() === 'phone') {
      await page.goto('/me/settings');
      await expect(page.getByRole('button', { name: /^Appearance/ })).toBeVisible();
      await expect(page.getByRole('button', { name: /^Shortcuts/ })).toHaveCount(0);
      return;
    }
    await openShortcuts(page);
    await expect(dialog(page).getByRole('region', { name: 'From anywhere' })).toHaveCount(0);
    await expect(
      dialog(page).getByText('New task and New note from anywhere come with the Mac app.'),
    ).toBeVisible();
    await expect(dialog(page).getByRole('region', { name: 'In Tudu' })).toBeVisible();
    await expect(dialog(page).getByText('Keys for Tudu on this computer.')).toBeVisible();
  });
});
