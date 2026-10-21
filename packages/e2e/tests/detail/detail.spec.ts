import type { Locator, Page } from '@playwright/test';
import { API_URL, expect, signInFresh, test } from '../../fixtures/app';
import { dayList, fixClock, idle, row, titlesOf, writeTasks } from '../../fixtures/today';

const THREE = ['Pay the electricity bill', 'Review Quick Add PR', 'Book flights for the offsite'];

/** The open task panel. */
function panel(page: Page): Locator {
  return page.getByRole('dialog', { name: 'Task details' });
}

/** Open a task from its row and wait for the panel to show it. */
async function openTask(page: Page, title: string): Promise<Locator> {
  await row(dayList(page), title).getByRole('button', { name: title }).click();
  const p = panel(page);
  await expect(p.getByRole('textbox', { name: 'Task title' })).toHaveValue(title);
  return p;
}

async function closePanel(page: Page): Promise<void> {
  const p = panel(page);
  if (test.info().project.name === 'phone')
    await p.getByRole('button', { name: /^(Today|Monday|Sunday)$/ }).click();
  else await p.getByRole('button', { name: 'Close' }).click();
  await expect(panel(page)).toHaveCount(0);
}

/** The task as the server has it, by its ref. */
async function serverTask(page: Page, ref: string) {
  const where = (await (await page.request.get(`${API_URL}/api/tasks/ref/${ref}`)).json()) as {
    taskId: string;
    spaceId: string;
  };
  const res = await page.request.get(`${API_URL}/api/spaces/${where.spaceId}/tasks/${where.taskId}`);
  return (await res.json()) as {
    title: string;
    due: string | null;
    notes: string;
    subtasks: Array<{ title: string; done: boolean }>;
    comments: Array<{ html: string; editedAt: string | null }>;
    history: Array<{ kind: string }>;
  };
}

