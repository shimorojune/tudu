import { expect, go, signIn, teamSpace, test, type TuduApp as App } from '../harness';

/**
 * Settings › Shortcuts in the real app (#57, #60; docs/plans/shortcuts.md, SK-D). The From anywhere keys are
 * registered with macOS by the app itself, from its own file, so they work with no window and only the menu bar
 * running. `press` goes through the same handler a key press reaches (CI cannot post real key events).
 */

const SUMMON = 'CommandOrControl+Shift+N';
const NOTES = 'CommandOrControl+Alt+N';
const CTRL_ALT_T = 'Control+Alt+KeyT';

const floatingShown = (a: App) => a.waitState((s) => s.windows.floating.visible);
const floatingHidden = (a: App) => a.waitState((s) => !s.windows.floating.visible);
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Settings › Shortcuts on the desk, its rows read from the app. */
async function openShortcuts(app: App) {
  await go(app, '/me?settings=keys');
  await app.until(`return T.all('button', /^New task shortcut, Shift Command N/).length > 0`);
}

/** Click a row's keys and press new ones in the page, as a person would at the keyboard. */
async function rebind(app: App, row: string, key: { code: string; key: string; mods: string[] }) {
  await app.eval(`T.click(T.get('button', new RegExp('^${row} shortcut')));`);
  // A person presses after the field says it is listening; a press in the same tick reaches the old handler.
  await app.until(
    `return !!T.all('button', new RegExp('^${row} shortcut'))[0]?.hasAttribute('data-listening')`,
  );
  await app.eval(`
    const f = T.get('button', new RegExp('^${row} shortcut'));
    const o = { code: ${JSON.stringify(key.code)}, key: ${JSON.stringify(key.key)}, bubbles: true, cancelable: true };
    for (const m of ${JSON.stringify(key.mods)}) o[m + 'Key'] = true;
    f.dispatchEvent(new KeyboardEvent('keydown', o));
    f.dispatchEvent(new KeyboardEvent('keyup', o));`);
}

/** The app's own command, as Settings calls it; answers the rows or the refusal's line. */
async function setKeys(app: App, id: 'newTask' | 'newNote', accelerator: string | null) {
  return app.eval<{ ok: boolean; value: unknown }>(
    `try { return { ok: true, value: await window.__TAURI_INTERNALS__.invoke('shortcuts_set', { id: ${JSON.stringify(id)}, accelerator: ${JSON.stringify(accelerator)} }) }; }
     catch (e) { return { ok: false, value: String(e) }; }`,
  );
}

/** A press with nothing in front: Quick Add comes up, and goes again. */
async function pressOpensQuickAdd(app: App, accelerator: string) {
  await app.act('press', { accelerator });
  await floatingShown(app);
  await app.act('summon');
  await floatingHidden(app);
}

