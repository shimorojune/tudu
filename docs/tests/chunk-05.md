# Chunk 05 · Week · test cases

Status column is kept by `pnpm test:status` in [STATUS.md](STATUS.md). Run this chunk's tests with
`pnpm test -- --project ui --project client --project core --project server` and `pnpm e2e week`.
End-to-end tests fix the clock at Sunday 18 October 2026, 10:00 (the last day of week 42, Monday 12 to Sunday 18);
the drag between days fixes it at Wednesday 14 October so a day of the week is still ahead.

## Unit (`packages/ui`, `packages/client`, `packages/core`)

| ID      | What it checks         | Scenario                                                                                                                                                                 |
| ------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| C05-U01 | A tile                 | Eyebrow (brand on today, quiet elsewhere), day, date, count; past and quiet (Backlog) tones; Nothing planned or Nothing waiting with the empty list kept as a drop place |
| C05-U02 | A section folds        | The header is a button with aria-expanded; tapping folds open and shut, turns the chevron (stylesheet), hides the preview, reports onToggle; a controlled open prop      |
| C05-U03 | The fold               | Inert while shut; the preview says Nothing planned or the Backlog's Nothing waiting; the fold moves on dur-fold with ease-settle and not at all under reduced motion     |
| C05-U04 | WeekTiles              | Eight tiles in a grid of four columns (stylesheet), two when asked; tiles keep their height and lists scroll inside                                                      |
| C05-U05 | WeekPicker             | A month of week rows with numbers, days, dots and this week marked; the months turn; the hint names the week under the pointer, the chosen one, or asks; This week       |
| C05-U06 | Picking a week         | A row reports its Monday; one row pressed; labels cross months ("28 Sep – 4 Oct"); a month has four to six rows, never one of another month alone                        |
| C05-U07 | DayHeader for the week | Bare puts the arrows on the title line; Previous week, Next week, Back to this week; the title opens the WeekPicker and picking closes it; That's the week on the ring   |
| C05-U08 | Lists in a week group  | Brief compact rows trade between lists; a locked list (a day gone by) never tints and takes nothing, but its rows can still be dragged out                               |
| C05-U09 | The Backlog's rows     | The quiet calendar button; picking Tomorrow there reports a move out of the Backlog and toasts Moved to Tomorrow                                                         |
| C05-U10 | The week in the store  | One week read fills the seven day caches and the Backlog with nothing more asked; a move shows in both lists at once and queues one change; a refused move is undone     |
| C05-U11 | Live events            | An event for a day refreshes that tile only, one for the Backlog (a null day) the Backlog only, a move both; the week itself is never read again for it                  |
| C05-U12 | Week words             | This week, Next week, Last week, In 2 weeks, 3 weeks ago; "12 – 18" with October; "28 Sep – 4 Oct" with no month beside; the eyebrow with the week number                |
| C05-U13 | Tile words             | The eyebrow long and short, counts ("1 task", "3 tasks", "2 of 7", nothing), the preview line and All crossed off, the label for screen readers                          |
| C05-U14 | New task from the week | Today for this week, the Monday of a later week, today for a week gone by; which day opens first on tablets and phones                                                   |

## API (`apps/server`)

| ID      | What it checks       | Scenario                                                                                                                                        |
| ------- | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| C05-A01 | Reading a week       | Seven days Monday to Sunday with their tasks in order and counts, plus the Backlog; a day that is not a Monday is 400; a stranger is 403        |
| C05-A02 | Roll-forward         | Reading the week that holds today carries unfinished tasks forward first, once, with where they came from; another week moves nothing           |
| C05-A03 | Reading the Backlog  | Undated tasks in position order, crossed-off ones kept; a stranger is 403                                                                       |
| C05-A04 | Moving between lists | A place between two days keeps the position asked for; out to the Backlog without one lands at the end; in from the Backlog at the top of a day |
| C05-A05 | The live event       | A move names both lists (the Backlog as a null day) with the task and the client, and reaches the space's people only                           |

## End-to-end (`packages/e2e/tests/week`, group `week`)

| ID      | What it checks         | Scenario                                                                                                                                                             |
| ------- | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C05-E01 | The week               | Seven tiles and the Backlog, today marked with its eyebrow, "This week · Week 42" and "12 – 18 October", today's tasks in its tile as brief rows, the ring           |
| C05-E02 | Drag to another day    | Wednesday to Thursday: both tiles, both counts and the ring follow; it is there after a reload, on the server, and on Today's sheet (desktop)                        |
| C05-E03 | Drag with the Backlog  | From the Backlog onto today and from today into the Backlog; both survive a reload; the server agrees (desktop)                                                      |
| C05-E04 | Cross off in a tile    | The strike, the tile's count "1 of 3", the week ring; uncrossing puts them back; a reload agrees                                                                     |
| C05-E05 | Turn the week          | Next week twice ("In 2 weeks · Week 44", "26 Oct – 1 Nov"), Back to this week, Previous week; the phone's eyebrow is the word alone                                  |
| C05-E06 | The week picker        | A dot on today, the chosen row pressed, picking next week turns the sheet, This week returns                                                                         |
| C05-E07 | Open a task            | The panel from a tile with the task in the address, Next and Previous walk the tile, Move to the Backlog moves it between tiles, a link reopens it                   |
| C05-E08 | New task from the week | On next week Quick Add says "Lands on Mon 19 Oct" and the row washes in Monday's tile with no toast; from this week a task for tomorrow toasts, Show turns the week  |
| C05-E09 | Tablet: days fold      | Today open, Saturday shut with Nothing planned and inert; today's preview lists its open tasks; a day you open stays open after a reload; the Backlog folds (tablet) |
| C05-E10 | Phone                  | The compact header with "This week"; open a day; the Backlog's plan button moves a task to today; the round button adds to today with the wash (phone)               |
| C05-E11 | Live                   | A task written in a second tab shows in today's tile; a move to the Backlog there moves it between tiles here, without a reload                                      |
| C05-E12 | Offline                | The banner; cross off (and on the desk drag to the Backlog) while offline; the server has it all when back                                                           |
| C05-E13 | Loading and error      | A held week read shows the tiles with their dates and skeleton rows; an aborted one shows "Couldn’t load this week." and Try again recovers                          |
| C05-E14 | A day gone by          | Keeps its crossed-off task with "1 of 1", never tints and refuses a drop; twelve tasks scroll inside today's tile and the tiles keep one height (desktop)            |
| C05-E15 | Dark mode              | The week, a cross off and (on the desk) a drag to the Backlog in the dark theme                                                                                      |

Not automated: the tint and the ink line under a dragged row between tiles, the fold's easing, the week turning,
the picker's arrival. Judge those on staging and on the kit page's week section.