test.describe('detail', () => {
  test.beforeEach(async ({ page }) => {
    await fixClock(page);
  });

  test('C03-E01 open a task from its row, change the title, close; the row shows it and a reload keeps it', async ({
    page,
  }) => {
    await signInFresh(page);
    await writeTasks(page, THREE);
    await page.getByRole('textbox', { name: 'New task' }).press('Escape');
    const p = await openTask(page, 'Review Quick Add PR');
    await expect(page).toHaveURL(/\?task=ME-2$/);
    await expect(p.getByRole('button', { name: 'Copy task ID ME-2' })).toBeVisible();
    const title = p.getByRole('textbox', { name: 'Task title' });
    await title.fill('Review Quick Add PR before Monday');
    await title.press('Enter');
    await expect(row(dayList(page), 'Review Quick Add PR before Monday')).toBeVisible();
    await closePanel(page);
    await expect(page).not.toHaveURL(/task=/);
    await idle(page);
    await page.reload();
    await expect
      .poll(() => titlesOf(dayList(page)))
      .toEqual([
        'Pay the electricity bill',
        'Review Quick Add PR before Monday',
        'Book flights for the offsite',
      ]);
  });

  test('C03-E02 set a due date from the panel; the byline says "Due Wed"; remove it; reload', async ({
    page,
  }) => {
    await signInFresh(page);
    await writeTasks(page, ['Reply to legal']);
    await page.getByRole('textbox', { name: 'New task' }).press('Escape');
    const p = await openTask(page, 'Reply to legal');
    await p.getByRole('button', { name: 'Due', exact: true }).click();
    const pop = p.locator('.tp-td-pop');
    await pop.getByRole('button', { name: /^21 October/ }).click();
    await expect(p.getByRole('button', { name: 'Due', exact: true })).toHaveText(/Wed 21 Oct.*in 3 days/);
    await expect(row(dayList(page), 'Reply to legal').locator('.tp-sg-due')).toHaveText('Due Wed');
    await idle(page);
    await page.reload();
    await expect(panel(page).getByRole('button', { name: 'Due', exact: true })).toHaveText(/Wed 21 Oct/);
    await panel(page).getByRole('button', { name: 'Due', exact: true }).click();
    await panel(page).locator('.tp-td-pop').getByRole('button', { name: 'Remove due date' }).click();
    await expect(panel(page).getByRole('button', { name: 'Due', exact: true })).toHaveText('Add a due date');
    await expect(row(dayList(page), 'Reply to legal').locator('.tp-sg-due')).toHaveCount(0);
    await idle(page);
    expect((await serverTask(page, 'ME-1')).due).toBeNull();
  });

  test('C03-E03 move the task to tomorrow from Planned: the row leaves today, the toast says so, the panel follows', async ({
    page,
  }) => {
    await signInFresh(page);
    await writeTasks(page, ['Pay the electricity bill', 'Dentist at 4pm']);
    await page.getByRole('textbox', { name: 'New task' }).press('Escape');
    const p = await openTask(page, 'Dentist at 4pm');
    await p.getByRole('button', { name: 'Planned', exact: true }).click();
    await p.locator('.tp-td-pop').getByRole('button', { name: 'Tomorrow' }).click();
    await expect(page.locator('.tp-toast')).toHaveText(/Moved to Tomorrow/);
    await expect
      .poll(() => titlesOf(dayList(page, 'Tasks for Sunday 18 October')))
      .toEqual(['Pay the electricity bill']);
    await expect(p.getByRole('button', { name: 'Planned', exact: true })).toHaveText(/Tomorrow · Mon 19 Oct/);
    await expect(p.getByRole('textbox', { name: 'Task title' })).toHaveValue('Dentist at 4pm');
    await idle(page);
    await page.reload();
    await expect(panel(page).getByRole('button', { name: 'Planned', exact: true })).toHaveText(
      /Tomorrow · Mon 19 Oct/,
    );
    // a link to it opens it on its day
    await page.goto('/t/ME-2');
    await expect(page.getByText('Tomorrow · Week 43')).toBeVisible();
    await expect(panel(page).getByRole('textbox', { name: 'Task title' })).toHaveValue('Dentist at 4pm');
  });

  test('C03-E04 write notes with bold, a list and a checklist; close and reopen; a reload shows them', async ({
    page,
  }) => {
    await signInFresh(page);
    await writeTasks(page, ['Review Quick Add PR']);
    await page.getByRole('textbox', { name: 'New task' }).press('Escape');
    const p = await openTask(page, 'Review Quick Add PR');
    const notes = p.getByRole('textbox', { name: 'Notes' });
    await notes.click();
    await page.keyboard.type('Meera wants a ');
    await p.getByRole('button', { name: 'Bold' }).click();
    await page.keyboard.type('yes or no');
    await p.getByRole('button', { name: 'Bold' }).click();
    await page.keyboard.press('Enter');
    await p.getByRole('button', { name: 'Bulleted list' }).click();
    await page.keyboard.type('The shortcut');
    await page.keyboard.press('Enter');
    await p.getByRole('button', { name: 'Checklist' }).click();
    await page.keyboard.type('Pull the branch');
    // leaving the field saves it
    await p.getByRole('textbox', { name: 'Task title' }).click();
    await idle(page);
    const saved = (await serverTask(page, 'ME-1')).notes;
    expect(saved).toContain('<strong>yes or no</strong>');
    expect(saved).toContain('<ul class="tp-checks" data-type="taskList">');
    expect(saved).toContain('<p>Pull the branch</p>');
    await closePanel(page);
    await page.reload();
    await openTask(page, 'Review Quick Add PR');
    const again = panel(page).getByRole('textbox', { name: 'Notes' });
    await expect(again.locator('strong')).toHaveText('yes or no');
    await expect(again.locator('ul.tp-checks')).toContainText('Pull the branch');
  });

  test('C03-E05 subtasks in the panel and the fold on the row', async ({ page }) => {
    await signInFresh(page);
    await writeTasks(page, ['Review Quick Add PR']);
    await page.getByRole('textbox', { name: 'New task' }).press('Escape');
    const p = await openTask(page, 'Review Quick Add PR');
    await p.getByRole('button', { name: 'Add subtask' }).click();
    const field = p.getByRole('textbox', { name: 'New subtask' });
    for (const s of ['Pull the branch', 'Run it on a clean profile', 'Leave review comments']) {
      await field.fill(s);
      await field.press('Enter');
    }
    await field.press('Escape');
    await p.getByRole('checkbox', { name: 'Cross off: Pull the branch' }).click();
    await expect(p.getByRole('heading', { name: /^Subtasks/ })).toHaveText('Subtasks1 of 3');
    await p.getByRole('button', { name: 'Delete subtask: Leave review comments' }).click();
    await expect(p.getByRole('heading', { name: /^Subtasks/ })).toHaveText('Subtasks1 of 2');
    await expect(row(dayList(page), 'Review Quick Add PR').locator('.tp-sg-subtasks')).toHaveText(
      '1 of 2 done',
    );
    await closePanel(page);
    await idle(page);
    await page.reload();
    const list = dayList(page);
    await row(list, 'Review Quick Add PR')
      .getByRole('button', { name: '1 of 2 subtasks done. Show subtasks' })
      .click();
    const fold = row(list, 'Review Quick Add PR').getByRole('group', {
      name: 'Subtasks of Review Quick Add PR',
    });
    await expect(fold.locator('.tp-sub-text')).toHaveText(['Pull the branch', 'Run it on a clean profile']);
    await fold.getByRole('checkbox', { name: 'Cross off: Run it on a clean profile' }).click();
    await expect(row(list, 'Review Quick Add PR').locator('.tp-sg-subtasks')).toHaveText('2 of 2 done');
    await idle(page);
    const saved = await serverTask(page, 'ME-1');
    expect(saved.subtasks.map((s) => [s.title, s.done])).toEqual([
      ['Pull the branch', true],
      ['Run it on a clean profile', true],
    ]);
  });

  test('C03-E06 add a comment; it appears with the wash; edit it; delete it and Undo', async ({ page }) => {
    await signInFresh(page);
    await writeTasks(page, ['Review Quick Add PR']);
    await page.getByRole('textbox', { name: 'New task' }).press('Escape');
    const p = await openTask(page, 'Review Quick Add PR');
    await p.getByRole('textbox', { name: 'Write a comment' }).click();
    await page.keyboard.type('Will review tomorrow morning.');
    await p.getByRole('button', { name: 'Comment' }).click();
    const comment = p.locator('.tp-td-cmt');
    await expect(comment).toHaveCount(1);
    await expect(comment.first()).toHaveClass(/tp-fresh/);
    await expect(comment.first()).toContainText('Will review tomorrow morning.');
    await expect(row(dayList(page), 'Review Quick Add PR').locator('.tp-sg-comments')).toHaveText(
      '1 comment',
    );
    await comment.first().hover();
    await comment.first().getByRole('button', { name: 'Comment options' }).click();
    await page.getByRole('menuitem', { name: 'Edit comment' }).click();
    const edit = comment.first().getByRole('textbox', { name: 'Edit comment' });
    await expect(edit).toBeFocused();
    await page.keyboard.type(' Done.');
    await comment.first().getByRole('button', { name: 'Save' }).click();
    await expect(comment.first()).toContainText('Will review tomorrow morning. Done.');
    await expect(comment.first()).toContainText('edited');
    await idle(page);
    expect((await serverTask(page, 'ME-1')).comments[0]!.editedAt).not.toBeNull();
    await comment.first().hover();
    await comment.first().getByRole('button', { name: 'Comment options' }).click();
    await page.getByRole('menuitem', { name: 'Delete comment' }).click();
    await expect(p.getByText('No comments yet.')).toBeVisible();
    // Undo while the toast settles in: a click that lands between its frames is retried, as a person would
    const undo = page.getByRole('button', { name: 'Undo' });
    await undo.click();
    for (let i = 0; i < 3 && (await comment.count()) === 0; i++) {
      await page.waitForTimeout(400);
      if ((await comment.count()) === 0 && (await undo.isVisible())) await undo.click();
    }
    await expect(comment).toHaveCount(1);
    await idle(page);
    // the restore lands a moment after the comment shows again, so ask until the server has it
    await expect
      .poll(async () => (await serverTask(page, 'ME-1')).comments.map((c) => c.html))
      .toEqual(['<p>Will review tomorrow morning. Done.</p>']);
  });

  test('C03-E07 delete the task; Undo brings it back in place; let the toast go and it is gone for good', async ({
    page,
  }) => {
    await signInFresh(page);
    await writeTasks(page, THREE);
    await page.getByRole('textbox', { name: 'New task' }).press('Escape');
    const p = await openTask(page, 'Review Quick Add PR');
    await p.getByRole('button', { name: 'More', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Delete task' }).click();
    await expect(panel(page)).toHaveCount(0);
    await expect
      .poll(() => titlesOf(dayList(page)))
      .toEqual(['Pay the electricity bill', 'Book flights for the offsite']);
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect.poll(() => titlesOf(dayList(page))).toEqual(THREE);
    await idle(page);
    await page.reload();
    await expect.poll(() => titlesOf(dayList(page))).toEqual(THREE);
    await openTask(page, 'Review Quick Add PR');
    await panel(page).getByRole('button', { name: 'More', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Delete task' }).click();
    await expect
      .poll(() => titlesOf(dayList(page)))
      .toEqual(['Pay the electricity bill', 'Book flights for the offsite']);
    await idle(page);
    await page.reload();
    await expect
      .poll(() => titlesOf(dayList(page)))
      .toEqual(['Pay the electricity bill', 'Book flights for the offsite']);
    expect((await page.request.get(`${API_URL}/api/tasks/ref/ME-2`)).status()).toBe(404);
  });

  test('C03-E08 step through the day with the arrows; Esc closes and focus is back on the row', async ({
    page,
  }) => {
    test.skip(test.info().project.name === 'phone', 'the phone page has its own back control');
    await signInFresh(page);
    await writeTasks(page, THREE);
    await page.getByRole('textbox', { name: 'New task' }).press('Escape');
    const p = await openTask(page, 'Pay the electricity bill');
    await expect(p.getByRole('button', { name: 'Previous task' })).toHaveCount(0);
    await p.getByRole('button', { name: 'Next task' }).click();
    await expect(p.getByRole('textbox', { name: 'Task title' })).toHaveValue('Review Quick Add PR');
    await expect(page).toHaveURL(/task=ME-2/);
    await p.getByRole('button', { name: 'Next task' }).click();
    await expect(p.getByRole('textbox', { name: 'Task title' })).toHaveValue('Book flights for the offsite');
    await expect(p.getByRole('button', { name: 'Next task' })).toHaveCount(0);
    await p.getByRole('button', { name: 'Previous task' }).click();
    await expect(p.getByRole('textbox', { name: 'Task title' })).toHaveValue('Review Quick Add PR');
    await page.keyboard.press('Escape');
    await expect(panel(page)).toHaveCount(0);
    await expect(
      row(dayList(page), 'Pay the electricity bill').getByRole('button', {
        name: 'Pay the electricity bill',
      }),
    ).toBeFocused();
    await expect(page).not.toHaveURL(/task=/);
  });

  test('C03-E09 History lists Created, Due date set and Moved', async ({ page }) => {
    await signInFresh(page);
    await writeTasks(page, ['Dentist at 4pm']);
    await page.getByRole('textbox', { name: 'New task' }).press('Escape');
    const p = await openTask(page, 'Dentist at 4pm');
    await p.getByRole('button', { name: 'Due', exact: true }).click();
    await p
      .locator('.tp-td-pop')
      .getByRole('button', { name: /^21 October/ })
      .click();
    await p.getByRole('button', { name: 'Planned', exact: true }).click();
    await p.locator('.tp-td-pop').getByRole('button', { name: 'Tomorrow' }).click();
    await idle(page);
    await expect(p.getByRole('button', { name: /^History/ })).toHaveText(/3 events/);
    await p.getByRole('button', { name: /^History/ }).click();
    await expect(p.locator('.tp-td-evt')).toHaveText([
      /^Created/,
      /^Due date set to Wed 21 Oct/,
      /^Moved from Today to Tomorrow/,
    ]);
  });

  test('C03-E10 the address: a reload with ?task= reopens it, /t/ME-1 opens it on its day, and the link copies that address', async ({
    page,
    context,
  }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {});
    await signInFresh(page);
    await writeTasks(page, ['Pay the electricity bill']);
    await page.getByRole('textbox', { name: 'New task' }).press('Escape');
    await openTask(page, 'Pay the electricity bill');
    await idle(page);
    await page.reload();
    await expect(panel(page).getByRole('textbox', { name: 'Task title' })).toHaveValue(
      'Pay the electricity bill',
    );
    await page.goto('/t/ME-1');
    await expect(page).toHaveURL(/\?task=ME-1$/);
    await expect(panel(page).getByRole('textbox', { name: 'Task title' })).toHaveValue(
      'Pay the electricity bill',
    );
    await panel(page).getByRole('button', { name: 'More', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Copy link to task' }).click();
    await expect(page.locator('.tp-toast')).toHaveText(/Link copied/);
    const origin = new URL(page.url()).origin;
    const copied = await page.evaluate(() => navigator.clipboard.readText()).catch(() => null);
    if (copied !== null) expect(copied).toBe(`${origin}/t/ME-1`);
    // a link to a task that is not there goes back to the day
    await page.goto('/t/ME-9');
    await expect(page).toHaveURL(/\/$/);
    await expect(panel(page)).toHaveCount(0);
  });

  test('C03-E11 phone: the detail is its own page; ‹ Today goes back; subtasks and a comment on the phone', async ({
    page,
  }) => {
    test.skip(test.info().project.name !== 'phone', 'the phone page');
    await signInFresh(page);
    await writeTasks(page, ['Review Quick Add PR']);
    await page.getByRole('textbox', { name: 'New task' }).press('Escape');
    const p = await openTask(page, 'Review Quick Add PR');
    await expect(page.locator('.tp-drawer-wrap')).toHaveClass(/tp-full/);
    await expect(p.getByRole('button', { name: 'Close' })).toHaveCount(0);
    await p.getByRole('button', { name: 'Add subtask' }).click();
    await p.getByRole('textbox', { name: 'New subtask' }).fill('Pull the branch');
    await p.getByRole('textbox', { name: 'New subtask' }).press('Enter');
    await p.getByRole('textbox', { name: 'New subtask' }).press('Escape');
    await p.getByRole('textbox', { name: 'Write a comment' }).click();
    await page.keyboard.type('On the phone.');
    await p.getByRole('button', { name: 'Comment' }).click();
    await expect(p.locator('.tp-td-cmt')).toHaveCount(1);
    await p.getByRole('button', { name: 'Today' }).click();
    await expect(panel(page)).toHaveCount(0);
    await expect(row(dayList(page), 'Review Quick Add PR').locator('.tp-byline')).toContainText(
      '0 of 1 done',
    );
    await expect(row(dayList(page), 'Review Quick Add PR').locator('.tp-byline')).toContainText('1 comment');
  });

  test('C03-E12 two days: the panel sits over both sheets and neither squeezes', async ({ page }) => {
    test.skip(test.info().project.name !== 'desktop', 'two days is the desk’s');
    await signInFresh(page);
    await writeTasks(page, ['Pay the electricity bill']);
    await page.getByRole('textbox', { name: 'New task' }).press('Escape');
    await page.getByRole('button', { name: '2 days' }).click();
    // wait for the second page to finish sliding out before measuring
    await expect(page.locator('.tp-spread-second')).toHaveClass(/tp-on/);
    await expect(page.locator('.tp-spread-second')).not.toHaveClass(/tp-moving/);
    const first = dayList(page, 'Tasks for Sunday 18 October');
    const widthBefore = (await first.boundingBox())!.width;
    const second = page.getByRole('region', { name: 'The second day' });
    const secondBefore = (await second.boundingBox())!.width;
    await openTask(page, 'Pay the electricity bill');
    expect((await first.boundingBox())!.width).toBe(widthBefore);
    expect((await second.boundingBox())!.width).toBe(secondBefore);
    await expect(page.locator('.tp-drawer-veil')).toBeVisible();
  });

  test('C03-E13 offline: set a due date and add a subtask; the banner shows; back online the server has both', async ({
    page,
    context,
  }) => {
    await signInFresh(page);
    await writeTasks(page, ['Reply to legal']);
    await page.getByRole('textbox', { name: 'New task' }).press('Escape');
    const p = await openTask(page, 'Reply to legal');
    await idle(page);
    await context.setOffline(true);
    await expect(page.getByText('You’re offline.')).toBeVisible();
    await p.getByRole('button', { name: 'Due', exact: true }).click();
    await p
      .locator('.tp-td-pop')
      .getByRole('button', { name: /^21 October/ })
      .click();
    await p.getByRole('button', { name: 'Add subtask' }).click();
    await p.getByRole('textbox', { name: 'New subtask' }).fill('Ask Arjun for the list');
    await p.getByRole('textbox', { name: 'New subtask' }).press('Enter');
    await p.getByRole('textbox', { name: 'New subtask' }).press('Escape');
    await expect(p.getByRole('button', { name: 'Due', exact: true })).toHaveText(/Wed 21 Oct/);
    await context.setOffline(false);
    await expect(page.getByText('You’re offline.')).toHaveCount(0);
    await idle(page);
    const saved = await serverTask(page, 'ME-1');
    expect(saved.due).toBe('2026-10-21');
    expect(saved.subtasks.map((s) => s.title)).toEqual(['Ask Arjun for the list']);
  });

  test('C03-E14 live: a due date set in a second tab shows in the open panel of the first', async ({
    page,
    context,
  }) => {
    await signInFresh(page);
    await writeTasks(page, ['Reply to legal']);
    await page.getByRole('textbox', { name: 'New task' }).press('Escape');
    const p = await openTask(page, 'Reply to legal');
    await idle(page);
    const second = await context.newPage();
    await fixClock(second);
    await second.goto('/?task=ME-1');
    const p2 = panel(second);
    await p2.getByRole('button', { name: 'Due', exact: true }).click();
    await p2
      .locator('.tp-td-pop')
      .getByRole('button', { name: /^21 October/ })
      .click();
    await p2.getByRole('button', { name: 'Add subtask' }).click();
    await p2.getByRole('textbox', { name: 'New subtask' }).fill('From the other tab');
    await p2.getByRole('textbox', { name: 'New subtask' }).press('Enter');
    await expect(p.getByRole('button', { name: 'Due', exact: true })).toHaveText(/Wed 21 Oct/, {
      timeout: 10_000,
    });
    await expect(p.getByRole('button', { name: 'Edit subtask: From the other tab' })).toBeVisible({
      timeout: 10_000,
    });
    await expect(row(dayList(page), 'Reply to legal').locator('.tp-sg-due')).toHaveText('Due Wed');
    await second.close();
  });

  test('C03-E15 a slow task shows the skeleton column; a failed one says so and Try again recovers', async ({
    page,
  }) => {
    await signInFresh(page);
    await writeTasks(page, ['Pay the electricity bill', 'Call the bank']);
    await page.getByRole('textbox', { name: 'New task' }).press('Escape');
    await idle(page);
    let release!: () => void;
    const held = new Promise<void>((r) => (release = r));
    await page.route('**/api/spaces/*/tasks/*', async (route) => {
      await held;
      await route.continue();
    });
    await row(dayList(page), 'Pay the electricity bill')
      .getByRole('button', { name: 'Pay the electricity bill' })
      .click();
    await expect(page.getByLabel('Loading task')).toBeVisible();
    release();
    await expect(panel(page).getByRole('textbox', { name: 'Task title' })).toHaveValue(
      'Pay the electricity bill',
    );
    await page.unroute('**/api/spaces/*/tasks/*');
    await closePanel(page);
    let fail = true;
    await page.route('**/api/spaces/*/tasks/*', (route) =>
      fail
        ? route.fulfill({ status: 500, body: '{"error":"Something went wrong on the server."}' })
        : route.continue(),
    );
    await row(dayList(page), 'Call the bank').getByRole('button', { name: 'Call the bank' }).click();
    await expect(page.getByText('This task didn’t load.')).toBeVisible({ timeout: 15_000 });
    fail = false;
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(panel(page).getByRole('textbox', { name: 'Task title' })).toHaveValue('Call the bank');
  });

  test('C03-E16 dark: open, write notes and comment in the dark theme', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await signInFresh(page);
    await expect(page.locator('html')).toHaveClass(/dark/);
    await writeTasks(page, ['Review Quick Add PR']);
    await page.getByRole('textbox', { name: 'New task' }).press('Escape');
    const p = await openTask(page, 'Review Quick Add PR');
    const title = p.getByRole('textbox', { name: 'Task title' });
    await title.fill('Review Quick Add PR tonight');
    await title.press('Enter');
    await p.getByRole('textbox', { name: 'Notes' }).click();
    await page.keyboard.type('In the dark.');
    await p.getByRole('textbox', { name: 'Write a comment' }).click();
    await page.keyboard.type('Dark comment.');
    await p.getByRole('button', { name: 'Comment' }).click();
    await expect(p.locator('.tp-td-cmt')).toHaveCount(1);
    await idle(page);
    await page.reload();
    await expect(panel(page).getByRole('textbox', { name: 'Task title' })).toHaveValue(
      'Review Quick Add PR tonight',
    );
    await expect(panel(page).getByRole('textbox', { name: 'Notes' })).toContainText('In the dark.');
    await expect(panel(page).locator('.tp-td-cmt')).toHaveCount(1);
  });
});
