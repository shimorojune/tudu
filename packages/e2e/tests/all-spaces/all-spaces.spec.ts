import type { Browser, Locator, Page } from '@playwright/test';
import { API_URL, expect, signInFresh, test } from '../../fixtures/app';
import { backlogList, dragAcross, tileList } from '../../fixtures/week';
import { hit, hitTitles, openSearch, panel as searchPanel, search } from '../../fixtures/search';
import {
  createSpace,
  joinLink,
  me,
  openSwitcher,
  secondPerson,
  seedTasks,
  switchTo,
  switcher,
} from '../../fixtures/spaces';
import { dayList, drag, fixClock, idle, ring, row, rowsOf, SUNDAY, titlesOf } from '../../fixtures/today';

const phone = () => test.info().project.name === 'phone';
const tablet = () => test.info().project.name === 'tablet';
const SUN = '2026-10-18';
/** Seeds written before Wednesday's clock, so a move made on Wednesday wins. */
const EARLIER = '2026-10-13T09:00:00.000Z';

type Space = { id: string; slug: string; name: string };

/** A team space made through the API, with invites. */
async function makeSpace(page: Page, name: string, color: string, invites: string[] = []): Promise<Space> {
  const res = await page.request.post(`${API_URL}/api/spaces`, { data: { name, color, invites } });
  expect(res.status()).toBe(201);
  return ((await res.json()) as { space: Space }).space;
}

/** Join through the mailed link, by the API, as the page's person. */
async function joinByLink(page: Page, inviter: Page, email: string): Promise<void> {
  const token = (await joinLink(inviter, email)).split('/').pop()!;
  expect((await page.request.post(`${API_URL}/api/join/${token}`)).ok()).toBe(true);
}

/**
 * You (`page`) in Personal, Northwind (yours, Meera is in it) and Pilot Farm (Meera's, you are in it). Each space
 * has one task of yours on Sunday; Meera has a shared task and an "only me" task in Northwind. You end on Personal.
 */
async function world(page: Page, browser: Browser) {
  const aEmail = await signInFresh(page);
  const b = await secondPerson(browser);
  const nw = await makeSpace(page, 'Northwind', '#a0613d', [b.email]);
  await joinByLink(b.page, page, b.email);
  const pf = await makeSpace(b.page, 'Pilot Farm', '#3d5a80', [aEmail]);
  await joinByLink(page, b.page, aEmail);
  const mine = await me(page);
  const personal = mine.spaces.find((s) => s.kind === 'personal')! as Space;
  const nwMine = mine.spaces.find((s) => s.id === nw.id)! as Space;
  const pfMine = mine.spaces.find((s) => s.id === pf.id)! as Space;
  const ids = {
    ...(await seedTasks(page, personal.id, [{ title: 'Pay the electricity bill', day: SUN }])),
    ...(await seedTasks(page, nw.id, [{ title: 'Review the Northwind roadmap', day: SUN }])),
    ...(await seedTasks(page, pf.id, [{ title: 'Order seed for the north field', day: SUN }])),
  };
  const theirs = await seedTasks(b.page, nw.id, [
    { title: 'Meera’s shared launch checklist', day: SUN },
    { title: 'Meera’s private notes', day: SUN, visibility: 'me' },
  ]);
  return {
    aEmail,
    aId: mine.userId,
    bId: (await me(b.page)).userId,
    b,
    personal,
    nw: nwMine,
    pf: pfMine,
    ids: { ...ids, ...theirs },
  };
}

/** All spaces' Today, from the switcher's first row. */
async function goAll(page: Page): Promise<void> {
  const menu = await openSwitcher(page);
  await menu.getByRole('menuitemradio', { name: /All spaces/ }).click();
  await expect(page).toHaveURL(/\/all(\?|$)/);
  await expect(switcher(page)).toContainText('All spaces');
  await expect(menu).toHaveCount(0);
}

function allDay(page: Page): Locator {
  return dayList(page, 'Tasks for Sunday 18 October');
}

function pill(list: Locator, title: string, space: string): Locator {
  return row(list, title).getByRole('button', { name: `Space · ${space}. Show only ${space}` });
}

/** The panel for a task, opened from its row. */
async function openTask(page: Page, list: Locator, title: string): Promise<Locator> {
  await row(list, title).getByRole('button', { name: title }).click();
  const p = page.getByRole('dialog', { name: 'Task details' });
  await expect(p.getByRole('textbox', { name: 'Task title' })).toHaveValue(title);
  return p;
}

