# Chunk 06 · Backlog · test cases

Status column is kept by `pnpm test:status` in [STATUS.md](STATUS.md). Run this chunk's tests with
`pnpm test -- --project ui --project client --project core --project web --project server` and `pnpm e2e backlog`.
End-to-end tests fix the clock at Sunday 18 October 2026, 10:00.

## Unit (`packages/ui`, `packages/client`, `packages/core`, `apps/web`)

| ID      | What it checks           | Scenario                                                                                                                                                                                                                                           |
| ------- | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C06-U01 | ProjectFilter            | The chip reads All projects with the mark, or the project with its dot; the menu lists All projects with the total and each project with its count; picking reports the id or null                                                                 |
| C06-U02 | A row that leaves        | `leaveDone`: a ticked row stays ticked for 900ms with nothing sent, then folds away and reports onLeave; the toast "Crossed off" with Undo reports onUnleave with the index it had and washes the row; ticked back within the beat it never leaves |
| C06-U03 | Crossed off's rows       | `leaveUndone`: an unticked row folds away with "Back in the Backlog" and Undo; a `static` list has no grip                                                                                                                                         |
| C06-U04 | The filter on a list     | Only the project's rows show, the "+" between rows is off, the writing line reads "Add to the Backlog…" and adds                                                                                                                                   |
| C06-U05 | The Backlog's header     | Backlog with the count beside it, no arrows, no ring, no top line; the filter first and the switch last in the tools row; compact on phones                                                                                                        |
| C06-U06 | Backlog words            | The counts for both views with and without a filter, Nothing waiting, Nothing crossed off; To do in its order and Crossed off newest first (ties by the last change, then the newer task); counts by project                                       |
| C06-U07 | The Backlog in the store | A task written with no day lands at the end of the Backlog cache (or where the "+" asked); crossing off keeps it cached, with its position, and queues one change, Undo the reverse; a reorder queues one place change with the day null           |
| C06-U08 | Where New task lands     | Nothing on the Backlog page, so the foot reads "Lands in Backlog"; Today and the week unchanged                                                                                                                                                    |
| C06-U09 | The page's memory        | The filter is kept per browser and space and forgotten with null; a space never seen has none; More lists the Backlog                                                                                                                              |

## API (`apps/server`)

| ID      | What it checks         | Scenario                                                                                                                                                         |
| ------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C06-A01 | Writing to the Backlog | A task created with no day and no position lands at the end with a dense position; the Backlog read keeps crossed-off tasks with their doneAt                    |
| C06-A02 | Crossing off there     | Crossing off and unticking keep the task's position; the live event names the Backlog (a null day), the task and the client, and reaches the space's people only |
| C06-A03 | Reordering there       | A place change with the day null reorders the Backlog; without a position it goes to the end; a stranger's change is refused                                     |

## End-to-end (`packages/e2e/tests/backlog`, group `backlog`)

| ID      | What it checks     | Scenario                                                                                                                                                                                 |
| ------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C06-E01 | The Backlog        | "Backlog" and "3 tasks", the chip, the switch, the undated tasks in order with their IDs and no date, the writing line, no arrows and no ring; More lit on phones                        |
| C06-E02 | Writing            | The last line's row washes in; the "+" slots one in above a row (desktop); the order and the missing day survive a reload and the server agrees                                          |
| C06-E03 | Giving a day       | The calendar button opens "Plan it for a day" with Today then Tomorrow; the row folds away, "Moved to Tomorrow" with Undo brings it back in place; done again, Monday has it             |
| C06-E04 | Crossing off       | Ticked for a beat, then gone with "Crossed off" and Undo; the count follows; Crossed off lists newest first, struck through, with no grip; unticking there sends it back                 |
| C06-E05 | The project filter | The menu's counts, the chip with its dot, "2 tasks in Platform", the "+" off; "0 crossed off in Platform"; the filter survives a reload; Show all projects from the empty project        |
| C06-E06 | Reordering         | A drag to the top survives a reload and the server agrees (desktop; press and hold is the row's unit tests)                                                                              |
| C06-E07 | Opening a task     | The panel with Backlog as its way back (phone), Planned reads Backlog, Next and Previous walk the list, the task in the address; a day from the panel takes it out; `/t/ME-3` opens here |
| C06-E08 | New task           | Quick Add says "Lands in Backlog" with the Backlog chip and the row washes in with no toast; a day picked toasts "Added to Tomorrow", Show turns to Today on it                          |
| C06-E09 | Phone              | More shows its page with More lit; Backlog opens the compact sheet; the round button adds here; the calendar button is always there and plans for today (phone)                          |
| C06-E10 | Tablet             | The rail, the filter and the switch, the panel no wider than 460px (tablet)                                                                                                              |
| C06-E11 | Live               | A task written, crossed off and given a day in a second tab shows, leaves and leaves here without a reload                                                                               |
| C06-E12 | Offline            | The banner; cross off, reorder (desktop) and give a day while offline; the server has it all when back, with no toast                                                                    |
| C06-E13 | Loading and error  | A held read shows the header and the filter with skeleton rows and no count; an aborted one shows "Couldn’t load the Backlog." and Try again recovers                                    |
| C06-E14 | Empty              | "Nothing waiting." with its line, Add a task opens Quick Add planned for the Backlog; "Nothing crossed off yet." in the other view                                                       |
| C06-E15 | Dark mode          | The Backlog, a cross off and the Crossed off view in the dark theme                                                                                                                      |

Not automated: the calendar button's fade, the fold's easing, the chip easing to its width, the sheet's turn between
views, press and hold on phones. Judge those on staging and on the kit page's Backlog section.
