# Mac polish: crisp Make a task, bigger space tiles, window buttons that match

Status: proposal, 27 Oct 2026. Canvas approved by Rohit 27 Oct (canvas v131, Menu bar & This Mac page, boards
`K-Polish` and `K-Polish-Dark`, sticky `p18-polish-draft`).

These are items 3, 11 and 15 from Rohit's staging pass on 26 Oct:

- 3: the "Make a task" bubble's words look fuzzy.
- 11: the space icons are too small in the menu bar view and in the week view.
- 15: in light mode the window's close, minimise and zoom buttons are drawn pure white.

## 1. Make a task: same bubble, sharp words

**Cause.** `NoteEditor` (`packages/ui/src/components/NoteEditor.tsx`) puts the bubble's `left`/`top` at the
selection's centre, which comes from `getBoundingClientRect()` and is fractional. `.tp-nb-bubble`
(`packages/ui/src/styles/components.css`) then centres it with `transform: translate(-50%, -100%)`, and half of an
odd button width is another half pixel. Its rise animation (`tp-nb-bubble-in`, fill `both`) keeps a transform on it
after it finishes, so WebKit leaves the bubble on its own compositing layer at a sub-pixel offset. That draws the text
off the pixel grid, and in WKWebView on the Mac it reads as soft next to the note. Chromium snaps it better, so the
web shows the problem less.

**Fix.**

- `NoteEditor` keeps the anchor point it has today (the selection's centre, clamped 70px from either edge, 8px above
  the line). A `useLayoutEffect` measures the bubble once it renders and writes whole-pixel `left` and `top` on its
  element before the first paint: `left = round(x − width / 2)`, clamped to `[8, paneWidth − width − 8]`, and
  `top = round(y − height)`, at least 8. It measures again when the selection moves, so there's no flash at a wrong
  spot and no layout jump.
- `.tp-nb-bubble` loses `transform: translate(-50%, -100%)`. The keyframes become
  `from { opacity: 0; transform: translateY(4px); }` with fill `backwards`, so the bubble still rises 4px and fades in
  over `--dur-menu` with `--ease-arrive`, as on the canvas. Once it has landed nothing is transformed, so it renders in
  the page's own layer like the note's text.
- Less motion and reduced motion keep their 1ms rules (`less-motion.css`, the `prefers-reduced-motion` block).
- Same look, size and shadow. The Notebook page, the Mac note window and the browser's floating note all use
  `NoteEditor`, so all three get the fix.

## 2. Menu bar sheet: space tiles 16 → 20

- `MenuBarSheet.tsx`: the heading's `SpaceTile` goes from `size={16}` to `size={20}`. `SpaceTile` already scales its
  contents: radius 6, Personal's person icon 10px (`size * 0.5`), a team's letter 9px (`size * 0.44`), and two
  letters still fit.
- `app.css` `.tp-mb .tp-mb-gh`: `gap: 9px` and `padding: 8px 10px 4px 8px`, so the tile's centre sits over the
  checkboxes' centre (the 15px checkbox starts 10px in). The 10.5px caps and the "1 of 3" count stay as they are. Each
  heading is 4px taller, and the sheet still scrolls inside its 580px.
- Only headed sheets change (two or more spaces). One space alone has no headings. Loading, empty, signed out and
  offline show no tiles.

## 3. The week (and phones): a tile without its name 13 → 16

In the week's tiles (`brief`) and on phones (`compact`), `TaskRow` shows a row's space as its tile alone
(`.tp-sg-bare`). That tile was sized for a pill that also shows the name.

- `TaskRow.tsx`: the space signal's `SpaceTile` gets `size={bare ? 16 : 13}`.
- `components.css`: `.tp-sg .tp-sg-tile` forces `font-size: 7.5px` and `border-radius: 4px` (both `!important`). A
  bare variant overrides them: `.tp-sg-bare .tp-sg-tile { border-radius: 5px !important; font-size: 9px !important;
vertical-align: calc(12.5px * .355 - 8px); }`. That sits the 16px tile on the middle of the words the way the 13px
  one sits now. Personal's person comes out 11px (`SpaceTile`'s small rule, `size * 0.7`).
