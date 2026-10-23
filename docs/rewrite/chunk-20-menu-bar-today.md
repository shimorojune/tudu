# Chunk 20 · Today in the menu bar

Status: approved 23 Oct 2026 and built on `claude/project-thread-fsltm1` (one branch for chunks 17 to 20).

Boards: 13 Next, K-MenuBar and K-MenuBar-Dark ("Today, from the menu bar"), and K-Proto's menu bar. A click on the ink
tick, left or right, opens a small sheet: today's tasks across your spaces, ticked off right there, with New task,
Open Tudu and ⋯. The native tray menu goes (your call, 23 Oct 2026). Chunk 16 makes Tudu live in the menu bar with
no Dock icon. This chunk is what the tick opens.

## Scope

- **The click.** Left or right click on the tick opens the sheet under it. A second click, Esc, or clicking
  anywhere else closes it. The tick shows as pressed while the sheet is open. There is no native menu any more.
- **The sheet.** It is 360px wide, up to 600px tall (it scrolls past that), on the card colour with the popover
  shadow, and it drops in over 160ms. It holds, from the top:
  - **The head.** "Today", "Week 43", the date ("Friday 23 October"), and the ring with "2 of 5".
  - **The tasks.** Every space you are in, Personal first, then the others in the switcher's order. A space with
    nothing today is left out. With more than one space shown, each gets its name and its own "1 of 3"; Personal
    alone is one plain list. Only your own tasks, never someone else's shared ones.
  - **A row.** It holds the real checkbox (the ink tick and its sparkle; the row stays where it is, struck
    through), the title (two lines at most), and the byline as on Today: the project's dot and name, a Jira key,
    "From Sat" for a carried task, "Overdue" in red. Ticking the last one closes the ring with its sparks.
  - **The foot.** New task ⌘⇧N (quiet), Open Tudu (quiet), and ⋯, which holds Send feedback… and Quit Tudu ⌘Q.
