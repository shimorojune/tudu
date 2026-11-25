import type { Locator, Page } from '@playwright/test';
import { API_URL, expect, signInFresh, test, newTaskButton } from '../../fixtures/app';
import { seedProjects } from '../../fixtures/groups';
import { dayList, fixClock, idle, row, titlesOf } from '../../fixtures/today';

/** The bar (or the sheet on phones), opened from New task with the cursor in the title. */
async function openBar(page: Page): Promise<Locator> {
  await newTaskButton(page).click();
  const b = page.getByRole('dialog', { name: 'Quick Add' });
  await expect(b.getByRole('textbox', { name: 'Task title' })).toBeFocused();
  return b;
}
const title = (b: Locator) => b.getByRole('textbox', { name: 'Task title' });
const hashMenu = (b: Locator) => b.getByRole('listbox', { name: 'Projects' });

/** Platform, Plants and Home in Personal, each with one Backlog task so nothing shows on today. */
async function threeProjects(page: Page) {
  return seedProjects(page, [
    { title: 'Old platform task', day: null, project: 'Platform' },
    { title: 'Old plants task', day: null, project: 'Plants' },
    { title: 'Old home task', day: null, project: 'Home' },
  ]);
}

/** A task on today's server list, by its title. */
async function serverToday(page: Page, spaceId: string, name: string) {
  const d = (await (await page.request.get(`${API_URL}/api/spaces/${spaceId}/days/2026-10-18`)).json()) as {
    tasks: Array<{ title: string; projectId: string | null }>;
  };
  return d.tasks.find((t) => t.title === name);
}

