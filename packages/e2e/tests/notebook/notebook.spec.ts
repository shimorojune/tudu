import type { BrowserContext, Locator, Page } from '@playwright/test';
import {
  API_URL,
  codeFor,
  enterCode,
  expect,
  freshEmail,
  quietFirstRun,
  signInFresh,
  test,
} from '../../fixtures/app';
import { calls, installFake } from '../../fixtures/desktop';
import { box, openSearch, panel } from '../../fixtures/search';
import { joinLink, me, secondPerson } from '../../fixtures/spaces';
import { settle } from '../../fixtures/motion';
import { dayList, idle, row, titlesOf } from '../../fixtures/today';

/**
 * Chunk 22, the Notebook: your notes, in folders, linked to tasks, and the note window. Every test makes its own
 * person and data. Desktop web unless the case says otherwise.
 */
const desk = () => test.info().project.name === 'desktop';
const phone = () => test.info().project.name === 'phone';

let clock = Date.now() - 60_000;
const at = () => new Date((clock += 1000)).toISOString();

async function sync(page: Page, mutations: Array<{ type: string; payload: Record<string, unknown> }>) {
  const res = await page.request.post(`${API_URL}/api/sync`, {
    data: {
      clientId: 'seed',
      mutations: mutations.map((m) => ({ id: crypto.randomUUID(), at: at(), ...m })),
    },
  });
  expect(res.status()).toBe(200);
  return (await res.json()) as { results: Array<{ status: string }> };
}

async function seedFolder(page: Page, name: string, parentId: string | null = null): Promise<string> {
  const id = crypto.randomUUID();
  await sync(page, [{ type: 'folder.create', payload: { id, parentId, name, position: null } }]);
  return id;
}

async function seedNote(
  page: Page,
  title: string,
  o: { html?: string; folderId?: string | null; linkTo?: string } = {},
): Promise<string> {
  const id = crypto.randomUUID();
  await sync(page, [
    {
      type: 'note.create',
      payload: {
        id,
        folderId: o.folderId ?? null,
        title,
        html: o.html ?? '',
        ...(o.linkTo ? { linkTo: o.linkTo } : {}),
      },
    },
  ]);
  return id;
}

async function seedTask(
  page: Page,
  spaceId: string,
  title: string,
  day: string | null = null,
): Promise<string> {
  const id = crypto.randomUUID();
  await sync(page, [{ type: 'task.create', payload: { id, spaceId, title, day, position: null } }]);
  return id;
}

async function personalId(page: Page): Promise<string> {
  return (await me(page)).spaces.find((s) => s.kind === 'personal')!.id;
}

/** The task's ID people see ("ME-3"), from the API. */
async function refOf(page: Page, spaceId: string, taskId: string): Promise<string> {
  const res = await page.request.get(`${API_URL}/api/spaces/${spaceId}/tasks/${taskId}`);
  return ((await res.json()) as { ref: string }).ref;
}

const tree = (page: Page) => page.getByRole('navigation', { name: 'Notebook' }).first();
const title = (scope: Page | Locator) => scope.getByRole('textbox', { name: 'Note title' });
const words = (scope: Page | Locator) => scope.locator('.tp-nb-body [contenteditable="true"]').first();
const noteWindow = (page: Page) => page.locator('.tp-nb-float .tp-nb-win');
const folderRow = (page: Page, name: string) =>
  tree(page)
    .locator('.tp-nb-frow')
    .filter({ has: page.locator('.tp-nb-fname', { hasText: new RegExp(`^${name}$`) }) });

/** New task over the page (Quick Add, named New task once you have more than one space). */
const quickAdd = (page: Page) => page.getByRole('dialog', { name: /^(New task|Quick Add)$/ });

/** Select characters `from` to `to` of the note's first line. */
async function selectWords(page: Page, from: number, to: number): Promise<void> {
  await words(page).evaluate(
    (el, [a, b]) => {
      const t = el.querySelector('p')!.firstChild!;
      const r = document.createRange();
      r.setStart(t, a!);
      r.setEnd(t, b!);
      const s = getSelection()!;
      s.removeAllRanges();
      s.addRange(r);
    },
    [from, to],
  );
}

async function openNotebook(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Notebook', exact: true }).click();
  await expect(page).toHaveURL(/\/notebook/);
}

/** A name typed in place, for New folder or Rename. */
async function nameIt(page: Page, name: string): Promise<void> {
  const field = page.getByRole('textbox', { name: 'Folder name' });
  await expect(field).toBeFocused();
  await field.fill(name);
  await field.press('Enter');
}

async function newFolderIn(page: Page, parent: string | null, name: string): Promise<void> {
  if (parent === null) {
    await tree(page).getByRole('button', { name: 'New note or folder' }).click();
    await page.getByRole('menuitem', { name: 'New folder' }).click();
  } else {
    await folderRow(page, parent).hover();
    await folderRow(page, parent)
      .getByRole('button', { name: `New folder in ${parent}` })
      .click();
  }
  await nameIt(page, name);
  await expect(folderRow(page, name)).toBeVisible();
}

/** A note linked to a task, opened in the note window from the task panel; answers the note's id. */
async function floatNote(page: Page, html = '<p>The Old Mill</p>'): Promise<string> {
  const sid = await personalId(page);
  const taskId = await seedTask(page, sid, 'Book the venue', new Date().toLocaleDateString('en-CA'));
  const id = await seedNote(page, 'Venue shortlist', { html, linkTo: taskId });
  await page.goto(`/t/${await refOf(page, sid, taskId)}`);
  await page
    .getByRole('region', { name: 'From your notebook' })
    .getByRole('button', { name: /Venue shortlist/ })
    .click();
  await expect(noteWindow(page)).toBeVisible();
  await settle(page, page.locator('.tp-nb-float'));
  return id;
}

const floatBox = async (page: Page) => (await page.locator('.tp-nb-float').boundingBox())!;

/** Drag from the middle of `handle` by dx, dy. */
async function dragBy(page: Page, handle: Locator, dx: number, dy: number): Promise<void> {
  const h = (await handle.boundingBox())!;
  const x = h.x + h.width / 2;
  const y = h.y + h.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 6 });
  await page.mouse.up();
}

/** The formatting bar is a solid strip above the writing, and only the words under it scroll. */
async function barOnTop(page: Page, scope: Locator): Promise<void> {
  const bar = scope.locator('.tp-nb-body .tp-rte-bar');
  const host = scope.locator('.tp-nb-body .tp-rte-host');
  await expect(bar).toBeVisible();
  const b = (await bar.boundingBox())!;
  const h = (await host.boundingBox())!;
  expect(Math.abs(b.y + b.height - h.y)).toBeLessThanOrEqual(1);
  // Away from the note: the strip stays solid, only its controls dim.
  const alpha = await bar.evaluate((el) => {
    const m = getComputedStyle(el).backgroundColor.match(/rgba?\(([^)]+)\)/);
    const parts = m ? m[1]!.split(/[ ,/]+/).filter(Boolean) : [];
    return parts.length > 3 ? Number(parts[3]) : 1;
  });
  expect(alpha).toBe(1);
  // The first line stays where it is when you click in.
  const first = scope.locator('.tp-nb-body .tp-rte-area > *').first();
  const before = (await first.boundingBox())!.y;
  await first.click();
  await expect(scope.locator('.tp-nb-body .tp-rte-notes')).toHaveClass(/tp-on/);
  expect(Math.abs((await first.boundingBox())!.y - before)).toBeLessThanOrEqual(0.5);
  // Scrolled to the end: right under the bar's lower edge is the bar, never a line of text behind it.
  await host.evaluate((el) => (el.scrollTop = el.scrollHeight));
  const under = await bar.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const at = document.elementFromPoint(r.left + r.width / 2, r.bottom - 2);
    return !!at?.closest('.tp-rte-bar');
  });
  expect(under).toBe(true);
  // The words scroll inside their own box, which starts at the bar's lower edge: nothing shows above it.
  expect(await host.evaluate((el) => getComputedStyle(el).overflowY)).toMatch(/auto|scroll/);
  const h2 = (await host.boundingBox())!;
  expect(h2.y).toBeGreaterThanOrEqual(b.y + b.height - 0.5);
}

async function noteMenu(page: Page, item: 'Move' | 'Delete', scope: Page | Locator = page): Promise<void> {
  await scope.locator('.tp-nb-ed-top').getByRole('button', { name: 'More' }).click();
  await page.getByRole('menuitem', { name: item }).click();
}

/** Drag a row with the mouse, as a person does: press, move past the 4 px that lifts it, glide over, let go. `at` is
 * how far down the target to let go (0 top, 1 bottom). Rows move on pointer events, not HTML drag and drop. */
async function mouseDrag(page: Page, from: Locator, to: Locator, at = 0.5): Promise<void> {
  const a = (await from.boundingBox())!;
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + a.width / 2 + 8, a.y + a.height / 2 + 2, { steps: 2 });
  await expect(tree(page).locator('.tp-nb-ghost')).toBeVisible();
  const b = (await to.boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height * at, { steps: 8 });
  await page.mouse.up();
}

/** A finger on the screen, through Chromium's touch input: `hold` ms still, then along `path`, then up. */
async function touchDrag(page: Page, from: Locator, path: Array<{ x: number; y: number }>, hold: number) {
  const cdp = await page.context().newCDPSession(page);
  const a = (await from.boundingBox())!;
  const start = { x: a.x + a.width / 2, y: a.y + a.height / 2 };
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [start] });
  if (hold) await page.waitForTimeout(hold);
  for (const p of path) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [p] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}

/** Points from one spot to another, `n` of them. */
const line = (a: { x: number; y: number }, b: { x: number; y: number }, n = 10) =>
  Array.from({ length: n }, (_, i) => ({
    x: a.x + ((b.x - a.x) * (i + 1)) / n,
    y: a.y + ((b.y - a.y) * (i + 1)) / n,
  }));
const mid = (b: { x: number; y: number; width: number; height: number }) => ({
  x: b.x + b.width / 2,
  y: b.y + b.height / 2,
});

