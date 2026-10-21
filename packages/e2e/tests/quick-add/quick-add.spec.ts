import type { Locator, Page } from '@playwright/test';
import { API_URL, expect, signInFresh, test } from '../../fixtures/app';
import { dayList, fixClock, idle, row, titlesOf, writeTasks } from '../../fixtures/today';

/** The bar (or the sheet on phones). */
function bar(page: Page): Locator {
  return page.getByRole('dialog', { name: 'Quick Add' });
}

/** Open Quick Add from New task (the round button on phones) and wait for the line. */
async function openBar(page: Page): Promise<Locator> {
  await page.getByRole('button', { name: 'New task' }).first().click();
  const b = bar(page);
  await expect(b.getByRole('textbox', { name: 'Task title' })).toBeFocused();
  return b;
}

const addButton = (b: Locator) => b.getByRole('button', { name: /^Add( task)?$/ });
const foot = (b: Locator) => b.locator('.tp-qa-lands');

/** Add one task through the bar and wait for the bar to leave. */
async function quickAdd(page: Page, title: string, more?: (b: Locator) => Promise<void>): Promise<void> {
  const b = await openBar(page);
  await b.getByRole('textbox', { name: 'Task title' }).fill(title);
  if (more) await more(b);
  await addButton(b).click();
  await expect(bar(page)).toHaveCount(0, { timeout: 5000 });
}

async function serverTask(page: Page, ref: string) {
  const where = (await (await page.request.get(`${API_URL}/api/tasks/ref/${ref}`)).json()) as {
    taskId: string;
    spaceId: string;
    day: string | null;
  };
  const res = await page.request.get(`${API_URL}/api/spaces/${where.spaceId}/tasks/${where.taskId}`);
  return (await res.json()) as {
    title: string;
    day: string | null;
    due: string | null;
    projectId: string | null;
    notes: string;
    history: Array<{ kind: string; source?: string }>;
  };
}

