# Chunk 06 · Backlog

Status: approved 21 Oct 2026 (all five choices as proposed), built on branch `rewrite/06-backlog`. Tests in
[docs/tests/chunk-06.md](../tests/chunk-06.md); deviations in [design-deviations.md](design-deviations.md).

Boards: 06 Backlog (desktop, dark, tablet, phone, states, motion), 00 The task row, 03 Quick Add (New task from the
Backlog). The page is the design system's Sheet with DayHeader, ProjectFilter, Segmented and TaskList with its
`leaveDone`, `leaveUndone` and `planButton` behaviour; the styles are already in the vendored stylesheet.

## Scope

- **The Backlog page** at `/backlog`, as drawn: one sheet like Today. The header reads "Backlog" with the count
  beside it ("4 tasks", "1 task", "2 tasks in Platform", "0 tasks in Home", "Nothing waiting"; in the other view
  "3 crossed off", "1 crossed off in Home"), no arrows, no ring. Under the title the project filter sits on the
  left and the To do | Crossed off switch on the right. Only the list scrolls; the header, the filter and the switch
  stay. Compact header on phones.
- **To do**: the undated open tasks in your own order, the same rows as Today (ID, due pill, Jira key, project,
  subtasks and comments in the byline). Drag to reorder (press and hold on phones), the "+" between rows, and the
  writing line at the foot, "Add to the Backlog…". A new task opens its gap with the wash.
- **Give a task a day.** Hover a row and the quiet calendar button fades in at its end (on phones it is always
  there, faintly). It opens "Plan it for a day": Today first, then Tomorrow and the month. Picking a day folds the
  row away and a toast says where it went ("Moved to Tomorrow") with Undo, which puts it back in its place. The
  row's due pill, when it has one, keeps changing the due date as it does on Today.
- **Cross one off.** The tick draws, the strike and the sparkle play, the row waits 900ms, then folds away to
  Crossed off; the toast says "Crossed off" with Undo, which puts it back in its place, unticked. The count follows.
