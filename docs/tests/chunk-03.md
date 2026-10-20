# Chunk 03 · Task detail · test cases

Status column is kept by `pnpm test:status` in [STATUS.md](STATUS.md). Run this chunk's tests with
`pnpm test -- --project ui --project client --project core --project server` and `pnpm e2e detail`.
End-to-end tests fix the clock at Sunday 18 October 2026, 10:00, and wait on `window.__tudu.idle()` (the outbox is
empty) before reading the server.

## Unit (`packages/ui`, `packages/client`, `packages/core`)

| ID      | What it checks          | Scenario                                                                                                                                                            |
| ------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C03-U01 | One calm column         | ID, title, Planned, Due, Visible to, Notes, Subtasks, History and Comments in that order; a fresh task shows "Add a due date", the notes prompt, "No comments yet." |
| C03-U02 | The title in place      | Enter and blur save a changed title, Esc and a blank put the old words back, a pasted newline becomes a space                                                       |
| C03-U03 | Crossing off            | The panel's checkbox crosses off; the panel takes the crossed-off look (the title struck through)                                                                   |
| C03-U04 | Planned                 | The calendar opens under the fact with Today, Tomorrow and Move to the Backlog; a pick moves it and closes; "carried from Sat" beside it, red when slipping         |
| C03-U05 | Due                     | Pick a day; the hover hint reads "Wed 21 Oct · in 3 days"; the value reads the distance; Remove due date clears it                                                  |
| C03-U06 | Esc steps out           | Esc in a picker closes the picker, eases it out and gives focus back to its fact; the panel stays                                                                   |
| C03-U07 | Next and previous       | The content slides in from the side you are heading to; an arrow shows only where there is a neighbour                                                              |
| C03-U08 | The ⋯ menu              | Copy link to task copies the link with "Link copied"; Copy task ID copies it; Delete task (red) asks the page; the ID at the top copies too                         |
| C03-U09 | Switching tasks         | Another task resets the title, the open picker, the History fold and the notes                                                                                      |
| C03-U10 | Notes                   | The toolbar rises on focus; bold, lists, a checklist, a link and code make the expected HTML; leaving the field reports it once                                     |
| C03-U11 | The comment box         | The box grows on focus, Comment is off while empty, Comment and Cmd+Enter post and clear it, Esc leaves the field                                                   |
| C03-U12 | Reading rich text       | Stored HTML renders with prose styles and checklist ticks; scripts, event handlers and script links never render                                                    |
| C03-U13 | Subtasks: writing       | Add subtask: Enter adds and keeps writing, Esc stops, blank adds nothing; a title edits in place; delete folds away with Undo; folded rows have no tab stops        |
| C03-U14 | Subtasks: ticking, drag | Crossing off reports the change; a pointer drag reorders and reports from and to; on touch a swipe scrolls and a press and hold lifts                               |
| C03-U15 | The row's fold          | The byline says "1 of 2 done ›" and opens the fold under the title (the design's indent and guide line); Add subtask writes one; crossed off keeps it folded        |
| C03-U16 | Due on the row          | Due replaces the carried pill; "Overdue since Fri" reads in red; "Due Fri" otherwise                                                                                |
| C03-U17 | History                 | Folded by default with its count; opens with the events in order and their day words; a task with no history shows no fold; the words for every event kind          |
| C03-U18 | Comments                | A new comment slides in with the wash and the panel scrolls to it; Edit saves with "edited" from the caret at the end; Delete removes it and Undo brings it back    |
| C03-U19 | Many comments           | More than five fold behind "Show N earlier comments"                                                                                                                |
| C03-U20 | The phone page          | Fullscreen drawer, no veil, no ×, a back button with the day's name; the stylesheet fades it under reduced motion                                                   |
| C03-U21 | Changes apply at once   | Due, notes, visibility, subtasks and comments show in the task and on its row before the save lands; a refused change rolls back and toasts                         |
| C03-U22 | Delete, restore, live   | Delete takes the row off its day and restore puts it back in place; a live event naming a task reads that task again and nothing else                               |
| C03-U23 | Due words               | "Fri" within a week, "4 Nov" further out, "Was due Friday"; today, tomorrow, in 4 days, in 3 weeks, 1 day overdue, 2 weeks overdue                                  |
| C03-U24 | Cleaning notes          | Keeps the editor's tags, safe links and checklist attributes; strips scripts, styles, frames, handlers and unknown tags; balances what is left; keeps entities      |

