# Chunk 02 · Today

Status: proposed, awaiting approval.

Boards: 01 Today (desktop, dark, tablet, phone, states, phone states, motion), 00 The task row, 00 Components (checkbox and the row), P-IdEnd (the ID at the end of the byline).

## Scope

- **Tasks exist.** Schema: tasks (id, space, title, planned day or none, position, crossed off at, carried from, created, updated, soft delete) and per-space task numbers with a prefix (Personal is `ME`, so a task reads `ME-58`). Everything here is for the space you are in; Personal is the only one until chunk 08.
- **Local-first writes.** The outbox from chunk 01 carries real mutations: create, rename, cross off, uncross, reorder, move to a day, delete. Each applies to the list at once; `POST /api/sync` replays them in order, last write wins per field by the client's clock, and the server answers with the rows as they are. A rejected mutation rolls the row back with a toast. The live stream tells other tabs and devices.
- **The day page**, as drawn: one plain list, crossed-off tasks stay in place struck through, the ring counts them, finishing the day plays the reward once. "Write the next thing…" on the last line (Enter adds and keeps writing); on desktop hover the gap between two tasks for the "+" and write there. Click anywhere on a row to open it (the detail panel arrives with chunk 03; until then the row's own title edits in place). Click the task ID to copy it, with the toast.
- **The row's byline**: date words ("→ From Sat", red when slipping, "Overdue since Fri" once due dates exist in chunk 03), the task ID. Subtasks, comments, Jira and projects join the byline as their chunks land.
- **Reorder by drag**: the grip in the left margin, the lifted slip with its tilt, rows gliding apart, the settle and wash; press and hold on phones.
- **Turning the day**: the arrows, the title's calendar, swipe on phones; the sheet turns as the Sheet already does. Days with tasks show a dot in the calendar and in the sidebar's week.
- **Two days** on desktop: the Day | 2 days switch, the second sheet sliding out from behind the first, each sheet with its own arrows and calendar, tasks dragged between them to move their day.
- **Carried over**: an unfinished task moves to today by itself when the day changes (the client asks for "today" and the server rolls earlier days forward, once); its byline says "→ From Sat" and the pill's picker keeps it or moves it. After two days it turns red.
- **States**: loading (skeleton rows under the header), empty, error with Try again, offline banner (writes keep working from the outbox), the after-midnight banner ("It's 00:40 on Monday. You're still on Sunday's list." with Start Monday and Stay on Sunday), a very full day (the list scrolls inside the sheet).

Out of scope: subtasks, notes, comments, due dates and the detail panel (chunk 03), Quick Add (chunk 04), projects (chunk 04), team spaces (chunk 08).

## Test plan

Unit (`packages/ui`, `packages/client`, `packages/core`):

| ID      | Component   | Case                                                                                                                          |
| ------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------- |
| C02-U01 | TaskRow     | Renders checkbox, title and the byline with the ID last; a row with nothing else stays one line                               |
| C02-U02 | TaskRow     | Crossing off: aria-checked, the strike class after the tick, the sparkle once; uncrossing plays nothing                       |
| C02-U03 | TaskRow     | Click anywhere on the row calls onOpen; the checkbox, byline items and a drag do not                                          |
| C02-U04 | TaskRow     | The ID click copies it, flashes in place and shows "Copied ME-41"                                                             |
| C02-U05 | TaskRow     | The carried pill reads "→ From Sat", turns red after two days, opens its picker; keep clears the marker, another day moves it |
| C02-U06 | TaskRow     | Titles clamp to two lines (three compact) and keep the full text in the title attribute                                       |
| C02-U07 | TaskList    | Renders rows in order; onReorder gets the new order after a keyboard move                                                     |
| C02-U08 | TaskList    | Drag with the pointer: starts after 4px, the lifted row and the gap, drop reorders, the ending click is ignored               |
| C02-U09 | TaskList    | Touch: a quick swipe does not lift; press and hold does                                                                       |
| C02-U10 | TaskList    | A new task from the add line opens its gap and gets the wash; the line stays open for the next                                |
| C02-U11 | TaskList    | The "+" between rows: appears on hover after the pause, writes a task in that slot, hidden while dragging and when filtered   |
| C02-U12 | TaskList    | Two lists in a group accept each other's rows; onMoveTask reports the move                                                    |
| C02-U13 | TaskList    | flashKey opens the gap and washes a row added from outside; locateKey scrolls to and flashes a row                            |
| C02-U14 | AddTask     | Serif placeholder until the first keystroke, Enter adds and keeps writing, Esc stops, blank text adds nothing                 |
| C02-U15 | DatePop     | Positions beside its anchor, flips up near the bottom, eases out on Esc, click away and scroll                                |
| C02-U16 | Spread      | Opening mounts the second page and moves both in one step; closing unmounts after the move; reduced motion fades              |
| C02-U17 | DayProgress | The ring fills with the count and plays the reward once when the last task is crossed off                                     |
| C02-U18 | Banner      | The after-midnight banner with Start Monday (primary) and Stay on Sunday                                                      |
| C02-U19 | client      | Mutations apply to the cached day at once and queue in the outbox; a rejected one rolls back and toasts                       |
| C02-U20 | client      | A live event for a day refreshes it; events for other days do not refetch it                                                  |
| C02-U21 | core        | Fractional positions: between, first, last, and renumbering when they get too close                                           |
| C02-U22 | core        | Carried labels: "From Sat" within a week, "From 4 Oct" further back, slipping after two days                                  |

API (`apps/server`):

| ID      | Case                                                                                                                             |
| ------- | -------------------------------------------------------------------------------------------------------------------------------- |
| C02-A01 | Create: a task lands on the day with the next number (`ME-1`, `ME-2`) and its position at the end                                |
| C02-A02 | Sync is idempotent: the same mutation id twice applies once                                                                      |
| C02-A03 | Last write wins per field: two renames with different clocks keep the later one, whatever the arrival order                      |
| C02-A04 | Cross off and uncross set and clear the time; the day's counts follow                                                            |
| C02-A05 | Reorder: positions are saved and the day comes back in that order                                                                |
| C02-A06 | Move to another day or to none (the Backlog's state), position at the end there                                                  |
| C02-A07 | Delete is soft; the task leaves the day and stays out after a reload                                                             |
| C02-A08 | Rollover: asking for today moves unfinished tasks from earlier days to today, once, with carried from set; crossed-off ones stay |
| C02-A09 | A task in another person's space is refused (403) and nothing changes                                                            |
| C02-A10 | Every accepted mutation publishes a live event to the space's people and not to others                                           |
| C02-A11 | Reading a day returns the tasks with their IDs and the counts the ring needs                                                     |
| C02-A12 | Task numbers never repeat, even when two clients create at the same time                                                         |

End-to-end, group `today`:

| ID      | Case                                                                                                                       |
| ------- | -------------------------------------------------------------------------------------------------------------------------- |
| C02-E01 | Write three tasks on the last line; they appear in order with IDs; reload shows them                                       |
| C02-E02 | Cross one off: it strikes through and stays in place; the ring says "1 of 3 crossed off"; uncross it                       |
| C02-E03 | Cross off everything: the ring closes with "All crossed off · That's the day"                                              |
| C02-E04 | Drag the third task to the top; the order survives a reload                                                                |
| C02-E05 | Slot a task between two with the "+"                                                                                       |
| C02-E06 | Turn the day with the arrows and the calendar; tasks belong to their day; Back to today                                    |
| C02-E07 | Two days: open the second sheet, drag a task to tomorrow, it is on tomorrow after a reload                                 |
| C02-E08 | Carried over: a task left on yesterday shows on today with "→ From <day>"; keep it; move another back                      |
| C02-E09 | Copy the ID: the toast says "Copied ME-1" and the clipboard holds it                                                       |
| C02-E10 | Offline: cut the network, add and cross off, the banner shows, reconnect, the server has it                                |
| C02-E11 | Live: a change in a second tab appears in the first without a reload                                                       |
| C02-E12 | Phone: write, cross off, swipe to the next day and back                                                                    |
| C02-E13 | Loading and error states: a slow day shows the skeleton; a failed day shows "This day didn't load." and Try again recovers |
| C02-E14 | Dark mode: E01 and E02 again in dark                                                                                       |

Not automated: the feel of the drag, the sparkle and the reward; you judge those on the day page and the kit.

## Done when

- The tests above pass three runs in a row locally and on the Dokploy runner.
- Staging lets you plan a day end to end, on desk, tablet and phone, light and dark.
- The row matches the 00 row board and the day the 01 boards.
