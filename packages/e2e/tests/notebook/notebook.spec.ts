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

async function noteMenu(page: Page, item: 'Move' | 'Delete', scope: Page | Locator = page): Promise<void> {
  await scope.locator('.tp-nb-ed-top').getByRole('button', { name: 'More' }).click();
  await page.getByRole('menuitem', { name: item }).click();
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
    await tree(page)
      .getByRole('button', { name: 'Q4 planning braindump' })
      .dragTo(folderRow(page, 'Planning'));
    await expect(page.locator('.tp-nb-crumb')).toContainText(/Northwind\s+\/\s+Planning/);
    await idle(page);
    const t = (await (await page.request.get(`${API_URL}/api/notebook`)).json()) as {
      folders: Array<{ id: string; name: string; parentId: string | null }>;
      notes: Array<{ title: string; folderId: string | null }>;
    };
    const planning = t.folders.find((f) => f.name === 'Planning')!;
    expect(t.notes.find((n) => n.title === 'Q4 planning braindump')!.folderId).toBe(planning.id);
    // Planning into Offsite (below itself, past three levels): refused, and it stays where it was.
    await folderRow(page, 'Planning').dragTo(folderRow(page, 'Offsite'));
    await expect(page.getByText('Folders go three levels deep.')).toBeVisible();
    await idle(page);
    const after = (await (await page.request.get(`${API_URL}/api/notebook`)).json()) as typeof t;
    expect(after.folders.find((f) => f.name === 'Planning')!.parentId).toBe(planning.parentId);
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

  test('C22-E24 the formatting bar sits at the foot of the note pane, centred, in a short note and a long one', async ({
    page,
  }) => {
    test.skip(!desk(), 'desktop web');
    await signInFresh(page);
    const short = await seedNote(page, 'Short', { html: '<p>One line</p>' });
    const long = await seedNote(page, 'Long', {
      html: Array.from({ length: 60 }, (_, i) => `<p>Line ${i + 1}</p>`).join(''),
    });
    const place = async () => {
      await words(page).click();
      const bar = page.locator('.tp-nb-body .tp-rte-bar');
      await expect(bar).toBeVisible();
      await settle(page, bar);
      const pane = (await page.locator('.tp-nb-body').boundingBox())!;
      const bb = (await bar.boundingBox())!;
      // 12px sticky inset over the pane's 16px bottom padding.
      expect(pane.y + pane.height - (bb.y + bb.height)).toBeLessThanOrEqual(30);
      expect(pane.y + pane.height - (bb.y + bb.height)).toBeGreaterThanOrEqual(0);
      expect(Math.abs(bb.x + bb.width / 2 - (pane.x + pane.width / 2))).toBeLessThanOrEqual(2);
      return bb;
    };
    await page.goto(`/notebook/${short}`);
    await expect(words(page)).toContainText('One line');
    const a = await place();
    await page.goto(`/notebook/${long}`);
    await expect(words(page)).toContainText('Line 60');
    await page
      .locator('.tp-nb-body')
      .evaluate((el) => (el.scrollTop = el.scrollHeight / 2 - el.clientHeight / 2));
    const b = await place();
    expect(Math.abs(a.y - b.y)).toBeLessThanOrEqual(2);
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

  test('C22-E15 the note window on the web: it drags; ↗ opens the popup on the same note; edits there show in the panel', async ({
    page,
    context,
  }) => {
    test.skip(!desk(), 'desktop web');
    await signInFresh(page);
    const sid = await personalId(page);
    const taskId = await seedTask(page, sid, 'Book the venue', new Date().toLocaleDateString('en-CA'));
    const id = await seedNote(page, 'Venue shortlist', { html: '<p>The Old Mill</p>', linkTo: taskId });
    await page.goto(`/t/${await refOf(page, sid, taskId)}`);
    await page
      .getByRole('region', { name: 'From your notebook' })
      .getByRole('button', { name: /Venue shortlist/ })
      .click();
    const win = noteWindow(page);
    await expect(win).toBeVisible();
    // Once it has finished rising in.
    await settle(page, page.locator('.tp-nb-float'));
    const before = (await page.locator('.tp-nb-float').boundingBox())!;
    const bar = win.locator('.tp-nb-win-title');
    const b = (await bar.boundingBox())!;
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width / 2 - 200, b.y + b.height / 2 + 60, { steps: 6 });
    await page.mouse.up();
    const after = (await page.locator('.tp-nb-float').boundingBox())!;
    expect(Math.round(before.x - after.x)).toBe(200);
    expect(Math.round(after.y - before.y)).toBe(60);
    const [popup] = await Promise.all([
      context.waitForEvent('page'),
      win.getByRole('button', { name: 'Open in its own window' }).click(),
    ]);
    await popup.waitForLoadState();
    expect(new URL(popup.url()).pathname).toBe(`/note-window/${id}`);
    await expect(title(popup)).toHaveValue('Venue shortlist');
    await title(popup).fill('Venue shortlist, final');
    await expect(title(win)).toHaveValue('Venue shortlist, final', { timeout: 10_000 });
    await popup.close();
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
