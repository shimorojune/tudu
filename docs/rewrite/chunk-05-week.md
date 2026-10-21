# Chunk 05 · Week

Status: approved 21 Oct 2026 (all five choices as proposed), built on branch `rewrite/05-week`. Tests in
[docs/tests/chunk-05.md](../tests/chunk-05.md); deviations in [design-deviations.md](design-deviations.md).

Boards: 05 Week (desktop, dark, tablet, phone, states, motion), 00 The task row (brief rows), 03 Quick Add (New
task from the week). The tiles and the folding days are the design system's WeekTiles and WeekDay; the week
picker is its WeekPicker. Reference source is in the Tudu Paper bundle; the styles are already in the vendored
stylesheet.

## Scope

- **The week page** at `/week`, as drawn: a plain sheet with the week's header and, on the desk, a grid of seven
  day tiles and the Backlog tile (four across, two on a narrow window). The header reads "This week · Week 43",
  "12 – 18" in Instrument Serif with "October" beside it ("28 Sep – 4 Oct" when the week crosses a month), the
  arrows turn the week, "Back to this week" fades in while you are elsewhere, and the ring counts the week's
  crossed-off tasks ("That's the week" when it closes). Weeks run Monday to Sunday.
- **The week picker.** The title opens the WeekPicker: a month of rows, each a week with its number and seven
  days, dots on days that have tasks, "This week" at the foot. Picking a row turns the sheet to that week. The
  same picker opens from the title on tablets and phones. (DayHeader's `weeks` placeholder is replaced.)
- **Each tile** is a small sheet: the eyebrow (Today, Tomorrow, Yesterday, In 3 days, 2 days ago), the day, the
  date, the count ("3 tasks", "2 of 7", nothing when empty) and a brief, compact list: title, the carried or due
  pill, the Jira key, the project. No ID, no subtasks, no comments; those stay in the panel. Today's tile carries
  the brand eyebrow; past days are quieter. A full day scrolls inside its tile and fades at the foot; an empty
  one says "Nothing planned" and still takes a dropped task. The week has no writing line.
- **Drag between days.** A task dragged from one tile to another, or in from the Backlog, or out to it, moves
  its day: the tile under the pointer tints, the task settles where it was dropped, both counts and the ring
  follow. Reordering inside a tile works as on Today. On phones and tablets a row's date pill moves it, and the
  Backlog's rows have the quiet calendar button at their end.
- **The Backlog tile**: "Backlog", "No date", "4 tasks", the undated tasks in their own order, "Nothing waiting"
  when empty. The Backlog's own page, its filters and crossing off from it are chunk 06.
- **Tablets and phones**: one sheet, a section per day that folds. A closed day shows its count and a one-line
  preview of its open tasks ("Pay the electricity bill · Dentist at 4pm", or "All crossed off"); tapping the
  header turns the chevron and folds the list open by its real height. The Backlog folds last. The phone's header
  is compact and its eyebrow is the week word alone ("This week"); the round button opens Quick Add.
- **Crossing off and opening.** The checkbox works as everywhere; the tile's count and the week ring follow.
  Clicking a row opens the same panel as Today with "Week" (or "Backlog") as its back label; prev and next walk
  that tile's list; the open task is in the address (`/week?task=ME-52`). Moving the task's day from the panel
  moves it between tiles.
- **New task** from the top bar or the round button opens Quick Add with Planned set to the first day of the
  shown week that is not in the past (today when it is this week). The new row opens its gap in its tile with the
  wash; on tablets and phones that day unfolds if it was shut.
- **Reading a week.** `GET /api/spaces/:id/weeks/:monday` answers with the seven days (tasks and counts) and the
  Backlog in one call, and `GET /api/spaces/:id/backlog` the Backlog alone. Asking for the week that holds today
  rolls unfinished tasks forward first, as the day read does. The client fills its per-day caches from the week
  answer, so Today is instant after the Week and the live stream refreshes a tile the way it refreshes a day
  (events already name the Backlog as a null day). No schema change; moving a task uses the place change from
  chunk 02.
- **States**, as drawn: loading (the tiles and their dates at once, skeleton rows inside), empty days, a very
  full day, all crossed off, the Backlog empty, the week failing to load ("Couldn't load this week." with Try
  again, in place of the tiles), offline (the week keeps what it last loaded; moves and ticks work from the
  outbox).

Out of scope: the Backlog page and its project filter (06), Search (07), the sidebar's week list (chunk 01, unchanged:
its days still open Today on that day), For someone and Send (08).

## Choices (approved as proposed)

1. **One read for the week.** A new week endpoint returns seven days and the Backlog together, and seeds the
   day caches. The alternative is eight day-sized requests (the existing day read seven times plus a Backlog
   read), which needs no new endpoint but shows the tiles filling in one by one and asks for roll-forward on
   every tile load.
2. **The shown week stays out of the address**, as chunk 02 decided for the day: `/week` is always the week you
   left, and a reload lands on this week. The open task is in the address as on Today.
3. **Folded days are remembered per browser** (local storage, keyed by day), so a day you opened stays open on
   your phone and nothing goes to the server. The first time, Today is open in this week and the first day in any
   other week; the Backlog starts shut. The alternative is to forget on reload and always open Today.
4. **Past days take no drops.** A task dropped on yesterday would be carried forward to today the next time Today
   loads, so the tiles of past days do not tint and refuse the drop; the row's date pill and the panel's Planned
   picker keep letting you pick any day, as they do now. The alternative is to allow it and let the roll-forward
   bring it back with "→ From Sat".
5. **Past days show only what was crossed off there**, because the roll-forward already moved the rest. No
   extra marks on past tiles, as the states board says.