async function notebookNow(page: Page) {
  return (await (await page.request.get(`${API_URL}/api/notebook`)).json()) as {
    folders: Array<{ id: string; name: string; parentId: string | null }>;
    notes: Array<{ id: string; title: string; folderId: string | null }>;
  };
}

test.describe('notebook', () => {
  test('C22-E01 first visit: the Notebook button opens the empty Notebook; a new note saves with the ring and the tick; reload keeps it', async ({
    page,
  }) => {
    test.skip(!desk(), 'desktop web');
    await signInFresh(page);
    await openNotebook(page);
    await expect(page.getByText('Somewhere to think out loud.')).toBeVisible();
    await expect(tree(page).getByText('No notes yet. Folders you make show up here.')).toBeVisible();
    // A slow save shows the small ring first.
    await page.route('**/api/sync', async (r) => {
      await new Promise((d) => setTimeout(d, 900));
      await r.continue();
    });
    await page.getByRole('button', { name: 'New note', exact: true }).click();
    await title(page).fill('Onboarding interview notes');
    await words(page).click();
    await page.keyboard.type('Same thing came up four times.');
    await expect(page.getByLabel('Saving')).toBeVisible();
    await expect(page.getByLabel('Saved')).toBeVisible();
    await page.unroute('**/api/sync');
    await idle(page);
    await page.reload();
    await expect(title(page)).toHaveValue('Onboarding interview notes');
    await expect(words(page)).toContainText('Same thing came up four times.');
    await expect(tree(page).getByRole('button', { name: 'Onboarding interview notes' })).toBeVisible();
  });

  test('C22-E02 folders three levels deep: no New folder in Offsite; a note drags into Planning; Planning under Offsite is refused', async ({
    page,
  }) => {
    test.skip(!desk(), 'desktop web');
    await signInFresh(page);
    await seedNote(page, 'Q4 planning braindump');
    await openNotebook(page);
    await newFolderIn(page, null, 'Northwind');
    await newFolderIn(page, 'Northwind', 'Planning');
    await newFolderIn(page, 'Planning', 'Offsite');
    await folderRow(page, 'Offsite').hover();
    await expect(
      folderRow(page, 'Offsite').getByRole('button', { name: 'New folder in Offsite' }),
    ).toHaveCount(0);
    await expect(
      folderRow(page, 'Offsite').getByRole('button', { name: 'New note in Offsite' }),
    ).toBeVisible();
    // A note into Planning.
    await mouseDrag(
      page,
      tree(page).getByRole('button', { name: 'Q4 planning braindump' }),
      folderRow(page, 'Planning'),
    );
    await expect(page.locator('.tp-nb-crumb')).toContainText(/Northwind\s+\/\s+Planning/);
    await idle(page);
    const t = (await (await page.request.get(`${API_URL}/api/notebook`)).json()) as {
      folders: Array<{ id: string; name: string; parentId: string | null }>;
      notes: Array<{ title: string; folderId: string | null }>;
    };
    const planning = t.folders.find((f) => f.name === 'Planning')!;
    expect(t.notes.find((n) => n.title === 'Q4 planning braindump')!.folderId).toBe(planning.id);
    // Planning into Offsite (below itself, past three levels): refused, and it stays where it was.
    await mouseDrag(page, folderRow(page, 'Planning'), folderRow(page, 'Offsite'));
    await expect(page.getByText('Folders go three levels deep.')).toBeVisible();
    await idle(page);
    const after = (await (await page.request.get(`${API_URL}/api/notebook`)).json()) as typeof t;
    expect(after.folders.find((f) => f.name === 'Planning')!.parentId).toBe(planning.parentId);
  });

  test('C22-E40 a note in no folder drags onto a folder with the mouse; the crumb and the server agree', async ({
    page,
  }) => {
    test.skip(!desk(), 'desktop web');
    await signInFresh(page);
    const home = await seedFolder(page, 'Home');
    const id = await seedNote(page, 'Gift ideas');
    await page.goto(`/notebook/${id}`);
    await expect(page.locator('.tp-nb-crumb')).toHaveText('Notebook');
    await mouseDrag(page, tree(page).getByRole('button', { name: 'Gift ideas' }), folderRow(page, 'Home'));
    await expect(page.locator('.tp-nb-crumb')).toContainText('Home');
    // The card has landed and gone; the row is back in the tree, in Home.
    await expect(tree(page).locator('.tp-nb-ghost')).toHaveCount(0);
    await expect(tree(page).getByRole('button', { name: 'Gift ideas' })).toBeVisible();
    await idle(page);
    expect((await notebookNow(page)).notes.find((n) => n.id === id)!.folderId).toBe(home);
  });

  test('C22-E41 a note dragged out of its folder to the top level: the crumb says Notebook and the server has no folder', async ({
    page,
  }) => {
    test.skip(!desk(), 'desktop web');
    await signInFresh(page);
    const home = await seedFolder(page, 'Home');
    const id = await seedNote(page, 'Things to fix in the flat', { folderId: home });
    await seedNote(page, 'Sunday scribbles');
    await page.goto(`/notebook/${id}`);
    await expect(page.locator('.tp-nb-crumb')).toContainText('Home');
    await expect(tree(page).locator('.tp-nb-loose-sep')).toBeVisible();
    await expect(tree(page).getByText('Not in a folder')).toHaveCount(0);
    await mouseDrag(
      page,
      tree(page).getByRole('button', { name: 'Things to fix in the flat' }),
      tree(page).getByRole('button', { name: 'Sunday scribbles' }),
      0.8,
    );
    await expect(page.locator('.tp-nb-crumb')).toHaveText('Notebook');
    await idle(page);
    expect((await notebookNow(page)).notes.find((n) => n.id === id)!.folderId).toBeNull();
  });

  test('C22-E42 phone: hold a note, then carry it onto a folder; a quick swipe moves nothing', async ({
    page,
  }) => {
    test.skip(!phone(), 'phones');
    await signInFresh(page);
    const home = await seedFolder(page, 'Home');
    const id = await seedNote(page, 'Gift ideas');
    await page.goto('/notebook');
    const note = tree(page).getByRole('button', { name: 'Gift ideas' });
    await expect(note).toBeVisible();
    // A quick swipe: no hold, so no lift; the list may scroll but nothing moves.
    const n0 = mid((await note.boundingBox())!);
    await touchDrag(page, note, line(n0, { x: n0.x, y: n0.y - 120 }, 4), 0);
    await expect(tree(page).locator('.tp-nb-ghost')).toHaveCount(0);
    await idle(page);
    expect((await notebookNow(page)).notes.find((n) => n.id === id)!.folderId).toBeNull();
    // Hold half a second, then carry it onto Home.
    const from = mid((await note.boundingBox())!);
    const to = mid((await folderRow(page, 'Home').boundingBox())!);
    await touchDrag(page, note, line(from, to), 500);
    await idle(page);
    await expect
      .poll(async () => (await notebookNow(page)).notes.find((n) => n.id === id)!.folderId)
      .toBe(home);
  });

  test('C22-E43 a new note shows no ⋯ until its first letter; then Move and Delete work', async ({
    page,
  }) => {
    test.skip(!desk(), 'desktop web');
    await signInFresh(page);
    await seedFolder(page, 'Home');
    await seedNote(page, 'Gift ideas');
    await openNotebook(page);
    await tree(page).getByRole('button', { name: 'New note or folder' }).click();
    await page.getByRole('menuitem', { name: 'New note' }).click();
    await expect(title(page)).toBeVisible();
    const more = page.locator('.tp-nb-ed-top .tp-nb-more');
    await expect(more).toHaveClass(/tp-nb-more-hide/);
    await expect(more).toBeHidden();
    // Hidden and out of reach: Tab never lands on it.
    await page.locator('.tp-nb-ed-top').click({ position: { x: 4, y: 4 } });
    for (let i = 0; i < 4; i++) {
      await page.keyboard.press('Tab');
      await expect(more.locator(':focus')).toHaveCount(0);
    }
    await title(page).click();
    await title(page).pressSequentially('V');
    await expect(more).not.toHaveClass(/tp-nb-more-hide/);
    await expect(more.getByRole('button', { name: 'More' })).toBeVisible();
    await title(page).pressSequentially('enue shortlist');
    await noteMenu(page, 'Move');
    await page
      .getByRole('dialog', { name: 'Move to a folder' })
      .getByRole('option', { name: /^Home/ })
      .click();
    await expect(page.locator('.tp-nb-crumb')).toContainText('Home');
    await noteMenu(page, 'Delete');
    await page
      .getByRole('dialog', { name: 'Delete “Venue shortlist”?' })
      .getByRole('button', { name: 'Delete' })
      .click();
    await expect(page.getByText('Moved to Trash. It stays there for 30 days.')).toBeVisible();
    await idle(page);
    const t = await notebookNow(page);
    expect(t.notes.map((n) => n.title)).not.toContain('Venue shortlist');
  });

  test('C22-E03 rename a folder from ⋯ and by double-click; Esc keeps the old name', async ({ page }) => {
    test.skip(!desk(), 'desktop web');
    await signInFresh(page);
    await seedFolder(page, 'Home');
    await seedNote(page, 'A note');
    await openNotebook(page);
    await folderRow(page, 'Home').hover();
    await folderRow(page, 'Home').getByRole('button', { name: 'More' }).click();
    await page.getByRole('menuitem', { name: 'Rename' }).click();
    await nameIt(page, 'House');
    await expect(folderRow(page, 'House')).toBeVisible();
    await folderRow(page, 'House').locator('.tp-nb-ftog').dblclick();
    const field = page.getByRole('textbox', { name: 'Folder name' });
    await field.fill('Flat');
    await field.press('Escape');
    await expect(folderRow(page, 'House')).toBeVisible();
    await idle(page);
    const t = (await (await page.request.get(`${API_URL}/api/notebook`)).json()) as {
      folders: Array<{ name: string }>;
    };
    expect(t.folders.map((f) => f.name)).toEqual(['House']);
  });

  test('C22-E04 ⋯ Move: Here is marked, Offsite moves it in the tree, Undo puts it back', async ({
    page,
  }) => {
    test.skip(!desk(), 'desktop web');
    await signInFresh(page);
    const nw = await seedFolder(page, 'Northwind');
    const plan = await seedFolder(page, 'Planning', nw);
    await seedFolder(page, 'Offsite', plan);
    const id = await seedNote(page, 'Venue shortlist', { folderId: nw });
    await page.goto(`/notebook/${id}`);
    await noteMenu(page, 'Move');
    const pick = page.getByRole('dialog', { name: 'Move to a folder' });
    await expect(pick.getByRole('option', { name: /^Northwind/ })).toContainText('Here');
    await pick.getByRole('option', { name: /^Offsite/ }).click();
    await expect(page.locator('.tp-nb-crumb')).toContainText('Offsite');
    await expect(page.getByText('Moved to Offsite.')).toBeVisible();
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.locator('.tp-nb-crumb')).not.toContainText('Offsite');
    await idle(page);
    const n = (await (await page.request.get(`${API_URL}/api/notebook/notes/${id}`)).json()) as {
      folderId: string;
    };
    expect(n.folderId).toBe(nw);
  });

  test('C22-E05 delete a note: it asks, Cancel keeps it, Delete fades it and opens the next, Undo brings it back', async ({
    page,
  }) => {
    test.skip(!desk(), 'desktop web');
    await signInFresh(page);
    const a = await seedNote(page, 'Gift ideas');
    await seedNote(page, 'Things to fix in the flat');
    await page.goto(`/notebook/${a}`);
    await expect(title(page)).toHaveValue('Gift ideas');
    await noteMenu(page, 'Delete');
    const ask = page.getByRole('dialog', { name: 'Delete “Gift ideas”?' });
    await ask.getByRole('button', { name: 'Cancel' }).click();
    await expect(ask).toBeHidden();
    await expect(title(page)).toHaveValue('Gift ideas');
    await noteMenu(page, 'Delete');
    await page
      .getByRole('dialog', { name: 'Delete “Gift ideas”?' })
      .getByRole('button', { name: 'Delete' })
      .click();
    await expect(title(page)).toHaveValue('Things to fix in the flat');
    await expect(page.getByText('Moved to Trash. It stays there for 30 days.')).toBeVisible();
    await expect(tree(page).getByRole('button', { name: 'Gift ideas' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(title(page)).toHaveValue('Gift ideas');
    await expect(tree(page).getByRole('button', { name: 'Gift ideas' })).toBeVisible();
  });

  test('C22-E06 Trash: a folder with two notes, days left, Put back restores both; Delete now and Empty Trash ask', async ({
    page,
  }) => {
    test.skip(!desk(), 'desktop web');
    await signInFresh(page);
    const home = await seedFolder(page, 'Home');
    await seedNote(page, 'Gift ideas', { folderId: home });
    await seedNote(page, 'Things to fix in the flat', { folderId: home });
    await seedNote(page, 'Loose note');
    await openNotebook(page);
    await folderRow(page, 'Home').hover();
    await folderRow(page, 'Home').getByRole('button', { name: 'More' }).click();
    await page.getByRole('menuitem', { name: 'Delete' }).click();
    const ask = page.getByRole('dialog', { name: 'Delete “Home”?' });
    await expect(ask).toContainText('The folder and its 2 notes go to Trash for 30 days');
    await ask.getByRole('button', { name: 'Delete' }).click();
    await expect(folderRow(page, 'Home')).toHaveCount(0);
    await tree(page)
      .getByRole('button', { name: /^Trash/ })
      .click();
    await expect(page).toHaveURL(/\/notebook\/trash$/);
    const homeRow = page.locator('.tp-nb-trrow').filter({ hasText: 'Home' });
    await expect(homeRow).toContainText('30 days left');
    await expect(homeRow).toContainText('2 notes');
    await homeRow.hover();
    await homeRow.getByRole('button', { name: 'Put back' }).click();
    await expect(folderRow(page, 'Home')).toBeVisible();
    await expect(page.getByText('Nothing in Trash.')).toBeVisible();
    await idle(page);
    const t = (await (await page.request.get(`${API_URL}/api/notebook`)).json()) as {
      notes: Array<{ folderId: string }>;
    };
    expect(t.notes.filter((n) => n.folderId === home)).toHaveLength(2);

    // Delete now, and Empty Trash: each asks first.
    const a = await seedNote(page, 'Old offsite ideas');
    const b = await seedNote(page, 'Another old one');
    await sync(page, [
      { type: 'note.delete', payload: { id: a } },
      { type: 'note.delete', payload: { id: b } },
    ]);
    await page.reload();
    const row = page.locator('.tp-nb-trrow').filter({ hasText: 'Old offsite ideas' });
    await row.hover();
    await row.getByRole('button', { name: 'Delete now' }).click();
    await page
      .getByRole('dialog', { name: 'Delete “Old offsite ideas” now?' })
      .getByRole('button', { name: 'Delete now' })
      .click();
    await expect(row).toHaveCount(0);
    await page.getByRole('button', { name: 'Empty Trash' }).click();
    await page
      .getByRole('dialog', { name: 'Empty Trash?' })
      .getByRole('button', { name: 'Empty Trash' })
      .click();
    await expect(page.getByText('Nothing in Trash.')).toBeVisible();
    await idle(page);
    const trash = (await (await page.request.get(`${API_URL}/api/notebook/trash`)).json()) as {
      items: unknown[];
    };
    expect(trash.items).toEqual([]);
  });

  test('C22-E07 link a task from another space; the chip shows; the task panel lists the note; × on either side unlinks', async ({
    page,
  }) => {
    test.skip(!desk(), 'desktop web');
    await signInFresh(page);
    const made = await page.request.post(`${API_URL}/api/spaces`, {
      data: { name: 'Northwind', color: '#3d5a80', invites: [] },
    });
    const space = ((await made.json()) as { space: { id: string; slug: string } }).space;
    const taskId = await seedTask(page, space.id, 'Plan the team offsite agenda', null);
    const ref = await refOf(page, space.id, taskId);
    const id = await seedNote(page, 'Offsite agenda draft');
    await page.goto(`/notebook/${id}`);
    await page.getByRole('button', { name: 'Link a task' }).click();
    const pick = page.getByRole('dialog', { name: 'Link a task' });
    await pick.getByRole('textbox').fill('offsite');
    await pick.getByRole('option', { name: new RegExp(ref) }).click();
    const chip = page.locator('.tp-nb-tchip').filter({ hasText: ref });
    await expect(chip).toContainText('Plan the team offsite agenda');
    await idle(page);
    // The task's panel, in its own space.
    await page.goto(`/t/${ref}`);
    const sec = page.getByRole('region', { name: 'From your notebook' });
    await expect(sec).toContainText('Offsite agenda draft');
    await expect(sec).toContainText('Only you see these');
    await sec.locator('.tp-nb-li').hover();
    await sec.getByRole('button', { name: 'Unlink from this task' }).click();
    await expect(sec.locator('.tp-nb-li')).toHaveCount(0);
    await idle(page);
    // Linked again, then unlinked from the note's own chip.
    await sync(page, [{ type: 'note.link', payload: { id, taskId } }]);
    await page.goto(`/notebook/${id}`);
    await chip.hover();
    await chip.getByRole('button', { name: `Unlink ${ref}` }).click();
    await expect(chip).toHaveCount(0);
    await expect(page.getByText(`Unlinked from ${ref}. The task is unchanged.`)).toBeVisible();
    await idle(page);
    const n = (await (await page.request.get(`${API_URL}/api/notebook/notes/${id}`)).json()) as {
      linked: unknown[];
    };
    expect(n.linked).toEqual([]);
  });

  test('C22-E08 task panel New note opens the note window linked to the task; typing saves; a blank one closed leaves nothing', async ({
    page,
  }) => {
    test.skip(!desk(), 'desktop web');
    await signInFresh(page);
    const sid = await personalId(page);
    const taskId = await seedTask(
      page,
      sid,
      'Call the bank about the card',
      new Date().toLocaleDateString('en-CA'),
    );
    const ref = await refOf(page, sid, taskId);
    await page.goto(`/t/${ref}`);
    const sec = page.getByRole('region', { name: 'From your notebook' });
    await sec.getByRole('button', { name: 'New note' }).click();
    const win = noteWindow(page);
    await expect(win).toBeVisible();
    await expect(win.locator('.tp-nb-win-title')).toHaveText('New note');
    await expect(title(win))
      .toBeFocused({ timeout: 2000 })
      .catch(() => {});
    await title(win).fill('Card fee question');
    await words(win).click();
    await page.keyboard.type('They charged twice.');
    await expect(sec).toContainText('Card fee question');
    await idle(page);
    await win.getByRole('button', { name: 'Close' }).click();
    await expect(win).toBeHidden();
    // A blank one, closed without a word.
    await sec.getByRole('button', { name: 'New note' }).click();
    await expect(noteWindow(page).locator('.tp-nb-win-title')).toHaveText('New note');
    await noteWindow(page).getByRole('button', { name: 'Close' }).click();
    await idle(page);
    const t = (await (await page.request.get(`${API_URL}/api/notebook`)).json()) as {
      notes: Array<{ title: string }>;
    };
    expect(t.notes.map((n) => n.title)).toEqual(['Card fee question']);
    const linked = (await (await page.request.get(`${API_URL}/api/tasks/${taskId}/notes`)).json()) as {
      notes: Array<{ title: string }>;
    };
    expect(linked.notes.map((n) => n.title)).toEqual(['Card fee question']);
  });

  test('C22-E09 clicking a note in the task panel opens the note window over the task; the panel stays open behind it', async ({
    page,
  }) => {
    test.skip(!desk(), 'desktop web');
    await signInFresh(page);
    const sid = await personalId(page);
    const taskId = await seedTask(page, sid, 'Plan the offsite', new Date().toLocaleDateString('en-CA'));
    await seedNote(page, 'Offsite agenda draft', { html: '<p>Day one</p>', linkTo: taskId });
    await page.goto(`/t/${await refOf(page, sid, taskId)}`);
    await page
      .getByRole('region', { name: 'From your notebook' })
      .getByRole('button', { name: /Offsite agenda draft/ })
      .click();
    await expect(noteWindow(page)).toBeVisible();
    await expect(title(noteWindow(page))).toHaveValue('Offsite agenda draft');
    await expect(page.getByRole('dialog', { name: 'Task details' })).toBeVisible();
    // Writing in the window leaves the panel where it is.
    await words(noteWindow(page)).click();
    await page.keyboard.type(' More.');
    await expect(page.getByRole('dialog', { name: 'Task details' })).toBeVisible();
    expect(new URL(page.url()).pathname).not.toContain('/notebook');
  });

  test('C22-E10 Meera opens the same shared task: no notebook section; her search for Rohit’s words finds no note', async ({
    page,
    browser,
  }) => {
    test.skip(!desk(), 'desktop web');
    const meeraEmail = freshEmail('meera');
    await signInFresh(page);
    const made = await page.request.post(`${API_URL}/api/spaces`, {
      data: { name: 'Northwind', color: '#3d5a80', invites: [meeraEmail] },
    });
    const space = ((await made.json()) as { space: { id: string; slug: string } }).space;
    const taskId = await seedTask(page, space.id, 'Shared offsite task', null);
    const ref = await refOf(page, space.id, taskId);
    await seedNote(page, 'Salary thoughts', { html: '<p>quokkaish planning words</p>', linkTo: taskId });
    const meera = await secondPerson(browser, meeraEmail);
    const link = await joinLink(page, meeraEmail);
    expect((await meera.page.request.post(`${API_URL}/api${link}`)).ok()).toBe(true);
    await meera.page.goto(`/t/${ref}`);
    await expect(meera.page.getByRole('dialog', { name: 'Task details' })).toBeVisible();
    await expect(meera.page.getByRole('dialog', { name: 'Task details' })).toContainText(
      'Shared offsite task',
    );
    // Her own (empty) section at most, never his note.
    await expect(meera.page.getByText('Salary thoughts')).toHaveCount(0);
    const s = (await (await meera.page.request.get(`${API_URL}/api/search?q=quokkaish`)).json()) as {
      notes: unknown[];
    };
    expect(s.notes).toEqual([]);
    await meera.context.close();
  });

  test('C22-E11 Make a task opens New task on the words; nothing is made until Add task; then it is linked and Open shows it', async ({
    page,
  }) => {
    test.skip(!desk(), 'desktop web');
    await signInFresh(page);
    const id = await seedNote(page, 'Interviews', { html: '<p>Ask Meera for the venue shortlist</p>' });
    await page.goto(`/notebook/${id}`);
    await expect(words(page)).toContainText('venue shortlist');
    await selectWords(page, 0, 33);
    await page.getByRole('button', { name: 'Make a task' }).click();
    const bar = quickAdd(page);
    await expect(bar).toBeVisible();
    await expect(bar.getByRole('textbox', { name: 'Task title' })).toHaveValue(
      'Ask Meera for the venue shortlist',
    );
    await expect(bar.locator('.tp-qa-from')).toContainText('Interviews');
    // Nothing made yet: no chip, nothing on Today.
    await expect(page.locator('.tp-nb-tchip')).toHaveCount(0);
    await bar.getByRole('button', { name: 'Add task' }).click();
    await expect(page.getByText(/is on Today in Personal, linked to this note\./)).toBeVisible();
    const chip = page.locator('.tp-nb-tchip');
    await expect(chip).toContainText('Ask Meera for the venue shortlist');
    await expect(chip).toContainText(/ME-\d+/);
    await idle(page);
    await page.getByRole('button', { name: 'Open', exact: true }).click();
    await expect(page).toHaveURL(/\/me\?task=ME-\d+/);
    await expect(page.getByRole('dialog', { name: 'Task details' })).toContainText(
      'Ask Meera for the venue shortlist',
    );
    await expect(page.getByRole('region', { name: 'From your notebook' })).toContainText('Interviews');
  });

  test('C22-E26 the Make a task bubble lands on whole pixels with nothing transformed, so its words are sharp', async ({
    page,
  }) => {
    test.skip(!desk() && test.info().project.name !== 'webkit', 'desktop web and WebKit');
    await signInFresh(page);
    const id = await seedNote(page, 'Interviews', { html: '<p>Ask Meera for the venue shortlist</p>' });
    await page.goto(`/notebook/${id}`);
    await expect(words(page)).toContainText('venue shortlist');
    await selectWords(page, 4, 15);
    const bubble = page.locator('.tp-nb-bubble');
    await expect(bubble).toBeVisible();
    // Once it has risen: no animation left, no transform, left and top in whole pixels.
    await expect.poll(() => bubble.evaluate((el) => el.getAnimations().length)).toBe(0);
    const at = await bubble.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { transform: cs.transform, left: cs.left, top: cs.top };
    });
    expect(at.transform).toBe('none');
    expect(at.left).toMatch(/^\d+px$/);
    expect(at.top).toMatch(/^\d+px$/);
    await page.getByRole('button', { name: 'Make a task' }).click();
    await expect(quickAdd(page).getByRole('textbox', { name: 'Task title' })).toHaveValue('Meera for t');
  });

  test('C22-E21 two selected lines: the first is the title, the second the note; the task panel shows that note', async ({
    page,
  }) => {
    test.skip(!desk(), 'desktop web');
    await signInFresh(page);
    const id = await seedNote(page, 'Offsite', {
      html: '<p>Call the venue</p><p>Ask about the garden room</p>',
    });
    await page.goto(`/notebook/${id}`);
    await expect(words(page)).toContainText('garden room');
    await words(page).evaluate((el) => {
      const ps = el.querySelectorAll('p');
      const r = document.createRange();
      r.setStart(ps[0]!.firstChild!, 0);
      r.setEnd(ps[1]!.firstChild!, ps[1]!.textContent!.length);
      const s = getSelection()!;
      s.removeAllRanges();
      s.addRange(r);
    });
    await page.getByRole('button', { name: 'Make a task' }).click();
    const bar = quickAdd(page);
    await expect(bar.getByRole('textbox', { name: 'Task title' })).toHaveValue('Call the venue');
    await expect(bar.getByRole('textbox', { name: 'Note' })).toContainText('Ask about the garden room');
    await bar.getByRole('button', { name: 'Add task' }).click();
    const chip = page.locator('.tp-nb-tchip');
    await expect(chip).toContainText('Call the venue');
    await idle(page);
    await page.goto('/me');
    await row(dayList(page), 'Call the venue').getByRole('button', { name: 'Call the venue' }).click();
    const panel = page.getByRole('dialog', { name: 'Task details' });
    await expect(panel.getByRole('textbox', { name: 'Notes' })).toContainText('Ask about the garden room');
  });

  test('C22-E22 × on the pill, then Add: the task is made but not linked; Esc instead makes nothing', async ({
    page,
  }) => {
    test.skip(!desk(), 'desktop web');
    await signInFresh(page);
    const id = await seedNote(page, 'Flat', { html: '<p>Fix the hall light</p><p>Call the plumber</p>' });
    await page.goto(`/notebook/${id}`);
    await expect(words(page)).toContainText('plumber');
    // Esc: nothing made, the note untouched.
    await selectWords(page, 0, 18);
    await page.getByRole('button', { name: 'Make a task' }).click();
    await expect(quickAdd(page)).toBeVisible();
    // New task takes the keyboard (the title) a moment after it opens; Esc before that would land in the note.
    await expect(quickAdd(page).getByRole('textbox', { name: 'Task title' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(quickAdd(page)).toHaveCount(0);
    await expect(words(page)).toContainText('Fix the hall light');
    // × on the pill: the pill shrinks away, the task is made, and no chip comes.
    await selectWords(page, 0, 18);
    await page.getByRole('button', { name: 'Make a task' }).click();
    const bar = quickAdd(page);
    await expect(bar.getByRole('textbox', { name: 'Task title' })).toHaveValue('Fix the hall light');
    await bar.getByRole('button', { name: 'Don’t link it to this note' }).click();
    await expect(bar.locator('.tp-qa-from')).toHaveCount(0);
    await bar.getByRole('button', { name: 'Add task' }).click();
    await idle(page);
    await expect(page.locator('.tp-nb-tchip')).toHaveCount(0);
    await page.goto('/me');
    await expect.poll(() => titlesOf(dayList(page))).toEqual(['Fix the hall light']);
  });

  test('C22-E23 the space chip moved to a team space: the task lands there, still linked to the note', async ({
    page,
  }) => {
    test.skip(!desk(), 'desktop web');
    await signInFresh(page);
    await page.request.post(`${API_URL}/api/spaces`, {
      data: { name: 'Northwind', color: '#3d5a80', invites: [] },
    });
    const id = await seedNote(page, 'Offsite agenda draft', { html: '<p>Book the coach</p>' });
    await page.goto(`/notebook/${id}`);
    await expect(words(page)).toContainText('Book the coach');
    await selectWords(page, 0, 14);
    await page.getByRole('button', { name: 'Make a task' }).click();
    const bar = quickAdd(page);
    await bar.getByRole('button', { name: 'Space: Personal' }).click();
    await page.getByRole('menuitemradio', { name: /Northwind/ }).click();
    await expect(bar.locator('.tp-qa-from')).toContainText('Offsite agenda draft');
    await bar.getByRole('button', { name: 'Add task' }).click();
    await expect(page.getByText(/is on Today in Northwind, linked to this note\./)).toBeVisible();
    const chip = page.locator('.tp-nb-tchip');
    await expect(chip).toContainText('Book the coach');
    await expect(chip).toContainText(/[A-Z]+-\d+/);
    await expect(chip).not.toContainText(/ME-\d+/);
  });

  test('C22-E25 a bullet clears the placeholder: the list button, “- ”, a task’s notes and a comment', async ({
    page,
  }) => {
    test.skip(!desk(), 'desktop web');
    await signInFresh(page);
    const blank = async (rte: Locator, yes: boolean) => {
      if (yes) await expect(rte).toHaveClass(/tp-rte-blank/);
      else await expect(rte).not.toHaveClass(/tp-rte-blank/);
      const before = await rte
        .locator('.tp-rte-area')
        .evaluate((el) => getComputedStyle(el, '::before').content);
      if (!yes) expect(before).toBe('none');
    };
    const one = await seedNote(page, 'Blank one');
    await page.goto(`/notebook/${one}`);
    const rte = page.locator('.tp-nb-body .tp-rte');
    await words(page).click();
    await blank(rte, true);
    await page.locator('.tp-nb-body').getByRole('button', { name: 'Bulleted list' }).click();
    await blank(rte, false);
    await expect(words(page).locator('ul > li')).toHaveCount(1);
    const two = await seedNote(page, 'Blank two');
    await page.goto(`/notebook/${two}`);
    await words(page).click();
    await page.keyboard.type('- ');
    await blank(page.locator('.tp-nb-body .tp-rte'), false);
    await expect(words(page).locator('ul > li')).toHaveCount(1);
    // A task's notes and a comment box.
    const pid = await personalId(page);
    const taskId = await seedTask(page, pid, 'Plan the offsite', null);
    const ref = await refOf(page, pid, taskId);
    await page.goto(`/t/${ref}`);
    const panel = page.getByRole('dialog', { name: 'Task details' });
    const notes = panel.getByRole('textbox', { name: 'Notes' });
    await notes.click();
    await page.keyboard.type('- ');
    await blank(panel.locator('.tp-rte-notes'), false);
    const box = panel.getByRole('textbox', { name: 'Write a comment' });
    await box.click();
    await page.keyboard.type('- ');
    await blank(panel.locator('.tp-rte-comment'), false);
  });

  test('C22-E12 Search: a word only in a note’s words finds it under Notes, washed in ink; picking it opens the note window', async ({
    page,
  }) => {
    test.skip(!desk(), 'desktop web');
    await signInFresh(page);
    await seedNote(page, 'Venue shortlist', { html: '<p>The Old Mill has a zephyrine garden.</p>' });
    await openSearch(page);
    await box(page).fill('zephyrine');
    const notes = panel(page).getByRole('option', { name: /Venue shortlist/ });
    await expect(notes).toBeVisible();
    await expect(panel(page).getByText('Notes', { exact: true })).toBeVisible();
    await expect(notes.locator('mark.tp-hl')).toHaveText('zephyrine');
    await notes.click();
    await expect(noteWindow(page)).toBeVisible();
    await expect(title(noteWindow(page))).toHaveValue('Venue shortlist');
  });

  test('C22-E13 offline: you keep typing, “Not saved yet” shows; back online it saves and the tick shows', async ({
    page,
    context,
  }) => {
    test.skip(!desk(), 'desktop web');
    await signInFresh(page);
    const id = await seedNote(page, 'Train notes', { html: '<p>Start</p>' });
    await page.goto(`/notebook/${id}`);
    await expect(words(page)).toContainText('Start');
    await context.setOffline(true);
    await words(page).click();
    await page.keyboard.press('End');
    await page.keyboard.type(' and more on the train');
    await expect(page.getByText('Not saved yet')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('You’re offline.')).toBeVisible();
    await context.setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await expect(page.getByText('Not saved yet')).toBeHidden({ timeout: 15_000 });
    await idle(page);
    const n = (await (await page.request.get(`${API_URL}/api/notebook/notes/${id}`)).json()) as {
      html: string;
    };
    expect(n.html).toContain('and more on the train');
  });

  test('C22-E14 conflict: another window saved first; the banner; Keep mine wins in both; Show the newer one drops local words', async ({
    page,
    browser,
  }) => {
    test.skip(!desk(), 'desktop web');
    const email = await signInFresh(page);
    const id = await seedNote(page, 'Offsite agenda', { html: '<p>Draft</p>' });
    // The same person in a second window.
    const other: BrowserContext = await browser.newContext({ reducedMotion: 'reduce' });
    const two = await other.newPage();
    // The code the first sign-in used is still in the outbox: wait for the new one.
    const first = await codeFor(two, email);
    await two.goto('/sign-in');
    await two.getByLabel('Email').fill(email);
    await two.getByRole('button', { name: 'Continue' }).click();
    await enterCode(two, await codeFor(two, email, first));
    await expect(two.getByRole('heading', { name: /day$/ })).toBeVisible({ timeout: 10_000 });
    await quietFirstRun(two);
    await page.goto(`/notebook/${id}`);
    await two.goto(`/notebook/${id}`);
    await expect(words(two)).toContainText('Draft');
    // The second window writes while away; the first saves meanwhile.
    await other.setOffline(true);
    await words(two).click();
    await two.keyboard.press('End');
    await two.keyboard.type(' from the second window');
    await expect(two.getByText('Not saved yet')).toBeVisible({ timeout: 10_000 });
    await words(page).click();
    await page.keyboard.press('End');
    await page.keyboard.type(' from the first window');
    await idle(page);
    await other.setOffline(false);
    await two.evaluate(() => window.dispatchEvent(new Event('online')));
    await expect(two.getByText('This note changed in another window.')).toBeVisible({ timeout: 15_000 });
    await expect(two.getByText('Changed elsewhere')).toBeVisible();
    await two.getByRole('button', { name: 'Keep mine' }).click();
    await idle(two);
    await expect(words(page)).toContainText('from the second window', { timeout: 10_000 });
    await expect(words(page)).not.toContainText('from the first window');

    // Again, and this time the newer one wins.
    await other.setOffline(true);
    await words(two).click();
    await two.keyboard.press('End');
    await two.keyboard.type(' DROPPED');
    await expect(two.getByText('Not saved yet')).toBeVisible({ timeout: 10_000 });
    await words(page).click();
    await page.keyboard.press('End');
    await page.keyboard.type(' newest');
    await idle(page);
    await other.setOffline(false);
    await two.evaluate(() => window.dispatchEvent(new Event('online')));
    await two.getByRole('button', { name: 'Show the newer one' }).click();
    await expect(words(two)).toContainText('newest');
    await expect(words(two)).not.toContainText('DROPPED');
    await other.close();
  });

  test('C22-E15 the note window on the web: it drags; the Tudu mark opens the note on the Notebook page and closes the window, no popup', async ({
    page,
    context,
  }) => {
    test.skip(!desk(), 'desktop web');
    await signInFresh(page);
    const id = await floatNote(page);
    const win = noteWindow(page);
    const before = await floatBox(page);
    await dragBy(page, win.locator('.tp-nb-win-title'), -200, 60);
    const after = await floatBox(page);
    expect(Math.round(before.x - after.x)).toBe(200);
    expect(Math.round(after.y - before.y)).toBe(60);
    const tabs = context.pages().length;
    await win.getByRole('button', { name: 'Open in your Notebook' }).click();
    await expect(page).toHaveURL(new RegExp(`/notebook/${id}$`));
    await expect(title(page)).toHaveValue('Venue shortlist');
    await expect(noteWindow(page)).toHaveCount(0);
    expect(context.pages()).toHaveLength(tabs);
    // An old link to the popup lands on the Notebook page too.
    await page.goto(`/note-window/${id}`);
    await expect(page).toHaveURL(new RegExp(`/notebook/${id}$`));
  });

  test('C22-E60 the note window resizes from every edge and corner, never below 420×320 or past the page, and keeps it', async ({
    page,
  }) => {
    test.skip(!desk(), 'desktop web');
    await signInFresh(page);
    await floatNote(page);
    const win = noteWindow(page);
    // Each edge in by 60 and back out: only the edges it names move.
    const moves: Array<[string, number, number]> = [
      ['n', 0, 60],
      ['s', 0, -60],
      ['e', -60, 0],
      ['w', 60, 0],
      ['ne', -60, 60],
      ['nw', 60, 60],
      ['se', -60, -60],
      ['sw', 60, -60],
    ];
    for (const [edge, dx, dy] of moves) {
      const a = await floatBox(page);
      await dragBy(page, win.locator(`[data-edge="${edge}"]`), dx, dy);
      const b = await floatBox(page);
      const left = edge.includes('w') ? dx : 0;
      const top = edge.includes('n') ? dy : 0;
      const right = edge.includes('e') ? dx : 0;
      const bottom = edge.includes('s') ? dy : 0;
      expect(Math.round(b.x - a.x), `${edge} left`).toBe(left);
      expect(Math.round(b.y - a.y), `${edge} top`).toBe(top);
      expect(Math.round(b.x + b.width - (a.x + a.width)), `${edge} right`).toBe(right);
      expect(Math.round(b.y + b.height - (a.y + a.height)), `${edge} bottom`).toBe(bottom);
      await dragBy(page, win.locator(`[data-edge="${edge}"]`), -dx, -dy);
      const c = await floatBox(page);
      expect(Math.round(c.width), `${edge} back`).toBe(Math.round(a.width));
      expect(Math.round(c.height), `${edge} back`).toBe(Math.round(a.height));
    }
    // Never smaller than 420×320.
    await dragBy(page, win.locator('[data-edge="se"]'), -900, -900);
    let f = await floatBox(page);
    expect(Math.round(f.width)).toBe(420);
    expect(Math.round(f.height)).toBe(320);
    // Never past the page: it stops 8px from its edges, where a reload keeps it.
    await dragBy(page, win.locator('[data-edge="nw"]'), -3000, -3000);
    f = await floatBox(page);
    expect(Math.round(f.x)).toBe(8);
    expect(Math.round(f.y)).toBe(8);
    const vp = page.viewportSize()!;
    await dragBy(page, win.locator('[data-edge="se"]'), 3000, 3000);
    f = await floatBox(page);
    expect(Math.round(f.x + f.width)).toBe(vp.width - 8);
    expect(Math.round(f.y + f.height)).toBe(vp.height - 8);
    await dragBy(page, win.locator('[data-edge="se"]'), -200, -150);
    const kept = await floatBox(page);
    // The same frame after a reload.
    await page.reload();
    await page
      .getByRole('region', { name: 'From your notebook' })
      .getByRole('button', { name: /Venue shortlist/ })
      .click();
    await settle(page, page.locator('.tp-nb-float'));
    const back = await floatBox(page);
    expect([back.x, back.y, back.width, back.height].map(Math.round)).toEqual(
      [kept.x, kept.y, kept.width, kept.height].map(Math.round),
    );
  });

  for (const scheme of ['light', 'dark'] as const)
    test(`C22-E61 (${scheme}) the drag mark shows in the bar, the rail is the note’s own paper, and each handle has its cursor`, async ({
      page,
    }) => {
      test.skip(!desk(), 'desktop web');
      await page.emulateMedia({ colorScheme: scheme });
      await signInFresh(page);
      await floatNote(page);
      const win = noteWindow(page);
      await expect(win.locator('.tp-nb-win-bar .tp-nb-win-grab')).toBeVisible();
      const bg = (sel: string) =>
        win
          .locator(sel)
          .first()
          .evaluate((el) => getComputedStyle(el).backgroundColor);
      expect(await bg('.tp-nb-rail')).toBe(await win.evaluate((el) => getComputedStyle(el).backgroundColor));
      const cursors: Record<string, string> = {
        n: 'ns-resize',
        s: 'ns-resize',
        e: 'ew-resize',
        w: 'ew-resize',
        ne: 'nesw-resize',
        sw: 'nesw-resize',
        nw: 'nwse-resize',
        se: 'nwse-resize',
      };
      for (const [edge, cursor] of Object.entries(cursors))
        expect(
          await win.locator(`[data-edge="${edge}"]`).evaluate((el) => getComputedStyle(el).cursor),
          edge,
        ).toBe(cursor);
    });

  test('C22-E62 the formatting bar is a solid strip above the writing on the Notebook page and in the note window; phones keep it at the foot', async ({
    page,
  }) => {
    test.skip(test.info().project.name === 'tablet', 'desktop and phones');
    await signInFresh(page);
    const html = Array.from({ length: 60 }, (_, i) => `<p>Line ${i + 1}</p>`).join('');
    if (phone()) {
      const id = await seedNote(page, 'Long', { html });
      await page.goto(`/notebook/${id}`);
      await expect(words(page)).toContainText('Line 60');
      await words(page).click();
      const bar = page.locator('.tp-nb-body .tp-rte-bar');
      await expect(bar).toBeVisible();
      await page.locator('.tp-nb-body').evaluate((el) => (el.scrollTop = el.scrollHeight));
      const last = (await words(page).locator('p').last().boundingBox())!;
      expect((await bar.boundingBox())!.y).toBeGreaterThanOrEqual(last.y + last.height - 1);
      return;
    }
    const id = await seedNote(page, 'Long', { html });
    await page.goto(`/notebook/${id}`);
    await expect(words(page)).toContainText('Line 60');
    await barOnTop(page, page.locator('.app-notebook'));
    // The note window, the same.
    await floatNote(page, html);
    await barOnTop(page, noteWindow(page));
  });

  test('C22-E63 an older Mac app: the note opens over the page with a toast; Update Tudu opens This Mac and checks', async ({
    page,
  }) => {
    test.skip(!desk(), 'desktop web');
    await installFake(page, { refuseOpenNote: true });
    await signInFresh(page);
    await floatNote(page);
    await expect(title(noteWindow(page))).toHaveValue('Venue shortlist');
    expect((await calls(page, 'openNote')).length).toBe(1);
    const toast = page.getByText(
      'This version of Tudu can’t float notes over other apps, so this one opens here.',
    );
    await expect(toast).toBeVisible();
    await page.getByRole('button', { name: 'Update Tudu' }).click();
    await expect(page).toHaveURL(/[?&]settings=mac/);
    await expect(
      page.getByRole('dialog', { name: 'Settings' }).getByRole('region', { name: 'Updates' }),
    ).toBeVisible();
    expect((await calls(page, 'checkUpdate')).map((c) => c.args)).toContainEqual([true]);
  });

  test('C22-E16 Recent and All notes in the window: All shows the tree; picking a note there opens it in the window', async ({
    page,
  }) => {
    test.skip(!desk(), 'desktop web');
    await signInFresh(page);
    const home = await seedFolder(page, 'Home');
    await seedNote(page, 'Gift ideas', { folderId: home });
    await seedNote(page, 'Train notes');
    await openSearch(page);
    await box(page).fill('train');
    await panel(page)
      .getByRole('option', { name: /Train notes/ })
      .click();
    const win = noteWindow(page);
    await expect(win.getByRole('listbox', { name: 'New note or a recent note' })).toContainText(
      'Train notes',
    );
    await win.getByRole('button', { name: 'All notes' }).click();
    const all = win.getByRole('navigation', { name: 'Notebook' });
    await expect(all.getByRole('searchbox', { name: 'Find a note' })).toBeVisible();
    await all.locator('.tp-nb-ftog', { hasText: 'Home' }).click();
    await all.getByRole('button', { name: 'Gift ideas' }).click();
    await expect(title(win)).toHaveValue('Gift ideas');
    await expect(win.locator('.tp-nb-win-title')).toHaveText('Gift ideas');
  });

  test('C22-E17 phone: More › Notebook, a folder and a note; type; the format bar stays at the bottom of the note; ‹ goes back', async ({
    page,
  }) => {
    test.skip(!phone(), 'phones');
    await signInFresh(page);
    const home = await seedFolder(page, 'Home');
    await seedNote(page, 'Things to fix in the flat', { folderId: home, html: '<p>Bathroom tap drips</p>' });
    await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'More' }).click();
    await page.getByRole('button', { name: /^Notebook/ }).click();
    await expect(page).toHaveURL(/\/notebook$/);
    await tree(page).locator('.tp-nb-ftog', { hasText: 'Home' }).click();
    await tree(page).getByRole('button', { name: 'Things to fix in the flat' }).click();
    await expect(title(page)).toHaveValue('Things to fix in the flat');
    await words(page).click();
    await page.keyboard.press('End');
    await page.keyboard.type(' and the hall light');
    // The formatting bar sits under the words, inside the note, on one row.
    const bar = page.locator('.tp-nb-body .tp-rte-bar');
    await expect(bar).toBeVisible();
    const body = (await page.locator('.tp-nb-body').boundingBox())!;
    const bb = (await bar.boundingBox())!;
    expect(bb.y + bb.height).toBeLessThanOrEqual(body.y + body.height + 1);
    expect(bb.height).toBeLessThan(60);
    await idle(page);
    await page.getByRole('button', { name: 'Notebook' }).first().click();
    await expect(page).toHaveURL(/\/notebook$/);
    await expect(tree(page)).toBeVisible();
  });

  for (const scheme of ['light', 'dark'] as const)
    test(`C22-E18 states (${scheme}): the notes and a note fail to load and say so with Try again; nothing overflows at 320 px`, async ({
      page,
    }) => {
      test.skip(test.info().project.name === 'tablet', 'desktop and phones');
      await page.emulateMedia({ colorScheme: scheme });
      await signInFresh(page);
      const id = await seedNote(page, 'Gift ideas', { html: '<p>Blue teapot</p>' });
      await page.route('**/api/notebook', (r) => r.fulfill({ status: 500, body: '{"error":"down"}' }));
      await page.route(`**/api/notebook/notes/${id}`, (r) =>
        r.fulfill({ status: 500, body: '{"error":"down"}' }),
      );
      await page.goto(`/notebook/${id}`);
      if (!phone()) {
        await expect(page.getByText('Your notes didn’t load.')).toBeVisible();
        await expect(tree(page).getByRole('button', { name: 'Try again' })).toBeVisible();
      }
      await expect(page.getByText('This note didn’t open.')).toBeVisible();
      await page.unroute(`**/api/notebook/notes/${id}`);
      await page.unroute('**/api/notebook');
      await page.getByRole('button', { name: 'Try again' }).last().click();
      await expect(title(page)).toHaveValue('Gift ideas');
      // Narrow: every message and the note reflow, nothing scrolls sideways.
      await page.setViewportSize({ width: 320, height: 640 });
      await page.route(`**/api/notebook/notes/${id}`, (r) => r.fulfill({ status: 500, body: '{}' }));
      await page.reload();
      await expect(page.getByText('This note didn’t open.')).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(0);
    });

  test('C22-E19 motion: popovers leave with the leaving animation; reduced motion turns slides into fades', async ({
    browser,
  }) => {
    test.skip(!desk(), 'desktop web');
    const context = await browser.newContext({
      reducedMotion: 'no-preference',
      viewport: { width: 1440, height: 900 },
    });
    const page = await context.newPage();
    await signInFresh(page);
    const id = await seedNote(page, 'Motion note', { html: '<p>Words</p>' });
    await page.goto(`/notebook/${id}`);
    await page.locator('.tp-nb-ed-top').getByRole('button', { name: 'More' }).click();
    await expect(page.getByRole('menu', { name: 'Note options' })).toBeVisible();
    await page.keyboard.press('Escape');
    const leaving = page.locator('.tp-nb-pop.tp-nb-pop-leaving');
    await expect(leaving).toHaveCount(1);
    expect(await leaving.evaluate((el) => getComputedStyle(el).animationName)).toBe('tp-pop-out');
    await expect(leaving).toHaveCount(0);
    await context.close();
    // Reduced motion: the window's list arrives by a fade, not a slide.
    const still = await browser.newContext({
      reducedMotion: 'reduce',
      viewport: { width: 1440, height: 900 },
    });
    const p2 = await still.newPage();
    await signInFresh(p2);
    await seedNote(p2, 'Train notes');
    await openSearch(p2);
    await box(p2).fill('train');
    await panel(p2)
      .getByRole('option', { name: /Train notes/ })
      .click();
    await noteWindow(p2).getByRole('button', { name: 'All notes' }).click();
    const all = noteWindow(p2).locator('.tp-nb-rail-all');
    expect(await all.evaluate((el) => getComputedStyle(el).animationName)).toBe('tp-nb-fade');
    await still.close();
  });

  test('C22-E20 the task panel’s comment box has equal padding left and right, at desktop and phone widths', async ({
    page,
  }) => {
    test.skip(test.info().project.name === 'tablet', 'desktop and phones');
    await signInFresh(page);
    const sid = await personalId(page);
    const taskId = await seedTask(page, sid, 'Padding check', new Date().toLocaleDateString('en-CA'));
    await page.goto(`/t/${await refOf(page, sid, taskId)}`);
    const compose = page.locator('.tp-td-compose');
    await expect(compose).toBeVisible();
    const sides = await compose.evaluate((el) => {
      const cs = getComputedStyle(el);
      return [cs.paddingLeft, cs.paddingRight];
    });
    expect(sides[0]).toBe(sides[1]);
    expect(sides[0]).toBe(phone() ? '20px' : '36px');
  });
});

/** Drawings in notes (Excalidraw), C22-E80 to E87. */
const sheet = (page: Page) => page.getByRole('dialog', { name: /^Drawing \d+$/ });
const drawCanvas = (page: Page) => sheet(page).locator('canvas.excalidraw__canvas.interactive');
const drawingBlock = (page: Page, id: string) => page.locator(`.tp-nb-draw[data-drawing-id="${id}"]`);

async function noteNow(page: Page, id: string) {
  return (await (await page.request.get(`${API_URL}/api/notebook/notes/${id}`)).json()) as {
    html: string;
    drawings: Array<{
      id: string;
      rev: number;
      previewLight: string | null;
      previewDark: string | null;
      words: number;
    }>;
  };
}

async function drawingNow(page: Page, id: string) {
  const res = await page.request.get(`${API_URL}/api/notebook/drawings/${id}`);
  expect(res.status()).toBe(200);
  return (await res.json()) as {
    rev: number;
    scene: {
      elements: Array<{ type: string; text?: string; isDeleted?: boolean }>;
      files: Record<string, { attachmentId: string }>;
    };
  };
}

/** Open a seeded note, put the caret at the end of its words, press Draw: the sheet opens on the new drawing. */
async function startDrawing(page: Page, noteId: string, firstWords: string): Promise<string> {
  await page.goto(`/notebook/${noteId}`);
  await expect(words(page)).toContainText(firstWords);
  await words(page).click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.locator('.tp-nb-body').getByRole('button', { name: 'Draw', exact: true }).click();
  await expect(sheet(page)).toBeVisible();
  await expect(drawCanvas(page)).toBeVisible({ timeout: 15_000 });
  const id = (await sheet(page).getAttribute('data-drawing-sheet'))!;
  expect(id).toBeTruthy();
  await expect(drawingBlock(page, id)).toHaveCount(1);
  return id;
}

/** An empty spot on the canvas, clear of Excalidraw's own controls: the welcome menu in the middle, Help and the
 * zoom in the corners, the shape properties on the left, a phone's tools at the foot. Right of what drawSomething draws. */
/** The canvas's box once Excalidraw has sized it to the sheet (it can first read the window's size). */
async function canvasBox(page: Page) {
  let box: { x: number; y: number; width: number; height: number } | null = null;
  await expect
    .poll(async () => {
      const [b, wrap] = await Promise.all([
        drawCanvas(page).boundingBox(),
        sheet(page).locator('.excalidraw').first().boundingBox(),
      ]);
      box = b;
      return !!b && !!wrap && b.x >= wrap.x - 1 && b.x + b.width <= wrap.x + wrap.width + 1;
    })
    .toBe(true);
  return box!;
}

const awayFrom = (b: { x: number; y: number; width: number; height: number }) => ({
  x: b.x + b.width * 0.85,
  y: b.y + b.height * 0.3,
});

/** A rectangle (r, then drag) and a line of text (t, click, type), the way a person draws them. */
async function drawSomething(page: Page, text: string): Promise<void> {
  const b = await canvasBox(page);
  const away = awayFrom(b);
  await page.mouse.click(away.x, away.y);
  // Wider than a phone, the shape properties stand over the left of the canvas (about 215px) once a tool is on.
  const phoneTools = /excalidraw--mobile/.test(
    (await sheet(page).locator('.excalidraw').getAttribute('class')) ?? '',
  );
  const left = b.x + (phoneTools ? 40 : Math.max(b.width * 0.45, 240));
  const right = Math.min(left + 160, b.x + b.width * 0.75);
  // Each tool is on before the pointer goes down (a key Excalidraw hasn't taken yet draws nothing).
  await page.keyboard.press('r');
  await expect(sheet(page).getByTestId('toolbar-rectangle').first()).toBeChecked();
  await page.mouse.move(left, b.y + 120);
  await page.mouse.down();
  await page.mouse.move(right, b.y + 220, { steps: 6 });
  await page.mouse.up();
  await page.keyboard.press('t');
  await expect(sheet(page).getByTestId('toolbar-text').first()).toBeChecked();
  await page.mouse.click(left + 20, b.y + 280);
  await expect(sheet(page).locator('textarea.excalidraw-wysiwyg')).toBeVisible();
  await page.keyboard.type(text);
  // A click away keeps the text and goes back to selecting.
  await page.mouse.click(away.x, away.y);
  await expect(sheet(page).locator('textarea.excalidraw-wysiwyg')).toHaveCount(0);
}

async function done(page: Page): Promise<void> {
  await sheet(page).getByRole('button', { name: 'Done' }).click();
  await expect(sheet(page)).toBeHidden();
}

/** A small red PNG, made in the page, in a DataTransfer as a person's paste or drop carries it. */
const imageTransfer = (page: Page) =>
  page.evaluateHandle(async () => {
    const c = document.createElement('canvas');
    c.width = 40;
    c.height = 30;
    const g = c.getContext('2d')!;
    g.fillStyle = '#c33';
    g.fillRect(0, 0, 40, 30);
    const blob = await new Promise<Blob>((r) => c.toBlob((b) => r(b!), 'image/png'));
    const dt = new DataTransfer();
    dt.items.add(new File([blob], 'red.png', { type: 'image/png' }));
    return dt;
  });

/** The image went up as an attachment and the scene names it by id: no picture data in the scene itself. */
async function imageKept(page: Page, drawingId: string): Promise<void> {
  await expect
    .poll(
      async () => {
        // The drawing is made by its first save, a moment after the image lands: a 404 until then.
        const res = await page.request.get(`${API_URL}/api/notebook/drawings/${drawingId}`);
        if (res.status() !== 200) return res.status();
        return Object.values(((await res.json()) as { scene: { files: object } }).scene.files).length;
      },
      { timeout: 15_000 },
    )
    .toBe(1);
  const d = await drawingNow(page, drawingId);
  expect(JSON.stringify(d.scene)).not.toContain('dataURL');
  const att = Object.values(d.scene.files)[0]!.attachmentId;
  expect(att).toBeTruthy();
  expect(d.scene.elements.some((e) => e.type === 'image' && !e.isDeleted)).toBe(true);
  expect((await page.request.get(`${API_URL}/api/files/${att}`)).status()).toBe(200);
}

test.describe('notebook drawings', () => {
  test('C22-E80 Draw, a rectangle and a text, Done: the block shows a picture, the server has the scene, a reload shows it again', async ({
    page,
  }) => {
    test.skip(!desk(), 'desktop web');
    await signInFresh(page);
    const id = await seedNote(page, 'Offsite floor plan', { html: '<p>Rough layout</p>' });
    const did = await startDrawing(page, id, 'Rough layout');
    await expect(sheet(page)).toHaveAccessibleName('Drawing 1');
    await expect(sheet(page).locator('.tp-nb-sheet-where')).toHaveText('Offsite floor plan · Drawing 1');
    await drawSomething(page, 'tables in a U');
    await done(page);
    const img = drawingBlock(page, did).getByRole('img');
    await expect(img).toHaveAttribute('alt', /^Drawing, \d+ words?$/);
    await idle(page);
    const n = await noteNow(page, id);
    expect(n.html).toContain(`data-drawing="${did}"`);
    expect(n.drawings).toHaveLength(1);
    expect(n.drawings[0]).toMatchObject({ id: did });
    expect(n.drawings[0]!.previewLight).toBeTruthy();
    expect(n.drawings[0]!.previewDark).toBeTruthy();
    const d = await drawingNow(page, did);
    expect(
      d.scene.elements
        .filter((e) => !e.isDeleted)
        .map((e) => e.type)
        .sort(),
    ).toEqual(['rectangle', 'text']);
    expect(d.scene.elements.find((e) => e.type === 'text')?.text).toBe('tables in a U');
    await page.reload();
    await expect(img).toHaveAttribute('src', `${API_URL}/api/files/${n.drawings[0]!.previewLight}`);
    await expect
      .poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0))
      .toBe(true);
    // Opened again, the same scene.
    await img.click();
    await expect(drawCanvas(page)).toBeVisible({ timeout: 15_000 });
    await done(page);
    await idle(page);
    expect((await drawingNow(page, did)).scene.elements.filter((e) => !e.isDeleted)).toHaveLength(2);
  });

  test('C22-E81 an image pasted into a drawing uploads, stays after a reload, and the scene holds no picture data', async ({
    page,
  }) => {
    test.skip(!desk(), 'desktop web');
    await signInFresh(page);
    const id = await seedNote(page, 'Whiteboard photo', { html: '<p>From the session</p>' });
    const did = await startDrawing(page, id, 'From the session');
    // The pointer over the canvas and Excalidraw focused, as when you paste with the mouse over the drawing.
    const c = awayFrom(await canvasBox(page));
    await page.mouse.move(c.x, c.y);
    await sheet(page).locator('.excalidraw').focus();
    // Excalidraw takes a paste only with the focus inside it.
    await expect.poll(() => page.evaluate(() => !!document.activeElement?.closest('.excalidraw'))).toBe(true);
    // Excalidraw drops a paste unless the canvas is under the last pointer position it saw.
    await expect
      .poll(() => page.evaluate((p) => document.elementFromPoint(p.x, p.y)?.tagName, c))
      .toBe('CANVAS');
    const dt = await imageTransfer(page);
    await Promise.all([
      page.waitForResponse((r) => r.url().endsWith('/api/notebook/files') && r.request().method() === 'POST'),
      page.evaluate(
        ({ d, p }) => {
          // The pointer position goes in the same task as the paste, so nothing can move it in between.
          document.dispatchEvent(
            new PointerEvent('pointermove', { clientX: p.x, clientY: p.y, bubbles: true }),
          );
          document.dispatchEvent(
            new ClipboardEvent('paste', { clipboardData: d, bubbles: true, cancelable: true }),
          );
        },
        { d: dt, p: c },
      ),
    ]);
    await imageKept(page, did);
    await done(page);
    await idle(page);
    await page.reload();
    await expect(drawingBlock(page, did).getByRole('img')).toBeVisible();
    await imageKept(page, did);
  });

  test('C22-E82 an image file dropped into a drawing uploads and stays, the same as a paste', async ({
    page,
  }) => {
    test.skip(!desk(), 'desktop web');
    await signInFresh(page);
    const id = await seedNote(page, 'Venue map', { html: '<p>Mark the exits</p>' });
    const did = await startDrawing(page, id, 'Mark the exits');
    await canvasBox(page);
    const dt = await imageTransfer(page);
    await drawCanvas(page).evaluate((el, d) => {
      const r = el.getBoundingClientRect();
      const at = {
        clientX: r.left + r.width * 0.7,
        clientY: r.top + r.height * 0.3,
        bubbles: true,
        cancelable: true,
      };
      el.dispatchEvent(new DragEvent('dragover', { ...at, dataTransfer: d }));
      el.dispatchEvent(new DragEvent('drop', { ...at, dataTransfer: d }));
    }, dt);
    await imageKept(page, did);
    // Still in Tudu: the drop did not open the file in place of the app.
    await expect(page).toHaveURL(new RegExp(`/notebook/${id}`));
    await done(page);
    await idle(page);
    await page.reload();
    await imageKept(page, did);
  });

  test('C22-E83 Search finds a note by a word written only in its drawing', async ({ page }) => {
    test.skip(!desk(), 'desktop web');
    await signInFresh(page);
    const id = await seedNote(page, 'Seating plan', { html: '<p>Two rooms</p>' });
    await startDrawing(page, id, 'Two rooms');
    await drawSomething(page, 'quillbrook stage');
    await done(page);
    await idle(page);
    await openSearch(page);
    await box(page).fill('quillbrook');
    await expect(panel(page).getByRole('option', { name: /Seating plan/ })).toBeVisible();
  });

  test('C22-E84 ⋯ › Delete drawing and Undo bring the block back; a note to Trash and Put back keeps its drawing', async ({
    page,
  }) => {
    test.skip(!desk(), 'desktop web');
    await signInFresh(page);
    const id = await seedNote(page, 'Stand-up board', { html: '<p>Columns</p>' });
    const did = await startDrawing(page, id, 'Columns');
    await drawSomething(page, 'todo doing done');
    await done(page);
    await idle(page);
    const blk = drawingBlock(page, did);
    await blk.hover();
    await blk.getByRole('button', { name: 'Drawing options' }).click();
    await page.getByRole('menuitem', { name: 'Delete drawing' }).click();
    await expect(blk).toHaveCount(0);
    await expect(page.getByText('Drawing deleted.')).toBeVisible();
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(blk.getByRole('img')).toBeVisible();
    await idle(page);
    expect((await noteNow(page, id)).html).toContain(`data-drawing="${did}"`);

    await noteMenu(page, 'Delete');
    await page
      .getByRole('dialog', { name: 'Delete “Stand-up board”?' })
      .getByRole('button', { name: 'Delete' })
      .click();
    await idle(page);
    expect((await page.request.get(`${API_URL}/api/notebook/drawings/${did}`)).status()).toBe(404);
    await tree(page)
      .getByRole('button', { name: /^Trash/ })
      .click();
    const row = page.locator('.tp-nb-trrow').filter({ hasText: 'Stand-up board' });
    await row.hover();
    await row.getByRole('button', { name: 'Put back' }).click();
    await idle(page);
    expect((await drawingNow(page, did)).scene.elements.some((e) => e.text === 'todo doing done')).toBe(true);
    await page.goto(`/notebook/${id}`);
    await expect(blk.getByRole('img')).toBeVisible();
  });

  test('C22-E85 dark mode: the block shows its dark picture; the sheet is in Excalidraw’s dark theme', async ({
    page,
  }) => {
    test.skip(!desk(), 'desktop web');
    await page.emulateMedia({ colorScheme: 'dark' });
    await signInFresh(page);
    const id = await seedNote(page, 'Night shift', { html: '<p>Rota</p>' });
    const did = await startDrawing(page, id, 'Rota');
    await expect(sheet(page).locator('.excalidraw')).toHaveClass(/theme--dark/);
    await drawSomething(page, 'rota');
    await done(page);
    await idle(page);
    const n = await noteNow(page, id);
    await page.reload();
    const img = drawingBlock(page, did).getByRole('img');
    await expect(img).toHaveAttribute('src', `${API_URL}/api/files/${n.drawings[0]!.previewDark}`);
    await page.emulateMedia({ colorScheme: 'light' });
    await expect(img).toHaveAttribute('src', `${API_URL}/api/files/${n.drawings[0]!.previewLight}`);
    await img.click();
    await expect(sheet(page).locator('.excalidraw')).not.toHaveClass(/theme--dark/);
  });

  test('C22-E86 Excalidraw is not fetched until a drawing opens; its fonts come from /excalidraw/fonts/, never a CDN', async ({
    page,
  }) => {
    test.skip(!desk(), 'desktop web');
    const scripts: string[] = [];
    const fonts: string[] = [];
    const hosts = new Set<string>();
    page.on('request', (r) => {
      hosts.add(new URL(r.url()).host);
      if (r.resourceType() === 'script') scripts.push(r.url());
      if (r.resourceType() === 'font' || /\.woff2?(\?|$)/.test(r.url())) fonts.push(r.url());
    });
    await signInFresh(page);
    const id = await seedNote(page, 'Light page', { html: '<p>Only words here</p>' });
    await page.goto(`/notebook/${id}`);
    await expect(words(page)).toContainText('Only words here');
    await idle(page);
    const before = [...scripts];
    const holds = async (u: string) =>
      (await (await page.request.get(u)).text()).includes('excalidraw__canvas');
    for (const u of before) expect(await holds(u), u).toBe(false);
    await startDrawing(page, id, 'Only words here');
    await drawSomething(page, 'fonts please');
    const after = scripts.slice(before.length);
    expect((await Promise.all(after.map(holds))).some(Boolean)).toBe(true);
    const origin = new URL(page.url()).origin;
    const drawFonts = fonts.filter((u) =>
      /excalidraw|Excalifont|Virgil|Nunito|Cascadia|Lilita|Comic/i.test(u),
    );
    expect(drawFonts.length).toBeGreaterThan(0);
    for (const u of drawFonts) expect(u.startsWith(`${origin}/excalidraw/fonts/`), u).toBe(true);
    expect([...hosts].filter((h) => /unpkg|jsdelivr|esm\.sh|excalidraw\.com/.test(h))).toEqual([]);
  });

  test('C22-E88 the keys over a block: Backspace selects it then deletes it, Undo brings it back; ArrowLeft steps onto it and Enter opens it', async ({
    page,
  }) => {
    test.skip(!desk(), 'desktop web');
    await signInFresh(page);
    const id = await seedNote(page, 'Keys', {
      html: '<p>above</p><div data-drawing="k1"></div><p>below</p>',
    });
    await page.goto(`/notebook/${id}`);
    const blk = drawingBlock(page, 'k1');
    await expect(blk).toBeVisible();
    // ⌘← on a Mac, Ctrl+← elsewhere (a word back: the line is one word). Home doesn't move the caret on a Mac.
    const startOfBelow = async () => {
      // The editor takes the caret from the page's selectionchange a moment after each move, and puts its own back
      // on the page after a click: a person never types that fast, so the test waits that moment too.
      const settle = () =>
        page.evaluate(() => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 50))));
      await words(page).locator('p', { hasText: 'below' }).click();
      await settle();
      await page.keyboard.press('ControlOrMeta+ArrowLeft');
      await settle();
    };
    await startOfBelow();
    await page.keyboard.press('Backspace');
    await expect(blk).toHaveClass(/tp-sel/);
    await page.keyboard.press('Backspace');
    await expect(blk).toHaveCount(0);
    await page.keyboard.press('ControlOrMeta+z');
    await expect(blk).toBeVisible();
    await startOfBelow();
    await expect(blk).not.toHaveClass(/tp-sel/);
    await page.keyboard.press('ArrowLeft');
    await expect(blk).toHaveClass(/tp-sel/);
    await page.keyboard.press('Enter');
    await expect(sheet(page)).toBeVisible();
    await expect(words(page)).toContainText('above');
  });

  test('C22-E87 on a phone the drawing fills the screen with Excalidraw’s phone tools at the foot; Done returns to the note', async ({
    page,
  }) => {
    test.skip(!phone(), 'phones');
    await signInFresh(page);
    const id = await seedNote(page, 'Kitchen layout', { html: '<p>Measure first</p>' });
    const did = await startDrawing(page, id, 'Measure first');
    const vp = page.viewportSize()!;
    const s = (await sheet(page).boundingBox())!;
    expect([s.x, s.y, s.width, s.height].map(Math.round)).toEqual([0, 0, vp.width, vp.height]);
    await expect(sheet(page).locator('.excalidraw')).toHaveClass(/excalidraw--mobile/);
    const tools = (await sheet(page).locator('.App-bottom-bar').boundingBox())!;
    expect(tools.y + tools.height).toBeGreaterThan(vp.height - 80);
    await drawSomething(page, 'sink');
    await done(page);
    await expect(words(page)).toContainText('Measure first');
    await expect(drawingBlock(page, did).getByRole('img')).toBeVisible();
  });
});