test.describe('quick-add # project', () => {
  test.beforeEach(async ({ page }) => {
    await fixClock(page);
  });

  test('PH-E01 #pla Enter picks Platform, Enter adds: the task is on today in Platform, titled without #pla', async ({
    page,
  }) => {
    await signInFresh(page);
    const seeded = await threeProjects(page);
    await page.reload();
    const b = await openBar(page);
    await title(b).pressSequentially('Review the notes #pla');
    await expect(hashMenu(b)).toBeVisible();
    await expect(b.getByText('Projects in Personal')).toBeVisible();
    // Both names start with the letters; they keep the space's own project order.
    await expect(hashMenu(b).getByRole('option')).toHaveText(seeded.order.filter((n) => n.startsWith('Pla')));
    await title(b).pressSequentially('t');
    await expect(hashMenu(b).getByRole('option')).toHaveText(['Platform']);
    await title(b).press('Enter');
    await expect(title(b)).toHaveValue('Review the notes');
    await expect(b.getByRole('button', { name: 'Project: Platform' })).toBeVisible();
    await expect(hashMenu(b)).toHaveCount(0);
    await title(b).press('Enter');
    await expect(page.getByRole('dialog', { name: 'Quick Add' })).toHaveCount(0, { timeout: 5000 });
    const r = row(dayList(page), 'Review the notes');
    await expect(r.locator('.tp-sg-project')).toHaveText('Platform');
    await idle(page);
    expect((await serverToday(page, seeded.spaceId, 'Review the notes'))?.projectId).toBe(
      seeded.projects.Platform,
    );
  });

  test('PH-E02 #garden offers New project Garden; the task has it and Settings › Projects lists it', async ({
    page,
  }) => {
    await signInFresh(page);
    await threeProjects(page);
    await page.reload();
    const b = await openBar(page);
    await title(b).pressSequentially('Buy seeds #garden');
    await expect(b.getByText('No project called garden')).toBeVisible();
    await expect(hashMenu(b).getByRole('option')).toHaveText(['New project Garden']);
    await title(b).press('Enter');
    await expect(b.getByRole('button', { name: 'Project: Garden' })).toBeVisible();
    await expect(title(b)).toHaveValue('Buy seeds');
    await title(b).press('Enter');
    await expect(page.getByRole('dialog', { name: 'Quick Add' })).toHaveCount(0, { timeout: 5000 });
    await expect(row(dayList(page), 'Buy seeds').locator('.tp-sg-project')).toHaveText('Garden');
    await idle(page);
    const me = (await (await page.request.get(`${API_URL}/api/me`)).json()) as {
      spaces: Array<{ id: string }>;
    };
    const listed = (await (
      await page.request.get(`${API_URL}/api/spaces/${me.spaces[0]!.id}/projects`)
    ).json()) as {
      projects: Array<{ name: string }>;
    };
    expect(listed.projects.map((p) => p.name)).toContain('Garden');
  });

  test('PH-E07 Quick Add: "Fix #92" and an Esc’d #word are saved as typed', async ({ page }) => {
    await signInFresh(page);
    await threeProjects(page);
    await page.reload();
    const b = await openBar(page);
    await title(b).pressSequentially('Fix #92 for #urgent');
    // # before a digit never opened it; the second one is open now.
    await expect(hashMenu(b)).toBeVisible();
    await title(b).press('Escape');
    await expect(hashMenu(b)).toHaveCount(0);
    // Esc was the menu's: the bar is still open with every word.
    await expect(title(b)).toHaveValue('Fix #92 for #urgent');
    await title(b).press('Enter');
    await expect(page.getByRole('dialog', { name: 'Quick Add' })).toHaveCount(0, { timeout: 5000 });
    await expect.poll(() => titlesOf(dayList(page))).toEqual(['Fix #92 for #urgent']);
  });

  test('PH-E10 phone: the menu opens above the title and a tap on a row picks', async ({ page }) => {
    test.skip(test.info().project.name !== 'phone', 'the sheet is the phone’s');
    await signInFresh(page);
    await threeProjects(page);
    await page.reload();
    const b = await openBar(page);
    await title(b).pressSequentially('Water #');
    await expect(b.locator('.tp-hm-pop')).toHaveClass(/tp-up/);
    const menuBox = (await hashMenu(b).boundingBox())!;
    const titleBox = (await title(b).boundingBox())!;
    expect(menuBox.y + menuBox.height).toBeLessThanOrEqual(titleBox.y + 1);
    await hashMenu(b).getByRole('option', { name: 'Home' }).click();
    await expect(b.getByRole('button', { name: 'Project: Home' })).toBeVisible();
    await expect(title(b)).toHaveValue('Water');
    await b.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Quick Add' })).toHaveCount(0, { timeout: 5000 });
    await expect(row(dayList(page), 'Water').locator('.tp-sg-project')).toHaveText('Home');
  });

  test('PH-E11 offline: a task with a project made by # shows at once, and both reach the server when back', async ({
    page,
    context,
  }) => {
    await signInFresh(page);
    const seeded = await threeProjects(page);
    await page.reload();
    await idle(page);
    await context.setOffline(true);
    await expect(page.getByText('You’re offline.')).toBeVisible();
    const b = await openBar(page);
    await title(b).pressSequentially('Pack the tent #camping');
    await title(b).press('Enter');
    await expect(b.getByRole('button', { name: 'Project: Camping' })).toBeVisible();
    await title(b).press('Enter');
    await expect(page.getByRole('dialog', { name: 'Quick Add' })).toHaveCount(0, { timeout: 5000 });
    await expect(row(dayList(page), 'Pack the tent').locator('.tp-sg-project')).toHaveText('Camping');
    await context.setOffline(false);
    await idle(page);
    // The outbox replays in order: the project first, then the task in it.
    await expect
      .poll(async () => (await serverToday(page, seeded.spaceId, 'Pack the tent'))?.projectId ?? null, {
        timeout: 15_000,
      })
      .not.toBeNull();
    const listed = (await (
      await page.request.get(`${API_URL}/api/spaces/${seeded.spaceId}/projects`)
    ).json()) as {
      projects: Array<{ id: string; name: string }>;
    };
    const camping = listed.projects.find((p) => p.name === 'Camping');
    expect(camping).toBeTruthy();
    expect((await serverToday(page, seeded.spaceId, 'Pack the tent'))?.projectId).toBe(camping!.id);
  });

  test('PH-E12 the floating Quick Add at the Mac window’s size: a long title and # keeps the menu whole, 12px inside (#117)', async ({
    page,
    context,
  }) => {
    test.skip(test.info().project.name !== 'desktop', 'the Mac window is one size');
    await signInFresh(page);
    const seeded = await threeProjects(page);
    const f = await context.newPage();
    await fixClock(f);
    await f.setViewportSize({ width: 640, height: 520 });
    await f.goto('/quick-add');
    const b = f.getByRole('dialog', { name: 'Quick Add' });
    await expect(title(b)).toBeFocused();
    const box = async () => (await hashMenu(b).boundingBox())!;
    const settled = async () => {
      // The pop-in scales from 96%: read the box once it is at rest.
      await expect(hashMenu(b)).toBeVisible();
      await expect
        .poll(() => f.evaluate(() => document.querySelector('.tp-hm-pop')!.getAnimations().length))
        .toBe(0);
      return box();
    };

    // A short title: the menu opens at the caret, as before, and nothing slides it.
    await title(b).pressSequentially('Call Sam #');
    const short = await settled();
    expect(short.x).toBeGreaterThanOrEqual(12);
    expect(short.x + short.width).toBeLessThanOrEqual(628);
    expect(await f.evaluate(() => document.querySelector<HTMLElement>('.tp-hm-pop')!.style.marginLeft)).toBe(
      '',
    );
    // At the caret: the menu's own margin is the # mark's place in the field.
    expect(
      await f.evaluate(() => parseFloat(document.querySelector<HTMLElement>('.tp-hm')!.style.marginLeft)),
    ).toBeGreaterThan(20);
    await title(b).press('Escape');
    await expect(hashMenu(b)).toHaveCount(0);

    // A title that fills the field: the menu would run past the window's right edge; it sits 12px inside.
    await title(b).fill('');
    await title(b).pressSequentially(
      'Send the signed renewal back to the landlord before Friday and ask about the deposit #',
    );
    const long = await settled();
    expect(Math.abs(long.x + long.width - 628)).toBeLessThanOrEqual(1);
    expect(long.x).toBeGreaterThanOrEqual(12);
    // Whole: nothing of it is outside the window.
    expect(long.x + long.width).toBeLessThanOrEqual(640);

    // Typing on after the same # filters it where it is; it doesn't chase the caret.
    await title(b).pressSequentially('pla');
    await expect(hashMenu(b).getByRole('option')).toHaveText(seeded.order.filter((n) => n.startsWith('Pla')));
    expect((await box()).x).toBe(long.x);
    // Enter still picks the first project.
    await title(b).press('Enter');
    await expect(hashMenu(b)).toHaveCount(0);
    await expect(
      b.getByRole('button', { name: `Project: ${seeded.order.find((n) => n.startsWith('Pla'))}` }),
    ).toBeVisible();
  });
});