- **Crossed off**: the undated crossed-off tasks, newest first, struck through. Unticking one there folds it away
  with "Back in the Backlog" and Undo, and it returns to To do in the place it had. "Nothing crossed off yet." when
  there are none. The switch turns the list like a page (the sheet's turn).
- **Filter by project.** The chip reads "All projects" with the backlog mark, or the project with its dot. Its
  menu lists All projects with the total and each project with how many Backlog tasks it has in the view. Picking
  one swaps the list in place and the count beside the title follows; with the filter on, the "+" between rows is
  off. "Nothing here for this project." with Show all projects when the project has nothing in the view.
- **Opening a task.** Clicking a row opens the same panel as Today with "Backlog" as its back label; prev and next
  walk the list in view; the open task is in the address (`/backlog?task=ME-52`), and `/t/ME-52` for a task with
  no day opens the Backlog. Planned reads Backlog until you give it a day; doing so from the panel folds the row
  out of the list. Delete with Undo works as on Today.
- **New task** from the top bar, the phone's round button or "Add a task" in the empty state opens Quick Add with
  Planned empty, so the foot says "Lands in the Backlog" and the row washes in here; picking a day in Quick Add
  sends it to that day with "Added to Tomorrow" and Show, which turns to Today on that day.
- **Phones**: the Backlog lives under More. The More tab opens a short page with Backlog on it (Inbox, Settings and
  Apps join it as their chunks land), the Backlog is its own page with More lit in the tab bar, and the tab bar meets
  the sheet with the soft fade. The panel is a full page with ‹ Backlog.
- **Everywhere else the Backlog already shows** (the week's tile and fold, the sidebar's link, the panel's "Move to
  the Backlog") keeps working off the same cache, so a task given a day here leaves the week's Backlog tile at once.
- **Reading.** No new endpoint and no schema change: `GET /api/spaces/:id/backlog` from chunk 05 already returns
  the undated tasks, crossed-off ones included, in position order. The client splits To do and Crossed off, filters
  and counts. Crossing off, reordering, giving a day and adding use the sync changes from chunks 02 and 04 with the
  day `null`. The live stream refreshes the Backlog as it does a day.
- **States**, as drawn: loading (skeleton rows under the header, never a spinner), empty ("Nothing waiting." with
  Add a task), nothing for the project, nothing crossed off, long (the list scrolls, the header stays), failing to
  load ("Couldn't load the Backlog." with Try again), offline (what was last loaded; ticks, moves and reorders work
  from the outbox).

Out of scope: Search (07) and "Looks like a task you have", the Inbox, Settings and Apps lines under More (08, 09,
10), renaming or deleting projects (09), a Backlog for team spaces beyond what chunk 08 brings.

## Choices

1. **The Backlog is read whole and split in the client.** One read (already there) gives To do and Crossed off,
   the filter and every count, so turning the view or the filter never asks the server. The alternative is query
   parameters for the view and the project, which keeps a long Backlog's crossed-off tail off the wire but shows a
   loading state on every switch.
2. **Crossed off is newest first and not draggable.** Your order is for things still to do; the crossed-off list
   reads like a log. The alternative keeps the drag order there too.
3. **The project filter is remembered per browser and space** (local storage, as the week's folds are), and the view
   starts at To do on every visit. A filter naming a project that no longer exists is dropped. The alternative
   forgets both on reload.
4. **More is a page of its own on phones** at `/more`, listing Backlog now and the rest later, so the tab bar's
   fourth tab does something from this chunk on. The alternative sends More straight to the Backlog until the
   Inbox arrives, and changes it again in chunk 08.
5. **Undo keeps the place.** Undo after crossing off, unticking or giving a day puts the row back at the index it
   had, as the design system's list does, by queueing the reverse change; the server never sees a special undo.
   Nothing to choose here unless you want Undo to put the row at the top instead.

## Test plan

Unit (`packages/ui`, `packages/client`, `packages/core`, `apps/web`):

| ID      | Component     | Case                                                                                                                                                                                                                               |
| ------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C06-U01 | ProjectFilter | The chip reads All projects with the mark, or the project with its dot; the menu lists All projects with the total and each project with its count; picking reports the name or null; the label for screen readers                 |
| C06-U02 | TaskList      | `leaveDone`: a ticked row waits 900ms, folds away, reports onLeave; the toast "Crossed off" with Undo puts it back at its index unticked and reports onUnleave; not at all under reduced motion's timing                           |
| C06-U03 | TaskList      | `leaveUndone`: in the Crossed off list an unticked row folds away with "Back in the Backlog"; Undo returns it struck through                                                                                                       |
| C06-U04 | TaskList      | `filter`: only the project's rows show, the "+" between rows and dragging between lists are off, the writing line reads "Add to the Backlog…" and adds with no day                                                                 |
| C06-U05 | DayHeader     | With `nav` off: Backlog, the count, no arrows and no ring; the filter and the switch sit in its slot; compact on phones; the switch turns the sheet                                                                                |
| C06-U06 | core          | Backlog words: the counts for both views with and without a filter, Nothing waiting; the split into To do (position order) and Crossed off (newest first); per-project counts of the view                                          |
| C06-U07 | client        | A task made with no day lands at the end of the Backlog cache; crossing off there queues one done change and keeps the task cached; a reorder queues one place change with the day null; Undo queues the reverse at the same index |
| C06-U08 | core          | Quick Add's Planned for the Backlog page is empty and the foot reads "Lands in the Backlog"; Today and the week are unchanged                                                                                                      |
| C06-U09 | web           | The page's filter is remembered per browser and space and dropped when its project is gone; the view starts at To do; the More page lists Backlog                                                                                  |

API (`apps/server`):

| ID      | Case                                                                                                                                                                |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C06-A01 | A task created with no day lands at the end of the Backlog with a dense position; reading the Backlog returns it after the rest, crossed-off ones with their doneAt |
| C06-A02 | Crossing off and unticking a Backlog task keeps its position; the live event names the Backlog (a null day) and reaches the space's people only                     |
| C06-A03 | A place change inside the Backlog (null to null with a position) reorders it and the positions stay dense; a stranger is 403                                        |

End-to-end, group `backlog`:

| ID      | Case                                                                                                                                                                                                      |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C06-E01 | Open the Backlog from the sidebar: "Backlog", "3 tasks", the undated tasks in their order with their bylines, the writing line, More lit on phones                                                        |
| C06-E02 | Write on "Add to the Backlog…": the row washes in, has no day on the server; the "+" between rows slots one in; both survive a reload in order                                                            |
| C06-E03 | Give a task a day with its calendar button: Today first, then Tomorrow; the row folds away, "Moved to Tomorrow" with Undo; Undo puts it back in place; done again, Today on tomorrow has it               |
| C06-E04 | Cross one off: the tick, the wait, the row folds away, "Crossed off" with Undo; the count "2 tasks"; Crossed off lists it newest first; untick there sends it back to To do in its place                  |
| C06-E05 | Filter by project: the chip with the dot, the menu's counts, "2 tasks in Platform", "Nothing here for this project." with Show all projects; the filter survives a reload and a deleted project clears it |
| C06-E06 | Reorder by drag (desktop) and by press and hold (phone): the order survives a reload and the server agrees                                                                                                |
| C06-E07 | Open a task: the panel with "Backlog" as its back label on phones, Planned reads Backlog, Next and Previous walk the list in view; a day picked in the panel folds the row out; `/t/ME-52` opens it here  |
| C06-E08 | New task from the top bar: Quick Add says "Lands in the Backlog" and the row washes in; a task with a day picked toasts "Added to Tomorrow" and Show turns to Today                                       |
| C06-E09 | Phone: the More tab shows its page, Backlog opens the sheet with the compact header, the calendar button is always there, the round button adds to the Backlog (phone)                                    |
| C06-E10 | Tablet: the rail, the sheet, the filter and the switch, the 460px panel (tablet)                                                                                                                          |
| C06-E11 | Live: a task crossed off in a second tab leaves this list; one added there with no day appears; one given a day there leaves                                                                              |
| C06-E12 | Offline: the banner; cross off, reorder and give a day while offline; the server has it all when back                                                                                                     |
| C06-E13 | Loading and error: a held read shows the header with skeleton rows; an aborted one shows "Couldn't load the Backlog." and Try again recovers                                                              |
| C06-E14 | Empty: "Nothing waiting." and Add a task opens Quick Add; "Nothing crossed off yet." in the other view                                                                                                    |
| C06-E15 | Dark mode: E01 and E04 again in dark                                                                                                                                                                      |

Not automated: the calendar button's fade, the fold's easing, the chip easing to its width, the sheet's turn between
views; you judge those on staging.

## Done when

- The tests above pass three runs in a row locally and on the Dokploy runner.
- Staging lets you work the Backlog end to end: add, reorder, give a day, cross off and bring back, filter by
  project, open and move tasks, on the desk, a tablet and a phone, light and dark.
- The page matches the 06 boards and the states board; the filter, the switch and the leaving rows match the design
  system's own.