async function dayOf(page: Page, spaceId: string, day = SUN) {
  const res = await page.request.get(`${API_URL}/api/spaces/${spaceId}/days/${day}?today=${SUN}`);
  return ((await res.json()) as { tasks: Array<{ title: string; done: boolean; due: string | null }> }).tasks;
}

const ALL_SUNDAY = [
  'Pay the electricity bill',
  'Review the Northwind roadmap',
  'Order seed for the north field',
];

/**
 * How far the centre of the small space tile inside `el` sits above the baseline of the text beside it, in px.
 * A zero-size inline block after the tile's text line marks the baseline.
 */
async function tileLift(el: Locator): Promise<number> {
  return el.evaluate((root) => {
    const tile = root.querySelector('.tp-stile')!;
    const mark = document.createElement('i');
    mark.style.cssText = 'display:inline-block;width:0;height:0';
    tile.parentElement!.append(mark);
    const base = mark.getBoundingClientRect().top;
    mark.remove();
    const t = tile.getBoundingClientRect();
    return base - (t.top + t.bottom) / 2;
  });
}

/** Half Geist's cap height at 12.5px: where the tiles' centres should sit above the baseline. */
const LIFT = 12.5 * 0.355;

/** Filters All spaces to Personal, then to Northwind, and reads each chip's tile lift. */
async function chipLifts(page: Page) {
  await page.reload();
  await goAll(page);
  await expect.poll(() => titlesOf(allDay(page))).toEqual(ALL_SUNDAY);
  const lifts = { Personal: 0, Northwind: 0 };
  for (const [title, space] of [
    ['Pay the electricity bill', 'Personal'],
    ['Review the Northwind roadmap', 'Northwind'],
  ] as const) {
    await pill(allDay(page), title, space).click();
    const chip = page.locator('.tp-chip-space').filter({ hasText: space });
    await expect(chip).toBeVisible();
    lifts[space] = await tileLift(chip);
    await page.getByRole('button', { name: `Clear filter ${space}` }).click();
    await expect.poll(() => titlesOf(allDay(page))).toEqual(ALL_SUNDAY);
  }
  return lifts;
}

