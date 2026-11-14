# Right-click task menu · test cases

The plan is [docs/plans/row-menu.md](../plans/row-menu.md). These ids (`RM-…`) come from that plan, not a chunk, so
`pnpm test:status` does not list them in STATUS.md; the test names carry them for `-g`. Unit, web and Mac tests run on
PR CI (and Actions › Flake check for repeats), not on Rohit's Mac.

## Unit (vitest)

| ID     | Where                                         | Case                                                                                                 |
| ------ | --------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| RM-U01 | `packages/ui/src/lib/rowMenu.test.ts`         | An open task on today: the items in order, Today ticked, no Remove without a due date                |
| RM-U02 | `packages/ui/src/lib/rowMenu.test.ts`         | Done, the Backlog, a due date and a project each show where the task is                              |
| RM-U03 | `packages/ui/src/lib/rowMenu.test.ts`         | No projects, projects loading, someone else's task (also RM-E13), lists that cannot move, no task ID |
| RM-U04 | `packages/ui/src/components/RowMenu.test.tsx` | Opens at the point, flips at the window's edges, reads as a menu                                     |
| RM-U05 | `packages/ui/src/components/RowMenu.test.tsx` | Hover opens a submenu after a beat; the keyboard walks it; Esc closes                                |
| RM-U06 | `packages/ui/src/components/RowMenu.test.tsx` | Closes on Esc, a left click outside, scroll, resize and blur; a right press alone leaves it          |
| RM-U07 | `packages/ui/src/components/RowMenu.test.tsx` | Right-click opens it on the row; another row or the same row moves it                                |
| RM-U08 | `packages/ui/src/components/RowMenu.test.tsx` | A menu fading out never closes the one that replaced it                                              |
| RM-U09 | `packages/ui/src/components/RowMenu.test.tsx` | Text being written and the paper keep the system menu; no `menu`, no Tudu menu                       |
| RM-U10 | `packages/ui/src/components/RowMenu.test.tsx` | Each action reaches the list: open, done, move with Undo, due, project, delete with Undo             |
| RM-U11 | `packages/ui/src/components/RowMenu.test.tsx` | Copy link and Copy task ID copy and say so; a refused copy says that                                 |
| RM-U12 | `packages/ui/src/components/RowMenu.test.tsx` | Pick a day… and Pick a date… open the row's own date picker                                          |
| RM-U13 | `packages/ui/src/components/RowMenu.test.tsx` | Touch: hold, then let go without moving opens the sheet; moving first is a drag                      |
| RM-U14 | `packages/ui/src/components/RowMenu.test.tsx` | The sheet offers the menu's actions; Project opens its page; the veil closes it                      |
| RM-U15 | `packages/ui/src/components/RowMenu.test.tsx` | An empty list has no rows to open a menu on                                                          |

## End-to-end, web (Playwright)

| ID     | Where                                        | Case                                                                                                  |
| ------ | -------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| RM-E01 | `packages/e2e/tests/today/row-menu.spec.ts`  | Move to › Tomorrow: the row folds with Undo, the server has it on Monday; Undo brings it back         |
| RM-E02 | `packages/e2e/tests/today/row-menu.spec.ts`  | Mark as done, Due date › Tomorrow and Project › Home from the menu; all survive a reload              |
| RM-E03 | `packages/e2e/tests/today/row-menu.spec.ts`  | Delete task: the row goes and the server deletes it; Undo brings it back in its place                 |
| RM-E04 | `packages/e2e/tests/today/row-menu.spec.ts`  | One menu at a time: another row moves it, the same row moves it to the pointer; the header gets none  |
| RM-E05 | `packages/e2e/tests/today/row-menu.spec.ts`  | Keyboard: Shift+F10, then to Move to › Tomorrow; Esc returns to the row                               |
| RM-E06 | `packages/e2e/tests/backlog/backlog.spec.ts` | A Backlog row: Move to › Today plans it; Mark as done folds it away with the Backlog's toast          |
| RM-E07 | `packages/e2e/tests/week/week.spec.ts`       | A week tile row: Move to › Backlog moves it into the Backlog tile and the server has it               |
| RM-E08 | `packages/e2e/tests/all-spaces/…spec.ts`     | All spaces: the Project list holds the task's own space's projects; picking one keeps it in its space |
| RM-E09 | `packages/e2e/tests/today/row-menu.spec.ts`  | Copy link puts the task's link on the clipboard and says so (not WebKit: no clipboard permission)     |
| RM-E10 | `packages/e2e/tests/today/row-menu.spec.ts`  | Offline: Move to and Delete apply at once and reach the server when back                              |
| RM-E11 | `packages/e2e/tests/today/row-menu.spec.ts`  | Phone: press and hold, let go: the sheet; Tomorrow moves it                                           |
| RM-E12 | `packages/e2e/tests/inbox/unified.spec.ts`   | An Inbox row gets no task menu on a right-click                                                       |
| RM-E13 | unit only (RM-U03)                           | Someone else's task never shows in your lists (C21-E02), so there is no row to right-click            |
| RM-E14 | `packages/e2e/tests/today/row-menu.spec.ts`  | Dark: the menu takes the dark popover colour                                                          |

## End-to-end, Mac (`packages/e2e/mac/tests/row-menu.spec.ts`, macOS CI runner)

| ID     | Case                                                                                                                               |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| RM-D01 | A right-click on a row (WebKit's event sequence, sent in the page) is cancelled and shows Tudu's menu; Move to › Tomorrow moves it |
| RM-D02 | A right-click in the writing line is left alone (not cancelled, no Tudu menu), so the system's text menu shows                     |

CI cannot post a real right-click to the app, so RM-D01 checks that the page cancels `contextmenu` (which is what keeps
WebKit's own menu away) rather than looking at the screen.

## Manual (Rohit, Mac app on staging)

| ID     | Case                                                                                                    |
| ------ | ------------------------------------------------------------------------------------------------------- |
| MC-R01 | Two-finger click on the trackpad and Ctrl-click both open Tudu's menu, no WebKit menu; it feels instant |
| MC-R02 | Right-click quickly down a column of rows: the menu follows without a flicker                           |
