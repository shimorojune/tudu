# Chunk 20 · Today in the menu bar · test cases

Status column is kept by `pnpm test:status` in [STATUS.md](STATUS.md). Run this chunk's tests with
`pnpm test -- --project core --project ui --project web`, `cargo test --features control` in
`apps/desktop/src-tauri` (on a Mac), `pnpm e2e menubar` and, on the macOS runner, the desktop group in
`packages/e2e/mac`.

## Unit (`packages/core`, `packages/ui`, `apps/web`, `apps/desktop`)

| ID      | Component    | Case                                                                                                                                                   |
| ------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| C20-U01 | core         | The gather: spaces in the switcher's order with Personal first, empty spaces dropped, only your tasks, carried ones marked "From …", the 04:00 turn    |
| C20-U02 | MenuBarSheet | One space: no headings; two: names and per-space counts; the ring's count; the foot's buttons and ⋯'s items, signed in and signed out                  |
| C20-U03 | MenuBarSheet | The empty state's lines appear only when true; the offline line; a row's byline matches Today's for the same task                                      |
| C20-U04 | web          | A tick writes to the outbox once and the row stays in place; a title click asks the bridge to open the task; the stream opens on show, closes on hide  |
| C20-U05 | desktop      | Rust: the sheet's position from the tray rectangle on each screen edge; left and right click both toggle; the click that blurred it does not reopen it |
| C20-U06 | desktop      | Rust: a click or an app coming forward outside Tudu puts the shown sheet away; Tudu's own, or a hidden sheet, does nothing                             |

## End-to-end (`packages/e2e/tests/menubar`, desktop size)

| ID      | Case                                                                                                                                                |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| C20-E01 | Personal with three tasks today: the head, the ring "0 of 3", three rows with their bylines; tick one: "1 of 3", the row struck in place            |
| C20-E02 | Personal and Northwind: two headed groups in order; a space with nothing today is absent; someone else's shared task never shows                    |
| C20-E03 | Live: a task added on another device of the same person shows within a second; a tick on the desk shows here                                        |
| C20-E04 | Title click: the bridge gets `openTask` with the space's Today and the task; New task `summon`; Open Tudu `showMain`; ⋯ › Send feedback… `feedback` |
| C20-E05 | Nothing today with 3 tomorrow and 12 in the Backlog: the lines; with none tomorrow, that line is absent                                             |
| C20-E06 | Offline: the line shows; a tick made offline reaches the server on reconnect                                                                        |
| C20-E07 | Signed out: the sentence, Open Tudu, and ⋯ with Quit Tudu alone                                                                                     |
| C20-E08 | At 02:00 the sheet shows the day before, as the desk does                                                                                           |
| C20-E09 | Dark: E01 and E02 again in dark; the kit shows every sheet state light and dark                                                                     |

## Desktop (`packages/e2e/mac`, Tudu Test on the macOS runner)

| ID      | Case                                                                                                                     |
| ------- | ------------------------------------------------------------------------------------------------------------------------ |
| C20-D01 | A left click shows the sheet under the tick; a second click hides it; a right click shows it too; no native menu appears |
| C20-D02 | With the window hidden: tick a task in the sheet; Open Tudu; the desk shows it ticked                                    |
| C20-D03 | A title click brings the window forward on that task with the panel open, and the sheet is hidden                        |
| C20-D04 | With Tudu in front, clicking another app hides the sheet; Esc hides it. Finder is checked to be in front (lsappinfo)     |
| C20-D05 | ⋯ › Quit Tudu ends the process, signed in and signed out                                                                 |
| C20-D06 | With another app in front (Tudu not active), another app coming forward hides the sheet. Both apps checked in front      |
| C20-D07 | With another app in front, a click in it hides the sheet; after the grace a click on the tick opens it again             |

## The note window's shortcut ([docs/plans/note-window-fixes.md](../plans/note-window-fixes.md))

| ID      | Where                       | Case                                                                                       |
| ------- | --------------------------- | ------------------------------------------------------------------------------------------ |
| C20-U20 | ui `MenuBarSheet.test.tsx`  | New note's tooltip shows "New note ⌥⌘N" above, with `aria-keyshortcuts`; without it, New note |
| C20-E20 | e2e `menubar`               | The sheet with `noteShortcut` shows ⌥⌘N on New note; from an older app, New note alone        |
