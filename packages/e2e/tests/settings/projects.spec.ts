import type { Locator, Page } from '@playwright/test';
import { API_URL, expect, signInFresh, test } from '../../fixtures/app';
import { goBacklog, filterChip } from '../../fixtures/backlog';
import { createSpace, joinLink, me, secondPerson } from '../../fixtures/spaces';
import { dayList, fixClock, idle, row } from '../../fixtures/today';

/**
 * Chunk 18 · projects in Settings › Space. Group `settings`. Each test makes its own person, space and projects.
 */

const phone = () => test.info().project.name === 'phone';
const tablet = () => test.info().project.name === 'tablet';
const desktop = () => !phone() && !tablet();

const dialog = (page: Page) => page.getByRole('dialog', { name: 'Settings' });
const nav = (page: Page) => page.getByRole('navigation', { name: 'Settings' });
const list = (scope: Locator) => scope.getByRole('list', { name: 'Projects' });
const toast = (page: Page) => page.locator('.tp-toast');

/** Settings › Space, as the size draws it: the dialog from the avatar, or the page on phones. */
async function openProjects(page: Page): Promise<Locator> {
  if (phone()) {
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await nav(page)
      .getByRole('button', { name: /^Space/ })
      .click();
    await expect(page).toHaveURL(/\/settings\/space$/);
    return page.locator('main, body').first();
  }
  await page.getByRole('button', { name: /^You: / }).click();
  await page.getByRole('menuitem', { name: 'Settings' }).click();
  await expect(dialog(page)).toBeVisible();
  await nav(page)
    .getByRole('button', { name: /^Space/ })
    .click();
  return dialog(page);
}

/** A project and tasks on it today, through the outbox, as the app would write them. */
async function seedProject(page: Page, spaceId: string, name: string, titles: string[]): Promise<string> {
  const pid = crypto.randomUUID();
  const at = Date.now();
  const res = await page.request.post(`${API_URL}/api/sync`, {
    data: {
      clientId: 'seed',
      mutations: [
        {
          id: crypto.randomUUID(),
          type: 'project.create',
          payload: { id: pid, spaceId, name },
          at: new Date(at).toISOString(),
        },
        ...titles.map((title, i) => ({
          id: crypto.randomUUID(),
          type: 'task.create',
          payload: {
            id: crypto.randomUUID(),
            spaceId,
            title,
            day: '2026-10-18',
            position: 1024 * (i + 1),
            projectId: pid,
          },
          at: new Date(at + 1000 + i).toISOString(),
        })),
      ],
    },
  });
  expect(res.ok()).toBe(true);
  return pid;
}

async function personal(page: Page) {
  return (await me(page)).spaces.find((s) => s.kind === 'personal')!;
}

async function serverProjects(page: Page, spaceId: string) {
  const res = await page.request.get(`${API_URL}/api/spaces/${spaceId}/projects`);
  return ((await res.json()) as { projects: Array<{ name: string; color: string }> }).projects;
}

/** E01's flow: New project, a name and a colour, Create project; it lists, and Quick Add's picker has it. */
async function createFlow(page: Page) {
  await fixClock(page);
  await signInFresh(page);
  const space = await personal(page);
  let s = await openProjects(page);
  await expect(s.getByRole('heading', { name: 'No projects yet' })).toBeVisible();
  await s.getByRole('button', { name: 'New project' }).click();
  const ed = s.getByRole('group', { name: 'New project' });
  await expect(ed.getByRole('textbox', { name: 'Project name' })).toBeFocused();
  await ed.getByRole('textbox', { name: 'Project name' }).fill('Hiring');
  await ed.getByRole('radiogroup', { name: 'Project colour' }).getByRole('radio').nth(4).click();
  await expect(ed.getByLabel('On a task')).toContainText('Hiring');
  await ed.getByRole('button', { name: 'Create project' }).click();
  await expect(list(s).getByRole('listitem')).toHaveText(['HiringNone open']);
  await idle(page);
  const saved = await serverProjects(page, space.id);
  expect(saved.map((p) => p.name)).toEqual(['Hiring']);
  // Out of Settings, into Quick Add: the picker lists it.
  if (phone()) {
    await page.locator('.tp-set-back').click();
    await page.goto('/me');
  } else await page.keyboard.press('Escape');
  await expect(dialog(page)).toHaveCount(0);
  await page.getByRole('button', { name: 'New task' }).first().click();
  const b = page.getByRole('dialog', { name: 'Quick Add' });
  await b.getByRole('button', { name: 'Choose a project' }).click();
  await expect(b.locator('.tp-qa-pop').getByRole('menuitem', { name: 'Hiring' })).toBeVisible();
  s = b;
  return { space, bar: s };
}

