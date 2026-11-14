# Right-click a task: one menu on every task list

Status: approved by Rohit on 14 Nov 2026; built. Asked by Rohit on 14 Nov 2026 ("on the tasks lists, I want right click
context menu options so I can do actions quickly"). Design approved by Rohit on 14 Nov 2026: canvas page Today, the
right-click draft row, boards `T-RowMenu`, `T-RowMenu-Dark`, `T-RowMenuMotion`, `T-RowMenuStates`,
`T-RowMenuStates-Dark`, `T-RowMenuPhone`, `T-RowMenuPhone-Dark` (canvas v240). Test cases are listed below with the
`RM-` prefix and as built in `docs/tests/row-menu.md`.

Rohit's calls during the canvas round (14 Nov):

- The **same Tudu menu** in the browser and the Mac app. No native macOS menu.
- Not "Cross off": the action reads **Mark as done** (and **Mark as not done** on a done task).
- With a menu open, right-clicking another row moves the menu to that row; right-clicking the same row moves it to
  the new pointer. Neither closes it, and nothing flickers.

## Why

Every action on a task today is one or two steps away: open the panel, or find the right pill on the row (the date
pill, the due pill, the checkbox). People who live in the lists want the usual desktop answer: right-click the row and
pick the action.

## What changes for the person

1. **Right-click any task row** on a task list and a menu opens at the pointer:

   | Item                                                      | What it does                                                                                                             |
   | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
   | Open                                                      | Opens the task panel, as clicking the row does                                                                           |
   | Mark as done / Mark as not done                           | The row's checkbox, with its ink and spark (and the Backlog's fold-away with Undo)                                       |
   | Move to ▸ Today, Tomorrow, Pick a day…, Backlog           | Moves it like the date pill / calendar button does: fold, toast with Undo. Where it is now is ticked and can't be picked |
   | Due date ▸ Today, Tomorrow, Pick a date…, Remove due date | Sets the due date like the due pill. Remove only when it has one. The submenu row shows the current due words            |
   | Project ▸ the space's projects, No project                | Sets the project. The current one is ticked. No projects: one greyed line "No projects yet"                              |
   | Copy link                                                 | The task's link, as the ID chip copies it. Toast "Link copied" (failure: "Couldn’t copy the link. Try again.")           |
   | Copy task ID                                              | "ME-41"; the ID shows at the row's end in mono. Failure uses the ID chip's words                                         |
   | Delete task                                               | Red. Folds the row away; toast "Task deleted" with Undo. No confirm dialog, as in the task panel                         |

   "Pick a day…" and "Pick a date…" open the existing date popover (`DatePop` + `MiniCalendar`) on the row's title.

2. **Where**: every list built on `TaskList` that edits tasks: Today, any day, 2 days, the Backlog page (open and
   Crossed off views), the Backlog beside Today (#102, when it lands), Week tiles, and All spaces. It is one prop on
   the shared `TaskList`, so no list can drift. **Not** on People and Inbox (read-only lists): there right-click stays
   the browser's own.
3. **All spaces**: the Project list holds the projects of the space the task lives in. Moving keeps it in its space.
4. **Someone else's task** (shared space, `ownerId` not me): the menu shows Open, Copy link and Copy task ID only,
   matching what the panel lets you do.
5. **Same menu, browser and Mac app.** The Mac app's WKWebView never shows its own menu on a row (the page calls
   `preventDefault`). Right-click on text you are editing (the writing line, a subtask being typed) keeps the
   system's menu, so spelling and paste still work. Right-click on empty paper is the browser's / the Mac's as today.
6. **Keyboard**: Shift+F10 or the menu key on a focused row opens the menu under the row's title with the first item
   focused. ↑↓ move, → or Enter opens a submenu, ← or Esc closes it, Enter picks, Esc closes the menu and focus goes
   back to the row.
7. **Closing**: Esc, a left click anywhere else, scrolling the list, resizing or leaving the window. A right-click on
   another row (or the same row) moves the menu there. A right-click anywhere that is not a task closes it.
