import type { Locator, Page } from '@playwright/test';
import { API_URL, expect, signInFresh, test } from '../../fixtures/app';
import { box, openSearch, panel } from '../../fixtures/search';
import { createSpace, goPeople, me, switcher } from '../../fixtures/spaces';
import { dayList, fixClock, idle, row, rowsOf } from '../../fixtures/today';
import { goWeek } from '../../fixtures/week';

/**
 * Scramble my text (#67, chunk 23): the switch in the avatar menu under Theme. While it's on, every word that is the
 * person's own is drawn jumbled on every page; Tudu's own words stay; the field being written in shows real words;
 * nothing saved changes. The sweep (E01) seeds one sentinel word into every kind of user text and reads the pages.
 */
const Z = 'Zorbleck';
const desk = () => test.info().project.name === 'desktop';
const phone = () => test.info().project.name === 'phone';

let clock = Date.parse('2026-10-18T08:00:00.000Z');
const at = () => new Date((clock += 1000)).toISOString();

async function sync(page: Page, mutations: Array<{ type: string; payload: Record<string, unknown> }>) {
  const res = await page.request.post(`${API_URL}/api/sync`, {
    data: {
      clientId: 'seed',
      mutations: mutations.map((m) => ({ id: crypto.randomUUID(), at: at(), ...m })),
    },
  });
  expect(res.status()).toBe(200);
}

const menuButton = (page: Page) => page.getByRole('button', { name: /^You: / });
const scrambleSwitch = (page: Page) => page.getByRole('switch', { name: 'Scramble my text' });
const pill = (page: Page) => page.getByRole('button', { name: 'Scrambled: turn Scramble my text off' });

