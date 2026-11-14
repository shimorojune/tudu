import type { Page } from '@playwright/test';
import { expect, signInFresh, test } from '../../fixtures/app';
import {
  group,
  groupHeader,
  groupNames,
  groupTitles,
  orderBy,
  orderSwitch,
  seedProjects,
  serverList,
  type SeedRow,
} from '../../fixtures/groups';
import { menu, pick, rightClick } from '../../fixtures/rowMenu';
import {
  backlogBeside,
  dayList,
  drag,
  fixClock,
  idle,
  ring,
  row,
  rowsOf,
  titlesOf,
  twoDays,
} from '../../fixtures/today';

const SUN = '2026-10-18';
const MON = '2026-10-19';
/** Sunday in the order it was planned: two projects woven together, and one task with none. */
const DAY: SeedRow[] = [
  { title: 'Send the invoice', day: SUN, project: 'Northwind' },
  { title: 'Rotate the keys', day: SUN, project: 'Platform' },
  { title: 'Book the room', day: SUN, project: 'Northwind' },
  { title: 'Water the plants', day: SUN },
  { title: 'Fix the flaky test', day: SUN, project: 'Platform' },
];
const MINE = DAY.map((r) => r.title);

const desktop = () => ['desktop', 'webkit'].includes(test.info().project.name);
const phone = () => test.info().project.name === 'phone';

/** Sign in, seed, reload: Sunday shows the seeded day. */
async function seeded(page: Page, rows: SeedRow[] = DAY) {
  await signInFresh(page);
  const made = await seedProjects(page, rows);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Sunday' })).toBeVisible();
  return made;
}