- Pills that show the name (Today, Backlog, the task panel's byline) stay 13px, matched to their 12.5px words.
- The byline keeps its 22px height. Hover still names the space and a click still filters to it.

## 4. Window buttons follow Tudu's theme

**Cause.** No window in `apps/desktop/src-tauri/src/windows.rs` sets a theme, so each NSWindow follows the Mac's
appearance, while the page paints the theme picked in Settings (`tudu.theme`). With the Mac in dark mode and Tudu in
light, macOS draws its dark set of window buttons on the light paper.

**Fix: in the startup-flash thread's change, not this one.** That thread (Rohit's item 14,
[launch-screen.md](launch-screen.md), branch `claude/project-thread-04i5wc`) adds one native command,
`set_appearance { theme: light | dark | system, lessMotion }`. `DesktopHost` and a new `onThemeChange` hook in
`theme.ts` call it. It sets the theme and background on all four windows (main, floating, menubar, note), saves the
choice, and applies it when each window is built. The window buttons come right with it; its test is **C11-D17**. To
keep one mechanism, this change adds no native code. If that change is held up, this one still ships items 1–3 on
their own.

## Design system and canvas

On approval of this proposal (the boards are approved already):

- Tudu Paper (design system): `MenuBarSheet` heading tile 20 and the `.tp-mb-gh` padding/gap; `TaskRow` bare tile 16
  plus the `.tp-sg-bare .tp-sg-tile` rule; the Notebook editor's bubble rules (whole pixels, rise without the
  half-width shift). `bundle.js` is hand-written except its Notebook tail, which is rebuilt from `packages/ui`
  (per the design-parity notes).
- Canvas: the 20px heading on K-MenuBar, K-Updates, K-Proto and P-MenuBar (light and dark), and the 16px tile on
  A-Week, A-Phone and A-Pieces (light and dark, from the updated bundle). A-Pieces' caption "13 in a byline" becomes
  "13 in a byline, 16 alone". K-Polish moves from Draft to Built once this merges.

## Tests

The numbers follow each chunk's last test on master. They get renumbered at merge if another branch takes them first.

Unit (Vitest, `packages/ui`):

- **C22-U31** bubble position: with the pane 600px wide and a selection centred at x = 200.5, y = 120.3, and the
  bubble measured 117 × 32, its inline `left` and `top` are whole numbers (142, 88). A selection near either edge
  clamps the bubble 8px inside the pane. `.tp-nb-bubble` has no `translate(-50%` and its animation's fill is
  `backwards` (read from the stylesheet as the other CSS tests do).
- **C20-U12** menu bar headings: with two spaces, each heading's tile is 20 × 20 with radius 6. Personal's person icon
  is 10px. `.tp-mb .tp-mb-gh` has `gap: 9px` and `padding-left: 8px`. With one space there are still no headings.
- **C21-U22** bare space tile: `TaskRow` with `inSpace` and `brief` (and again with `compact`) renders a 16px tile.
  Without either it renders 13px. The stylesheet's `.tp-sg-bare .tp-sg-tile` sets `font-size: 9px`. Update the
  existing All spaces `TaskRow` test, which doesn't check sizes today, only if its assertions move.

E2E (Playwright, run on Rohit's Mac):

- **C22-E26** (`notebook.spec.ts`, desktop and webkit projects): select words in a note, wait for the bubble's
  animation to end. Its bounding box's `x` and `y` are whole numbers and its computed `transform` is `none`. Then
  Make a task still opens New task on the words (C22-E11 keeps covering the rest of the flow).
- **C21-E26** (`all-spaces`, desktop): in All spaces › Week, a row's space tile is 16 × 16. In All spaces › Today the
  named pill's tile is still 13 × 13. **C21-E27** (phone project): All spaces › Today on a phone shows 16px tiles.
- **C20-E10** (`menubar`, desktop): the menu bar page with two spaces shows 20px tiles in its headings.

Desktop (Mac app, on Rohit's Mac): C11-D17 from launch-screen.md covers the window buttons. Plus a manual check on
the floating window, the menu bar sheet and the note window: with the Mac in dark mode and Tudu in light, the bubble's
text is as sharp as the note's.

No new loading, empty or error states. The bubble exists only while words are selected, and the tiles appear only
where they already do.