/** E03's flow: ⋯ › Delete says what happened to the tasks; the dots go; Undo puts them back. */
async function deleteFlow(page: Page) {
  await fixClock(page);
  await signInFresh(page);
  const space = await personal(page);
  await seedProject(page, space.id, 'Home', ['Fix the gate', 'Paint the shed']);
  await page.reload();
  const gate = row(dayList(page), 'Fix the gate');
  await expect(gate.locator('.tp-sg-project')).toHaveText('Home');
  const s = await openProjects(page);
  await expect(list(s).getByRole('listitem')).toHaveText(['Home2 open']);
  await s.getByRole('button', { name: 'More for Home' }).click();
  await page.getByRole('menu', { name: 'More for Home' }).getByRole('menuitem', { name: 'Delete' }).click();
  await expect(toast(page)).toContainText('Home deleted. Its 2 tasks keep no project.');
  await expect(s.getByRole('heading', { name: 'No projects yet' })).toBeVisible();
  await toast(page).getByRole('button', { name: 'Undo' }).click();
  await expect(list(s).getByRole('listitem')).toHaveText(['Home2 open']);
  await idle(page);
  if (phone()) await page.goto('/me');
  else await page.keyboard.press('Escape');
  await expect(row(dayList(page), 'Fix the gate').locator('.tp-sg-project')).toHaveText('Home');
  await expect(row(dayList(page), 'Paint the shed').locator('.tp-sg-project')).toHaveText('Home');
  return { space };
}

/** E02's flow: a row opens its editor; rename and recolour; Save; the task's byline follows. */
async function editFlow(page: Page) {
  await fixClock(page);
  await signInFresh(page);
  const space = await personal(page);
  await seedProject(page, space.id, 'Home', ['Fix the gate']);
  await page.reload();
  const r = row(dayList(page), 'Fix the gate');
  await expect(r.locator('.tp-sg-project')).toHaveText('Home');
  const before = (await serverProjects(page, space.id))[0]!.color;
  const s = await openProjects(page);
  await s.getByRole('button', { name: 'Edit Home, 1 open task' }).click();
  const ed = s.getByRole('group', { name: 'Edit Home' });
  await expect(ed.getByText('1 open task')).toBeVisible();
  await ed.getByRole('textbox', { name: 'Project name' }).fill('House');
  await ed
    .getByRole('radiogroup', { name: 'Project colour' })
    .getByRole('radio', { checked: false })
    .nth(2)
    .click();
  await ed.getByRole('button', { name: 'Save' }).click();
  await expect(list(s).getByRole('listitem')).toHaveText(['House1 open']);
  await idle(page);
  const after = (await serverProjects(page, space.id))[0]!;
  expect(after.name).toBe('House');
  expect(after.color).not.toBe(before);
  await page.keyboard.press('Escape');
  await expect(r.locator('.tp-sg-project')).toHaveText('House');
  const dot = await r
    .locator('.tp-sg-project i, .tp-sg-project .tp-dot')
    .first()
    .evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(dot).not.toBe('');
}

const dark = (page: Page) =>
  page.addInitScript(() => {
    if (!localStorage.getItem('tudu.theme')) localStorage.setItem('tudu.theme', 'dark');
  });

