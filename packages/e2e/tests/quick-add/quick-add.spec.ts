import type { Locator, Page } from '@playwright/test';
import { API_URL, expect, signInFresh, test } from '../../fixtures/app';
import { goInbox, pane, rows, section } from '../../fixtures/inbox';
import { createSpace, joinLink, secondPerson, switchTo } from '../../fixtures/spaces';
import { dayList, fixClock, idle, row, SUNDAY, titlesOf, writeTasks } from '../../fixtures/today';
import { expectListMarkers, expectOneLineChip } from '../../fixtures/visual';

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

/** A real-world name: long, with spaces and dots. */
const LONG = 'WhatsApp Image 2026-08-05 at 4.29.27 PM.jpeg';
const jpeg = (name = LONG) => ({ name, mimeType: 'image/jpeg', buffer: Buffer.alloc(248_000, 1) });

/** A task's panel, opened from its row on today. */
async function openPanel(page: Page, title: string): Promise<Locator> {
  await row(dayList(page), title).getByRole('button', { name: title }).click();
  const p = page.getByRole('dialog', { name: 'Task details' });
  await expect(p.getByRole('textbox', { name: 'Task title' })).toHaveValue(title);
  return p;
}

/** Paste files into an editor the way the browser does with a screenshot on the clipboard. */
async function pasteFile(field: Locator, name: string, type: string, size: number): Promise<void> {
  await field.evaluate(
    (el, f) => {
      const dt = new DataTransfer();
      dt.items.add(new File([new Uint8Array(f.size)], f.name, { type: f.type }));
      el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    },
    { name, type, size },
  );
}

