import { asPage, expect, go, signIn, test, writeTask, type TuduApp as App } from '../harness';

/**
 * The right-click task menu in the real app's WKWebView (docs/plans/row-menu.md, RM-D). CI cannot post a real
 * right-click, so `rightClick` sends what WebKit sends for one (the button-2 pointer pair, then `contextmenu`) and
 * answers whether the page took it: a `contextmenu` the page cancels is one WebKit shows no menu of its own for.
 * Seeing that no WebKit menu is drawn is MC-R01, Rohit's.
 */

const day = (n = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toLocaleDateString('en-CA');
};

async function personalId(app: App): Promise<string> {
  const me = await asPage<{ spaces: Array<{ id: string; kind: string }> }>(app, 'GET', '/api/me');
  return me.spaces.find((s) => s.kind === 'personal')!.id;
}

/** Right-click the element `find` (a page expression) returns; true when the page cancelled the event. */
function rightClick(app: App, find: string): Promise<boolean> {
  return app.eval<boolean>(`
    const el = ${find};
    if (!el) throw new Error('nothing to right-click');
    el.scrollIntoView({ block: 'center' });
    const r = el.getBoundingClientRect();
    const o = { bubbles: true, cancelable: true, view: window, button: 2, buttons: 2, clientX: r.left + 20, clientY: r.top + r.height / 2, pointerType: 'mouse', isPrimary: true };
    el.dispatchEvent(new PointerEvent('pointerdown', o));
    el.dispatchEvent(new MouseEvent('mousedown', o));
    el.dispatchEvent(new PointerEvent('pointerup', { ...o, buttons: 0 }));
    el.dispatchEvent(new MouseEvent('mouseup', { ...o, buttons: 0 }));
    return !el.dispatchEvent(new MouseEvent('contextmenu', o));`);
}

const titleOf = (title: string) =>
  `[...document.querySelectorAll('.tp-title > .tp-strike')].find((e) => e.textContent.trim() === ${JSON.stringify(title)})`;

const menuOpen = (title: string) =>
  `return !!document.querySelector('.tp-ctx[role=menu][aria-label=${JSON.stringify(`Actions for ${title}`)}]')`;

test.describe('RM Mac row menu', () => {
  test('RM-D01 a right-click on a row shows Tudu’s menu, not WebKit’s; Move to › Tomorrow moves it', async ({
    app,
  }) => {
    await signIn(app);
    const space = await personalId(app);
    await writeTask(app, space, 'Call Sam at 3pm', day());
    await go(app, '/me');
    await app.until(`return !!${titleOf('Call Sam at 3pm')}`);
    expect(await rightClick(app, titleOf('Call Sam at 3pm'))).toBe(true);
    await app.until(menuOpen('Call Sam at 3pm'));
    await app.eval(`T.click(T.get('button', /^Move to/, document.querySelector('.tp-ctx')));`);
    await app.until(`return document.querySelectorAll('.tp-ctx').length === 2`);
    await app.eval(`
      const sub = [...document.querySelectorAll('.tp-ctx')].at(-1);
      T.click(T.get('button', /^Tomorrow/, sub));`);
    await app.until(`return !${titleOf('Call Sam at 3pm')}`);
    await expect
      .poll(async () => {
        const r = await asPage<{ tasks: Array<{ title: string }> }>(
          app,
          'GET',
          `/api/spaces/${space}/days/${day(1)}`,
        );
        return r.tasks.map((t) => t.title);
      })
      .toEqual(['Call Sam at 3pm']);
  });

  test('RM-D02 a right-click in the writing line is left to the system’s text menu', async ({ app }) => {
    await signIn(app);
    const space = await personalId(app);
    await writeTask(app, space, 'Call Sam at 3pm', day());
    await go(app, '/me');
    await app.until(`return !!${titleOf('Call Sam at 3pm')}`);
    await app.eval(`T.click(T.get('button', 'Write the next thing…'));`);
    await app.until(`return !!document.querySelector('[aria-label="New task"]')`);
    expect(await rightClick(app, `document.querySelector('[aria-label="New task"]')`)).toBe(false);
    expect(await app.eval<number>(`return document.querySelectorAll('.tp-ctx').length`)).toBe(0);
  });
});