- **What a click does.** A title opens the desk on that task (its space, its day, the panel open) and the sheet
  closes as the window comes forward. New task closes the sheet and summons the floating bar (chunk 04). Open Tudu
  brings the window back (chunk 16's reopen). Send feedback… opens the window with the form up (chunk 19). Quit
  Tudu ends the process.
- **Today is the app's today.** The 04:00 turn is included, so at 02:00 the sheet still shows yesterday's sheet,
  as the desk does.
- **Nothing today.** "Nothing planned for today.", "Tomorrow has 3." and "The Backlog has 12 waiting for a day."
  (each line only when true), with New task.
- **Offline.** A line under the head reads "Ticks save here and go when you're back." Ticks go into the same
  outbox as the desk's.
- **Signed out.** "Sign in to see your day.", "Your tasks show here once you are signed in on this Mac.", Open
  Tudu (primary), and ⋯ with Quit Tudu alone.
- **Live.** A task added or ticked on the desk or another device shows within a second, through the same live
  stream.
- **Data.** None new. The sheet reads each space's `GET /api/spaces/:id/days/:day` (filtered to yours) and listens
  on `GET /api/events`, which already carries every space you are in.

Out of scope: the Inbox's waiting tasks in the sheet (open question on the sticky), dragging to reorder in the
sheet, editing a title in place, a global shortcut for the sheet, and Windows or Linux trays.

## Choices

1. **A webview popover, not a native menu with checkmarks.** The sheet is a second Tauri window (`menubar`,
   borderless, transparent, always on top, not in ⌘Tab), created hidden at launch and placed under the tray icon
   by its rectangle on every open. It loads the same web bundle on `/menubar`, so the checkbox, the byline and the
   sparkle are the app's own components, and the outbox and the session are shared through the same origin. The
   alternative, an `NSMenu` with checkmark items, is native but cannot draw the byline, the ring or the sparkle,
   and a tick in a menu closes the menu.
2. **The sheet closes when it loses focus.** This is the macOS popover rule (Fantastical, 1Password): the window
   hides on blur, and the tray click toggles it. The alternative, a sheet that stays until clicked away, sits over
   your work.
3. **One stream per window.** The sheet opens its own live stream while it is shown and closes it when hidden.
   The main window keeps its own. The alternative routes events from the main window through the bridge, which
   couples the sheet to a window that may be reloading.
4. **New design system parts.** `MenuBarSheet`, `MenuBarRow` and the empty and signed-out states move from the
   board's `k-mb-*` markup into `packages/ui` as `tp-mb-*`, with kit states light and dark.

## Changes to earlier chunks

- Chunk 11: the tray's native menu (Open Tudu, New task ⌘⇧N, Quit Tudu) is removed. C11-D01's check of the tray's
  items and C11-D02's use of its Open Tudu move to the sheet.
- Chunk 16: it removes the native menu and draws the count beside the tick. **Order:** if chunk 16 ships first, it
  keeps today's native menu until this chunk replaces it, so the tick is never a dead click. Its C16-U02 and
  C16-D06 then run against the sheet once this lands.
- The design deviations register: the Desktop line for the tray and the 13 Next line for the menu bar both go,
  replaced by one Desktop line for the sheet.

## Test plan

Unit (`packages/core`, `packages/ui`, `apps/web`, `apps/desktop`):

| ID      | Component    | Case                                                                                                                                                  |
| ------- | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| C20-U01 | core         | The gather: spaces in the switcher's order with Personal first, empty spaces dropped, only your tasks, carried ones marked "From …", the 04:00 turn   |
| C20-U02 | MenuBarSheet | One space: no headings; two: names and per-space counts; the ring's count; the foot's buttons and ⋯'s items, signed in and signed out                 |
| C20-U03 | MenuBarSheet | The empty state's lines appear only when true; the offline line; a row's byline matches Today's for the same task                                     |
| C20-U04 | web          | A tick writes to the outbox once and the row stays in place; a title click asks the bridge to open the task; the stream opens on show, closes on hide |
| C20-U05 | desktop      | Rust: the sheet's position from the tray rectangle on each screen edge; left and right click both toggle; blur hides; no native menu is attached      |

End-to-end, group `menubar` (Chromium on `/menubar` with the desktop bridge faked, which records `openTask`,
`summon`, `showMain`, `quit` and `feedback`):

| ID      | Case                                                                                                                                            |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| C20-E01 | Personal with three tasks today: the head, the ring "0 of 3", three rows with their bylines; tick one: "1 of 3", the row struck in place        |
| C20-E02 | Personal and Northwind: two headed groups in order; a space with nothing today is absent; someone else's shared task never shows                |
| C20-E03 | Live: a task added in a second browser context of the same person shows within a second; a tick there shows here                                |
| C20-E04 | Title click: the bridge gets `openTask` with the space, day and id; New task gets `summon`; Open Tudu `showMain`; ⋯ › Send feedback… `feedback` |
| C20-E05 | Nothing today with 3 tomorrow and 12 in the Backlog: the three lines; with none tomorrow, that line is absent                                   |
| C20-E06 | Offline: the line shows; a tick made offline reaches the server on reconnect                                                                    |
| C20-E07 | Signed out: the sentence, Open Tudu, and ⋯ with Quit Tudu alone                                                                                 |
| C20-E08 | The clock at 02:00 on Saturday: the sheet shows Friday's tasks, as the desk does                                                                |
| C20-E09 | Dark: E01 and E02 again in dark; the kit shows every sheet state light and dark                                                                 |

Desktop, group `desktop` (Tudu Test over its control channel, which learns to click the tray and read the sheet's
window):

| ID      | Case                                                                                                                     |
| ------- | ------------------------------------------------------------------------------------------------------------------------ |
| C20-D01 | A left click shows the sheet under the tick; a second click hides it; a right click shows it too; no native menu appears |
| C20-D02 | With the window hidden (chunk 16): tick a task in the sheet; Open Tudu; the desk shows it ticked                         |
| C20-D03 | A title click brings the window forward on that task with the panel open, and the sheet is hidden                        |
| C20-D04 | Clicking another app hides the sheet; Esc hides it                                                                       |
| C20-D05 | ⋯ › Quit Tudu ends the process, signed in and signed out                                                                 |

Not automated: the sheet's placement on a real notch MacBook and with the menu bar auto-hidden. Judge those on Tudu
Staging.

## Done when

- The tests above pass three runs in a row locally, in CI and on the macOS runner.
- On Tudu Staging, the tick opens today across your spaces, ticks there show on your phone within a second, and the
  sheet matches K-MenuBar light and dark.
