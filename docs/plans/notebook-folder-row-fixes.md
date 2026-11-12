# Notebook folder row: menu cut off, long name under the buttons (#92, #93)

Status: approved by Rohit 12 Nov 2026; implemented. Canvas: skipped with Rohit's OK (12 Nov 2026). No new design: both are
the existing design drawn wrongly. The design system kit has the same two faults, so it gets the same fix after the
merge (see "Design system and canvas").

## The reports

Both from production 0.41.1, Mac app, dark, Notebook tree.

- **#92** "Menu for notebook folder is disappearing below the scrollable section with no scroll. It should pop out."
  The screenshot shows a folder inside a folder (`Features › EGS-102104`, empty). Its ⋯ menu is cut off halfway
  through "Rename"; "Delete" can't be seen or reached.
- **#93** "Notes folder icon and title are overlapping." Same folder with a long name
  (`EGS-102104: Improve Usab…`). On hover, the name runs underneath the New folder / New note / ⋯ buttons.

## What is actually wrong

### #92: the menu is drawn inside a box that clips

`Folder` in `packages/ui/src/components/NoteTree.tsx` renders the ⋯ menu as
`<NotePop className="tp-nb-pop-r tp-nb-fmenu">` inside the row. `NotePop` is `position: absolute` under its button.
Two ancestors clip it:

1. `.tp-nb-kids > div { overflow: hidden }` (`components.css`). Every folder's children sit in this box so the
   open/close fold can animate. A folder **inside** a folder has its menu cut at the bottom of its parent's box. The
   menu is about 80px tall, so it only survives if at least two more rows follow it in the same parent. This is the
   case in the report.
2. `.tp-nb-tree-scroll { overflow-y: auto }`. A **top-level** folder near the bottom of the tree has the same problem
   against the scroll area: the menu hangs below the visible part and you have to scroll to see it.

`NotePop` can flip upward, but only `NotePicker` asks it to. A plain `MenuList` never does. Flipping would not be
enough anyway: a nested folder that is the first row of its parent is clipped above as well.

### #93: the name never makes room for the buttons

`.tp-nb-frow .tp-nb-fadd { position: absolute; right: 4px }` floats the buttons over the row's right edge, where the
count sits. The name's button keeps `padding-right: 12px` whether or not the buttons are showing. `.tp-nb-fname`
already has an ellipsis, but it only kicks in at the row's edge, not at the buttons' left edge. The buttons are up to
3 × 26px wide, so up to about 70px of a long name ends up under them.

The tooltip in the #93 screenshot is **not** clipped by the pane. `Tooltip` is already a Radix portal with collision
handling; the screenshot is just cropped there. Nothing to fix (one optional tidy-up under "Open question").

## The change

### 1. The folder ⋯ menu floats over the page (#92)

- **`NoteParts.tsx`, `NotePop`**: new optional prop `float`. With it, the pop is rendered through `createPortal` into
  `document.body` as `position: fixed` (class `tp-root tp-nb-pop tp-nb-pop-float`), the way `DatePop` already does it
  for the same reason. Without `float`, nothing changes (the note editor's ⋯, Move and link pickers, and the header's
  New menu stay as they are; none of them sit inside a clipping box).
- **Placement** is a small pure function, `placePop(anchor, size, view)`, exported for tests:
  - Below the ⋯ button with the same 6px gap, right edges aligned (what `tp-nb-pop-r` does today).
  - If there's less room below than the menu needs and more room above, it opens upward (`tp-nb-pop-up`, same
    transform origin as today).
  - Kept at least 8px inside the window on every side.
  - Measured in a layout effect before paint. Until measured it is `visibility: hidden`, so there's no jump.
- **Motion** is unchanged: the same `tp-nb-pop` arrive, `tp-pop-out` / `tp-pop-out-up` leave (130ms), and the same
  reduced-motion and Less motion rules. They key off `.tp-nb-pop`, which the floating pop keeps.
- **Closing**: a press outside, Esc, and choosing an item work as now. New: scrolling the tree or resizing the window
  closes it (same rule as `DatePop`), because a fixed menu would otherwise drift away from its row.