test.describe('SK Mac shortcuts', () => {
  test('SK-D01 Settings shows ⇧⌘N and ⌥⌘N registered; rebinding New task to ⌃⌥T moves it at once', async ({
    app,
  }) => {
    await signIn(app);
    let s = await app.state();
    expect(s.shortcuts.summon).toEqual({ accelerator: SUMMON, label: '⇧⌘N', registered: true });
    expect(s.shortcuts.notes).toEqual({ accelerator: NOTES, label: '⌥⌘N', registered: true });
    await openShortcuts(app);
    await app.until(`return T.all('button', /^New note shortcut, Option Command N/).length > 0`);
    await rebind(app, 'New task', { code: 'KeyT', key: 't', mods: ['ctrl', 'alt'] });
    s = await app.waitState((x) => x.shortcuts.summon.accelerator === CTRL_ALT_T);
    expect(s.shortcuts.summon).toEqual({ accelerator: CTRL_ALT_T, label: '⌃⌥T', registered: true });
    await app.until(`return T.all('button', /^New task shortcut, Control Option T/).length > 0`);
    await app.act('close', { window: 'main' });
    await pressOpensQuickAdd(app, CTRL_ALT_T);
    // The old keys do nothing now.
    await app.act('press', { accelerator: SUMMON });
    await pause(800);
    expect((await app.state()).windows.floating.visible).toBe(false);
  });

  test('SK-D02 and SK-D03 the new keys are registered at launch, and at login work before any window', async ({
    app,
  }) => {
    await signIn(app);
    expect((await setKeys(app, 'newTask', CTRL_ALT_T)).ok).toBe(true);
    await app.quit();
    await app.launch();
    let s = await app.state();
    expect(s.shortcuts.summon).toMatchObject({ accelerator: CTRL_ALT_T, registered: true });
    await app.waitState((x) => x.seen.signedIn === true, 20_000);
    await app.act('close', { window: 'main' });
    await pressOpensQuickAdd(app, CTRL_ALT_T);

    // As the login item starts it: no window, no Dock icon, and the keys straight away.
    await app.quit();
    await app.launch({ TUDU_TEST_AT_LOGIN: '1' });
    s = await app.state();
    expect(s.shortcuts.summon).toMatchObject({ accelerator: CTRL_ALT_T, registered: true });
    await app.waitState((x) => x.seen.signedIn === true, 20_000);
    s = await app.state();
    expect(s.background).toMatchObject({ policy: 'accessory', deskOpen: false });
    await app.act('press', { accelerator: CTRL_ALT_T });
    s = await floatingShown(app);
    // Quick Add over nothing, not Sign in.
    expect(s.windows.main.visible).toBe(false);
  });

  test('SK-D04 menu bar only: New note’s keys open the note window, New task’s Quick Add', async ({
    app,
  }) => {
    await signIn(app);
    await app.act('close', { window: 'main' });
    await app.waitState((x) => x.background.policy === 'accessory' && !x.windows.main.visible);
    await app.act('press', { accelerator: 'Alt+Super+KeyN' });
    let s = await app.waitState((x) => x.windows.note.visible);
    expect(s.windows.main.visible).toBe(false);
    await app.act('close', { window: 'note' });
    await app.waitState((x) => !x.windows.note.visible);
    await app.act('press', { accelerator: 'Shift+Super+KeyN' });
    s = await floatingShown(app);
    expect(s.windows.main.visible).toBe(false);
  });

  test('SK-D05 keys another app holds are refused with the line; ⇧⌘N stays and works', async ({ app }) => {
    await app.quit();
    await app.launch({ TUDU_TEST_TAKEN: CTRL_ALT_T });
    await signIn(app);
    const r = await setKeys(app, 'newTask', CTRL_ALT_T);
    expect(r).toEqual({ ok: false, value: 'macOS or another app already uses ⌃⌥T. Still ⇧⌘N.' });
    const s = await app.state();
    expect(s.shortcuts.summon).toMatchObject({ accelerator: SUMMON, registered: true });
    await app.act('close', { window: 'main' });
    await pressOpensQuickAdd(app, SUMMON);
  });

  test('SK-D06 New note off: unregistered, the sheet says New note alone; the usual keys come back', async ({
    app,
  }) => {
    await signIn(app);
    expect((await setKeys(app, 'newNote', null)).ok).toBe(true);
    let s = await app.state();
    expect(s.shortcuts.notes).toEqual({ accelerator: null, label: null, registered: false });
    const info = await app.eval<{ noteShortcut?: string }>(
      `return await window.__TAURI_INTERNALS__.invoke('app_info')`,
    );
    expect(info.noteShortcut).toBeUndefined();
    await app.act('tray');
    await app.waitState((x) => x.windows.menubar.visible);
    await app.until(
      `const b = T.all('button', 'New note')[0]; return !!b && !b.hasAttribute('aria-keyshortcuts')`,
      'menubar',
      15_000,
    );
    // Back to ⌥⌘N, as the back arrow sends it.
    expect((await setKeys(app, 'newNote', 'Alt+Super+KeyN')).ok).toBe(true);
    s = await app.state();
    expect(s.shortcuts.notes).toMatchObject({ label: '⌥⌘N', registered: true });
    // The sheet heard it.
    await app.until(
      `const b = T.all('button', 'New note')[0]; return b && b.getAttribute('aria-keyshortcuts') === 'Alt+Meta+N'`,
      'menubar',
    );
  });

  test('SK-D07 a key macOS lost behind the app’s back is registered again on wake', async ({ app }) => {
    await signIn(app);
    await app.act('drop-shortcut', { id: 'newTask' });
    let s = await app.state();
    expect(s.shortcuts.summon.registered).toBe(false);
    await app.act('wake');
    s = await app.waitState((x) => x.shortcuts.summon.registered);
    expect(s.shortcuts.summon.accelerator).toBe(SUMMON);
  });

  test('SK-D08 a press before the desk says you are signed in waits for it, then opens Quick Add', async ({
    app,
  }) => {
    await signIn(app);
    await app.act('close', { window: 'main' });
    await app.waitState((x) => !x.windows.main.visible);
    // As in the first seconds after a launch at login: the desk hasn't said yet.
    await app.act('signed-in', { value: null });
    await app.act('press', { accelerator: SUMMON });
    let s = await app.state();
    expect(s.shortcuts.held).toBe('New task');
    expect(s.windows.floating.visible).toBe(false);
    expect(s.windows.main.visible).toBe(false);
    await app.act('signed-in', { value: true });
    s = await floatingShown(app);
    expect(s.shortcuts.held).toBeNull();
    // Not Sign in.
    expect(s.windows.main.visible).toBe(false);
  });

  test('SK-D09 in the desk, ⌃2 switches to the second space', async ({ app }) => {
    await signIn(app);
    const nw = await teamSpace(app, 'Northwind');
    await go(app, '/me/week');
    await app.until(
      `return !!document.querySelector('.tp-ssw-b') && document.querySelector('.tp-ssw-b').textContent.includes('Personal')`,
    );
    await app.eval(
      `window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit2', key: '2', ctrlKey: true, bubbles: true, cancelable: true }))`,
    );
    await app.until(`return location.pathname === ${JSON.stringify(`/${nw.slug}/week`)}`);
  });
});