## Test plan

Unit (`packages/ui`, `packages/client`, `packages/core`):

| ID      | Component  | Case                                                                                                                                                                        |
| ------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C05-U01 | WeekDay    | Tile: eyebrow (brand on today, quiet elsewhere), day, date, count; past and quiet tones; "Nothing planned" when empty and the list still renders as a drop target           |
| C05-U02 | WeekDay    | Section: the header is a button with aria-expanded; tapping toggles, turns the chevron and reports onToggle; the preview shows when shut and is hidden when open            |
| C05-U03 | WeekDay    | Section: the folded body is inert when shut; "Nothing planned" and a custom empty text ("Nothing waiting"); reduced motion folds without the height animation               |
| C05-U04 | WeekTiles  | Seven tiles and the Backlog in a grid of four columns; `columns` sets two; tiles keep their height and lists scroll inside                                                  |
| C05-U05 | WeekPicker | A month of week rows with numbers, days, dots on marked days, this week marked; previous and next month; hover or focus names the week in the hint; "This week" at the foot |
| C05-U06 | WeekPicker | Picking a row reports its Monday; aria-pressed on the chosen week; weeks that cross a month read "28 Sep – 4 Oct"                                                           |
| C05-U07 | DayHeader  | With `weeks`, the title opens the WeekPicker instead of the calendar; "Back to this week", "Previous week" and "Next week" labels; the ring's "That's the week"             |
| C05-U08 | TaskList   | Brief compact rows in a `week` group trade rows between eight lists; onMoveTask reports from, to and the index; a tile marked past refuses the drop                         |
| C05-U09 | TaskList   | The Backlog's rows show the quiet calendar button; picking a day there reports a move out of the Backlog                                                                    |
| C05-U10 | client     | The week query fills the seven day caches and the Backlog; a move between days updates both lists at once and queues one place change; a rejected move rolls both back      |
| C05-U11 | client     | A live event for a day or the Backlog refreshes that list only; a week in view refetches once, not eight times                                                              |
| C05-U12 | core       | Week words: This week, Next week, Last week, In 2 weeks, 3 weeks ago; the heading "12 – 18" + "October" and "28 Sep – 4 Oct"; the eyebrow "Next week · Week 43"             |
| C05-U13 | core       | Tile words: the eyebrow (Today, Tomorrow, Yesterday, In 3 days, 2 days ago), counts ("1 task", "3 tasks", "2 of 7", empty), the preview line and "All crossed off"          |
| C05-U14 | core       | Quick Add's Planned for a week: today for this week, the Monday for a later week, nothing in the past                                                                       |

API (`apps/server`):

| ID      | Case                                                                                                                                             |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| C05-A01 | Reading a week: seven days Monday to Sunday with their tasks in order and counts, plus the Backlog; a date that is not a Monday is refused (400) |
| C05-A02 | Reading the week that holds today rolls unfinished tasks forward first, once, and the days come back already moved                               |
| C05-A03 | Reading the Backlog: undated tasks in position order, crossed-off ones included; a stranger gets 403                                             |
| C05-A04 | A place change between two days keeps the index asked for; between a day and the Backlog the positions on both sides stay dense                  |
| C05-A05 | The live event for a move names both lists (the old day, the new day or the Backlog) and reaches the space's people only                         |

End-to-end, group `week`:

| ID      | Case                                                                                                                                        |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| C05-E01 | Open Week: seven tiles and the Backlog, today's eyebrow, the heading "This week · Week 42", the tasks made on Today in today's tile         |
| C05-E02 | Drag a task from today to Thursday: it is in Thursday's tile, both counts follow, and Thursday has it after a reload and on Today's sheet   |
| C05-E03 | Drag a task from the Backlog onto a day, and one from a day into the Backlog; both survive a reload                                         |
| C05-E04 | Cross off in a tile: the strike, the tile's count "1 of 3", the week ring; uncross it                                                       |
| C05-E05 | Turn the week with the arrows: next week's dates, "Back to this week" appears and works                                                     |
| C05-E06 | Pick a week from the picker: the dots on marked days, the chosen week's tiles; "This week" in the picker returns                            |
| C05-E07 | Open a task from a tile: the panel with "Week" as its back label, prev and next walk the tile; change its day in the panel, it changes tile |
| C05-E08 | New task from the top bar on next week: Quick Add says "Lands on Mon 19 Oct"; the row washes in Monday's tile                               |
| C05-E09 | Tablet: days fold; Today is open, Monday closed with its preview; open Monday, reload, it is still open; the Backlog folds                  |
| C05-E10 | Phone: the compact header, "This week"; open a day; move a task with its date pill; the round button adds to today                          |
| C05-E11 | Live: a move made in a second tab shows in the first week without a reload, in both tiles                                                   |
| C05-E12 | Offline: cut the network, drag a task to another day and cross one off, reconnect, the server has both                                      |
| C05-E13 | Loading and error: a slow week shows the tiles with skeleton rows; a failed week shows "Couldn't load this week." and Try again recovers    |
| C05-E14 | A past day refuses a drop and keeps its crossed-off tasks; a very full day scrolls inside its tile                                          |
| C05-E15 | Dark mode: E01 and E02 again in dark                                                                                                        |

Not automated: the tint under a dragged task, the fold's easing, the week turning; you judge those on staging.

## Done when

- The tests above pass three runs in a row locally and on the Dokploy runner.
- Staging lets you plan a week end to end: move tasks between days and the Backlog, turn and pick weeks, fold days
  on a tablet and a phone, light and dark.
- The page matches the 05 boards and the states board; the tiles, the picker and the folding days match the design
  system's own.