test.describe('quick-add', () => {
  test.beforeEach(async ({ page }) => {
    await fixClock(page);
  });

  test('C04-E01 New task opens the bar over the day; Add task puts the row on today with the wash; a reload shows it', async ({
    page,
  }) => {
    await signInFresh(page);
    await writeTasks(page, ['Pay the electricity bill']);
    await page.getByRole('textbox', { name: 'New task' }).press('Escape');
    const b = await openBar(page);
    if (test.info().project.name !== 'phone') {
      await expect(page.locator('.tp-qa-veil')).toBeVisible();
      await expect(foot(b)).toHaveText('Lands on Today');
    }
    await b.getByRole('textbox', { name: 'Task title' }).fill('Book the meeting room');
    await addButton(b).click();
    if (test.info().project.name !== 'phone') await expect(foot(b)).toHaveText('Added to Today');
    await expect(bar(page)).toHaveCount(0, { timeout: 5000 });
    const list = dayList(page);
    await expect.poll(() => titlesOf(list)).toEqual(['Pay the electricity bill', 'Book the meeting room']);
    await expect(row(list, 'Book the meeting room')).toHaveClass(/tp-new/);
    await idle(page);
    await page.reload();
    await expect
      .poll(() => titlesOf(dayList(page)))
      .toEqual(['Pay the electricity bill', 'Book the meeting room']);
    expect((await serverTask(page, 'ME-2')).history[0]).toMatchObject({
      kind: 'created',
      source: 'quick-add',
    });
  });

  test('C04-E02 Planned Tomorrow: "Added to Tomorrow" with Show; Show turns the sheet and washes the row', async ({
    page,
  }) => {
    await signInFresh(page);
    await quickAdd(page, 'Meera’s demo', async (b) => {
      await b.getByRole('button', { name: 'Planned for: Today' }).click();
      await b.locator('.tp-qa-pop').getByRole('button', { name: 'Tomorrow' }).click();
      if (test.info().project.name !== 'phone') await expect(foot(b)).toHaveText('Lands on Tomorrow');
    });
    await expect(page.locator('.tp-toast')).toHaveText('Added to TomorrowShow');
    await expect(page.getByText('Nothing planned for today yet.')).toBeVisible();
    await page.getByRole('button', { name: 'Show', exact: true }).click();
    await expect(page.getByText('Tomorrow · Week 43')).toBeVisible();
    const list = dayList(page, 'Tasks for Monday 19 October');
    await expect.poll(() => titlesOf(list)).toEqual(['Meera’s demo']);
    await expect(row(list, 'Meera’s demo')).toHaveClass(/tp-new/);
  });

  test('C04-E03 Planned Backlog: "Added to Backlog" with Show; today stays empty; the server has it without a day', async ({
    page,
  }) => {
    await signInFresh(page);
    await quickAdd(page, 'Renew the domain before it lapses', async (b) => {
      await b.getByRole('button', { name: 'Planned for: Today' }).click();
      await b.locator('.tp-qa-pop').getByRole('button', { name: 'Backlog' }).click();
      if (test.info().project.name !== 'phone') await expect(foot(b)).toHaveText('Lands in Backlog');
    });
    // since chunk 06 the toast offers Show, which opens the Backlog on the row
    await expect(page.locator('.tp-toast')).toHaveText('Added to BacklogShow');
    await expect(page.getByText('Nothing planned for today yet.')).toBeVisible();
    await idle(page);
    expect((await serverTask(page, 'ME-1')).day).toBeNull();
    await page.getByRole('button', { name: 'Show', exact: true }).click();
    await expect(page).toHaveURL(/\/backlog$/);
    await expect(page.getByRole('list', { name: 'Tasks in the Backlog' })).toContainText(
      'Renew the domain before it lapses',
    );
  });

  test('C04-E04 Due and Project: the foot reads them; the row says "Due Thu" and the project; the panel shows the Project fact', async ({
    page,
  }) => {
    await signInFresh(page);
    await quickAdd(page, 'Review Arjun’s design', async (b) => {
      await b.getByRole('button', { name: 'Add a due date' }).click();
      await b
        .locator('.tp-qa-pop')
        .getByRole('button', { name: /^22 October/ })
        .click();
      await b.getByRole('button', { name: 'Choose a project' }).click();
      await b.locator('.tp-qa-pop').getByRole('menuitem', { name: 'New project…' }).click();
      await b.getByRole('textbox', { name: 'Project name' }).fill('Platform');
      await b.getByRole('textbox', { name: 'Project name' }).press('Enter');
      await expect(b.getByRole('button', { name: 'Project: Platform' })).toBeVisible();
      if (test.info().project.name !== 'phone')
        await expect(foot(b)).toHaveText('Lands on Today · Platform · due Thu 22 Oct');
    });
    const r = row(dayList(page), 'Review Arjun’s design');
    await expect(r.locator('.tp-sg-due')).toHaveText('Due Thu');
    await expect(r.locator('.tp-sg-project')).toHaveText('Platform');
    await r.getByRole('button', { name: 'Review Arjun’s design' }).click();
    const panel = page.getByRole('dialog', { name: 'Task details' });
    await expect(panel.getByRole('button', { name: 'Project', exact: true })).toHaveText('Platform');
    await expect(panel.getByRole('button', { name: 'Due', exact: true })).toHaveText(/Thu 22 Oct/);
    await idle(page);
    const saved = await serverTask(page, 'ME-1');
    expect(saved.due).toBe('2026-10-22');
    expect(saved.projectId).not.toBeNull();
  });

  test('C04-E05 a new project from the chip is in the picker next time, on the row and in the panel', async ({
    page,
  }) => {
    await signInFresh(page);
    await quickAdd(page, 'First', async (b) => {
      await b.getByRole('button', { name: 'Choose a project' }).click();
      await b.locator('.tp-qa-pop').getByRole('menuitem', { name: 'New project…' }).click();
      await b.getByRole('textbox', { name: 'Project name' }).fill('Home');
      await b.getByRole('textbox', { name: 'Project name' }).press('Enter');
    });
    await idle(page);
    await page.reload();
    const b = await openBar(page);
    await b.getByRole('textbox', { name: 'Task title' }).fill('Second');
    await b.getByRole('button', { name: 'Choose a project' }).click();
    const items = b.locator('.tp-qa-pop').getByRole('menuitem');
    await expect(items).toHaveText(['Home', 'New project…']);
    await items.first().click();
    await addButton(b).click();
    await expect(bar(page)).toHaveCount(0, { timeout: 5000 });
    await expect(row(dayList(page), 'Second').locator('.tp-sg-project')).toHaveText('Home');
    await row(dayList(page), 'First').getByRole('button', { name: 'First' }).click();
    const panel = page.getByRole('dialog', { name: 'Task details' });
    await expect(panel.getByRole('button', { name: 'Project', exact: true })).toHaveText('Home');
  });

  test('C04-E06 a note becomes the task’s notes; a file attached shows as a chip in the notes and opens', async ({
    page,
  }) => {
    await signInFresh(page);
    await quickAdd(page, 'Send the offsite agenda', async (b) => {
      await b.getByRole('button', { name: 'Add a note' }).click();
      await b.getByRole('textbox', { name: 'Note' }).fill('Keep it to one page.');
      await b.locator('input[type=file]').setInputFiles({
        name: 'offsite-agenda-v3.pdf',
        mimeType: 'application/pdf',
        buffer: Buffer.alloc(248_000, 1),
      });
      await expect(b.locator('.tp-qa-file')).toHaveText(['offsite-agenda-v3.pdf242 KB']);
      await expect(b.locator('.tp-qa-file')).not.toHaveClass(/tp-qa-file-up/);
      if (test.info().project.name !== 'phone')
        await expect(foot(b)).toHaveText('Lands on Today · note · 1 file');
    });
    await idle(page);
    const saved = await serverTask(page, 'ME-1');
    expect(saved.notes).toContain('<p>Keep it to one page.</p>');
    expect(saved.notes).toContain('class="tp-att"');
    await row(dayList(page), 'Send the offsite agenda')
      .getByRole('button', { name: 'Send the offsite agenda' })
      .click();
    const notes = page.getByRole('dialog', { name: 'Task details' }).getByRole('textbox', { name: 'Notes' });
    await expect(notes).toContainText('Keep it to one page.');
    const chip = notes.locator('a.tp-att');
    await expect(chip).toContainText('offsite-agenda-v3.pdf');
    const href = (await chip.getAttribute('href'))!;
    expect(href).toMatch(/\/api\/files\//);
    const file = await page.request.get(href);
    expect(file.status()).toBe(200);
    expect(file.headers()['content-type']).toBe('application/pdf');
  });

  test('C04-E07 drop a file on the bar: the outline, the chip, the upload; a 30 MB file is refused with a plain message', async ({
    page,
  }) => {
    test.skip(test.info().project.name === 'phone', 'dropping is a pointer thing');
    await signInFresh(page);
    const b = await openBar(page);
    await b.getByRole('textbox', { name: 'Task title' }).fill('Expense the team lunch');
    // a drag with files over the bar
    const dt = await page.evaluateHandle(() => {
      const d = new DataTransfer();
      d.items.add(new File([new Uint8Array(1_260_000)], 'venue-map.png', { type: 'image/png' }));
      return d;
    });
    await b.dispatchEvent('dragenter', { dataTransfer: dt });
    await expect(b).toHaveClass(/tp-qa-dropping/);
    await expect(b.getByText('Drop to attach')).toBeVisible();
    await b.dispatchEvent('drop', { dataTransfer: dt });
    await expect(b).not.toHaveClass(/tp-qa-dropping/);
    await expect(b.locator('.tp-qa-file')).toHaveText(['venue-map.png1.2 MB']);
    await expect(b.locator('.tp-qa-file')).not.toHaveClass(/tp-qa-file-up/, { timeout: 10_000 });
    // too big
    await b.locator('input[type=file]').setInputFiles({
      name: 'big.bin',
      mimeType: 'application/octet-stream',
      buffer: Buffer.alloc(30 * 1024 * 1024),
    });
    await expect(page.locator('.tp-toast')).toHaveText('That file is too big. Files can be up to 25 MB.', {
      timeout: 15_000,
    });
    await expect(b.locator('.tp-qa-file').nth(1)).toHaveText(/failed/);
    await b.getByRole('button', { name: 'Remove big.bin' }).click();
    await addButton(b).click();
    await expect(bar(page)).toHaveCount(0, { timeout: 5000 });
    await idle(page);
    expect((await serverTask(page, 'ME-1')).notes).toContain('venue-map.png');
  });

  test('C04-E08 Esc keeps the draft; reopening shows it; × and the veil close it too', async ({ page }) => {
    await signInFresh(page);
    let b = await openBar(page);
    await b.getByRole('textbox', { name: 'Task title' }).fill('Renew the domain');
    await page.keyboard.press('Escape');
    await expect(bar(page)).toHaveCount(0);
    b = await openBar(page);
    await expect(b.getByRole('textbox', { name: 'Task title' })).toHaveValue('Renew the domain');
    if (test.info().project.name !== 'phone') {
      await b.getByRole('button', { name: 'Close' }).click();
      await expect(bar(page)).toHaveCount(0);
      await openBar(page);
      await page.locator('.tp-qa-veil').click({ position: { x: 10, y: 10 } });
      await expect(bar(page)).toHaveCount(0);
    }
    await expect(page.getByText('Nothing planned for today yet.')).toBeVisible();
  });

  test('C04-E09 Enter adds; a failed save says the draft is still here; adding again works', async ({
    page,
  }) => {
    await signInFresh(page);
    let fail = true;
    await page.route('**/api/sync', (route) =>
      fail
        ? route.fulfill({ status: 500, body: '{"error":"Something went wrong on the server."}' })
        : route.continue(),
    );
    const b = await openBar(page);
    await b.getByRole('textbox', { name: 'Task title' }).fill('Book the meeting room');
    await b.getByRole('textbox', { name: 'Task title' }).press('Enter');
    // the task is local-first: it shows at once and the bar confirms; the save keeps retrying from the outbox
    await expect(bar(page)).toHaveCount(0, { timeout: 5000 });
    await expect.poll(() => titlesOf(dayList(page))).toEqual(['Book the meeting room']);
    fail = false;
    await idle(page);
    await page.reload();
    await expect.poll(() => titlesOf(dayList(page))).toEqual(['Book the meeting room']);
  });

  test('C04-E10 phone: the round button opens the sheet; add a task; it is on today', async ({ page }) => {
    test.skip(test.info().project.name !== 'phone', 'the sheet is the phone’s');
    await signInFresh(page);
    await page.getByRole('button', { name: 'New task' }).click();
    const b = bar(page);
    await expect(b).toHaveClass(/tp-qa-phone/);
    await expect(page.locator('.tp-qa-layer')).toHaveClass(/tp-qa-layer-sheet/);
    await expect(b.getByRole('button', { name: 'Close' })).toHaveCount(0);
    await b.getByRole('textbox', { name: 'Task title' }).fill('Call the bank');
    await b.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(bar(page)).toHaveCount(0, { timeout: 5000 });
    await expect.poll(() => titlesOf(dayList(page))).toEqual(['Call the bank']);
  });

  test('C04-E11 two days: a task added to the second sheet’s day washes there', async ({ page }) => {
    test.skip(test.info().project.name !== 'desktop', 'two days is the desk’s');
    await signInFresh(page);
    await page.getByRole('group', { name: 'Days to show' }).getByRole('button', { name: '2 days' }).click();
    await expect(page.locator('.tp-spread-second')).toHaveClass(/tp-on/);
    await quickAdd(page, 'On Monday', async (b) => {
      await b.getByRole('button', { name: 'Planned for: Today' }).click();
      await b.locator('.tp-qa-pop').getByRole('button', { name: 'Tomorrow' }).click();
    });
    const monday = dayList(page, 'Tasks for Monday 19 October');
    await expect.poll(() => titlesOf(monday)).toEqual(['On Monday']);
    await expect(row(monday, 'On Monday')).toHaveClass(/tp-new/);
    await expect(page.locator('.tp-toast')).toHaveCount(0);
  });

  test('C04-E12 offline: a task from the bar shows at once and reaches the server when back; the attach button says it needs a connection', async ({
    page,
    context,
  }) => {
    await signInFresh(page);
    await writeTasks(page, ['Written online']);
    await page.getByRole('textbox', { name: 'New task' }).press('Escape');
    await idle(page);
    await context.setOffline(true);
    await expect(page.getByText('You’re offline.')).toBeVisible();
    const b = await openBar(page);
    await b.getByRole('button', { name: 'Attach a file' }).click();
    await expect(page.locator('.tp-toast')).toHaveText('You’re offline. Files need a connection.');
    await b.getByRole('textbox', { name: 'Task title' }).fill('Written offline');
    await addButton(b).click();
    await expect(bar(page)).toHaveCount(0, { timeout: 5000 });
    await expect.poll(() => titlesOf(dayList(page))).toEqual(['Written online', 'Written offline']);
    await context.setOffline(false);
    await idle(page);
    // the outbox replays as soon as the connection is back
    await expect
      .poll(async () => (await page.request.get(`${API_URL}/api/tasks/ref/ME-2`)).status(), {
        timeout: 15_000,
      })
      .toBe(200);
    expect((await serverTask(page, 'ME-2')).title).toBe('Written offline');
  });

  test('C04-E13 /quick-add shows the bar alone; adding from it lands on today in another tab', async ({
    page,
    context,
  }) => {
    await signInFresh(page);
    const floating = await context.newPage();
    await fixClock(floating);
    await floating.goto('/quick-add');
    const b = floating.getByRole('dialog', { name: 'Quick Add' });
    await expect(b).toBeVisible();
    await expect(floating.locator('.tp-qa-veil')).toHaveCount(0);
    await expect(floating.locator('.app-floating')).toBeVisible();
    await b.getByRole('textbox', { name: 'Task title' }).fill('From the floating bar');
    await b.getByRole('button', { name: 'Add task' }).click();
    await expect(floating.locator('.tp-toast')).toHaveText('Added to Today');
    await expect(b.getByRole('textbox', { name: 'Task title' })).toHaveValue('', { timeout: 5000 });
    await expect.poll(() => titlesOf(dayList(page)), { timeout: 10_000 }).toEqual(['From the floating bar']);
    await floating.close();
  });

  test('C04-E14 attach a file from the notes editor in the panel; the chip is there after a reload and opens', async ({
    page,
  }) => {
    await signInFresh(page);
    await writeTasks(page, ['Review Quick Add PR']);
    await page.getByRole('textbox', { name: 'New task' }).press('Escape');
    await row(dayList(page), 'Review Quick Add PR')
      .getByRole('button', { name: 'Review Quick Add PR' })
      .click();
    const panel = page.getByRole('dialog', { name: 'Task details' });
    const notes = panel.getByRole('textbox', { name: 'Notes' });
    await notes.click();
    await page.keyboard.type('Spec: ');
    await panel
      .locator('.tp-rte-notes input[type=file]')
      .setInputFiles({ name: 'quick-add-spec.md', mimeType: 'text/markdown', buffer: Buffer.from('# Spec') });
    await expect(notes.locator('a.tp-att')).toContainText('quick-add-spec.md');
    await panel.getByRole('textbox', { name: 'Task title' }).click();
    await idle(page);
    await page.reload();
    const again = page.getByRole('dialog', { name: 'Task details' }).getByRole('textbox', { name: 'Notes' });
    await expect(again.locator('a.tp-att')).toContainText('quick-add-spec.md');
    const href = (await again.locator('a.tp-att').getAttribute('href'))!;
    const file = await page.request.get(href);
    expect(file.status()).toBe(200);
    expect(await file.text()).toBe('# Spec');
  });

  test('C04-E15 dark: add with a due date and a project in the dark theme', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await signInFresh(page);
    await expect(page.locator('html')).toHaveClass(/dark/);
    await quickAdd(page, 'In the dark', async (b) => {
      await b.getByRole('button', { name: 'Add a due date' }).click();
      await b
        .locator('.tp-qa-pop')
        .getByRole('button', { name: /^22 October/ })
        .click();
    });
    const r = row(dayList(page), 'In the dark');
    await expect(r.locator('.tp-sg-due')).toHaveText('Due Thu');
    await idle(page);
    await page.reload();
    await expect.poll(() => titlesOf(dayList(page))).toEqual(['In the dark']);
  });
});
