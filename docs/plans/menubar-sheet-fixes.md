# The menu bar sheet: one scrollbar, a heading that holds, a shadow that fits, and reordering (#123, #122)

Status: approved by Rohit on 25 Nov 2026 and built. Canvas approved by Rohit on 25 Nov 2026 (canvas v291). The boards are on the
Menu bar page:

- "Draft · #123 · One scrollbar, a heading that holds, a shadow that fits" (K-SheetFix, K-SheetFix-Dark)
- "Draft · #122 · Drag today's tasks into order from the menu bar" (K-SheetReorder, K-SheetReorder-Dark)

## The reports

- **#123** (Rohit, Mac 0.43.1, dark): the sheet under the menu bar tick has three faults:
  - It shows two scrollbars on a full day.
  - With Scramble my text on, the heading wraps and grows a line.
  - Its shadow stops in straight lines at the window's edge.
- **#122** (Rohit): tasks can't be reordered from the menu bar sheet. On Today they can.

## What is actually wrong (#123)

1. **Two scrollbars.** The window is 360 × 600 (`SHEET_WIDTH`/`SHEET_HEIGHT` in `place.rs`). `.tp-root.tp-mb` may grow
   to `max-height: 600px` (`packages/ui/src/styles/app.css`). In the app the page around it adds `padding: 0 8px 16px`
   (`html[data-app='menubar'] .app-menubar` in `apps/web/src/routes/menubar/menubar.css`). So a full day makes the page
   616px tall, and it scrolls as well as the list. A wheel over the heading moves the whole sheet.
2. **The heading wraps.** `ScrambledPill` (`tp-mb-scr`, about 100px) sits in the heading row between the day block and
   the ring (`MenuBarSheet.tsx`). That leaves the words about 150px, so "Today · Week 48" and "25 November" wrap.
3. **The shadow is cut.** The window is clear and its native shadow is off (`.shadow(false)`), so the sheet draws
   `--shadow-pop`. That shadow reaches about 40px, but the window keeps only 8px each side and 16px below. This is the
   same cause as the note window's #88.

## The change

### #123

- **One scrollbar** (`menubar.css`): `html[data-app='menubar'] .tp-root.tp-mb { max-height: calc(100vh - 16px); }`.
  This makes the sheet at most 584px in the 600px window, so the page never scrolls and only the list (`.tp-mb-b`, which
  already scrolls) has a bar. A short day is unchanged: the sheet is as tall as its rows. In a browser tab (tests, the
  kit) the 600px cap stays.
- **The pill on the eyebrow line** (`MenuBarSheet.tsx`, `app.css`):
  - `ScrambledPill` moves into `.tp-mb-eb`, after the eyebrow words. The eyebrow becomes a flex row with an 8px gap.
  - The pill is 20px tall with `margin: -4px 0`, so the line keeps its height and the day, the date and the ring never
    move.
  - It keeps its 220ms scale-in (ease-arrive). With Less motion it shows at once, as now.
  - The day and the date get `white-space: nowrap`. The date gets `min-width: 0; overflow: hidden; text-overflow:
ellipsis`, so if a long date ever meets the ring, the date gives way first.
- **The shadow** (`menubar.css`): in the app only, the sheet uses the note window's short shadow, all inside the clear
  edge:
  `html[data-app='menubar'] .tp-root.tp-mb { box-shadow: 0 0 0 1px var(--hair), 0 1px 2px var(--hair), 0 4px 10px -4px
var(--shadow-color); }`. The browser sheet keeps the deep pop shadow, since nothing cuts it there.

### #122: reorder

- **`MenuBarSheet`** (packages/ui) gets `onReorder?(groupKey, key, to)`. Each group's list uses the same `useReorder`
  hook as `TaskList` (`packages/ui/src/lib/reorder.ts`):
  - Rows carry `data-reorder` and `data-key`.
  - Press a row anywhere but its checkbox and drag it. A click that doesn't move still opens the task.
  - A grip shows in the left margin on hover, in the ghost colour, as on Today.
  - ⌥↑ and ⌥↓ on a focused title move the row one place, as on Today.
  - A row moves only within its own space's group, because each space keeps its own day. There is no hand-off between
    groups.
  - A group with one task has no grip and nothing to move.
- **Where the move goes** (new in `packages/core/src/menubar.ts`): `placeAmongMine(dayTasks, mineIds, key, to)` turns an
  index in the sheet (only your tasks) into an index in the space's whole day.
  - The task lands just before the row of yours it was dropped above, or just after the last one, wherever the others'
    tasks sit.
  - In a personal space the two lists are the same.
  - `MenuBarPage` then calls `taskStore.place(key, today, at)`, the call Today uses, so the desk moves too, live.
- **Offline**: the move waits in the same outbox as ticks. The offline line changes from "Ticks save here and go when
  you're back." to "Ticks and moves save here and go when you're back."
- **Error**: `taskStore.place` returns its change ids (it returns nothing now). `MenuBarPage` listens with
  `taskStore.onAnswered`.
  - If the server turns the move down (the task was moved or deleted elsewhere), a red `Banner` (tone `error`)
    folds in under the heading: "It's back where it was. Try again."
  - The store already reads the day again, so the row glides back.
  - The line goes with the next move, or when the sheet hides.
  - The menubar window has no toast host, so today's toast never shows there; this line replaces it.