8. **Touch** (phones and touch screens): press and hold a row 320ms; it settles 1.5% smaller. Let go without moving
   and a bottom sheet rises (the Quick Add grabber): the task's title and ID, Mark as done and Open rows, Move to and
   Due date chips (Today, Tomorrow, Backlog / Remove, Pick a day / a date), a Project row that slides to a second page
   with Back, Copy link and Delete task. Moving more than 8px before letting go is the drag it is today, so
   reordering is untouched.
9. **While open**, the row keeps the neutral hover wash (no colour, no outline).
10. **States** (T-RowMenuStates): a loading (shimmering) list has no menu; an empty list has none; offline every action
    still works and syncs later (Copy needs no network); a change the server refuses puts the row back with the usual
    "That change couldn’t be saved." toast.
11. **Motion** (T-RowMenuMotion): in 160ms (scale .96 → 1 from the pointer corner, ease-arrive), flipping up or left at
    window edges; submenus slide 4px and fade in 120ms after a 60ms hover, kept open 120ms on a diagonal move; out
    130ms; the row wash 160ms. A second right-click swaps at once (the old menu goes without fading, the new one grows
    in). Picking runs the action's own motion (fold 300ms, tick 300ms, toast 200ms). Touch: sheet up 260ms
    ease-settle over a 200ms veil, down 220ms, Project page 240ms. Reduce motion: 120ms fades, the sheet appears
    without rising.

## How

### Design system (`packages/ui`)

- New `RowMenu` (desktop menu, submenus, keyboard, flip-at-edges, portal) and `RowSheet` (touch sheet) components,
  built from the canvas draft (`RowMenu`, `RowSheet`, `CtxDatePop` in the canvas DS bundle), with their CSS
  (`.tp-ctx*`, `.tp-ctxs-*`) moved into `packages/ui/src/styles`. Both take a pure item model from
  `rowMenuModel(task, { today, day, projects, can })` in `packages/ui/src/lib/rowMenu.ts`, so the menu and the
  sheet can never list different actions.
- `RowMenu` is not Radix `DropdownMenu`: Radix opens from a trigger element, while this one opens at a point and must
  move between rows without closing. It follows the same ARIA (`role="menu"`, `menuitem`, `menuitemradio` with
  `aria-checked` for the ticks, `aria-haspopup` on submenu rows).