/** Flip Scramble my text from the avatar menu; the menu stays open, so Escape closes it after. */
async function flip(page: Page, on: boolean) {
  await menuButton(page).click();
  const sw = scrambleSwitch(page);
  await expect(sw).toBeVisible();
  if ((await sw.getAttribute('aria-checked')) !== String(on)) await sw.click();
  await expect(sw).toHaveAttribute('aria-checked', String(on));
  // Still open: switch it, then take the screenshot.
  await expect(page.getByRole('menu', { name: 'You' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu', { name: 'You' })).toHaveCount(0);
}

/** What the page draws for people to read: its text and its tooltips. Field values are not drawn text. */
async function drawn(page: Page): Promise<string> {
  return page.evaluate(
    () =>
      `${document.body.innerText}\n${[...document.querySelectorAll('[title]')]
        .map((e) => e.getAttribute('title'))
        .join('\n')}`,
  );
}

async function noSentinel(page: Page, where: string) {
  await idle(page);
  expect(await drawn(page), where).not.toContain(Z);
}

/** One team space full of the sentinel: its name, a project, a task with a comment, a note in a folder, your name. */
async function seedEverything(page: Page): Promise<{ spaceId: string; taskId: string; slug: string }> {
  await createSpace(page, `${Z} Farm`);
  const mine = await me(page);
  const space = mine.spaces.find((s) => s.name === `${Z} Farm`)!;
  const projectId = crypto.randomUUID();
  const taskId = crypto.randomUUID();
  const folderId = crypto.randomUUID();
  await sync(page, [
    { type: 'me.rename', payload: { id: mine.userId, name: `${Z} Person` } },
    { type: 'project.create', payload: { id: projectId, spaceId: space.id, name: `${Z} Launch` } },
    {
      type: 'task.create',
      payload: {
        id: taskId,
        spaceId: space.id,
        title: `Call ${Z} today`,
        day: '2026-10-18',
        position: 1024,
        projectId,
      },
    },
    { type: 'comment.create', payload: { id: crypto.randomUUID(), taskId, html: `<p>${Z} said yes</p>` } },
    { type: 'folder.create', payload: { id: folderId, parentId: null, name: `${Z} folder`, position: null } },
    {
      type: 'note.create',
      payload: { id: crypto.randomUUID(), folderId, title: `${Z} notes`, html: `<p>Ask ${Z} about it</p>` },
    },
  ]);
  await page.reload();
  await expect(row(dayList(page), `Call ${Z} today`)).toBeVisible({ timeout: 10_000 });
  // Toasts from making the space are not part of a page.
  await expect(page.locator('.tp-toast')).toHaveCount(0, { timeout: 10_000 });
  return { spaceId: space.id, taskId, slug: space.slug };
}

test.beforeEach(async ({ page }) => {
  await fixClock(page);
});

test.describe('Scramble my text', () => {
  test('C23-E01 the sweep: with it on, no page draws the sentinel word; off, it is back', async ({
    page,
  }) => {
    test.skip(!desk(), 'one sweep, on the desk; E05 covers phones');
    test.setTimeout(150_000);
    await signInFresh(page);
    const { slug } = await seedEverything(page);
    expect(await drawn(page)).toContain(Z);
    await flip(page, true);

    await noSentinel(page, 'Today');
    // Tudu's own words stay readable.
    await expect(page.getByRole('button', { name: 'New task' })).toBeVisible();
    await expect(pill(page)).toBeVisible();

    // The task panel: its title, project, comment and who wrote it.
    await rowsOf(dayList(page)).first().click();
    await expect(page.getByRole('textbox', { name: 'Task title' })).toBeVisible();
    await noSentinel(page, 'the task panel');
    await expect(page.getByRole('textbox', { name: 'Task title' })).not.toHaveValue(new RegExp(Z));
    await page.keyboard.press('Escape');

    await goWeek(page);
    await noSentinel(page, 'Week');

    await goPeople(page);
    await noSentinel(page, 'People');

    await openSearch(page);
    await box(page).fill(Z);
    await expect(panel(page).locator('.tp-sh-title').first()).toBeVisible();
    await noSentinel(page, 'Search results');
    await page.keyboard.press('Escape');

    // All spaces: one list, a space pill per row.
    await page.goto('/all');
    await expect(page.locator('.tp-row').first()).toBeVisible({ timeout: 10_000 });
    await noSentinel(page, 'All spaces');

    await page.goto(`/${slug}`);
    await expect(switcher(page)).toBeVisible();
    await page.getByRole('button', { name: 'Notebook', exact: true }).click();
    await expect(page).toHaveURL(/\/notebook/);
    // The folder, then its note: by role, since the scrambled names are not the seeded ones.
    const tree = page.getByRole('tree', { name: 'Notes and folders' });
    const folder = tree.getByRole('treeitem', { level: 1 }).first();
    if ((await folder.getAttribute('aria-expanded')) !== 'true')
      await folder.getByRole('button').first().click();
    await tree.getByRole('treeitem', { level: 2 }).first().getByRole('button').first().click();
    await expect(page.getByRole('textbox', { name: 'Note title' })).toBeVisible();
    await noSentinel(page, 'the Notebook');

    await page.goto(`/${slug}`);
    await menuButton(page).click();
    await page.getByRole('menuitem', { name: 'Settings' }).click();
    const settings = page.getByRole('dialog', { name: 'Settings' });
    await expect(settings).toBeVisible();
    await noSentinel(page, 'Settings, Account');
    await settings
      .getByRole('navigation', { name: 'Settings' })
      .getByRole('button', { name: /^Space/ })
      .click();
    await noSentinel(page, 'Settings, Space and projects');
    await page.keyboard.press('Escape');

    // Off again: the words come back.
    await flip(page, false);
    await expect(pill(page)).toHaveCount(0);
    await expect(row(dayList(page), `Call ${Z} today`)).toBeVisible();
  });

  test('C23-E02 it stays on through a reload; the pill turns it off and the words come back', async ({
    page,
  }) => {
    test.skip(!desk(), 'the same switch on every size');
    await signInFresh(page);
    await sync(page, [
      {
        type: 'task.create',
        payload: {
          id: crypto.randomUUID(),
          spaceId: (await me(page)).spaces.find((s) => s.kind === 'personal')!.id,
          title: `${Z} stays hidden`,
          day: '2026-10-18',
          position: 1024,
        },
      },
    ]);
    await page.reload();
    await expect(row(dayList(page), `${Z} stays hidden`)).toBeVisible();
    await flip(page, true);
    await page.reload();
    await expect(pill(page)).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-scrambled', '');
    await noSentinel(page, 'after a reload');
    await pill(page).click();
    await expect(pill(page)).toHaveCount(0);
    await expect(row(dayList(page), `${Z} stays hidden`)).toBeVisible();
  });

  test('C23-E03 writing while it is on: the focused field shows real words; what is saved is real', async ({
    page,
  }) => {
    test.skip(!desk(), 'the same fields on every size');
    await signInFresh(page);
    const personal = (await me(page)).spaces.find((s) => s.kind === 'personal')!;
    const id = crypto.randomUUID();
    await sync(page, [
      {
        type: 'task.create',
        payload: { id, spaceId: personal.id, title: `${Z} draft`, day: '2026-10-18', position: 1024 },
      },
    ]);
    await page.reload();
    await expect(row(dayList(page), `${Z} draft`)).toBeVisible();
    await flip(page, true);
    await rowsOf(dayList(page)).first().click();
    const title = page.getByRole('textbox', { name: 'Task title' });
    await expect(title).toBeVisible();
    await expect(title).not.toHaveValue(new RegExp(Z));
    await title.click();
    await expect(title).toHaveValue(`${Z} draft`);
    await title.press('End');
    await title.pressSequentially(' two');
    await expect(title).toHaveValue(`${Z} draft two`);
    await title.press('Enter');
    await expect(title).not.toHaveValue(new RegExp(Z));
    await idle(page);
    await expect
      .poll(async () => {
        const res = await page.request.get(`${API_URL}/api/spaces/${personal.id}/days/2026-10-18`);
        return JSON.stringify(await res.json());
      })
      .toContain(`${Z} draft two`);
  });

  test('C23-E04 Send feedback with it on: the form shows the real words; the thanks offers Turn off, which works', async ({
    page,
  }) => {
    test.skip(!desk(), 'the same form on every size');
    await signInFresh(page);
    await flip(page, true);
    await page.getByRole('button', { name: 'Report a bug or idea' }).click();
    const f = page.getByRole('dialog', { name: 'Send feedback' });
    await expect(f.getByText('Your text is scrambled')).toBeVisible();
    const words = f.getByRole('textbox', { name: 'What happened?' });
    await words.fill(`The ${Z} button sticks ${crypto.randomUUID()}`);
    await expect(words).toHaveValue(new RegExp(`^The ${Z} button sticks`));
    await f.getByRole('button', { name: 'Send', exact: true }).click();
    // The test API files on its fake GitHub: Filed, then Done gives the toast.
    const done = page.getByRole('dialog', { name: 'Thanks, it’s filed' });
    await expect(done).toBeVisible({ timeout: 10_000 });
    await done.getByRole('button', { name: 'Done' }).click();
    const toast = page.locator('.tp-toast');
    await expect(toast).toContainText('Scramble is on.', { timeout: 10_000 });
    await toast.getByRole('button', { name: 'Turn off' }).click();
    await expect(pill(page)).toHaveCount(0);
    await expect(page.locator('html')).not.toHaveAttribute('data-scrambled', '');
  });

  test('C23-E05 phones: the switch is in Settings, Appearance (the avatar opens Settings); the pill fits the header', async ({
    page,
  }) => {
    test.skip(!phone(), 'phones only');
    await signInFresh(page);
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByRole('button', { name: /^Appearance/ }).click();
    const sw = scrambleSwitch(page);
    await expect(sw).toHaveAttribute('aria-checked', 'false');
    await sw.click();
    await expect(sw).toHaveAttribute('aria-checked', 'true');
    const p = pill(page);
    await expect(p).toBeVisible();
    const fits = await page.evaluate(() => {
      const bar = document.querySelector('.app-phone-head');
      return (
        !!bar &&
        bar.scrollWidth <= bar.clientWidth + 1 &&
        document.documentElement.scrollWidth <= window.innerWidth
      );
    });
    expect(fits).toBe(true);
    await p.click();
    await expect(p).toHaveCount(0);
    await expect(sw).toHaveAttribute('aria-checked', 'false');
  });

  test('C23-E07 kit: the Scrambled pill in light and dark, on one line', async ({ page }) => {
    test.skip(!desk(), 'the kit on the desk');
    await page.goto('/kit');
    const block = page.getByRole('region', { name: 'Scrambled pill' });
    await expect(block.locator('.tp-scr-pill')).toHaveCount(2);
    for (const p of await block.locator('.tp-scr-pill').all()) {
      await expect(p).toHaveText('Scrambled');
      expect((await p.boundingBox())!.height).toBeLessThanOrEqual(24);
    }
  });
});

export type { Locator };