test.describe('today, by project', () => {
  test.beforeEach(async ({ page }) => {
    await fixClock(page);
  });

  test('C02-E26 My order | By project: groups in project order with what’s left, No project last; survives a reload; My order is as it was', async ({
    page,
  }) => {
    const made = await seeded(page);
    await expect.poll(() => titlesOf(dayList(page))).toEqual(MINE);
    await expect(orderSwitch(page)).toBeVisible();
    await expect(orderSwitch(page).getByRole('button', { name: 'My order' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.locator('section.tp-g')).toHaveCount(0);

    await orderBy(page, 'By project');
    await expect.poll(() => groupNames(page)).toEqual([...made.order, 'No project']);
    // inside a group the day's own order is kept
    expect(await groupTitles(page, 'Northwind')).toEqual(['Send the invoice', 'Book the room']);
    expect(await groupTitles(page, 'Platform')).toEqual(['Rotate the keys', 'Fix the flaky test']);
    expect(await groupTitles(page, 'No project')).toEqual(['Water the plants']);
    await expect(groupHeader(page, 'Northwind')).toHaveAccessibleName('Northwind, 2 left');
    await expect(group(page, 'Northwind').locator('.tp-gh-n')).toHaveText('2');
    await expect(groupHeader(page, 'No project')).toHaveAccessibleName('No project, 1 left');

    // a project done for the day wears a tick; the ring counts the whole day
    await page.getByRole('checkbox', { name: 'Cross off: Water the plants' }).click();
    await expect(groupHeader(page, 'No project')).toHaveAccessibleName('No project, all crossed off');
    await expect(group(page, 'No project').locator('.tp-gh-tick')).toBeVisible();
    await expect(ring(page, '1 of 5 crossed off')).toBeVisible();
    await idle(page);

    await page.reload();
    await expect.poll(() => groupNames(page)).toEqual([...made.order, 'No project']);
    await orderBy(page, 'My order');
    await expect.poll(() => titlesOf(dayList(page))).toEqual(MINE);
  });

  test('C02-E27 fold a project from its header: it stays folded across days and a reload, and the ring still counts it', async ({
    page,
  }) => {
    await seeded(page, [
      ...DAY,
      { title: 'Chase the PO', day: MON, project: 'Northwind' },
      { title: 'Pack', day: MON },
    ]);
    await orderBy(page, 'By project');
    const north = groupHeader(page, 'Northwind');
    await expect(north).toHaveAttribute('aria-expanded', 'true');
    await north.click();
    await expect(north).toHaveAttribute('aria-expanded', 'false');
    await expect(group(page, 'Northwind').locator('.tp-g-body')).toHaveAttribute('inert', '');
    await expect(row(group(page, 'Northwind'), 'Send the invoice')).toBeHidden();
    // still one line with its count
    await expect(group(page, 'Northwind').locator('.tp-gh-n')).toHaveText('2');
    await expect(ring(page, '0 of 5 crossed off')).toBeVisible();

    await page.getByRole('button', { name: 'Next day' }).click();
    await expect(page.getByRole('heading', { name: 'Monday' })).toBeVisible();
    await expect(groupHeader(page, 'Northwind')).toHaveAttribute('aria-expanded', 'false');
    await expect(row(group(page, 'Northwind'), 'Chase the PO')).toBeHidden();
    await page.getByRole('button', { name: 'Previous day' }).click();
    await expect(page.getByRole('heading', { name: 'Sunday' })).toBeVisible();

    await page.reload();
    await expect(groupHeader(page, 'Northwind')).toHaveAttribute('aria-expanded', 'false');
    await groupHeader(page, 'Northwind').click();
    await expect(row(group(page, 'Northwind'), 'Send the invoice')).toBeVisible();
  });

  test('C02-E28 "+" on a header: the cursor is in the project’s own line; the task is saved in that project, last in its group', async ({
    page,
  }) => {
    const made = await seeded(page);
    await orderBy(page, 'By project');
    const plat = group(page, 'Platform');
    await plat.locator('.tp-gh').hover();
    await plat.getByRole('button', { name: 'Add a task to Platform' }).click();
    const line = plat.getByRole('textbox', { name: 'New task' });
    await expect(line).toBeFocused();
    await expect(line).toHaveAttribute('placeholder', 'Add to Platform…');
    await line.fill('Renew the certificate');
    await line.press('Enter');
    await expect(line).toBeFocused();
    await line.press('Escape');
    await expect
      .poll(() => groupTitles(page, 'Platform'))
      .toEqual(['Rotate the keys', 'Fix the flaky test', 'Renew the certificate']);
    await idle(page);
    const server = await serverList(page, made.spaceId, SUN);
    expect(server.find((t) => t.title === 'Renew the certificate')!.projectId).toBe(made.projects.Platform);
    // in My order it sits right after the project's last task
    expect(server.map((t) => t.title)).toEqual([...MINE, 'Renew the certificate']);

    // a folded group opens for its "+"
    await groupHeader(page, 'Northwind').click();
    await expect(groupHeader(page, 'Northwind')).toHaveAttribute('aria-expanded', 'false');
    await group(page, 'Northwind').locator('.tp-gh').hover();
    await group(page, 'Northwind').getByRole('button', { name: 'Add a task to Northwind' }).click();
    await expect(groupHeader(page, 'Northwind')).toHaveAttribute('aria-expanded', 'true');
    const nline = group(page, 'Northwind').getByRole('textbox', { name: 'New task' });
    await expect(nline).toBeFocused();
    await nline.fill('Chase the PO');
    await nline.press('Enter');
    await nline.press('Escape');
    await idle(page);
    // after Book the room (Northwind's last), before Water the plants
    expect((await serverList(page, made.spaceId, SUN)).map((t) => t.title)).toEqual([
      'Send the invoice',
      'Rotate the keys',
      'Book the room',
      'Chase the PO',
      'Water the plants',
      'Fix the flaky test',
      'Renew the certificate',
    ]);
  });

  test('C02-E29 reorder inside a group: only that task moves in My order, and the server agrees', async ({
    page,
  }) => {
    const made = await seeded(page);
    await orderBy(page, 'By project');
    const moved = row(group(page, 'Platform'), 'Fix the flaky test');
    await moved.getByRole('checkbox').focus();
    await page.keyboard.press('Alt+ArrowUp');
    await expect.poll(() => groupTitles(page, 'Platform')).toEqual(['Fix the flaky test', 'Rotate the keys']);
    // the first row of a group never crosses into the project above
    await page.keyboard.press('Alt+ArrowUp');
    await expect.poll(() => groupTitles(page, 'Platform')).toEqual(['Fix the flaky test', 'Rotate the keys']);
    expect(await groupTitles(page, 'Northwind')).toEqual(['Send the invoice', 'Book the room']);
    await idle(page);
    const want = [
      'Send the invoice',
      'Fix the flaky test',
      'Rotate the keys',
      'Book the room',
      'Water the plants',
    ];
    expect((await serverList(page, made.spaceId, SUN)).map((t) => t.title)).toEqual(want);
    await orderBy(page, 'My order');
    await expect.poll(() => titlesOf(dayList(page))).toEqual(want);
  });

  test('C02-E30 one project only: no switch and the plain list; a second group brings the switch, and the choice was kept', async ({
    page,
  }) => {
    await seeded(
      page,
      DAY.filter((r) => r.project === 'Northwind'),
    );
    await expect.poll(() => titlesOf(dayList(page))).toEqual(['Send the invoice', 'Book the room']);
    await expect(orderSwitch(page)).toHaveCount(0);
    // a task with no project is a second group
    await page.getByRole('button', { name: 'Write the next thing…' }).click();
    const field = page.getByRole('textbox', { name: 'New task' });
    await field.fill('Water the plants');
    await field.press('Enter');
    await field.press('Escape');
    await expect(orderSwitch(page)).toBeVisible();
    await orderBy(page, 'By project');
    await expect.poll(() => groupNames(page)).toEqual(['Northwind', 'No project']);
    // down to one group again: the plain list, no switch; grouping is still chosen
    await page.getByRole('checkbox', { name: 'Cross off: Water the plants' }).click();
    await idle(page);
    await page.getByRole('button', { name: 'Next day' }).click();
    await expect(page.getByRole('heading', { name: 'Monday' })).toBeVisible();
    await expect(orderSwitch(page)).toHaveCount(0);
    await page.getByRole('button', { name: 'Previous day' }).click();
    await expect.poll(() => groupNames(page)).toEqual(['Northwind', 'No project']);
  });

  test('C02-E31 two days: the switch takes its own line, a fold applies to both pages, and a row cannot be dropped on the other page', async ({
    page,
  }) => {
    test.skip(!desktop(), 'two days side by side is the desk’s');
    const made = await seeded(page, [
      ...DAY,
      { title: 'Chase the PO', day: MON, project: 'Northwind' },
      { title: 'Pack', day: MON },
    ]);
    await orderBy(page, 'By project');
    const second = await twoDays(page);
    const first = page.getByRole('region', { name: /^Sunday|^Today/ }).first();
    await expect.poll(() => groupNames(second)).toEqual(['Northwind', 'No project']);
    // too narrow for the title's line: the switch sits under the title
    const sw = (await orderSwitch(page).boundingBox())!;
    const title = (await page.getByRole('heading', { name: 'Sunday' }).boundingBox())!;
    expect(sw.y).toBeGreaterThanOrEqual(title.y + title.height - 1);

    await groupHeader(second, 'Northwind').click();
    await expect(groupHeader(second, 'Northwind')).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('section.tp-g .tp-gh-main[aria-expanded="false"]')).toHaveCount(2);
    void first;

    // dragging across pages is My order's: here the row comes back
    const to = (await group(second, 'No project').boundingBox())!;
    await drag(page, row(group(page, 'Platform').first(), 'Rotate the keys'), {
      x: to.x + to.width / 2,
      y: to.y + to.height - 8,
    });
    await idle(page);
    expect((await serverList(page, made.spaceId, MON)).map((t) => t.title)).toEqual(['Chase the PO', 'Pack']);
    // it never left Sunday or its group (where it lands inside the group is the pointer's path, C02-E29 holds that)
    expect((await serverList(page, made.spaceId, SUN)).map((t) => t.title).sort()).toEqual([...MINE].sort());
    expect((await groupTitles(page.locator('.tp-sheet').first(), 'Platform')).sort()).toEqual([
      'Fix the flaky test',
      'Rotate the keys',
    ]);
  });

  test('C02-E32 the Backlog beside: the same switch and folds; dragging to the day comes back in My order', async ({
    page,
  }) => {
    test.skip(!desktop(), 'the Backlog beside is the desk’s');
    await seeded(page, [
      ...DAY,
      { title: 'Renew passport', day: null, project: 'Northwind' },
      { title: 'Compare standing desks', day: null },
    ]);
    await orderBy(page, 'By project');
    await groupHeader(page, 'Northwind').click();
    const beside = await backlogBeside(page);
    await expect.poll(() => groupNames(beside)).toEqual(['Northwind', 'No project']);
    await expect(groupHeader(beside, 'Northwind')).toHaveAttribute('aria-expanded', 'false');
    await groupHeader(beside, 'Northwind').click();
    await expect(row(group(beside, 'Northwind'), 'Renew passport')).toBeVisible();
    // one choice for the space: My order here is My order on the day
    await orderBy(beside, 'My order');
    await expect(page.locator('section.tp-g')).toHaveCount(0);
    await expect.poll(() => titlesOf(dayList(page, 'Tasks for Sunday 18 October'))).toEqual(MINE);
  });

  test('C02-E33 the switch costs no height on a wide sheet and takes its own line on a phone; headers and the writing line sit level', async ({
    page,
  }) => {
    await seeded(page);
    const head = page.locator('.tp-dh').first();
    const title = (await page.getByRole('heading', { name: 'Sunday' }).boundingBox())!;
    const sw = (await orderSwitch(page).boundingBox())!;
    if (phone()) expect(sw.y).toBeGreaterThanOrEqual(title.y + title.height - 1);
    else if (desktop()) {
      // on the title's line, between the date and the ring
      const prog = (await head.locator('.tp-prog').boundingBox())!;
      expect(sw.y).toBeGreaterThan(title.y);
      expect(sw.y + sw.height).toBeLessThanOrEqual(title.y + title.height + 6);
      expect(sw.x + sw.width).toBeLessThanOrEqual(prog.x);
    }
    await orderBy(page, 'By project');
    const gh = group(page, 'Northwind').locator('.tp-gh');
    expect((await gh.boundingBox())!.height).toBe(phone() ? 44 : 36);
    if (phone())
      await expect(gh.getByRole('button', { name: 'Add a task to Northwind' })).toHaveCSS('opacity', '1');

    // the dot sits level with the name: its centre is within 1.5px of the middle of the name's lowercase
    const level = await gh.evaluate((el) => {
      const name = el.querySelector('.tp-gh-name')!;
      const dot = el.querySelector('.tp-gh-dot')!.getBoundingClientRect();
      const car = el.querySelector('.tp-gh-car')!.getBoundingClientRect();
      const probe = document.createElement('span');
      probe.style.cssText = 'display:inline-block;width:0;height:0;vertical-align:baseline';
      name.appendChild(probe);
      const base = probe.getBoundingClientRect().top;
      probe.remove();
      const size = parseFloat(getComputedStyle(name).fontSize);
      const mid = base - (size * 0.355) / 1;
      return { dot: dot.top + dot.height / 2 - mid, car: car.top + car.height / 2 - mid, size };
    });
    expect(Math.abs(level.dot)).toBeLessThanOrEqual(1.5);
    expect(Math.abs(level.car)).toBeLessThanOrEqual(1.5);

    // the writing line's box sits level with its words
    const add = page.locator('.tp-groups > .tp-fold > .tp-addtask, .tp-groups > .tp-addtask').last();
    const lineLevel = await add.evaluate((el) => {
      const box = el.querySelector('.tp-addtask-box')!.getBoundingClientRect();
      const words = el.querySelector('.tp-addtask-btn')!;
      const probe = document.createElement('span');
      probe.style.cssText = 'display:inline-block;width:0;height:0;vertical-align:baseline';
      words.appendChild(probe);
      const base = probe.getBoundingClientRect().top;
      probe.remove();
      const size = parseFloat(getComputedStyle(words).fontSize);
      // the middle of the italic's lowercase sits about a third of an em above the baseline, where a row's
      // checkbox centres on its title
      return box.top + box.height / 2 - (base - size * 0.33);
    });
    expect(Math.abs(lineLevel)).toBeLessThanOrEqual(1.5);
  });

  test('C02-E34 dark theme, and a held read keeps the grouped shape', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await seeded(page);
    await expect(page.locator('html')).toHaveClass(/dark/);
    await orderBy(page, 'By project');
    await expect(group(page, 'Northwind').locator('.tp-gh-dot')).toBeVisible();
    await expect(groupHeader(page, 'Platform')).toHaveAccessibleName('Platform, 2 left');

    let release!: () => void;
    const held = new Promise<void>((r) => (release = r));
    await page.route('**/api/spaces/*/days/*', async (route) => {
      await held;
      await route.continue();
    });
    await page.reload();
    await expect(page.locator('[aria-label="Loading tasks"]').first()).toBeAttached();
    await expect(page.locator('.tp-skl-gh')).toHaveCount(2);
    await expect(orderSwitch(page)).toHaveCount(0);
    release();
    await expect.poll(() => groupNames(page)).toHaveLength(3);
  });

  test('C02-E35 never two writing lines: the page’s line makes way while the last project’s own line is open, and No project’s "+" uses the page’s', async ({
    page,
  }) => {
    const made = await seeded(
      page,
      DAY.filter((r) => r.project),
    );
    await orderBy(page, 'By project');
    const pageLine = page.getByRole('button', { name: 'Write the next thing…' });
    await expect(pageLine).toHaveCount(1);
    const last = made.order[made.order.length - 1]!;
    await group(page, last).locator('.tp-gh').hover();
    await group(page, last)
      .getByRole('button', { name: `Add a task to ${last}` })
      .click();
    await expect(group(page, last).getByRole('textbox', { name: 'New task' })).toBeFocused();
    await expect(pageLine).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(pageLine).toHaveCount(1);

    // with a No project group, its "+" puts the cursor in the page's line
    await pageLine.click();
    const field = page.getByRole('textbox', { name: 'New task' });
    await field.fill('Water the plants');
    await field.press('Enter');
    await field.press('Escape');
    await expect.poll(() => groupNames(page)).toEqual([...made.order, 'No project']);
    await group(page, 'No project').locator('.tp-gh').hover();
    await group(page, 'No project').getByRole('button', { name: 'Add a task to No project' }).click();
    await expect(page.getByRole('textbox', { name: 'New task' })).toBeFocused();
    await expect(page.getByRole('textbox', { name: 'New task' })).toHaveAttribute(
      'placeholder',
      'Write the next thing…',
    );
    await expect(group(page, 'No project').getByRole('textbox')).toHaveCount(0);
    void rowsOf;
  });

  test('C02-E36 the row menu in a group: Project moves the row to that project’s group, and the server agrees', async ({
    page,
  }) => {
    test.skip(!desktop(), 'touch sizes press and hold for the sheet (the row menu’s own cases)');
    const made = await seeded(page);
    await orderBy(page, 'By project');
    await expect.poll(() => groupNames(page)).toEqual([...made.order, 'No project']);
    await rightClick(group(page, 'No project'), 'Water the plants');
    await expect(menu(page, 'Water the plants')).toBeVisible();
    await pick(page, /^Project/, 'Platform');
    await expect.poll(() => groupNames(page)).toEqual(made.order);
    expect(await groupTitles(page, 'Platform')).toEqual([
      'Rotate the keys',
      'Water the plants',
      'Fix the flaky test',
    ]);
    await idle(page);
    const server = await serverList(page, made.spaceId, SUN);
    expect(server.find((t) => t.title === 'Water the plants')!.projectId).toBe(made.projects.Platform);
  });
});