- **`useCloseOnOutside`** today treats a press as "inside" only if it lands in the `.tp-nb-menuw` wrapper. The floated
  menu is no longer inside that wrapper in the DOM, so without a change a press on "Rename" would close the menu before
  the click lands. The hook will also count a press inside the floated pop that belongs to this wrapper (the pop
  carries the wrapper's id) as inside.
- **`NoteTree.tsx`**:
  - `Folder` passes `float` to its `NotePop`.
  - The row's drag handler (`down`) skips presses on `.tp-nb-fadd, .tp-nb-menuw, input`. React still bubbles events
    from a portal to its React parent, so a press on a floated menu item would reach the folder row and start a drag
    hold. `.tp-nb-pop` is added to that skip list.
- **Layer**: `z-index: 70` like `DatePop`, above the page and below dialogs. The Delete confirm still opens over
  everything after the menu has closed.
- The Mac note window's rail tree gets the same fix for free (same component).

### 2. The name gives way to the buttons (#93)

- **`NoteTree.tsx`**: the folder row sets `--nb-acts` to the number of buttons it draws (3, or 2 on a third-level
  folder that has no New folder, fewer when the tree is given no create handlers).
- **`components.css`**: while the buttons show (`.tp-nb-frow:hover`, `:focus-within`, `.tp-nb-frow-busy`), the name's
  button gets `padding-right: calc(var(--nb-acts) * 26px + 10px)`. The name then ends in "…" a few pixels before the
  first button. At rest it stays `12px`, so the name uses the full row and the count sits where it does now.
- `padding-right` eases over `--dur-menu`, the same time the buttons take to fade in, so the name shortens as the
  buttons arrive instead of snapping. 1ms under reduced motion and Less motion. During a drag
  (`.tp-nb-dragon`, where the buttons are held hidden) the padding stays at rest.
- The rename field is unaffected: the buttons are already `display: none` while renaming.
- Found while building: the padding is `--nb-acts × 26px − 10px`, not `+ 10px`. The count stays in the row, faded
  out, and its 20px sit under the buttons, so the name still ends 4px before the first one. On a phone the row has no
  hover buttons, so the padding stays at rest there (`notebook.css`).
- Found while building: with Reduce motion on, every element gets a 120ms transition, which slid the floating menu
  in from off screen. The floating pop sets `transition-property: none`; C22-E93 checks the menu is at its button at
  once.

No server change, no migration, no copy change.

### Open question (optional, not needed for either fix)

With a long name the tooltips read "New folder in EGS-102104: Improve Usability of…", up to about 95 characters on
one line. I'd shorten the **tooltip only** to "New folder" / "New note" (the row you're pointing at already says which
folder) and keep the full text as the accessible name. That is a small copy change, so I'll leave it out unless you
say yes.

## Design system and canvas

The kit's `PadTree` (design system artifact, and the canvas copy) has the same CSS and the same inline menu, so it has
both faults. After the PR merges:

- Port the floating menu and the `--nb-acts` padding to the kit, publish the design system, and re-sync the canvas
  copy.
- Notebook page on the canvas: no new sheets. Check that P-Desktop / P-States (light and dark) still draw the tree
  the same, since at rest nothing moves.

## Test scenarios

Run on PR CI (unit, web e2e, Mac e2e), not on Rohit's Mac, per the 10 Nov rule.

### New

- **C22-U106** `placePop` (`NoteParts.test.tsx`, pure):
  - Room below: top = anchor bottom + 6, right edge = anchor right, `up: false`.
  - No room below, room above: bottom = anchor top − 6, `up: true`.
  - No room either way: stays below, clamped 8px inside the window.
  - Anchor near the left edge: left is clamped to 8px.
- **C22-U107** the folder menu floats (`NoteTree.test.tsx`):
  - ⋯ on `Offsite` (third level): the menu is in `document.body`, not inside any `.tp-nb-kids` or the tree `nav`.
  - A pointer press on "Rename" inside it does not close it first: the rename field appears.
  - A pointer press on a menu item never calls the drag start (no `tp-nb-carrying`, no ghost after `HOLD_MS`).
  - A press elsewhere closes it; Esc closes it.
  - A `scroll` event on the tree's scroll area closes it; a window `resize` closes it.
  - Opening ⋯ on a second folder closes the first one's menu (one menu at a time).
- **C22-U108** `--nb-acts` on the folder row (`NoteTree.test.tsx`): 3 on a first- or second-level folder, 2 on a
  third-level folder, 1 when the tree gets no `onCreateFolder` and no `onNewNote`.
- **C22-E91** (web e2e, `notebook.spec.ts`) #92, nested: a folder with one empty folder inside it and nothing after.
  ⋯ on the inner folder. "Rename" and "Delete" are both fully inside the window, and the element at the centre of
  "Delete" is that menu item (nothing covers or clips it). Click Delete: the confirm dialog opens.
- **C22-E92** (web e2e) #92, bottom of the tree: enough folders to make the tree scroll, scrolled to the end. ⋯ on
  the last folder: the whole menu is inside the window (it opens upward). Scrolling the tree closes it.
- **C22-E93** (web e2e) #93: a second-level folder with an 80-character name.
  - Not hovered: the name's right edge is left of the count; the name is truncated (`scrollWidth > clientWidth`).
  - Hovered, after the fade: the name's right edge is at or left of the first button's left edge, for all three
    buttons showing.
  - Same check with the ⋯ menu open and the pointer moved away (`tp-nb-frow-busy`).
  - Same check on a third-level folder (two buttons).

### Updated

- **C22-U12** (`NoteTree.test.tsx`, Rename / Delete from ⋯): it already finds menu items through `screen`, so it should
  pass as is. It gets one added line asserting the menu is gone from the document after the leave time, now that it
  lives outside the tree.
- **C22-E43 and the other folder e2e tests that open ⋯** (`notebook.spec.ts`): any locator that reaches the menu
  through the folder row (`row.getByRole('menuitem')`) moves to a page-level locator. I'll list the exact ones in the
  PR.
- **Mac e2e** (`packages/e2e/mac/tests/notebook.spec.ts`): no new cases. Both fixes are layout in the shared web
  code and the web e2e covers them in a real browser. The existing Mac notebook group runs on the PR as a regression
  check, with the same locator update if any case opens a folder's ⋯.

### Manual check for Rohit after release

- **MC-N01** In the Mac app, dark: the `Features › EGS-102104` folder from the reports. ⋯ shows Rename and Delete in
  full; hovering the row ends the name in "…" before the buttons.
