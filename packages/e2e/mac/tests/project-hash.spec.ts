import { asPage, expect, signIn, test, type Space, type TuduApp as App } from '../harness';

/**
 * # in Quick Add's title on the Mac (docs/plans/project-hash.md, PH-D): Tudu Test's own floating Quick Add window,
 * a panel of its own, so the menu has to open inside it and Enter has to stay the menu's.
 */

const floatingShown = (a: App) => a.waitState((s) => s.windows.floating.visible);
const floatingHidden = (a: App) => a.waitState((s) => !s.windows.floating.visible);
const today = () => new Date().toLocaleDateString('en-CA');

async function personal(app: App): Promise<Space> {
  const me = await asPage<{ spaces: Space[] }>(app, 'GET', '/api/me');
  return me.spaces.find((s) => s.kind === 'personal')!;
}

test.describe('PH Mac Quick Add #', () => {
  test('PH-D01 the Quick Add window: the # menu opens inside the window; Enter picks and does not add, the next adds', async ({
    app,
  }) => {
    await signIn(app);
    const space = await personal(app);
    const platform = crypto.randomUUID();
    await asPage(app, 'POST', '/api/sync', {
      clientId: 'mac-seed',
      mutations: [
        {
          id: crypto.randomUUID(),
          type: 'project.create',
          payload: { id: platform, spaceId: space.id, name: 'Platform' },
          at: new Date().toISOString(),
        },
      ],
    });
    await app.act('summon');
    await floatingShown(app);
    await app.until(`return !!T.all('textbox', 'Task title')[0]`, 'floating');
    // The window's projects come in with the space; wait for the row rather than racing it.
    await app.eval(`T.fill(T.get('textbox', 'Task title'), 'Review the notes #pla')`, 'floating');
    await app.until(
      `return T.all('button', 'Platform').some((el) => el.getAttribute('role') === 'option')`,
      'floating',
    );
    // Inside the window: the menu's box is within the viewport, nothing cut off.
    const box = await app.eval<{
      top: number;
      bottom: number;
      left: number;
      right: number;
      w: number;
      h: number;
    }>(
      `const r = document.querySelector('[role=listbox][aria-label=Projects]').getBoundingClientRect();
       return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, w: innerWidth, h: innerHeight };`,
      'floating',
    );
    expect(box.top).toBeGreaterThanOrEqual(0);
    expect(box.left).toBeGreaterThanOrEqual(0);
    expect(box.bottom).toBeLessThanOrEqual(box.h);
    expect(box.right).toBeLessThanOrEqual(box.w);

    await app.eval(`T.press('Enter', T.get('textbox', 'Task title'))`, 'floating');
    await app.until(`return T.all('button', 'Project: Platform').length > 0`, 'floating');
    const s = await app.state();
    expect(s.windows.floating.visible).toBe(true);
    expect(await app.eval<string>(`return T.get('textbox', 'Task title').value`, 'floating')).toBe(
      'Review the notes',
    );

    await app.eval(`T.press('Enter', T.get('textbox', 'Task title'))`, 'floating');
    await floatingHidden(app);
    const day = await asPage<{ tasks: Array<{ title: string; projectId: string | null }> }>(
      app,
      'GET',
      `/api/spaces/${space.id}/days/${today()}`,
    );
    expect(day.tasks.find((t) => t.title === 'Review the notes')?.projectId).toBe(platform);
  });
});
