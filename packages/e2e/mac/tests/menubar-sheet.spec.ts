import { asPage, expect, signIn, test, type TuduApp as App } from '../harness';

/**
 * The real sheet under the tick on a full day (#123, #122, docs/plans/menubar-sheet-fixes.md): one scrollbar, and
 * a row dragged in the sheet lands in the same order on the desk.
 */

const today = () => new Date().toLocaleDateString('en-CA');

async function openSheet(app: App): Promise<void> {
  await app.act('tray');
  await app.waitState((s) => s.windows.menubar.visible);
  await app.until(`return !!document.querySelector('[role=dialog][aria-label="Today"]')`, 'menubar');
}

/** Twelve tasks today in Personal, in this order. */
async function fullDay(app: App): Promise<{ spaceId: string; titles: string[] }> {
  const me = await asPage<{ spaces: Array<{ id: string; kind: string }> }>(app, 'GET', '/api/me');
  const spaceId = me.spaces.find((s) => s.kind === 'personal')!.id;
  const titles = Array.from({ length: 12 }, (_, i) => `Task number ${i + 1}`);
  const at = Date.now();
  await asPage(app, 'POST', '/api/sync', {
    clientId: 'mac-seed',
    mutations: titles.map((title, i) => ({
      id: crypto.randomUUID(),
      type: 'task.create',
      payload: { id: crypto.randomUUID(), spaceId, title, day: today(), position: 1024 * (i + 1) },
      at: new Date(at + i).toISOString(),
    })),
  });
  return { spaceId, titles };
}

const sheetTitles = (app: App) =>
  app.eval<string[]>(
    `return [...document.querySelectorAll('.tp-mb-r .tp-mb-t')].map((t) => t.textContent)`,
    'menubar',
  );

test.describe('#123 #122 the menu bar sheet on a full day', () => {
  test('C20-D12 the real sheet on a full day has one scrollbar, and a row dragged in it moves on the desk too', async ({
    app,
  }) => {
    await signIn(app);
    const { spaceId, titles } = await fullDay(app);
    await openSheet(app);
    await app.until(`return document.querySelectorAll('.tp-mb-r').length === 12`, 'menubar', 15_000);
    expect(await sheetTitles(app)).toEqual(titles);

    // One bar: the page is exactly the window, and only the list scrolls.
    const sizes = await app.eval<{ page: number; window: number; list: number; sheet: number }>(
      `const body = document.querySelector('.tp-mb-b');
       return {
         page: document.scrollingElement.scrollHeight,
         window: window.innerHeight,
         list: body.scrollHeight - body.clientHeight,
         sheet: document.querySelector('.tp-root.tp-mb').getBoundingClientRect().height,
       };`,
      'menubar',
    );
    expect(sizes.page).toBe(sizes.window);
    expect(sizes.list).toBeGreaterThan(0);
    expect(sizes.sheet).toBeLessThanOrEqual(sizes.window - 16);

    // The third row, pressed on its title and carried above the first, by the mouse's own events.
    await app.eval(
      `const rows = [...document.querySelectorAll('.tp-mb-r[data-reorder]')];
       const moved = rows[2];
       const fire = (target, type, x, y) =>
         target.dispatchEvent(new PointerEvent(type, {
           bubbles: true, cancelable: true, view: window, button: 0, buttons: type === 'pointerup' ? 0 : 1,
           pointerId: 1, pointerType: 'mouse', isPrimary: true, clientX: x, clientY: y,
         }));
       const next = () => new Promise((r) => requestAnimationFrame(r));
       const from = moved.getBoundingClientRect();
       const to = rows[0].getBoundingClientRect();
       const x = from.left + 120, y0 = from.top + from.height / 2, y1 = to.top + 2;
       fire(moved.querySelector('.tp-mb-m'), 'pointerdown', x, y0);
       fire(window, 'pointermove', x, y0 - 6);
       for (let i = 1; i <= 12; i++) {
         fire(window, 'pointermove', x, y0 - 6 + ((y1 - y0 + 6) * i) / 12);
         await next();
       }
       if (!moved.classList.contains('tp-dragging')) throw new Error('the row never lifted');
       fire(window, 'pointerup', x, y1);
       return true;`,
      'menubar',
    );
    const moved = [titles[2]!, titles[0]!, titles[1]!, ...titles.slice(3)];
    await expect.poll(() => sheetTitles(app)).toEqual(moved);
    // The server has it, and the desk shows it without being asked.
    await expect
      .poll(async () => {
        const r = await asPage<{ tasks: Array<{ title: string }> }>(
          app,
          'GET',
          `/api/spaces/${spaceId}/days/${today()}`,
        );
        return r.tasks.map((t) => t.title);
      })
      .toEqual(moved);
    await expect
      .poll(() =>
        app.eval<string[]>(
          `return [...document.querySelectorAll('[role=list][aria-label^="Tasks for "] [data-reorder] .tp-strike')].map((t) => t.textContent)`,
        ),
      )
      .toEqual(moved);
    // The drop opened nothing: the sheet is still up and the desk is on no task.
    expect(await app.eval<boolean>(`return location.search.includes('task=')`)).toBe(false);
  });
});
