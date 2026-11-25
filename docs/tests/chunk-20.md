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

| ID      | Where                      | Case                                                                                          |
| ------- | -------------------------- | --------------------------------------------------------------------------------------------- |
| C20-U20 | ui `MenuBarSheet.test.tsx` | New note's tooltip shows "New note ⌥⌘N" above, with `aria-keyshortcuts`; without it, New note |
| C20-E20 | e2e `menubar`              | The sheet with `noteShortcut` shows ⌥⌘N on New note; from an older app, New note alone        |

## The sheet follows the theme and Less motion ([docs/plans/menubar-sheet-theme.md](../plans/menubar-sheet-theme.md))

| ID      | Where                      | Case                                                                                                                                                         |
| ------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| C20-U21 | web `MenuBarPage.test.tsx` | A theme pick heard live (storage event) paints the sheet; one stored while hidden is painted on `menubar:shown`; System follows macOS; no `setAppearance`    |
| C20-U22 | web `MenuBarPage.test.tsx` | Less motion heard live, and taken up on `menubar:shown` when missed                                                                                          |
| C20-U23 | web `MenuBarPage.test.tsx` | A row due today reads "Due today", tomorrow "Due tomorrow", yesterday a red "Overdue", four days out "Due Tue" (#58)                                         |
| C20-E21 | e2e `menubar`              | Desk picks Dark, Light, Dark: the sheet matches each with no reload; a pick missed while hidden is taken up on show; System follows the page's colour scheme |
| C20-E22 | e2e `menubar`              | Less motion flipped on the desk reaches the sheet and the floating Quick Add with no reload, both ways                                                       |
| C20-D09 | Mac `desktop`              | #74's sequence in the real app: Light, then Dark, Light, Dark picked on the desk, the sheet opened after each, matching each time                            |
| MC-T01  | Manual, Mac build          | Dark → open sheet → Light → open sheet → Dark → open sheet: the sheet matches every time                                                                     |
| MC-T02  | Manual, Mac build          | System, flip macOS appearance with the sheet closed, open it: it matches macOS                                                                               |
| MC-T03  | Manual, Mac build          | Less motion on, open the sheet: no drop-in motion                                                                                                            |

## "Due today" in the sheet (#121) ([docs/plans/hash-edge-due-today.md](../plans/hash-edge-due-today.md))

| ID      | Where                                | Case                                                                                                                                               |
| ------- | ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| C20-U31 | ui `MenuBarSheet.test.tsx`           | A row due today: its byline's due span has `tp-dt` (`--warning`); a late one has `tp-od`; another day has neither; a crossed-off row keeps it grey |
| C20-U23 | web `MenuBarPage.test.tsx` (updated) | The sheet's "Due today" row is amber; tomorrow, yesterday and further are not                                                                      |

## The sheet's height, heading, shadow and order (#123, #122) ([docs/plans/menubar-sheet-fixes.md](../plans/menubar-sheet-fixes.md))

| ID      | Where                            | Case                                                                                                                                                                                                                                                          |
| ------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C20-U25 | core `menubar.test.ts`           | `placeAmongMine`: a personal day keeps the sheet's index; in a team day a move lands just before the row of yours it was dropped above, or just after your last; an unknown key or a lone task gives null                                                     |
| C20-U26 | ui `MenuBarSheet.test.tsx`       | Scrambled on: the pill is inside the eyebrow, and the heading row holds the day block and the ring only; the pill is 20px with its height taken back; the day and the date never wrap                                                                         |
| C20-U27 | ui `MenuBarSheet.test.tsx`       | ⌥↓ on a title calls `onReorder(group, key, to)`; ⌥↑ on a first row does nothing; a one-task group has no grip; a plain click still opens the task; a move turned down shows as an alert                                                                       |
| C20-U28 | web `MenuBarPage.test.tsx`       | A reorder in a team space calls `taskStore.place` with the whole day's index; a rejected answer for that change shows "It's back where it was. Try again."; the next move, or `menubar:hidden`, clears it                                                     |
| C20-U29 | web `MenuBarPage.test.tsx`       | Offline: the line reads "Ticks and moves save here and go when you're back."                                                                                                                                                                                  |
| C20-U30 | ui `MenuBarSheet.test.tsx`       | The list is the sheet's one scroller and is `position: relative`, so a group's hidden status line stays inside it and a long day never makes the page taller than the window                                                                                  |
| C20-E23 | e2e `menubar` (window 360 × 600) | Thirty tasks today in the app look: the page doesn't scroll, the list does, the sheet is at most 584px, and a wheel over the heading moves nothing                                                                                                            |
| C20-E24 | e2e `menubar`                    | Scrambled on at 360px: the eyebrow, the day and the date keep their heights and places, and the heading is as tall as with Scrambled off; the pill is 20px, on the eyebrow line                                                                               |
| C20-E25 | e2e `menubar`                    | In the app look no layer of the sheet's shadow reaches more than 8px; in a plain tab it is the pop shadow                                                                                                                                                     |
| C20-E26 | e2e `menubar`                    | Drag the third row of Personal above the first (pressed on its title): the sheet, the server and the desk show the new order, and nothing opens. ⌥↑ on a title moves it too and keeps the keyboard on it                                                      |
| C20-E27 | e2e `menubar`                    | Northwind, someone else's task on the same day (the server gives each person their own tasks of a day): your third dragged above your first, then ⌥↓ twice back to the end, saves among yours on the server and the desk; the other person's day is unchanged |
| C20-E28 | e2e `menubar`                    | Offline, a moved row stays moved and nothing says it failed; back online the server has the new order                                                                                                                                                         |
| C20-D12 | Mac `menubar-sheet.spec.ts`      | The real sheet on a full day: the page's scroll height equals the window's and only the list scrolls; a row dragged by mouse events in the sheet reorders it, on the server and on the desk                                                                   |

Manual check for Rohit after release, MC-M05: open the sheet over a light and a dark window. The edge is soft all round, with no straight cut-off, and there is one scrollbar on a full day.