test.describe('all spaces', () => {
  test.beforeEach(async ({ page }) => {
    await fixClock(page);
  });

  test('C21-E01 All spaces Today gathers your tasks from Personal, Northwind and Pilot Farm, each with its pill, and the ring adds up', async ({
    page,
    browser,
  }) => {
    const w = await world(page, browser);
    await seedTasks(page, w.nw.id, [{ title: 'Send the Northwind invoice', day: SUN }]);
    await seedTasks(page, w.pf.id, [{ title: 'Fix the barn door', day: SUN }]);
    await page.reload();
    await goAll(page);
    await expect(page.getByRole('region', { name: 'The day, every space' })).toBeVisible();
    await expect
      .poll(() => titlesOf(allDay(page)))
      .toEqual([...ALL_SUNDAY.slice(0, 2), 'Send the Northwind invoice', ALL_SUNDAY[2], 'Fix the barn door']);
    for (const [title, space] of [
      ['Pay the electricity bill', 'Personal'],
      ['Review the Northwind roadmap', 'Northwind'],
      ['Order seed for the north field', 'Pilot Farm'],
    ] as const)
      await expect(pill(allDay(page), title, space)).toBeVisible();
    await row(allDay(page), 'Fix the barn door').getByRole('checkbox').click();
    await row(allDay(page), 'Pay the electricity bill').getByRole('checkbox').click();
    await expect(ring(page, '2 of 5 crossed off')).toBeVisible();
  });

  test('C21-E02 isolation: Meera’s tasks and her "only me" task never show; your "only me" task does; nothing from a space you are not in', async ({
    page,
    browser,
  }) => {
    const w = await world(page, browser);
    await seedTasks(page, w.nw.id, [{ title: 'My private Northwind note', day: SUN, visibility: 'me' }]);
    // A space of Meera's you are not in.
    const solo = await makeSpace(w.b.page, 'Meera solo', '#5b7f5e');
    await seedTasks(w.b.page, solo.id, [{ title: 'Meera’s solo task', day: SUN }]);
    await page.reload();
    await goAll(page);
    await expect.poll(() => titlesOf(allDay(page))).toContain('My private Northwind note');
    const titles = await titlesOf(allDay(page));
    expect(titles).not.toContain('Meera’s shared launch checklist');
    expect(titles).not.toContain('Meera’s private notes');
    expect(titles).not.toContain('Meera’s solo task');
  });

  test('C21-E03 pill filter: Northwind’s pill leaves only Northwind, the chip shows, the address keeps it through a reload, ✕ clears it', async ({
    page,
    browser,
  }) => {
    const w = await world(page, browser);
    await page.reload();
    await goAll(page);
    await expect.poll(() => titlesOf(allDay(page))).toEqual(ALL_SUNDAY);
    await pill(allDay(page), 'Review the Northwind roadmap', 'Northwind').click();
    await expect.poll(() => titlesOf(allDay(page))).toEqual(['Review the Northwind roadmap']);
    await expect(page).toHaveURL(new RegExp(`/all\\?space=${w.nw.slug}$`));
    const clear = page.getByRole('button', { name: 'Clear filter Northwind' });
    await expect(clear).toBeVisible();
    await expect(page.getByRole('button', { name: 'Write the next thing in Northwind…' })).toBeVisible();
    await page.reload();
    await expect.poll(() => titlesOf(allDay(page))).toEqual(['Review the Northwind roadmap']);
    await page.getByRole('button', { name: 'Clear filter Northwind' }).click();
    await expect.poll(() => titlesOf(allDay(page))).toEqual(ALL_SUNDAY);
    await expect(page).toHaveURL(/\/all$/);
  });

  test('C21-E04 own order: a Pilot Farm task dragged to the top stays there after a reload; Pilot Farm’s own Today keeps its order', async ({
    page,
    browser,
  }) => {
    test.skip(phone(), 'the phone reorders by long press, covered by the kit');
    const w = await world(page, browser);
    await seedTasks(page, w.pf.id, [{ title: 'Fix the barn door', day: SUN }]);
    await page.reload();
    await goAll(page);
    const list = allDay(page);
    await expect.poll(() => titlesOf(list)).toEqual([...ALL_SUNDAY, 'Fix the barn door']);
    const first = (await rowsOf(list).first().boundingBox())!;
    await drag(page, row(list, 'Fix the barn door'), { x: first.x + 120, y: first.y + 4 });
    await expect.poll(() => titlesOf(list)).toEqual(['Fix the barn door', ...ALL_SUNDAY]);
    await idle(page);
    await page.reload();
    await expect.poll(() => titlesOf(allDay(page))).toEqual(['Fix the barn door', ...ALL_SUNDAY]);
    expect((await dayOf(page, w.pf.id)).map((t) => t.title)).toEqual([
      'Order seed for the north field',
      'Fix the barn door',
    ]);
    await switchTo(page, 'Pilot Farm');
    await expect
      .poll(() => titlesOf(allDay(page)))
      .toEqual(['Order seed for the north field', 'Fix the barn door']);
  });

  test('C21-E05 wrong-space writes: cross off, rename and a due day on a Northwind task from All spaces land in Northwind, and Personal has none', async ({
    page,
    browser,
  }) => {
    const w = await world(page, browser);
    await seedTasks(page, w.nw.id, [{ title: 'Send the Northwind invoice', day: SUN }]);
    await page.reload();
    await goAll(page);
    await row(allDay(page), 'Send the Northwind invoice').getByRole('checkbox').click();
    const p = await openTask(page, allDay(page), 'Review the Northwind roadmap');
    const title = p.getByRole('textbox', { name: 'Task title' });
    await title.fill('Review the Northwind roadmap with Sam');
    await title.press('Enter');
    await p.getByRole('button', { name: 'Due', exact: true }).click();
    await p
      .locator('.tp-td-pop')
      .getByRole('button', { name: /^21 October/ })
      .click();
    await expect(p.getByRole('button', { name: 'Due', exact: true })).toHaveText(/Wed 21 Oct/);
    await idle(page);
    const nw = await dayOf(page, w.nw.id);
    expect(nw.find((t) => t.title === 'Send the Northwind invoice')?.done).toBe(true);
    expect(nw.find((t) => t.title === 'Review the Northwind roadmap with Sam')?.due).toBe('2026-10-21');
    expect((await dayOf(page, w.personal.id)).map((t) => [t.title, t.done, t.due])).toEqual([
      ['Pay the electricity bill', false, null],
    ]);
  });

  test('C21-E06 writing line: a task written in All spaces lands in Personal; filtered to Northwind it lands in Northwind; Quick Add says the same', async ({
    page,
    browser,
  }) => {
    const w = await world(page, browser);
    await page.reload();
    await goAll(page);
    await page.getByRole('button', { name: 'Write the next thing in Personal…' }).click();
    const field = page.getByRole('textbox', { name: 'New task' });
    await field.fill('Water the plants');
    await field.press('Enter');
    await expect(pill(allDay(page), 'Water the plants', 'Personal')).toBeVisible();
    await field.press('Escape');
    await pill(allDay(page), 'Review the Northwind roadmap', 'Northwind').click();
    await page.getByRole('button', { name: 'Write the next thing in Northwind…' }).click();
    await field.fill('Book the Northwind offsite');
    await field.press('Enter');
    await expect(pill(allDay(page), 'Book the Northwind offsite', 'Northwind')).toBeVisible();
    await field.press('Escape');
    await idle(page);
    expect((await dayOf(page, w.personal.id)).map((t) => t.title)).toContain('Water the plants');
    expect((await dayOf(page, w.nw.id)).map((t) => t.title)).toContain('Book the Northwind offsite');
    await page.getByRole('button', { name: 'Clear filter Northwind' }).click();
    await expect(page.getByRole('button', { name: 'Clear filter Northwind' })).toHaveCount(0);
    await expect.poll(() => titlesOf(allDay(page))).toHaveLength(5);
    // The top bar's button, or the phone's round one.
    await page.getByRole('button', { name: 'New task', exact: true }).last().click();
    // With more than one space Quick Add is called New task, and its top line says where the task goes.
    const bar = page.getByRole('dialog', { name: 'New task' });
    await expect(bar.getByRole('button', { name: /Personal/ }).first()).toBeVisible();
    await bar.getByRole('textbox', { name: 'Task title' }).fill('Call the plumber');
    await bar.getByRole('button', { name: /^Add( task)?$/ }).click();
    await expect(pill(allDay(page), 'Call the plumber', 'Personal')).toBeVisible();
  });

  test('C21-E07 week: a Northwind task dragged from Thursday into the middle of Friday is at Friday’s end in Northwind and where you dropped it in All spaces', async ({
    page,
    browser,
  }) => {
    test.skip(phone() || tablet(), 'the desk drags across tiles');
    await fixClock(page, new Date(2026, 9, 14, 10, 0));
    const w = await world(page, browser);
    await seedTasks(
      page,
      w.nw.id,
      [
        { title: 'Ship the release notes', day: '2026-10-15' },
        { title: 'Northwind standup notes', day: '2026-10-16' },
      ],
      EARLIER,
    );
    await seedTasks(page, w.personal.id, [{ title: 'Buy groceries', day: '2026-10-16' }], EARLIER);
    await page.reload();
    await goAll(page);
    await page
      .getByRole('button', { name: /^Week(,|$)/ })
      .first()
      .click();
    await expect(page.getByRole('region', { name: 'The week, every space' })).toBeVisible();
    const fri = tileList(page, 'Friday 16 October');
    await expect.poll(() => titlesOf(fri)).toEqual(['Buy groceries', 'Northwind standup notes']);
    // Dropped between Buy groceries and the standup notes.
    const second = (await rowsOf(fri).nth(1).boundingBox())!;
    await dragAcross(page, row(tileList(page, 'Thursday 15 October'), 'Ship the release notes'), {
      x: second.x + 120,
      y: second.y + 4,
    });
    await expect
      .poll(() => titlesOf(fri))
      .toEqual(['Buy groceries', 'Ship the release notes', 'Northwind standup notes']);
    await idle(page);
    expect((await dayOf(page, w.nw.id, '2026-10-16')).map((t) => t.title)).toEqual([
      'Northwind standup notes',
      'Ship the release notes',
    ]);
    await page.reload();
    await expect
      .poll(() => titlesOf(tileList(page, 'Friday 16 October')))
      .toEqual(['Buy groceries', 'Ship the release notes', 'Northwind standup notes']);
  });

  test('C21-E08 Backlog: the space filter lists All spaces and each space; Pilot Farm narrows the list and the count, and the done view too', async ({
    page,
    browser,
  }) => {
    const w = await world(page, browser);
    await seedTasks(page, w.personal.id, [{ title: 'Sort the attic', day: null }]);
    const pf = await seedTasks(page, w.pf.id, [
      { title: 'Paint the fence', day: null },
      { title: 'Mend the gate', day: null },
    ]);
    await seedTasks(page, w.nw.id, [{ title: 'Draft the Q4 plan', day: null }]);
    await page.request.post(`${API_URL}/api/sync`, {
      data: {
        clientId: 'seed',
        mutations: [
          {
            id: crypto.randomUUID(),
            type: 'task.cross',
            payload: { id: pf['Mend the gate'], done: true },
            at: new Date(SUNDAY.getTime() + 5000).toISOString(),
          },
        ],
      },
    });
    await page.reload();
    await goAll(page);
    const more = page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'More' });
    if (await more.count()) {
      await more.click();
      await page.getByRole('button', { name: /^Backlog/ }).click();
    } else
      await page
        .getByRole('button', { name: /^Backlog(,|$)/ })
        .first()
        .click();
    const sheet = page.getByRole('region', { name: 'The Backlog, every space' });
    await expect(sheet).toBeVisible();
    await expect(sheet.locator('.tp-dh-date')).toHaveText('3 tasks in every space');
    await expect
      .poll(() => titlesOf(backlogList(page)))
      .toEqual(['Sort the attic', 'Draft the Q4 plan', 'Paint the fence']);
    await sheet.getByRole('button', { name: 'Space: all spaces' }).click();
    const menu = page.getByRole('menu');
    await expect(menu.getByRole('menuitem')).toHaveText([
      /All spaces\s*3/,
      /Personal\s*1/,
      /Northwind\s*1/,
      /Pilot Farm\s*1/,
    ]);
    await menu.getByRole('menuitem', { name: /Pilot Farm/ }).click();
    await expect.poll(() => titlesOf(backlogList(page))).toEqual(['Paint the fence']);
    await expect(sheet.locator('.tp-dh-date')).toHaveText('1 task in Pilot Farm');
    await sheet.getByRole('group', { name: 'View' }).getByRole('button', { name: 'Crossed off' }).click();
    await expect
      .poll(() =>
        titlesOf(page.getByRole('list', { name: 'Crossed off in the Backlog', includeHidden: true })),
      )
      .toEqual(['Mend the gate']);
  });

  test('C21-E09 live: a task Meera asks of you in Northwind shows once you take it, without a reload; your second tab sees your reorder', async ({
    page,
    browser,
    context,
  }) => {
    test.skip(phone(), 'the desk covers the live path');
    const w = await world(page, browser);
    await page.reload();
    await goAll(page);
    await expect.poll(() => titlesOf(allDay(page))).toEqual(ALL_SUNDAY);
    const requestId = crypto.randomUUID();
    const send = await w.b.page.request.post(`${API_URL}/api/sync`, {
      data: {
        clientId: 'seed',
        mutations: [
          {
            id: crypto.randomUUID(),
            type: 'request.send',
            payload: {
              id: requestId,
              spaceId: w.nw.id,
              toId: w.aId,
              title: 'Check the Northwind contract',
              askedDay: SUN,
            },
            at: new Date().toISOString(),
          },
        ],
      },
    });
    expect(send.status()).toBe(200);
    const take = await page.request.post(`${API_URL}/api/sync`, {
      data: {
        clientId: 'seed',
        mutations: [
          {
            id: crypto.randomUUID(),
            type: 'request.accept',
            payload: { id: requestId, taskId: crypto.randomUUID(), day: SUN },
            at: new Date().toISOString(),
          },
        ],
      },
    });
    expect(take.status()).toBe(200);
    await expect.poll(() => titlesOf(allDay(page))).toContain('Check the Northwind contract');
    // Your second tab, on All spaces too, hears your reorder.
    const two = await context.newPage();
    await fixClock(two);
    await two.goto('/all');
    // A day you never arranged reads in the switcher's order, then each space's own: the new task sits with Northwind.
    const before = [...ALL_SUNDAY.slice(0, 2), 'Check the Northwind contract', ALL_SUNDAY[2]];
    await expect.poll(() => titlesOf(allDay(page))).toEqual(before);
    await expect.poll(() => titlesOf(allDay(two))).toEqual(before);
    const first = (await rowsOf(allDay(page)).first().boundingBox())!;
    await drag(page, row(allDay(page), 'Order seed for the north field'), {
      x: first.x + 120,
      y: first.y + 4,
    });
    await expect
      .poll(() => titlesOf(allDay(two)))
      .toEqual([
        'Order seed for the north field',
        'Pay the electricity bill',
        'Review the Northwind roadmap',
        'Check the Northwind contract',
      ]);
  });

  test('C21-E10 removed while looking: Meera removes you from Pilot Farm; its rows leave live with the notice, the filter resets, and re-adding shows no stale rows', async ({
    page,
    browser,
  }) => {
    const w = await world(page, browser);
    await page.reload();
    await goAll(page);
    await pill(allDay(page), 'Order seed for the north field', 'Pilot Farm').click();
    await expect.poll(() => titlesOf(allDay(page))).toEqual(['Order seed for the north field']);
    expect(
      (await w.b.page.request.delete(`${API_URL}/api/spaces/${w.pf.id}/members/${w.aId}`)).status(),
    ).toBe(204);
    await expect(page.getByText('You’re no longer in Pilot Farm.')).toBeVisible();
    await expect(page).toHaveURL(/\/all$/);
    await expect.poll(() => titlesOf(allDay(page))).toEqual(ALL_SUNDAY.slice(0, 2));
    // Meera adds you back: Pilot Farm returns, read fresh.
    const res = await w.b.page.request.post(`${API_URL}/api/spaces/${w.pf.id}/members/${w.aId}/restore`);
    expect(res.status()).toBe(200);
    await page.reload();
    await expect.poll(() => titlesOf(allDay(page))).toEqual(ALL_SUNDAY);
  });

  test('C21-E11 a space deleted while filtered to it: the list falls back to every space and the switcher no longer lists it', async ({
    page,
    browser,
  }) => {
    const w = await world(page, browser);
    await page.reload();
    await goAll(page);
    await pill(allDay(page), 'Order seed for the north field', 'Pilot Farm').click();
    await expect.poll(() => titlesOf(allDay(page))).toEqual(['Order seed for the north field']);
    expect((await w.b.page.request.delete(`${API_URL}/api/spaces/${w.pf.id}`)).status()).toBe(204);
    await expect(page).toHaveURL(/\/all$/);
    await expect.poll(() => titlesOf(allDay(page))).toEqual(ALL_SUNDAY.slice(0, 2));
    const menu = await openSwitcher(page);
    await expect(menu.getByRole('menuitemradio')).toHaveCount(3);
    await expect(menu.getByRole('menuitemradio', { name: /Pilot Farm/ })).toHaveCount(0);
  });

  test('C21-E12 one space failing: the banner names Pilot Farm, the other rows show, and Try again fills it in', async ({
    page,
    browser,
  }) => {
    const w = await world(page, browser);
    await page.reload();
    await expect(switcher(page)).toContainText('Personal');
    let fail = true;
    await page.route(`**/api/spaces/${w.pf.id}/days/**`, (route) =>
      fail ? route.fulfill({ status: 500, body: '{"error":"down"}' }) : route.continue(),
    );
    await goAll(page);
    await expect(page.getByText('Pilot Farm didn’t load.')).toBeVisible({ timeout: 15_000 });
    await expect.poll(() => titlesOf(allDay(page))).toEqual(ALL_SUNDAY.slice(0, 2));
    fail = false;
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect.poll(() => titlesOf(allDay(page))).toEqual(ALL_SUNDAY);
    await expect(page.getByText('Pilot Farm didn’t load.')).toHaveCount(0);
  });

  test('C21-E13 panel: the Space fact reads Northwind and opens the task in Northwind; the project picker lists Northwind’s projects only', async ({
    page,
    browser,
  }) => {
    const w = await world(page, browser);
    await page.request.post(`${API_URL}/api/sync`, {
      data: {
        clientId: 'seed',
        mutations: [
          {
            id: crypto.randomUUID(),
            type: 'project.create',
            payload: { id: crypto.randomUUID(), spaceId: w.nw.id, name: 'Roadmap' },
            at: new Date().toISOString(),
          },
          {
            id: crypto.randomUUID(),
            type: 'project.create',
            payload: { id: crypto.randomUUID(), spaceId: w.personal.id, name: 'Home' },
            at: new Date().toISOString(),
          },
        ],
      },
    });
    await page.reload();
    await goAll(page);
    const p = await openTask(page, allDay(page), 'Review the Northwind roadmap');
    const fact = p.getByRole('button', { name: 'Space: Northwind. Open in Northwind' });
    await expect(fact).toBeVisible();
    await p.getByRole('button', { name: 'Project', exact: true }).click();
    const pop = p.locator('.tp-td-pop');
    await expect(pop.getByText('Roadmap')).toBeVisible();
    await expect(pop.getByText('Home', { exact: true })).toHaveCount(0);
    await page.keyboard.press('Escape');
    await fact.click();
    await expect(page).toHaveURL(new RegExp(`/${w.nw.slug}\\?task=NW-1$`));
    await expect(switcher(page)).toContainText('Northwind');
  });

  test('C21-E14 switcher: no All spaces row with one space; it appears once you join a second', async ({
    page,
  }) => {
    await signInFresh(page);
    let menu = await openSwitcher(page);
    await expect(menu.getByRole('menuitemradio')).toHaveCount(1);
    await expect(menu.getByRole('menuitemradio', { name: /All spaces/ })).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    await createSpace(page, 'Northwind');
    menu = await openSwitcher(page);
    await expect(menu.getByRole('menuitemradio').first()).toContainText('All spaces');
    await menu.getByRole('menuitemradio', { name: /All spaces/ }).click();
    await expect(page).toHaveURL(/\/all$/);
    await expect(page.getByRole('region', { name: 'The day, every space' })).toBeVisible();
  });

  test('C21-E15 slug: a space named "All" lives at /all-2 or the next free one, and /all is still All spaces', async ({
    page,
  }) => {
    await signInFresh(page);
    const slug = await createSpace(page, 'All');
    // Slugs are shared by every space, so another run's "All" may hold all-2.
    expect(slug).toMatch(/^all-\d+$/);
    await page.goto('/all');
    await expect(switcher(page)).toContainText('All spaces');
    await expect(page.getByRole('region', { name: 'The day, every space' })).toBeVisible();
    await page.goto(`/${slug}`);
    await expect(switcher(page)).toContainText('All');
    await expect(page.getByRole('region', { name: 'The day', exact: true })).toBeVisible();
  });

  test('C21-E16 phone: the switcher row, tile-only pills, the chip and the writing line; tapping a pill filters', async ({
    page,
    browser,
  }) => {
    test.skip(!phone(), 'the phone’s own layout');
    const w = await world(page, browser);
    await page.reload();
    await goAll(page);
    const p = pill(allDay(page), 'Review the Northwind roadmap', 'Northwind');
    await expect(p).toHaveClass(/tp-sg-bare/);
    await expect(p).not.toContainText('Northwind');
    await p.click();
    await expect.poll(() => titlesOf(allDay(page))).toEqual(['Review the Northwind roadmap']);
    await expect(page.getByRole('button', { name: 'Clear filter Northwind' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Write the next thing in Northwind…' })).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`space=${w.nw.slug}`));
  });

  test('C21-E17 dark: the list in the dark theme, the All spaces tile cream', async ({ page, browser }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await world(page, browser);
    await page.reload();
    await goAll(page);
    await expect(page.locator('html')).toHaveClass(/dark/);
    await expect.poll(() => titlesOf(allDay(page))).toEqual(ALL_SUNDAY);
    const tileBg = await switcher(page)
      .locator('.tp-stile-all')
      .first()
      .evaluate((el) => getComputedStyle(el).backgroundColor);
    // Cream: the dark theme's foreground, the tile's ink-on-paper flipped.
    const cream = await page.evaluate(() => {
      const probe = document.createElement('div');
      probe.style.color = 'var(--foreground)';
      document.body.append(probe);
      const c = getComputedStyle(probe).color;
      probe.remove();
      return c;
    });
    expect(tileBg).toBe(cream);
  });

  test('C21-E18 requests: one day read per space and one places read on opening All spaces Today; Northwind’s Today after it reads no day again', async ({
    page,
    browser,
  }) => {
    const w = await world(page, browser);
    await page.goto('/me');
    await expect(switcher(page)).toContainText('Personal');
    await expect.poll(() => titlesOf(allDay(page))).toEqual(['Pay the electricity bill']);
    const seen: string[] = [];
    page.on('request', (r) => {
      const u = new URL(r.url());
      if (/\/days\/|\/all-spaces\/places/.test(u.pathname)) seen.push(u.pathname);
    });
    await goAll(page);
    await expect.poll(() => titlesOf(allDay(page))).toEqual(ALL_SUNDAY);
    await idle(page);
    const days = seen.filter((p) => p.endsWith(`/days/${SUN}`));
    expect(days.filter((p) => p.includes(w.nw.id))).toHaveLength(1);
    expect(days.filter((p) => p.includes(w.pf.id))).toHaveLength(1);
    expect(days.filter((p) => p.includes(w.personal.id)).length).toBeLessThanOrEqual(1);
    expect(seen.filter((p) => p.endsWith('/all-spaces/places'))).toHaveLength(1);
    seen.length = 0;
    await switchTo(page, 'Northwind');
    await expect.poll(() => titlesOf(allDay(page))).toContain('Review the Northwind roadmap');
    await idle(page);
    expect(seen.filter((p) => p.includes(`${w.nw.id}/days/${SUN}`))).toHaveLength(0);
  });

  test('C21-E19 search from Northwind’s Today finds a Personal task and Meera’s shared Pilot Farm task, each labelled; one opens in its own space', async ({
    page,
    browser,
  }) => {
    const w = await world(page, browser);
    await seedTasks(w.b.page, w.pf.id, [{ title: 'Seed order for the tractor', day: SUN }]);
    await page.goto(`/${w.nw.slug}`);
    await expect(switcher(page)).toContainText('Northwind');
    await openSearch(page);
    await search(page, 'seed');
    await expect
      .poll(() => hitTitles(page))
      .toEqual(expect.arrayContaining(['Order seed for the north field', 'Seed order for the tractor']));
    await expect(hit(page, 'Seed order for the tractor')).toContainText('Pilot Farm');
    await search(page, 'electricity');
    await expect.poll(() => hitTitles(page)).toEqual(['Pay the electricity bill']);
    await expect(hit(page, 'Pay the electricity bill')).toContainText('Personal');
    await hit(page, 'Pay the electricity bill').click();
    await expect(searchPanel(page)).toHaveCount(0);
    await expect(page).toHaveURL(/\/me(\?|$)/);
    await expect(switcher(page)).toContainText('Personal');
  });

  test('C21-E20 search never shows Meera’s "only me" task, and after Meera removes you from Pilot Farm its tasks drop out', async ({
    page,
    browser,
  }) => {
    const w = await world(page, browser);
    await page.reload();
    await openSearch(page);
    await search(page, 'Meera');
    await expect.poll(() => hitTitles(page)).toEqual(['Meera’s shared launch checklist']);
    await search(page, 'north field');
    await expect.poll(() => hitTitles(page)).toEqual(['Order seed for the north field']);
    await page.keyboard.press('Escape');
    expect(
      (await w.b.page.request.delete(`${API_URL}/api/spaces/${w.pf.id}/members/${w.aId}`)).status(),
    ).toBe(204);
    await page.reload();
    await openSearch(page);
    await search(page, 'north field');
    await expect(searchPanel(page).getByRole('listbox', { name: 'Matching tasks' })).toHaveAttribute(
      'data-answer',
      'north field',
    );
    expect(await hitTitles(page)).toEqual([]);
  });

  test('C21-E21 search from All spaces labels every hit; Recently opened lists tasks from two spaces', async ({
    page,
    browser,
  }) => {
    await world(page, browser);
    await page.reload();
    await goAll(page);
    await openSearch(page);
    await search(page, 'the');
    await expect.poll(async () => (await hitTitles(page)).length).toBeGreaterThanOrEqual(3);
    await expect(hit(page, 'Pay the electricity bill')).toContainText('Personal');
    await expect(hit(page, 'Review the Northwind roadmap')).toContainText('Northwind');
    await expect(hit(page, 'Order seed for the north field')).toContainText('Pilot Farm');
    await hit(page, 'Pay the electricity bill').click();
    await expect(searchPanel(page)).toHaveCount(0);
    await goAll(page);
    await openSearch(page);
    await search(page, 'roadmap');
    await hit(page, 'Review the Northwind roadmap').click();
    await expect(searchPanel(page)).toHaveCount(0);
    await openSearch(page);
    await searchPanel(page).getByRole('combobox', { name: 'Search tasks' }).fill('');
    const recent = searchPanel(page).getByRole('option', {
      name: /^(Review the Northwind roadmap|Pay the electricity bill),/,
    });
    await expect(recent).toHaveCount(2);
  });

  test('STB-E01 chip: the Personal tile hangs off the label baseline like a team space’s tile', async ({
    page,
    browser,
  }) => {
    await world(page, browser);
    const lifts = await chipLifts(page);
    expect(Math.abs(lifts.Personal - LIFT)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(lifts.Personal - lifts.Northwind)).toBeLessThanOrEqual(0.25);
  });

  test('STB-E02 byline: Personal and team rows put their space tiles at the same height against the name', async ({
    page,
    browser,
  }) => {
    test.skip(phone(), 'phones show the tile only, with no name beside it');
    await world(page, browser);
    await page.reload();
    await goAll(page);
    await expect.poll(() => titlesOf(allDay(page))).toEqual(ALL_SUNDAY);
    const personal = await tileLift(pill(allDay(page), 'Pay the electricity bill', 'Personal'));
    const team = await tileLift(pill(allDay(page), 'Review the Northwind roadmap', 'Northwind'));
    expect(Math.abs(personal - LIFT)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(personal - team)).toBeLessThanOrEqual(0.25);
  });

  test('STB-E03 dark: the chip tiles line up the same in the dark theme', async ({ page, browser }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await world(page, browser);
    const lifts = await chipLifts(page);
    await expect(page.locator('html')).toHaveClass(/dark/);
    expect(Math.abs(lifts.Personal - LIFT)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(lifts.Personal - lifts.Northwind)).toBeLessThanOrEqual(0.25);
  });
});
