import type { Locator, Page } from '@playwright/test';
import { API_URL, expect, signInFresh, test } from '../../fixtures/app';
import { seedProjects } from '../../fixtures/groups';
import { dayList, fixClock, idle, row, titlesOf } from '../../fixtures/today';

/** The bar (or the sheet on phones), opened from New task with the cursor in the title. */
async function openBar(page: Page): Promise<Locator> {
  await page.getByRole('button', { name: 'New task' }).first().click();
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
});
