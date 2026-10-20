# Chunk 03 · Task detail

Status: approved 20 Oct 2026 (defaults on all five choices), built on branch `rewrite/03-task-detail`. Tests in
[docs/tests/chunk-03.md](../tests/chunk-03.md); deviations in [design-deviations.md](design-deviations.md).

Boards: 02 Task detail (desktop, dark, tablet, phone, two days, the four states, motion), 00 Components (the
subtask fold), 00 The task row (byline rules). The panel is the design system's TaskDetail; its reference source
is in the Tudu Paper bundle.

## Scope

- **The panel.** Click anywhere on a row and the task opens over the page in a paper panel with a light veil. The
  day under it never moves or squeezes, in one-day or two-day view. The × in the panel, a click on the veil or Esc
  closes it (Esc steps out of a field or an open picker first); focus returns to the title you opened. The arrows
  step through the open day's list without the panel moving: only its content slides in from the side you are
  heading to. Tablet: the same panel at 460px. Phone: the detail is its own page that slides in over the day, with
  ‹ Today (or the day's name) to go back.
- **One calm column**, as drawn: the ID at the top (click to copy), the checkbox and the title written in place
  (Enter or leaving the field saves, a blank title puts the old words back), then the facts, Notes, Subtasks,
  History (folded), Comments, and the comment box pinned to the foot.
- **Facts.** Planned opens the same calendar as the carried pill's picker and moves the task (the panel follows it,
  the row leaves the day, a toast says "Moved to Mon 19 Oct"); a carried task reads "carried from Sat" beside it,
  red when slipping. Due is a separate fact with its own calendar: the hover hint says how far each day is ("Wed
  21 Oct · in 3 days"), Remove due date clears it, and the value reads "Fri 16 Oct · 2 days overdue" in red, "today"
  in the brand colour, "in 4 days" otherwise. Visible to reads "Only you" with its one-item menu; the space option
  arrives with chunk 08. Project and Jira stay out of the panel until their chunks (04 and 10) bring their data.
- **Notes** are rich text, written in place with the slim toolbar that rises when you click in: text style, bold,
  italic, underline, lists, checklist, link, highlight, code, and the rest under More. Saved when you leave the
  field, and before the panel closes or steps to another task. Tiptap underneath; the stored form is HTML, cleaned
  on the server to the tags the editor makes.
- **Subtasks**, in the panel and folded under the row. The row's byline says "1 of 4 done ›" and opens the fold:
  the list lines up under the title with the faint guide line, "Add subtask" is the last line, Enter adds and keeps
  writing, titles edit in place, a subtask deletes from its own ×, and subtasks reorder by drag (press and hold on
  phones). The same list sits in the panel under its heading with "2 of 4". Crossing off every subtask does not
  cross off the task.
- **History** folds away under its heading ("4 events"): Created, Due date set to Fri 16 Oct, Due date removed,
  Moved from Backlog to Today, Carried over from Sat, Crossed off, Uncrossed. The server writes these as it applies
  changes, so every device sees the same history.
- **Comments** read as a conversation: your avatar, name, when, the text. The box at the foot grows as you write;
  its toolbar and the Comment button appear once you click in. A new comment slides up with a soft wash and the
  panel scrolls to it. Your own comments have Edit and Delete (with Undo) under their ⋯; more than five fold behind
  "Show 3 earlier comments". The row's byline counts them ("3 comments"). Until chunk 08 the only voice is yours.
- **⋯ menu**: Copy link to task, Copy task ID, Delete task. Delete closes the panel, the row leaves the list and a
  toast offers Undo for 4.5 seconds; Undo puts it back where it was, on its day, in its place.
- **The address.** The open task is in the address (`/today?task=ME-52`), so a reload reopens it and Copy link
  gives `https://<host>/t/ME-52`, which opens the task on its day. (Chunk 02 kept the day out of the address; the
  task goes in because the link is a feature on the board.)
- **Data.** Tasks gain a due day, notes and the visibility flag; new tables for subtasks (own order and clocks),
  comments and history. New changes through the outbox: due, notes, visibility, subtask create, rename, cross off,
  reorder, delete, comment add, edit, delete, task restore (for Undo). Last write wins per field as before;
  subtasks are their own rows with their own clocks. The day response carries what the byline needs (due,
  subtasks done and total, comment count); one task read returns everything the panel shows; the live stream
  tells other tabs which task changed.
- **States**, as drawn: full, just written (every empty fact invites you in), crossed off (struck through, all
  quiet), slipping (carried four times, overdue), loading (a skeleton column), a task that did not load, offline
  (every change still queues).

Out of scope: project picker and the project dot (04), file attachments in notes and comments (04, with Quick
Add's files, since both need the upload endpoint), Jira fact (10), Send to someone, Go to its day, other people's
comments and the owner's read-only view (08), keyboard shortcuts (none for now, per the decisions log).

## Choices (approved as proposed)

1. **Attachments later.** The editor's "Attach a file" button stays hidden until chunk 04 brings uploads. The
   alternative is to build the upload endpoint now, which makes this chunk noticeably bigger.
2. **Project and Jira rows hidden** rather than shown as dead "Add to a project" buttons. They appear when their
   chunks land. Say if you would rather see them greyed out now.
3. **The task in the address** (`?task=ME-52` and `/t/ME-52`). Chunk 02 left the day out of the address; this
   puts only the task in. Say if you want the day in too while we are here.
4. **Planned picker gets "Move to the Backlog"** as its clear label, since the Backlog state has existed since
   chunk 02 even though its page arrives with 06. Easy to leave out until 06 if you prefer.
5. **Notes save on blur**, as the motion board says, plus on close and on next or previous. No autosave while
   typing. If you would rather not lose a long note to a closed laptop lid, say so and I will add a save after
   two seconds of quiet.

## Test plan

Unit (`packages/ui`, `packages/client`, `packages/core`):

| ID      | Component       | Case                                                                                                                                          |
| ------- | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| C03-U01 | TaskDetail      | Renders the ID, title, Planned, Due, Visible to, Notes, Subtasks, History and Comments in that order; a fresh task shows the empty prompts    |
| C03-U02 | TaskDetail      | Title edits in place: Enter and blur save a changed title, Esc or a blank puts the old words back, newlines never get in                      |
| C03-U03 | TaskDetail      | The checkbox crosses off from the panel; the panel takes the crossed-off look and the row's state follows                                     |
| C03-U04 | TaskDetail      | Planned: the calendar opens under the fact, a pick calls onMove and closes; the carried note reads "carried from Sat", red when slipping      |
| C03-U05 | TaskDetail      | Due: pick a day (onChange with the due day), the hover hint says "Wed 21 Oct · in 3 days", Remove due date clears it, overdue reads in red    |
| C03-U06 | TaskDetail      | Esc steps out: first the field or picker, then the panel; focus returns to the opener on close                                                |
| C03-U07 | TaskDetail      | Next and previous: content slides in from the right or left; the arrows are absent at either end of the list                                  |
| C03-U08 | TaskDetail      | ⋯ menu: Copy link copies `/t/ME-52` with a toast, Copy task ID copies it, Delete task calls onDelete                                          |
| C03-U09 | TaskDetail      | Switching tasks resets every field, picker and fold; nothing from the last task leaks into the next                                           |
| C03-U10 | RichTextEditor  | Notes: toolbar rises on focus, bold, italic, lists, checklist, link and code produce the expected HTML, blur reports the HTML once if changed |
| C03-U11 | RichTextEditor  | Comment variant: the box grows, Comment is disabled while empty, submit clears it, Esc leaves the field; the toolbar folds marks into More    |
| C03-U12 | RichTextContent | Stored HTML renders with prose styles; checklists show their ticks; script and event attributes never render                                  |
| C03-U13 | SubtaskList     | Add on Enter and keep writing, Esc stops, blank adds nothing; rename in place; delete from its × with the leaving motion                      |
| C03-U14 | SubtaskList     | Cross off updates the "2 of 4" count; drag reorders and reports the new order; press and hold on touch                                        |
| C03-U15 | TaskRow         | The byline says "1 of 4 done ›" and opens the fold; the fold lines up under the title; the byline says "3 comments" and "Due Fri"             |
| C03-U16 | TaskRow         | Due replaces the carried pill in the byline; "Overdue since Fri" reads in red                                                                 |
| C03-U17 | History         | Folded by default with the event count; opens with the events in order and their day words                                                    |
| C03-U18 | Comments        | A new comment appears with the wash and the panel scrolls to it; Edit saves with "edited"; Delete removes it and Undo brings it back          |
| C03-U19 | Comments        | More than five fold behind "Show N earlier comments"                                                                                          |
| C03-U20 | Drawer          | Fullscreen on phones: the page slides in from the right, the back button closes it; reduced motion fades                                      |
| C03-U21 | client          | Due, notes, visibility, subtask and comment changes apply to the cached task at once and queue; a refused one rolls back and toasts           |
| C03-U22 | client          | Delete removes the row from its day and restore puts it back in place; a `task.changed` event refreshes that task only                        |
| C03-U23 | core            | Due words: "today", "tomorrow", "in 4 days", "in 3 weeks", "1 day overdue", "2 weeks overdue"; "Fri 16 Oct" formatting                        |
| C03-U24 | core            | Notes cleaning keeps the editor's tags and attributes and strips everything else                                                              |

API (`apps/server`):

| ID      | Case                                                                                                                               |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| C03-A01 | Reading a task returns its fields, subtasks in order, comments in order and history; a task in someone else's space is 403         |
| C03-A02 | Due: set and clear, last write wins by clock; each write adds a history event                                                      |
| C03-A03 | Notes: saved as cleaned HTML; oversize notes are refused (400); last write wins                                                    |
| C03-A04 | Visibility: only `me` and `space` are accepted; stored and returned                                                                |
| C03-A05 | Subtasks: create with the next position, rename, cross off, reorder, delete; each is idempotent by mutation id and last write wins |
| C03-A06 | Comments: add, edit by its author, delete by its author; editing someone else's is 403; a deleted comment stays out                |
| C03-A07 | History: moving a task between days and the Backlog, carrying over, crossing off and uncrossing each write one event in order      |
| C03-A08 | Restore: a soft-deleted task comes back on its day in its place with its subtasks and comments; restoring a live task is a no-op   |
| C03-A09 | The day response carries due, subtask counts and comment counts for each task                                                      |
| C03-A10 | Every change publishes a live event naming the task to the space's people and not to others                                        |
| C03-A11 | `/t/ME-52` resolves a task ref to its day for the person who can see it, 404 otherwise                                             |

End-to-end, group `detail`:

| ID      | Case                                                                                                                          |
| ------- | ----------------------------------------------------------------------------------------------------------------------------- |
| C03-E01 | Open a task from the row, change the title, close with ×; the row shows the new title and a reload keeps it                   |
| C03-E02 | Set a due date from the panel; the byline says "Due Wed"; remove it; reload                                                   |
| C03-E03 | Move the task to tomorrow from Planned; the row leaves today, the toast says "Moved to Mon 19 Oct", the panel follows; reload |
| C03-E04 | Write notes with bold, a list and a checklist; close and reopen; a reload shows them                                          |
| C03-E05 | Add three subtasks in the panel, cross one off, reorder, delete one; the row says "1 of 2 done ›"; open the fold on the row   |
| C03-E06 | Add a comment; it appears with the wash; edit it; delete it and Undo                                                          |
| C03-E07 | Delete the task; the row leaves; Undo brings it back in place; delete again and let the toast go; a reload shows it gone      |
| C03-E08 | Step through the day with the arrows; Esc closes; focus is back on the row                                                    |
| C03-E09 | History lists Created, Due date set and Moved after E02 and E03                                                               |
| C03-E10 | Reload with `?task=ME-1` reopens it; `/t/ME-1` opens it on its day; copy link gives that address                              |
| C03-E11 | Phone: the detail is its own page; ‹ Today goes back; subtasks and a comment on the phone                                     |
| C03-E12 | Two days: the panel sits over both sheets and neither squeezes (desktop)                                                      |
| C03-E13 | Offline: set a due date and add a subtask, the banner shows, reconnect, the server has both                                   |
| C03-E14 | Live: a due date set in a second tab shows in the open panel of the first                                                     |
| C03-E15 | States: a slow task shows the skeleton column; a failed task says it did not load and Try again recovers                      |
| C03-E16 | Dark mode: E01, E04 and E06 again in dark                                                                                     |

Not automated: the feel of the slide, the veil, the comment wash and the subtask fold; you judge those on staging
and the kit.

## Done when

- The tests above pass three runs in a row locally and on the Dokploy runner.
- Staging lets you open any task and change everything in place, on desk, tablet and phone, light and dark.
- The panel matches the 02 boards and the four states; the row's fold matches the 00 components board.
