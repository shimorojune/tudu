import { expect, signIn, test } from '../harness';

/**
 * Chunk 23, Scramble my text on the Mac (#67): switched in the desk's avatar menu, it reaches the other windows of
 * the app (the note window and the menu bar's sheet) through the shared storage, each with its Scrambled pill.
 */

const PILL = `'Scrambled: turn Scramble my text off'`;

test.describe('chunk 23 · Scramble my text in every window', () => {
  test('C23-E06 on in the desk: the note window and the menu bar sheet scramble too, each with its pill; off clears them', async ({
    app,
  }) => {
    await signIn(app);
    await app.until(`return T.all('button', /^You: /).length > 0`);
    await app.eval(`T.click(T.get('button', /^You: /))`);
    await app.until(`return T.all('switch', 'Scramble my text').length > 0`);
    await app.eval(`T.click(T.get('switch', 'Scramble my text'))`);
    await app.until(
      `return document.documentElement.hasAttribute('data-scrambled') && T.all('button', ${PILL}).length > 0`,
    );
    expect(await app.eval(`return !!localStorage.getItem('tudu.scramble')`)).toBe(true);

    // The note window: opened after the switch, it starts scrambled.
    await app.eval(`await window.__TAURI_INTERNALS__.invoke('open_note', { id: null, linkTo: null })`);
    await app.waitState((s) => s.windows.note.visible);
    await app.until(
      `return document.documentElement.hasAttribute('data-scrambled') && T.all('button', ${PILL}).length > 0`,
      'note',
    );
    await app.act('close', { window: 'note' });
    await app.waitState((s) => !s.windows.note.visible);

    // The menu bar's sheet.
    await app.act('tray');
    await app.waitState((s) => s.windows.menubar.visible);
    await app.until(
      `return document.documentElement.hasAttribute('data-scrambled') && T.all('button', ${PILL}).length > 0`,
      'menubar',
    );
    // Its pill turns it off everywhere: the desk's pill goes too.
    await app.eval(`T.click(T.get('button', ${PILL}))`, 'menubar');
    await app.until(`return !document.documentElement.hasAttribute('data-scrambled')`, 'menubar');
    await app.until(
      `return !document.documentElement.hasAttribute('data-scrambled') && T.all('button', ${PILL}).length === 0`,
    );
  });
});
