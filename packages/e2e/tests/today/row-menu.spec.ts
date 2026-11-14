import type { Page } from '@playwright/test';
import { API_URL, expect, signInFresh, test } from '../../fixtures/app';
import { menu, pick, rightClick, toast } from '../../fixtures/rowMenu';
import { dayList, fixClock, idle, ring, row, titlesOf, writeTasks } from '../../fixtures/today';

const THREE = ['Pay the electricity bill', 'Call Sam at 3pm', 'Book car service'];
const SUNDAY = 'Tasks for Sunday 18 October';

const phone = () => test.info().project.name === 'phone';

type ServerTask = {
  id: string;
  title: string;
  done: boolean;
  ref: string;
  due: string | null;
  projectId: string | null;
};

async function personal(page: Page): Promise<string> {
  const me = (await (await page.request.get(`${API_URL}/api/me`)).json()) as {
    spaces: Array<{ id: string }>;
  };
  return me.spaces[0]!.id;
}

async function serverDay(page: Page, day: string): Promise<ServerTask[]> {
  const res = await page.request.get(`${API_URL}/api/spaces/${await personal(page)}/days/${day}`);
  return ((await res.json()) as { tasks: ServerTask[] }).tasks;
}

test.describe('row menu', () => {
  test.beforeEach(async ({ page }) => {
    await fixClock(page);
  });

  test('RM-E01 right-click, Move to › Tomorrow: the row folds with Undo, the server has it on Monday; Undo brings it back', async ({
    page,
  }) => {
    await signInFresh(page);
    await writeTasks(page, THREE);
    await page.getByRole('textbox', { name: 'New task' }).press('Escape');
    const list = dayList(page, SUNDAY);
    await rightClick(list, 'Call Sam at 3pm');
    await expect(menu(page, 'Call Sam at 3pm')).toBeVisible();
    await expect(row(list, 'Call Sam at 3pm')).toHaveClass(/tp-ctx-on/);
    await pick(page, /^Move to/, 'Tomorrow');
    await expect(menu(page)).toHaveCount(0);
    await expect.poll(() => titlesOf(list)).toEqual(['Pay the electricity bill', 'Book car service']);
    await expect(toast(page, 'Moved to tomorrow')).toBeVisible();
    await idle(page);
    expect((await serverDay(page, '2026-10-19')).map((t) => t.title)).toEqual(['Call Sam at 3pm']);
    await toast(page, 'Moved to tomorrow').getByRole('button', { name: 'Undo' }).click();
    await expect.poll(() => titlesOf(list)).toEqual(THREE);
    await idle(page);
    expect((await serverDay(page, '2026-10-18')).map((t) => t.title)).toEqual(THREE);
  });

  test('RM-E02 Mark as done, Due date › Tomorrow and Project › Home from the menu; all survive a reload', async ({
    page,
  }) => {
    await signInFresh(page);
    const space = await personal(page);
    await page.request.post(`${API_URL}/api/sync`, {
      data: {
        clientId: 'seed',
        mutations: [
          {
            id: crypto.randomUUID(),
            type: 'project.create',
            payload: { id: crypto.randomUUID(), spaceId: space, name: 'Home' },
            at: new Date().toISOString(),
          },
        ],
      },
    });
    await page.reload();
    await writeTasks(page, THREE);
    await page.getByRole('textbox', { name: 'New task' }).press('Escape');
    const list = dayList(page, SUNDAY);
    await rightClick(list, 'Pay the electricity bill');
    await pick(page, 'Mark as done');
    await expect(ring(page, '1 of 3 crossed off')).toBeVisible();
    await rightClick(list, 'Call Sam at 3pm');
    await pick(page, /^Due date/, 'Tomorrow');
    await expect(row(list, 'Call Sam at 3pm').getByText('Due tomorrow')).toBeVisible();
    await rightClick(list, 'Book car service');
    await pick(page, /^Project/, 'Home');
    await expect(row(list, 'Book car service').getByText('Home', { exact: true })).toBeVisible();
    await idle(page);
    await page.reload();
    await expect(page.getByRole('checkbox', { name: 'Cross off: Pay the electricity bill' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await expect(row(dayList(page, SUNDAY), 'Call Sam at 3pm').getByText('Due tomorrow')).toBeVisible();
    await expect(
      row(dayList(page, SUNDAY), 'Book car service').getByText('Home', { exact: true }),
    ).toBeVisible();
    const day = await serverDay(page, '2026-10-18');
    expect(day.find((t) => t.title === 'Call Sam at 3pm')!.due).toBe('2026-10-19');
    expect(day.find((t) => t.title === 'Book car service')!.projectId).not.toBeNull();
  });

  test('RM-E03 Delete task: the row goes and the server deletes it; Undo brings it back in its place', async ({
    page,
  }) => {
    await signInFresh(page);
    await writeTasks(page, THREE);
    await page.getByRole('textbox', { name: 'New task' }).press('Escape');
    const list = dayList(page, SUNDAY);
    await rightClick(list, 'Call Sam at 3pm');
    await pick(page, 'Delete task');
    await expect.poll(() => titlesOf(list)).toEqual(['Pay the electricity bill', 'Book car service']);
    await expect(toast(page, 'Task deleted')).toBeVisible();
    await idle(page);
    expect((await serverDay(page, '2026-10-18')).map((t) => t.title)).toEqual([
      'Pay the electricity bill',
      'Book car service',
    ]);
    await toast(page, 'Task deleted').getByRole('button', { name: 'Undo' }).click();
    await expect.poll(() => titlesOf(list)).toEqual(THREE);
    await idle(page);
    expect((await serverDay(page, '2026-10-18')).map((t) => t.title)).toEqual(THREE);
  });

  test('RM-E04 one menu at a time: right-click another row moves it there, the same row moves it to the pointer; the header gets none', async ({
    page,
  }) => {
    await signInFresh(page);
    await writeTasks(page, THREE);
    await page.getByRole('textbox', { name: 'New task' }).press('Escape');
    const list = dayList(page, SUNDAY);
    await rightClick(list, 'Pay the electricity bill');
    await expect(menu(page, 'Pay the electricity bill')).toBeVisible();
    await rightClick(list, 'Book car service', { x: 4, y: 4 });
    await expect(menu(page)).toHaveCount(1);
    await expect(menu(page, 'Book car service')).toBeVisible();
    await expect(row(list, 'Pay the electricity bill')).not.toHaveClass(/tp-ctx-on/);
    const before = (await menu(page).boundingBox())!;
    // The same row again, a little to the left: the one menu follows, it never blinks shut.
    await rightClick(list, 'Book car service', { x: 1, y: 2 });
    await expect(menu(page)).toHaveCount(1);
    await expect(menu(page, 'Book car service')).not.toHaveClass(/tp-ctx-leaving/);
    await expect.poll(async () => (await menu(page).boundingBox())!.x).toBeLessThan(before.x);
    await page.getByRole('heading', { name: 'Sunday' }).click({ button: 'right' });
    await expect(menu(page)).toHaveCount(0);
  });

  test('RM-E05 keyboard: Shift+F10 on a row, then to Move to › Tomorrow; Esc returns to the row', async ({
    page,
  }) => {
    test.skip(phone(), 'a keyboard is the desk’s');
    await signInFresh(page);
    await writeTasks(page, THREE);
    await page.getByRole('textbox', { name: 'New task' }).press('Escape');
    const list = dayList(page, SUNDAY);
    const title = row(list, 'Pay the electricity bill').locator('.tp-title > .tp-strike');
    await title.focus();
    await page.keyboard.press('Shift+F10');
    await expect(menu(page, 'Pay the electricity bill')).toBeVisible();
    await expect(page.locator('.tp-ctx [role^="menuitem"]:focus')).toHaveText(/Open/);
    await page.keyboard.press('Escape');
    await expect(menu(page)).toHaveCount(0);
    await expect(title).toBeFocused();
    await page.keyboard.press('Shift+F10');
    await page.keyboard.press('ArrowDown'); // Mark as done
    await page.keyboard.press('ArrowDown'); // Move to
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowDown'); // Tomorrow
    await page.keyboard.press('Enter');
    await expect.poll(() => titlesOf(list)).toEqual(['Call Sam at 3pm', 'Book car service']);
  });

  test('RM-E09 Copy link puts the task’s link on the clipboard and says so', async ({ page, context }) => {
    test.skip(test.info().project.name === 'webkit', 'WebKit has no clipboard permissions to grant');
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await signInFresh(page);
    await writeTasks(page, ['Pay the electricity bill']);
    await page.getByRole('textbox', { name: 'New task' }).press('Escape');
    await idle(page);
    await rightClick(dayList(page, SUNDAY), 'Pay the electricity bill');
    await pick(page, 'Copy link');
    await expect(toast(page, 'Link copied')).toBeVisible();
    const link = await page.evaluate(() => navigator.clipboard.readText());
    expect(link).toBe(`${new URL(page.url()).origin}/t/ME-1`);
  });

  test('RM-E10 offline: Move to and Delete apply at once and reach the server when back', async ({
    page,
    context,
  }) => {
    await signInFresh(page);
    await writeTasks(page, THREE);
    await page.getByRole('textbox', { name: 'New task' }).press('Escape');
    await idle(page);
    await context.setOffline(true);
    await expect(page.getByText('You’re offline.')).toBeVisible();
    const list = dayList(page, SUNDAY);
    await rightClick(list, 'Pay the electricity bill');
    await pick(page, /^Move to/, 'Backlog');
    await rightClick(list, 'Book car service');
    await pick(page, 'Delete task');
    await expect.poll(() => titlesOf(list)).toEqual(['Call Sam at 3pm']);
    await context.setOffline(false);
    await expect(page.getByText('You’re offline.')).toHaveCount(0);
    await idle(page);
    expect((await serverDay(page, '2026-10-18')).map((t) => t.title)).toEqual(['Call Sam at 3pm']);
  });

  test('RM-E11 phone: press and hold a row, let go, and the sheet offers the actions; Tomorrow moves it', async ({
    page,
  }) => {
    test.skip(!phone(), 'press and hold is touch');
    await signInFresh(page);
    await writeTasks(page, THREE);
    await page.getByRole('textbox', { name: 'New task' }).press('Escape');
    const list = dayList(page, SUNDAY);
    const box = (await row(list, 'Call Sam at 3pm').locator('.tp-title > .tp-strike').boundingBox())!;
    const cdp = await page.context().newCDPSession(page);
    const at = { x: box.x + 30, y: box.y + box.height / 2 };
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [at] });
    await page.waitForTimeout(500);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await cdp.detach();
    const sheet = page.getByRole('dialog', { name: 'Task actions: Call Sam at 3pm' });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole('button', { name: 'Today' }).first()).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await sheet.getByRole('button', { name: 'Tomorrow' }).first().click();
    await expect(sheet).toHaveCount(0);
    await expect.poll(() => titlesOf(list)).toEqual(['Pay the electricity bill', 'Book car service']);
    // The order is untouched: a hold that is let go is not a drag.
  });

  test('RM-E14 dark: the menu takes the dark popover colours', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await signInFresh(page);
    await expect(page.locator('html')).toHaveClass(/dark/);
    await writeTasks(page, ['Pay the electricity bill']);
    await page.getByRole('textbox', { name: 'New task' }).press('Escape');
    await rightClick(dayList(page, SUNDAY), 'Pay the electricity bill');
    const m = menu(page, 'Pay the electricity bill');
    await expect(m).toBeVisible();
    const [bg, popover] = await m.evaluate((el) => [
      getComputedStyle(el).backgroundColor,
      (() => {
        const probe = document.createElement('div');
        probe.style.background = 'var(--popover)';
        document.body.appendChild(probe);
        const c = getComputedStyle(probe).backgroundColor;
        probe.remove();
        return c;
      })(),
    ]);
    expect(bg).toBe(popover);
    expect(bg).not.toBe('rgb(255, 255, 255)');
  });
});