## API (`apps/server`)

| ID      | What it checks     | Scenario                                                                                                                                           |
| ------- | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| C03-A01 | Reading a task     | Its fields, subtasks in order, comments with their author and history; a stranger gets 403; the wrong space gets 404                               |
| C03-A02 | Due                | Set and clear; last write wins by clock in either arrival order; each change writes a history event; the day's row follows                         |
| C03-A03 | Notes              | Saved cleaned (scripts and handlers gone); over 100,000 characters is refused (400); last write wins                                               |
| C03-A04 | Visibility         | Only `me` and `space` are accepted; anything else is 400 and nothing changes                                                                       |
| C03-A05 | Subtasks           | Create with the next position, rename, cross off, reorder, delete; idempotent by mutation id; last write wins; 410 after delete; 403 for strangers |
| C03-A06 | Comments           | Add (cleaned, empty refused), edit (sets edited), delete; a deleted one stays out and refuses edits (410); strangers are refused (403)             |
| C03-A07 | History            | Moving between days and the Backlog, crossing off, uncrossing and carrying forward each write one event, in order, with their facts                |
| C03-A08 | Restore            | A deleted task comes back on its day in its place with its subtasks and comments; restoring a live task is a no-op; an older restore loses         |
| C03-A09 | The day's rows     | Each row carries due, its subtasks, the subtask counts and the comment count, and no notes                                                         |
| C03-A10 | Live events        | Every accepted change names its task and days to the space's people; a refused one says nothing; strangers hear nothing                            |
| C03-A11 | Where a ref points | `/tasks/ref/ME-2` gives the task and its day for a member, in any case; 404 for an unknown ref, a stranger or a deleted task                       |

## End-to-end (`packages/e2e/tests/detail`, group `detail`)

| ID      | What it checks           | Scenario                                                                                                                                |
| ------- | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| C03-E01 | Open and rename          | A row click opens the task with `?task=ME-2` in the address; a new title shows on the row; close clears the address; a reload keeps it  |
| C03-E02 | Due                      | Pick Wednesday: the panel reads "Wed 21 Oct · in 3 days", the row "Due Wed"; a reload keeps it; Remove due date clears it on the server |
| C03-E03 | Planned                  | Tomorrow from the picker: the row leaves today, "Moved to Tomorrow", the panel follows; `/t/ME-2` opens it on Monday                    |
| C03-E04 | Notes                    | Bold, a list and a checklist; leaving the field saves them; close, reload and reopen shows them                                         |
| C03-E05 | Subtasks                 | Three added in the panel, one crossed off, one deleted; the row says "1 of 2 done"; after a reload the fold opens and ticks one more    |
| C03-E06 | Comments                 | A comment appears with the wash and the row says "1 comment"; Edit saves with "edited"; Delete and Undo; the server has one comment     |
| C03-E07 | Delete and Undo          | The row leaves, Undo puts it back in place and a reload agrees; deleted again and left, it is gone and its ref is 404                   |
| C03-E08 | The arrows and Esc       | Next and previous step through the day with the address following; Esc closes and focus is back on the row's title (desktop, tablet)    |
| C03-E09 | History                  | Created, Due date set to Wed 21 Oct, Moved from Today to Tomorrow                                                                       |
| C03-E10 | The address              | A reload with `?task=` reopens it; `/t/ME-1` opens it; Copy link copies that address; a link to no task goes back to the day            |
| C03-E11 | Phone                    | The detail is its own full page without ×; subtasks and a comment on the phone; ‹ Today goes back and the row shows the counts (phone)  |
| C03-E12 | Two days                 | With two sheets open the panel sits over both and neither changes width (desktop)                                                       |
| C03-E13 | Offline                  | The banner shows; a due date and a subtask still work; back online the server has both                                                  |
| C03-E14 | Live                     | A due date and a subtask set in a second tab show in the open panel of the first, and the row's byline follows                          |
| C03-E15 | Loading and error states | A slow task shows the skeleton column; a failed task says "This task didn’t load." and Try again recovers                               |
| C03-E16 | Dark mode                | Open, rename, write notes and comment in the dark theme; a reload keeps them                                                            |

Not automated: the feel of the slide and the veil, the comment wash, the subtask fold and the pop easing out. Judge those on
staging and on the kit page's Task detail section.