## Motion

- **#123**: no new motion. The sheet still drops in over 160ms (ease-change). The pill keeps its scale-in.
- **#122**: Today's reorder motion, unchanged:
  - Lift: the row takes the pop shadow and follows the pointer, with no delay.
  - The others make room over 160ms (ease-change).
  - Drop: the row glides into its slot (dur-fold 300ms, ease-settle) and washes once (1.2s).
  - Less motion: no glide, no wash.

## States

- **Loading**: as built. The sheet shows only once every space's today has answered.
- **Empty**: no rows, nothing to drag. The empty state is unchanged and is shown on K-SheetFix with the new height and
  shadow.
- **Offline**: described above.
- **Error**: described above.
- **Scrambled**: titles are scrambled and dragging works the same.
- **Signed out**: no change.

## Design system and canvas

- **DS kit `MenuBarSheet`**:
  - The pill moves to the eyebrow line, and the date gets its ellipsis.
  - `onReorder` and the grip are added with the same reorder as the kit `TaskList`.
  - The offline words change.
  - The error banner is added as a state.
  - The app-only height and shadow are in the README's "In the app" notes, with the same values as the note window.
- **Canvas**:
  - K-SheetFix and K-SheetReorder are titled Built, and their stickies turn grey.
  - K-MenuBar (the shipped sheet boards) moves the pill to the eyebrow line and uses the new offline words, so no board
    shows the old heading.

## Test scenarios

Tests run on PR CI (Rohit, 10 Nov 2026: no test runs on his Mac). The IDs continue chunk 20 and go into
`docs/tests/chunk-20.md` under a new section, "The sheet's height, heading, shadow and order (#123, #122)".

### New

| ID      | Where                            | Scenario                                                                                                                                                                                                                                                                 |
| ------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| C20-U25 | core `menubar.test.ts`           | `placeAmongMine`: in a personal day, the sheet's index equals the day's. In a team day `[o1, m1, o2, m2, m3]` (o = others'), moving `m3` to 0 gives index 1 (before `m1`, after `o1`), and moving `m1` to the end gives index 4 (after `m3`). An unknown key gives null. |
| C20-U26 | ui `MenuBarSheet.test.tsx`       | Scrambled on: the pill is inside `.tp-mb-eb`, not in the heading row. The heading row's children are the day block and the ring only.                                                                                                                                    |
| C20-U27 | ui `MenuBarSheet.test.tsx`       | Two groups of three: ⌥↓ on the first title calls `onReorder(group, key, 1)`. ⌥↑ on a group's first row does nothing. A one-task group has no `data-reorder` grip. A plain click on a title still calls `onOpen`.                                                         |
| C20-U28 | web `MenuBarPage.test.tsx`       | A reorder in a team space calls `taskStore.place` with the day index from `placeAmongMine`. A rejected answer for that change shows "It's back where it was. Try again." under the heading. The next move, or `menubar:hidden`, clears it.                               |
| C20-U29 | web `MenuBarPage.test.tsx`       | Offline: the line reads "Ticks and moves save here and go when you're back."                                                                                                                                                                                             |
| C20-U30 | ui `MenuBarSheet.test.tsx`       | The list is the sheet's one scroller and is `position: relative`, so a group's hidden status line stays inside it and a long day never makes the page taller than the window                                                                                             |
| C20-E23 | e2e `menubar` (window 360 × 600) | Thirty tasks today, with `data-app='menubar'` set as the app sets it: `document.scrollingElement.scrollHeight <= innerHeight` (the page doesn't scroll), the list does scroll, and the sheet's height is at most 584px.                                                  |
| C20-E24 | e2e `menubar`                    | Scrambled on, at 360px: the eyebrow, the day and the date are each one line (their heights equal their line-heights), and the heading's height is the same as with Scrambled off.                                                                                        |
| C20-E25 | e2e `menubar`                    | In the app look (`data-app='menubar'`), the sheet's computed `box-shadow` has no part reaching more than 8px. In a plain tab it keeps `--shadow-pop`.                                                                                                                    |
| C20-E26 | e2e `menubar`                    | Drag the third row of Personal above the first. The sheet shows the new order, the server's Today order for Personal matches, and the desk page (same session) shows it too. ⌥↑ on a title does the same.                                                                |
| C20-E27 | e2e `menubar`                    | Northwind, someone else's task on the same day (the server gives each person their own tasks of a day): your third dragged above your first, then ⌥↓ twice back to the end, saves among yours on the server and the desk; the other person's day is unchanged            |
| C20-E28 | e2e `menubar`                    | Offline, move a row: it stays. Back online: the server has the new order.                                                                                                                                                                                                |
| C20-D12 | Mac `menubar-sheet.spec.ts`      | The real sheet on a full day: the page's scroll height equals the window's (one bar). A drag of a row by mouse events in the sheet reorders it, and the desk shows the new order.                                                                                        |

### Unchanged, must still pass

C20-U02..U04, U20..U23, C20-E01..E09, E20..E22, C20-D01..D09, and the Today reorder tests (C02 drag and Alt-arrow cases).

### Not automated

How the shadow looks against a real desktop picture. Manual check MC-M05 for Rohit after release: open the sheet over a
light and a dark window. The edge is soft all round, with no straight cut-off, and there is one scrollbar on a full day.