/** Hold uploads back so the uploading chip can be seen, until `release` is called. */
async function holdUploads(page: Page): Promise<() => void> {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  await page.route('**/api/spaces/*/files', async (route) => {
    await gate;
    await route.continue();
  });
  return release;
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
    // Edit projects… ends the list (chunk 18).
    await expect(items).toHaveText(['Home', 'New project…', 'Edit projects…']);
    await items.first().click();
    await addButton(b).click();
    await expect(bar(page)).toHaveCount(0, { timeout: 5000 });
    await expect(row(dayList(page), 'Second').locator('.tp-sg-project')).toHaveText('Home');
    await row(dayList(page), 'First').getByRole('button', { name: 'First' }).click();
    const panel = page.getByRole('dialog', { name: 'Task details' });
    await expect(panel.getByRole('button', { name: 'Project', exact: true })).toHaveText('Home');
  });

  test('C18-E15 New project… in Quick Add takes a colour; the same name again offers Use instead of a twin', async ({
    page,
  }) => {
    test.skip(test.info().project.name !== 'desktop', 'the same picker on every size');
    await signInFresh(page);
    const me = await (await page.request.get(`${API_URL}/api/me`)).json();
    const space = (me as { spaces: Array<{ id: string; kind: string }> }).spaces.find(
      (x) => x.kind === 'personal',
    )!;
    let b = await openBar(page);
    await b.getByRole('textbox', { name: 'Task title' }).fill('Buy stamps');
    await b.getByRole('button', { name: 'Choose a project' }).click();
    await b.locator('.tp-qa-pop').getByRole('menuitem', { name: 'New project…' }).click();
    const card = b.getByRole('group', { name: 'New project' });
    await card.getByRole('radio', { name: 'Teal' }).click();
    await card.getByRole('textbox', { name: 'Project name' }).fill('Errands');
    await card.getByRole('textbox', { name: 'Project name' }).press('Enter');
    const chip = b.getByRole('button', { name: 'Project: Errands' });
    await expect(chip).toBeVisible();
    expect(await chip.locator('.tp-dot').evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(
      'rgb(47, 111, 111)',
    );
    await addButton(b).click();
    await expect(bar(page)).toHaveCount(0, { timeout: 5000 });
    await idle(page);
    const res = await page.request.get(`${API_URL}/api/spaces/${space.id}/projects`);
    const saved = ((await res.json()) as { projects: Array<{ name: string; color: string }> }).projects;
    expect(saved).toEqual([expect.objectContaining({ name: 'Errands', color: '#2f6f6f' })]);
    // The same name again: the card offers the one there is.
    b = await openBar(page);
    await b.getByRole('button', { name: 'Choose a project' }).click();
    await b.locator('.tp-qa-pop').getByRole('menuitem', { name: 'New project…' }).click();
    await b.getByRole('textbox', { name: 'Project name' }).fill('errands');
    await expect(b.getByText('Errands is already here.')).toBeVisible();
    await b.getByRole('button', { name: 'Use Errands' }).click();
    await expect(b.getByRole('button', { name: 'Project: Errands' })).toBeVisible();
    await page.keyboard.press('Escape');
    await idle(page);
    const again = await page.request.get(`${API_URL}/api/spaces/${space.id}/projects`);
    expect(((await again.json()) as { projects: unknown[] }).projects).toHaveLength(1);
  });

  test('C04-E06 a note becomes the task’s notes; a long-named file shows as a one-line chip in the notes and opens', async ({
    page,
  }) => {
    await signInFresh(page);
    await quickAdd(page, 'Send the offsite agenda', async (b) => {
      await b.getByRole('button', { name: 'Add a note' }).click();
      await b.getByRole('textbox', { name: 'Note' }).fill('Keep it to one page.');
      await b
        .locator('input[type=file]')
        .first()
        .setInputFiles({
          name: 'Offsite agenda v3 (final, with the venue map and the travel plan).pdf',
          mimeType: 'application/pdf',
          buffer: Buffer.alloc(248_000, 1),
        });
      await expect(b.locator('.tp-qa-file')).toHaveText([
        'Offsite agenda v3 (final, with the venue map and the travel plan).pdf242 KB',
      ]);
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
    await expect(chip).toHaveAttribute(
      'title',
      'Offsite agenda v3 (final, with the venue map and the travel plan).pdf',
    );
    await expect(chip.locator('.tp-att-ext')).toHaveText('.pdf');
    expect((await expectOneLineChip(chip, notes)).cut).toBe(true);
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

  test('C04-E14 attach a long-named file from the notes editor in the panel; one line, there after a reload, and it opens', async ({
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
    await panel.locator('.tp-rte-notes input[type=file]').setInputFiles({
      name: 'Quick Add spec, rich notes and files, second draft.md',
      mimeType: 'text/markdown',
      buffer: Buffer.from('# Spec'),
    });
    await expect(notes.locator('a.tp-att')).toHaveAttribute(
      'title',
      'Quick Add spec, rich notes and files, second draft.md',
    );
    await expectOneLineChip(notes.locator('a.tp-att'), notes);
    await panel.getByRole('textbox', { name: 'Task title' }).click();
    await idle(page);
    await page.reload();
    const again = page.getByRole('dialog', { name: 'Task details' }).getByRole('textbox', { name: 'Notes' });
    await expect(again.locator('a.tp-att .tp-att-ext')).toHaveText('.md');
    await expectOneLineChip(again.locator('a.tp-att'), again);
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

  test('C04-E16 a long-named file in notes: in a list item and after a line it stays one line, cut before .jpeg, the full name on hover', async ({
    page,
  }) => {
    await signInFresh(page);
    await writeTasks(page, ['Share the venue photos']);
    await page.getByRole('textbox', { name: 'New task' }).press('Escape');
    const panel = await openPanel(page, 'Share the venue photos');
    const notes = panel.getByRole('textbox', { name: 'Notes' });
    const input = panel.locator('.tp-rte-notes input[type=file]');
    await notes.click();
    await page.keyboard.type('- Photos: ');
    await input.setInputFiles(jpeg());
    await expect(notes.locator('li a.tp-att')).toHaveCount(1);
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    await page.keyboard.type('The hall from the stage, before the chairs went in, is in this one: ');
    await input.setInputFiles(jpeg());
    await expect(notes.locator('a.tp-att')).toHaveCount(2);
    for (const chip of await notes.locator('a.tp-att').all()) {
      await expect(chip).toHaveAttribute('title', LONG);
      await expect(chip.locator('.tp-att-ext')).toHaveText('.jpeg');
      expect((await expectOneLineChip(chip, notes)).cut).toBe(true);
    }
    await expectListMarkers(notes);
    await panel.getByRole('textbox', { name: 'Task title' }).click();
    await idle(page);
    await page.reload();
    const again = page.getByRole('dialog', { name: 'Task details' }).getByRole('textbox', { name: 'Notes' });
    await expect(again.locator('a.tp-att')).toHaveCount(2);
    for (const chip of await again.locator('a.tp-att').all()) await expectOneLineChip(chip, again);
  });

  test('C04-E17 paste a screenshot into notes: the uploading chip at once, then "Pasted image" with its size; after a reload it opens as a PNG', async ({
    page,
  }) => {
    await signInFresh(page);
    await writeTasks(page, ['Fix the header']);
    await page.getByRole('textbox', { name: 'New task' }).press('Escape');
    const panel = await openPanel(page, 'Fix the header');
    const notes = panel.getByRole('textbox', { name: 'Notes' });
    await notes.click();
    await page.keyboard.type('What it looks like: ');
    const release = await holdUploads(page);
    await pasteFile(notes, 'image.png', 'image/png', 1_260_000);
    const up = notes.locator('[data-tp-upload]');
    await expect(up).toHaveClass(/tp-att-up/);
    await expect(up.locator('.tp-att-stem')).toHaveText('Pasted image 18 Oct 10.00');
    await expect(up.locator('.tp-att-ext')).toHaveText('.png');
    await expectOneLineChip(up, notes);
    release();
    const chip = notes.locator('a.tp-att');
    await expect(chip).toHaveAttribute('title', 'Pasted image 18 Oct 10.00.png');
    await expect(chip.locator('.tp-att-s')).toHaveText('1.2 MB');
    await expect(up).toHaveCount(0);
    await panel.getByRole('textbox', { name: 'Task title' }).click();
    await idle(page);
    const saved = (await serverTask(page, 'ME-1')).notes;
    expect(saved).toContain('data-name="Pasted image 18 Oct 10.00.png"');
    expect(saved).not.toContain('data-tp-upload');
    await page.reload();
    const again = page.getByRole('dialog', { name: 'Task details' }).getByRole('textbox', { name: 'Notes' });
    const href = (await again.locator('a.tp-att').getAttribute('href'))!;
    const file = await page.request.get(href);
    expect(file.status()).toBe(200);
    expect(file.headers()['content-type']).toBe('image/png');
  });

  test('C04-E18 paste into a comment: Comment waits for the file; the posted comment shows it on one line and it opens', async ({
    page,
  }) => {
    await signInFresh(page);
    await writeTasks(page, ['Fix the header']);
    await page.getByRole('textbox', { name: 'New task' }).press('Escape');
    const panel = await openPanel(page, 'Fix the header');
    const box = panel.getByRole('textbox', { name: 'Write a comment' });
    await box.click();
    await page.keyboard.type('Here it is ');
    const release = await holdUploads(page);
    await pasteFile(box, 'image.png', 'image/png', 64_000);
    const send = panel.getByRole('button', { name: 'Comment' });
    await expect(box.locator('[data-tp-upload]')).toBeVisible();
    await expect(send).toBeDisabled();
    release();
    await expect(box.locator('a.tp-att')).toBeVisible();
    await expect(send).toBeEnabled();
    await send.click();
    const comment = panel.locator('.tp-td-cmt').first();
    const chip = comment.locator('a.tp-att');
    await expect(chip).toHaveAttribute('title', 'Pasted image 18 Oct 10.00.png');
    await expectOneLineChip(chip, comment);
    const file = await page.request.get((await chip.getAttribute('href'))!);
    expect(file.status()).toBe(200);
  });

  test('C04-E19 drop a file on the notes: the outline shows and the chip lands where it was dropped', async ({
    page,
  }) => {
    test.skip(test.info().project.name === 'phone', 'dropping is a pointer thing');
    await signInFresh(page);
    await writeTasks(page, ['Expense the team lunch']);
    await page.getByRole('textbox', { name: 'New task' }).press('Escape');
    const panel = await openPanel(page, 'Expense the team lunch');
    const notes = panel.getByRole('textbox', { name: 'Notes' });
    await notes.click();
    await page.keyboard.type('Receipt:');
    await page.keyboard.press('Enter');
    await page.keyboard.type('Paid by card.');
    await panel.getByRole('textbox', { name: 'Task title' }).click();
    const dt = await page.evaluateHandle(() => {
      const d = new DataTransfer();
      d.items.add(new File([new Uint8Array(90_000)], 'lunch-receipt.pdf', { type: 'application/pdf' }));
      return d;
    });
    await notes.dispatchEvent('dragenter', { dataTransfer: dt });
    await expect(panel.locator('.tp-rte-notes')).toHaveClass(/tp-rte-dropping/);
    await expect(
      panel.locator('.tp-rte-notes').getByText('Drop to attach · it goes where the caret is'),
    ).toBeVisible();
    // dropped at the end of the first line
    const at = await notes
      .locator('p')
      .first()
      .evaluate((p) => {
        const r = document.createRange();
        r.selectNodeContents(p);
        const box = r.getBoundingClientRect();
        return { x: box.right - 1, y: box.top + box.height / 2 };
      });
    await notes.dispatchEvent('drop', { dataTransfer: dt, clientX: at.x, clientY: at.y });
    await expect(panel.locator('.tp-rte-notes')).not.toHaveClass(/tp-rte-dropping/);
    await expect(notes.locator('p').first().locator('a.tp-att')).toHaveAttribute(
      'title',
      'lunch-receipt.pdf',
    );
    await expectOneLineChip(notes.locator('a.tp-att'), notes);
  });

  test('C04-E20 a failed paste: the red chip and the toast; Retry once the route recovers lands it; a reload never shows a broken chip', async ({
    page,
  }) => {
    await signInFresh(page);
    await writeTasks(page, ['Fix the header']);
    await page.getByRole('textbox', { name: 'New task' }).press('Escape');
    const panel = await openPanel(page, 'Fix the header');
    const notes = panel.getByRole('textbox', { name: 'Notes' });
    await notes.click();
    await page.keyboard.type('Before: ');
    await page.route('**/api/spaces/*/files', (route) => route.fulfill({ status: 500, body: 'down' }));
    await pasteFile(notes, 'image.png', 'image/png', 64_000);
    const bad = notes.locator('.tp-att-err');
    await expect(bad).toBeVisible();
    await expect(page.locator('.tp-toast')).toContainText(
      'Couldn’t attach the file. Check your connection and retry.',
    );
    await expectOneLineChip(bad, notes);
    // leaving now saves the words without the broken chip
    await panel.getByRole('textbox', { name: 'Task title' }).click();
    await idle(page);
    const saved = (await serverTask(page, 'ME-1')).notes;
    expect(saved).toContain('Before:');
    expect(saved).not.toContain('tp-att');
    await page.unroute('**/api/spaces/*/files');
    await bad.getByRole('button', { name: 'Retry' }).click();
    await expect(notes.locator('a.tp-att')).toHaveAttribute('title', 'Pasted image 18 Oct 10.00.png');
    await expect(bad).toHaveCount(0);
    // it saves on its own once it lands, the field already left
    await idle(page);
    await expect
      .poll(async () => (await serverTask(page, 'ME-1')).notes)
      .toContain('Pasted image 18 Oct 10.00.png');
    await page.reload();
    const again = page.getByRole('dialog', { name: 'Task details' }).getByRole('textbox', { name: 'Notes' });
    await expect(again.locator('a.tp-att')).toHaveCount(1);
    await expect(again.locator('.tp-att-err, [data-tp-upload]')).toHaveCount(0);
  });

  test('C04-E21 Quick Add with a rich note and a long-named file: the task’s notes show the list and the chip on one line', async ({
    page,
  }) => {
    await signInFresh(page);
    await quickAdd(page, 'Plan the offsite', async (b) => {
      await b.getByRole('button', { name: 'Add a note' }).click();
      const note = b.getByRole('textbox', { name: 'Note' });
      await expect(note).toBeFocused();
      const tools = b.getByRole('toolbar', { name: 'Note formatting' });
      await expect(tools).toBeVisible();
      await tools.getByRole('button', { name: 'Bulleted list' }).click();
      await page.keyboard.type('Venue');
      await page.keyboard.press('Enter');
      await page.keyboard.type('Food');
      await expect(note.locator('ul > li')).toHaveCount(2);
      await expectListMarkers(note);
      await b.locator('input[type=file]').first().setInputFiles(jpeg());
      await expect(b.locator('.tp-qa-file')).not.toHaveClass(/tp-qa-file-up/);
      // leaving a note with words keeps its row, so Add stays under the pointer
      const before = await addButton(b).boundingBox();
      await b.getByRole('textbox', { name: 'Task title' }).click();
      await expect(tools).toBeVisible();
      expect(await addButton(b).boundingBox()).toEqual(before);
    });
    await idle(page);
    const saved = (await serverTask(page, 'ME-1')).notes;
    expect(saved).toContain('<ul><li><p>Venue</p></li><li><p>Food</p></li></ul>');
    const panel = await openPanel(page, 'Plan the offsite');
    const notes = panel.getByRole('textbox', { name: 'Notes' });
    await expectListMarkers(notes);
    expect((await expectOneLineChip(notes.locator('a.tp-att'), notes)).cut).toBe(true);
  });

  test('C04-E22 a rich note to someone else: their Inbox reads the words; accepted, the task’s notes have the list', async ({
    page,
    browser,
  }) => {
    test.skip(test.info().project.name === 'phone', 'the two-pane flow is the desk’s and the tablet’s');
    await signInFresh(page);
    const other = await secondPerson(browser);
    await fixClock(other.page, new Date(SUNDAY.getTime() - 60_000));
    const slug = await createSpace(page, 'Northwind', [other.email]);
    await other.page.goto(await joinLink(page, other.email));
    await other.page.getByRole('button', { name: 'Join Northwind' }).click();
    await expect(other.page).toHaveURL(new RegExp(`/${slug}$`), { timeout: 10_000 });
    await page.getByRole('button', { name: 'New task' }).first().click();
    const qa = page.getByRole('dialog', { name: 'New task' });
    await qa.getByRole('textbox', { name: 'Task title' }).fill('Get the visitor pass');
    await qa.getByRole('button', { name: 'Who it’s for' }).click();
    await page
      .getByRole('menu', { name: 'Who it’s for' })
      .getByRole('menuitemradio', { name: new RegExp(other.email) })
      .click();
    await qa.getByRole('button', { name: 'Add a note' }).click();
    await expect(qa.getByRole('textbox', { name: 'Note' })).toBeFocused();
    await page.keyboard.type('1. Bring the badge');
    await page.keyboard.press('Enter');
    await page.keyboard.type('Sign the form');
    await qa.getByRole('button', { name: 'Send' }).click();
    await expect(page.locator('.tp-toast')).toContainText(/^Sent to /);
    await idle(page);
    await goInbox(other.page);
    await rows(section(other.page, 'To answer')).first().locator('.tp-ix-head').click();
    const note = pane(other.page).locator('.tp-ix-note');
    await expect(note).toHaveText('Bring the badge\nSign the form');
    await expect(note).not.toContainText('<');
    await pane(other.page).getByRole('button', { name: 'Accept' }).click();
    await other.page
      .getByRole('dialog', { name: 'Accept it onto…' })
      .getByRole('button', { name: 'Tomorrow' })
      .click();
    await idle(other.page);
    await other.page
      .getByRole('navigation', { name: 'Main' })
      .getByRole('button', { name: /^Today/ })
      .first()
      .click();
    await other.page.getByRole('button', { name: 'Next day' }).click();
    await row(dayList(other.page), 'Get the visitor pass')
      .getByRole('button', { name: 'Get the visitor pass' })
      .click();
    const notes = other.page
      .getByRole('dialog', { name: 'Task details' })
      .getByRole('textbox', { name: 'Notes' });
    await expect(notes.locator('ol > li')).toHaveCount(2);
    await expectListMarkers(notes);
    await other.context.close();
  });

  test('C17-E01 Personal alone: Quick Add opens on "In Personal for Me" and neither chip opens', async ({
    page,
  }) => {
    test.skip(test.info().project.name === 'phone', 'C17-E03 is the phone’s');
    await signInFresh(page);
    const b = await openBar(page);
    const line = b.locator('.tp-qa-toline');
    await expect(line).toHaveText(/^In.*Personal.*for.*Me$/);
    await expect(line.locator('.tp-qa-static-chip')).toHaveCount(2);
    await expect(b.getByRole('button', { name: /^Space:/ })).toHaveCount(0);
    await line.getByText('Personal', { exact: true }).click();
    await expect(page.getByRole('menu')).toHaveCount(0);
    await b.getByRole('textbox', { name: 'Task title' }).fill('Plain as ever');
    await addButton(b).click();
    await expect(bar(page)).toHaveCount(0, { timeout: 5000 });
    await expect(row(dayList(page), 'Plain as ever')).toBeVisible();
  });

  test('C17-E02 with a team space the chips open, and a task added for Northwind lands on its Today', async ({
    page,
  }) => {
    test.skip(test.info().project.name === 'phone', 'the switcher flow is the desk’s');
    await signInFresh(page);
    await createSpace(page, 'Northwind');
    await switchTo(page, 'Personal');
    await page.getByRole('button', { name: 'New task' }).first().click();
    const b = page.getByRole('dialog', { name: 'New task' });
    await expect(b.locator('.tp-qa-toline')).toHaveText(/^In.*Personal.*for.*Me$/);
    await b.getByRole('button', { name: 'Space: Personal' }).click();
    await page.getByRole('menuitemradio', { name: /Northwind/ }).click();
    await expect(b.locator('.tp-qa-toline')).toHaveText(/^In.*Northwind.*for/);
    await b.getByRole('textbox', { name: 'Task title' }).fill('Book the offsite');
    await addButton(b).click();
    await expect(b).toHaveCount(0, { timeout: 5000 });
    await expect(page.locator('.tp-toast')).toContainText('in Northwind');
    await switchTo(page, 'Northwind');
    await expect(row(dayList(page), 'Book the offsite')).toBeVisible();
  });

  test('C17-E03 phone: the sheet says "In Personal for Me" with plain chips', async ({ page }) => {
    test.skip(test.info().project.name !== 'phone', 'the sheet is the phone’s');
    await signInFresh(page);
    const b = await openBar(page);
    await expect(b.locator('.tp-qa-toline')).toHaveText(/^In.*Personal.*for.*Me$/);
    await expect(b.locator('.tp-qa-toline .tp-qa-static-chip')).toHaveCount(2);
  });

  test('C17-E05 dark: the line reads the same and its chips stay plain', async ({ page }) => {
    test.skip(test.info().project.name !== 'desktop', 'one theme check is enough');
    await page.emulateMedia({ colorScheme: 'dark' });
    await signInFresh(page);
    await expect(page.locator('html')).toHaveClass(/dark/);
    const b = await openBar(page);
    await expect(b.locator('.tp-qa-toline')).toHaveText(/^In.*Personal.*for.*Me$/);
    await expect(b.getByRole('button', { name: /^Space:/ })).toHaveCount(0);
  });
});