- `TaskList` gains one prop:

  ```ts
  /** Right-click (and Shift+F10, and press-and-hold on touch) opens the row menu. Leave out for read-only lists. */
  menu?: {
    projects?: (task: TaskItem) => RowMenuProject[] | undefined; // undefined while loading: "Loading…" line
    onSetProject?: (task: TaskItem, projectId: string | null) => void;
    onDelete?: (task: TaskItem) => void;   // the list folds the row first, then toasts "Task deleted" with Undo
    onRestore?: (task: TaskItem) => void;  // that Undo
    linkFor?: (task: TaskItem) => string;  // when the list has no `linkFor` of its own (the week's tiles)
    readOnly?: (task: TaskItem) => boolean; // someone else's task: Open and copy only
  };
  ```

  Everything else reuses the props the list already has: `onOpenTask`, the checkbox (`onToggleTask` /
  `leaveDone` path, so the Backlog's fold-away is the same), `onMoveTask` (with Undo, as the date pill),
  `onDueChange`, `linkFor` and the row's `id`. `TaskItem` gains `readOnly?: boolean` for someone else's task.

- The open menu's state is keyed by a counter (`n`), and a close only clears its own `n`, so a menu fading out can
  never close the one that replaced it (the glitch Rohit found on the canvas). A right-button `pointerdown` is left to
  the `contextmenu` event, which either moves the menu (on a row) or closes it at once (anywhere else).
- Touch hold reuses `reorder.ts`'s `TOUCH_HOLD_MS` (320) and `TOUCH_SLOP_PX` (8): a hold that is let go without
  moving opens the sheet; moving starts the drag as now. The click that follows the release is swallowed.

### Web app (`apps/web`)

- `TodayPage`, `BacklogPage` (both views), `WeekPage` and All spaces pass `menu`. Projects come from
  `taskStore.projectsQuery(spaceId)`; in All spaces from the task's own space (`cachedProjects`, fetched on open).
- Delete calls `taskStore.remove(id)` and the toast's Undo `taskStore.restore(id)`, like `TaskPanel`. If the deleted
  task is open in the panel, the panel closes.
- `InboxPage` and `PeoplePage` do not pass `menu`.

### Mac app (`apps/desktop`)

No Rust or Tauri change: the menu is the page's own. The page's `preventDefault` on a row's `contextmenu` keeps
WKWebView's menu away; text fields keep it.

### Canvas and docs

When built: DS `RowMenu` + `RowSheet` pages and the `TaskList` page's new prop on the design system artifact; the
canvas draft sheets lose the Draft marks and the canvas DS bundle matches `packages/ui` (the daily fold picks them
up). The shared T-Desktop / A-Desktop / Week / Backlog boards get `menu` on their lists so right-click works there too.

## Test scenarios

All tests run on PR CI (and Actions › Flake check for repeats), not on Rohit's Mac.

### Unit (vitest)

| ID     | Where                                         | Case                                                                                                                                                        |
| ------ | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RM-U01 | `packages/ui/src/lib/rowMenu.test.ts`         | Model for an open task on today: items and order; Move to ticks Today and disables it; Due has no Remove without a due date                                 |
| RM-U02 | `packages/ui/src/lib/rowMenu.test.ts`         | Done task reads Mark as not done; a Backlog task (day null) ticks Backlog; a due date adds Remove and the due words; the task's project is ticked           |
| RM-U03 | `packages/ui/src/lib/rowMenu.test.ts`         | No projects: one disabled "No projects yet"; projects loading: "Loading…"; `readOnly`: Open, Copy link, Copy task ID only                                   |
| RM-U04 | `packages/ui/src/components/RowMenu.test.tsx` | Opens at the point; flips up and left at the window's edges; portal into the desk; `role=menu`, ticks are `menuitemradio` with `aria-checked`               |
| RM-U05 | `packages/ui/src/components/RowMenu.test.tsx` | Hover opens a submenu after 60ms; a diagonal move keeps it 120ms; keyboard ↑↓ → ← Enter Esc; Shift+F10 focuses the first item; Esc returns focus to the row |
| RM-U06 | `packages/ui/src/components/RowMenu.test.tsx` | Closes on Esc, left click outside, scroll, resize, blur; a right-button pointerdown outside does not close it by itself                                     |
| RM-U07 | `packages/ui/src/components/RowMenu.test.tsx` | Right-click a row opens the menu with that row washed; right-click another row moves it (one menu, new row washed); same row moves it to the new point      |
| RM-U08 | `packages/ui/src/components/RowMenu.test.tsx` | A menu still fading out never closes the menu that replaced it (fake timers: right-click A, right-click B, run all timers, B's menu is open)                |
| RM-U09 | `packages/ui/src/components/RowMenu.test.tsx` | Right-click in the writing line or a subtask input keeps the browser menu (no `preventDefault`); right-click on empty paper too; no `menu` prop: no menu    |
| RM-U10 | `packages/ui/src/components/RowMenu.test.tsx` | Each action calls the right prop: open, toggle (and the Backlog's leave path), move (today, tomorrow, Backlog) with Undo, due, project, delete with Undo    |
| RM-U11 | `packages/ui/src/components/RowMenu.test.tsx` | Copy link and Copy task ID copy the right text and toast; a refused copy shows the ID chip's failure words                                                  |
| RM-U12 | `packages/ui/src/components/RowMenu.test.tsx` | Pick a day… / Pick a date… open the date popover on the row; a pick moves / sets due; the same day does nothing                                             |
| RM-U13 | `packages/ui/src/components/RowMenu.test.tsx` | Touch: hold 320ms then let go opens the sheet and swallows the click; moving 9px before 320ms is a drag and no sheet; a mouse hold does nothing             |
| RM-U14 | `packages/ui/src/components/RowMenu.test.tsx` | Sheet lists the same actions as the menu; Project page with Back; veil tap and swipe down close it; reduce motion has no rise                               |
| RM-U15 | `packages/ui/src/components/RowMenu.test.tsx` | A loading list (skeleton) and an empty list open no menu                                                                                                    |

### End-to-end (Playwright, web)

| ID     | Group        | Case                                                                                                                                                    |
| ------ | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RM-E01 | `today`      | Right-click a row, Move to › Tomorrow: the row folds, the toast offers Undo, the server has it on tomorrow; Undo puts it back where it was              |
| RM-E02 | `today`      | Mark as done from the menu ticks the row and counts it; Due date › Tomorrow shows "Due tomorrow"; Project › Platform shows the pill; all survive reload |
| RM-E03 | `today`      | Delete task: row gone, server deleted; Undo brings it back in its place                                                                                 |
| RM-E04 | `today`      | Right-click row A then row B: one menu, at B; right-click B again at another point: one menu, moved; right-click the header: no menu                    |
| RM-E05 | `today`      | Shift+F10 on a focused row, keyboard to Move to › Tomorrow, Enter: moved; Esc returns focus to the row                                                  |
| RM-E06 | `backlog`    | Backlog row: Move to › Today plans it (gone from the Backlog, on today); Mark as done folds it with the Backlog's toast                                 |
| RM-E07 | `week`       | Week tile row: Move to › Backlog moves it into the Backlog tile; the server has it undated (the fixed clock is Sunday, so a later weekday is next week) |
| RM-E08 | `all-spaces` | All spaces: the Project list holds the task's space's projects only; setting one keeps the task in its space                                            |
| RM-E09 | `today`      | Copy link puts the task link on the clipboard (permissions granted); the toast says Link copied                                                         |
| RM-E10 | `today`      | Offline (route aborted): Move to and Delete apply at once and sync on reconnect                                                                         |
| RM-E11 | `today`      | Phone (touch): press and hold, let go: the sheet; Move to Tomorrow chip moves it; press, hold and move: a drag, no sheet                                |
| RM-E12 | `inbox`      | Inbox rows: right-click shows no Tudu menu (People has no task rows of its own)                                                                         |
| RM-E13 | unit only    | Someone else's task: Open, Copy link, Copy task ID only. Covered by RM-U03; others' tasks never show in your lists (C21-E02), so there is no row to try |
| RM-E14 | `today`      | Dark theme: the menu's background is the dark `--popover` token                                                                                         |

### Desktop (Tudu Test on the macOS CI runner)

| ID     | Case                                                                                                                                                                                                         |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| RM-D01 | In the real WKWebView, a right-click on a row (WebKit's event sequence, sent from the page) is cancelled by the page and shows Tudu's menu; Move to › Tomorrow works. That no WebKit menu is drawn is MC-R01 |
| RM-D02 | Right-click in the writing line still gets the system's text menu (Tudu's menu not shown)                                                                                                                    |

### Manual (Rohit, Mac app on staging)

| ID     | Case                                                                                 |
| ------ | ------------------------------------------------------------------------------------ |
| MC-R01 | Two-finger click on the trackpad and Ctrl-click both open the menu; it feels instant |
| MC-R02 | Right-click quickly down a column of rows: the menu follows without a flicker        |

## Risks

- Ctrl-click on a Mac fires `contextmenu`, so Ctrl-click no longer behaves as a plain click on a row. Nothing in Tudu
  uses Ctrl-click today.
- WKWebView sends `contextmenu` reliably for a two-finger click; Force Touch "look up" is a different gesture and is
  left alone.
- The touch hold shares its timing with drag; a sheet that opens on a hold that was meant as a drag would be the
  worst case. RM-U13 and RM-E11 pin the rule: any move over 8px before release is a drag. On lists that reorder, the hold is
  reorder's own lift let go without moving (`onHoldRelease`); on static lists (the Backlog's Crossed off) the list
  runs its own 320ms hold.
- Week tiles are narrow; the menu flips left near the right edge (RM-U04).