test.describe('settings › projects', () => {
  test('C18-E01 Personal › Space: New project, a name and a colour, Create project; it lists, and Quick Add has it', async ({
    page,
  }) => {
    test.skip(!desktop(), 'phones are E06; the dialog is the same on tablets');
    await createFlow(page);
  });

  test('C18-E02 a row opens its editor; rename and recolour, Save; the task on Today shows the new name', async ({
    page,
  }) => {
    test.skip(!desktop(), 'tablets are E07');
    await editFlow(page);
  });

  test('C18-E03 ⋯ › Delete: "Its 2 tasks keep no project."; the dots go; Undo brings them back', async ({
    page,
  }) => {
    test.skip(!desktop(), 'phones are E06');
    await deleteFlow(page);
    // Delete again and let it stand: the dots go for good.
    const s = await openProjects(page);
    await s.getByRole('button', { name: 'More for Home' }).click();
    await page.getByRole('menu', { name: 'More for Home' }).getByRole('menuitem', { name: 'Delete' }).click();
    await idle(page);
    await page.keyboard.press('Escape');
    await expect(row(dayList(page), 'Fix the gate').locator('.tp-sg-project')).toHaveCount(0);
  });

  test('C18-E04 a team space: a member creates and edits; the other person sees it within a second', async ({
    page,
    browser,
  }) => {
    test.skip(!desktop(), 'the same section on every size');
    await signInFresh(page);
    const b = await secondPerson(browser);
    const slug = await createSpace(page, 'Northwind', [b.email]);
    await b.page.goto(await joinLink(page, b.email));
    await b.page.getByRole('button', { name: 'Join Northwind' }).click();
    await expect(b.page).toHaveURL(new RegExp(`/${slug}$`), { timeout: 10_000 });
    const mine = await openProjects(page);
    await expect(mine.getByRole('heading', { name: 'No projects yet' })).toBeVisible();
    // The member, not an admin, makes one.
    const s = await openProjects(b.page);
    await s.getByRole('button', { name: 'New project' }).click();
    await s.getByRole('textbox', { name: 'Project name' }).fill('Launch');
    await s.getByRole('button', { name: 'Create project' }).click();
    await expect(list(mine).getByRole('listitem')).toHaveText(['LaunchNone open'], { timeout: 2000 });
    // And renames it.
    await s.getByRole('button', { name: 'Edit Launch, No open tasks' }).click();
    await s.getByRole('textbox', { name: 'Project name' }).fill('Launch week');
    await s.getByRole('textbox', { name: 'Project name' }).press('Enter');
    await expect(list(mine).getByRole('listitem')).toHaveText(['Launch weekNone open'], { timeout: 2000 });
    await b.context.close();
  });

  test('C18-E05 Edit projects… from Quick Add, the task panel and the Backlog filter opens Settings on Projects; Quick Add keeps its draft', async ({
    page,
  }) => {
    test.skip(!desktop(), 'phones go to the Space page (E06)');
    await fixClock(page);
    await signInFresh(page);
    const space = await personal(page);
    await seedProject(page, space.id, 'Home', ['Fix the gate']);
    await page.reload();
    const projectsInView = async () => {
      const d = dialog(page);
      await expect(d).toBeVisible();
      await expect(nav(page).getByRole('button', { name: /^Space/ })).toHaveAttribute('aria-current', /.+/);
      await expect(d.locator('#projects')).toBeInViewport();
      return d;
    };

    // Quick Add: Settings opens on Projects; closing it brings the bar back with the draft.
    await page.getByRole('button', { name: 'New task' }).first().click();
    const b = page.getByRole('dialog', { name: 'Quick Add' });
    await b.getByRole('textbox', { name: 'Task title' }).fill('Order the paint');
    await b.getByRole('button', { name: 'Choose a project' }).click();
    await b.locator('.tp-qa-pop').getByRole('menuitem', { name: 'Edit projects…' }).click();
    await expect(b).toHaveCount(0);
    await projectsInView();
    await page.keyboard.press('Escape');
    await expect(dialog(page)).toHaveCount(0);
    await expect(b.getByRole('textbox', { name: 'Task title' })).toHaveValue('Order the paint');
    await page.keyboard.press('Escape');
    await expect(b).toHaveCount(0);

    // The task panel's project picker.
    await row(dayList(page), 'Fix the gate').getByRole('button', { name: 'Fix the gate' }).click();
    const panel = page.getByRole('dialog', { name: 'Task details' });
    await panel.getByRole('button', { name: 'Project', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Edit projects…' }).click();
    await projectsInView();
    await page.keyboard.press('Escape');
    await expect(dialog(page)).toHaveCount(0);

    // The Backlog's project filter.
    await panel.getByRole('button', { name: 'Close' }).click();
    await expect(panel).toHaveCount(0);
    await goBacklog(page);
    await filterChip(page).click();
    await page.getByRole('menuitem', { name: 'Edit projects…' }).click();
    await projectsInView();
  });

  test('C18-E06 phone: create and delete in the Space page', async ({ page }) => {
    test.skip(!phone(), 'phone only');
    await createFlow(page);
    await page.context().clearCookies();
    await deleteFlow(page);
  });

  test('C18-E07 tablet: rename and recolour in the dialog', async ({ page }) => {
    test.skip(!tablet(), 'tablet only');
    await editFlow(page);
  });

  test('C18-E08 dark: create, then delete with Undo, on the dark surfaces', async ({ page }) => {
    test.skip(!desktop(), 'the same flow on every size');
    await dark(page);
    await createFlow(page);
    await expect(page.locator('html')).toHaveClass(/dark/);
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await page.context().clearCookies();
    await deleteFlow(page);
    const s = await openProjects(page);
    const bg = await list(s)
      .getByRole('listitem')
      .first()
      .evaluate(
        (el) => getComputedStyle(el.closest('.tp-set-sec, section, [role="dialog"]')!).backgroundColor,
      );
    expect(bg).not.toBe('rgb(255, 255, 255)');
  });

  test('C18-E09 the kit: the list, both editors and the empty state, light and dark; nothing overflows at phone width', async ({
    page,
  }) => {
    test.skip(!desktop(), 'the kit is one page');
    await page.goto('/kit');
    for (const [title, check] of [
      ['Projects', (l: Locator) => expect(l.getByRole('list', { name: 'Projects' })).toBeVisible()],
      [
        'Projects, editing one',
        (l: Locator) => expect(l.getByRole('group', { name: /^Edit / })).toBeVisible(),
      ],
      [
        'Projects, a new one',
        (l: Locator) => expect(l.getByRole('group', { name: 'New project' })).toBeVisible(),
      ],
      [
        'Projects, none yet',
        (l: Locator) => expect(l.getByRole('heading', { name: 'No projects yet' })).toBeVisible(),
      ],
    ] as const) {
      const block = page.getByRole('region', { name: title, exact: true });
      // Light, then dark: each Pair draws both.
      for (const i of [0, 1]) await check(block.locator('.kit-desk').nth(i));
    }
    await page.setViewportSize({ width: 390, height: 844 });
    const over = await page.evaluate(() => {
      const past: string[] = [];
      for (const el of document.querySelectorAll('.tp-prj, .tp-prj *')) {
        const r = el.getBoundingClientRect();
        const box = el.closest('.kit-desk')!.getBoundingClientRect();
        if (r.width && r.right > box.right + 1) past.push(el.className.toString());
      }
      return past;
    });
    expect(over).toEqual([]);
  });
});
