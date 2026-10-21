# Chunk 04 · Quick Add

Status: approved 21 Oct 2026 (all five choices as proposed), built on branch `rewrite/04-quick-add`. Tests in
[docs/tests/chunk-04.md](../tests/chunk-04.md); deviations in [design-deviations.md](design-deviations.md).

Boards: 03 Quick Add (desktop, dark, tablet, phone, the floating bar, the seven states, motion), 00 The task row
(the project dot), 02 Task detail (the Project fact). The bar is the design system's QuickAdd; its reference source
is in the Tudu Paper bundle.

## Scope

- **The bar.** New task in the top bar (desk and tablet) and the round button on phones open Quick Add. On the
  desk and tablets the bar fades down 8px into place near the top while a light veil settles; on phones it is a
  sheet that rises with the keyboard. The line is ready to write in. Esc (a picker first), the × or a click on the
  veil close it, and what you wrote is still there the next time you open it.
- **One line, three quiet chips**, as drawn: the title (Enter adds), Planned (the day you are looking at by
  default; Today, Tomorrow and Backlog on top of the calendar), Due (the calendar with the "how far" hint, Remove
  due date), Project (the list with its dots, No project). Chips ease their width when their label changes.
- **A note and files only when you ask for them.** The note line (up to three lines) fades up under the title
  and becomes the task's notes. Files come from the attach button, a paste, or a drop anywhere on the bar (a
  dashed ink outline says "Drop to attach"); they show as chips with their size and a ×. They upload as soon as
  they are added, with a quiet progress on the chip, and go with the task as attachment chips at the end of its
  notes.
- **Adding.** The foot says where it lands as you write ("Lands on Today · Platform · due Thu 22 Oct · note ·
  2 files"). Add task spins ("Adding…") while the form holds still, then confirms with a tick ("Added") and the
  bar leaves after 650ms. On the day you are looking at the new row opens its gap with the wash (both sheets in
  two-day view); on another day a toast says "Added to Tomorrow" with Show, which turns the sheet there and
  washes it; in the Backlog, "Added to Backlog". A failed add keeps the draft and says "Couldn’t add the task.
  Your draft is still here."
- **Projects.** A space has projects (a name and a muted colour); a task may belong to one. The row's byline shows
  the dot and the name, the panel's facts gain Project with its picker (projects, No project), and the Quick Add
  chip picks one. New projects are made from the picker's last line, "New project…" (see the choices).
- **Attachments.** `POST /api/spaces/:id/files` takes a file (up to 25 MB) into object storage (RustFS locally
  and in CI, the Dokploy buckets on staging and production) and answers with its id, name, size and type;
  `GET /api/files/:id` streams it back to a member of its space. The notes and comment editors' "Attach a file"
  button arrives with the same upload, inserting the attachment chip at the caret; chips in notes and comments open
  the file. The cleaner keeps the chip.
- **The floating bar's page.** `/quick-add` renders the bar alone on the desk's blurred backdrop, as the floating
  board draws it, for the macOS window that chunk 11 opens with the global summon. On the web it is just a page.
- **Data.** New tables `projects` and `attachments`; `project_id` on tasks with its own clock. New changes through
  the outbox: project set, project create, rename, recolour and delete. History gets "Created from Quick Add".
- **States**, as drawn: just opened, written, with a note and files, dropping files, not for a day yet (Backlog),
  adding, added. Offline: adding still works from the outbox; attaching needs a connection (see the choices).

Out of scope: "Looks like a task you have" (word matches arrive with Search, chunk 07; close matches by meaning
are in later.md), the global summon, tray and the Tauri window (11), For someone and Send (08), the project
filter on the Backlog (06), Jira (10).

## Choices (approved as proposed)

1. **New projects from the picker.** The canvas draws no place to make a project. The picker's last line,
   "New project…", asks for a name on the spot and gives it the next colour from the design's muted palette;
   renaming, recolouring and deleting wait for Settings › Space (chunk 09). The alternative is to make projects
   only in chunk 09, which leaves the picker empty until then.
2. **Files upload at once**, when added to the bar, so Add task stays quick and the attachment is real before the
   task is. Offline, the attach button says "You’re offline. Files need a connection." and the rest of the bar
   keeps working. The alternative, queuing files in the outbox, would mean keeping file bodies in IndexedDB.
3. **Attachments live in the notes** as chips, the way the editor's "Attach a file" inserts them, rather than in
   a separate Files section the canvas does not draw.
4. **The draft is kept per browser** (in memory for the visit) rather than on the server, matching "what you
   wrote is still there the next time you open it" without a new API.
5. **Planned defaults to the day you are looking at**, as the boards do, not always to today.

## Test plan

Unit (`packages/ui`, `packages/client`, `packages/core`):

| ID      | Component  | Case                                                                                                                                                              |
| ------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C04-U01 | QuickAdd   | Just opened: the line focused, Planned "Today" in the brand tone, Due and Project empty, the foot says "Lands on Today", Add task off                             |
| C04-U02 | QuickAdd   | Planned: Today, Tomorrow, Backlog and the calendar; the chip and the foot follow ("Lands in Backlog"); the chip eases its width                                   |
| C04-U03 | QuickAdd   | Due: the hover hint says how far; the chip reads "Due Thu 22 Oct", red when overdue; Remove due date clears it                                                    |
| C04-U04 | QuickAdd   | Project: the list with dots, No project; New project… asks for a name and adds it with the next colour                                                            |
| C04-U05 | QuickAdd   | The note line fades up on the note button, keeps three lines, folds away when left empty; the foot says "note"                                                    |
| C04-U06 | QuickAdd   | Files: the attach button, a paste and a drop add chips with their size; dropping shows the outline; × removes one; the foot counts them                           |
| C04-U07 | QuickAdd   | Add: Enter or the button; onSave gets the draft; "Adding…" holds the form, "Added" then onAdd and onClose after 650ms; a rejected save keeps the draft and toasts |
| C04-U08 | QuickAdd   | Esc closes a picker first, then the bar; the × and the veil close it; the draft is still there when it opens again                                                |
| C04-U09 | QuickAdd   | Phone: the sheet with the grabber, the foot with the buttons and Add, pickers open upward, the keyboard height moves the sheet                                    |
| C04-U10 | QuickAdd   | Reduced motion and the leaving states: the bar fades, 150ms out (210 on phones)                                                                                   |
| C04-U11 | TaskRow    | The project dot and name in the byline, after the Jira key; brief rows keep it                                                                                    |
| C04-U12 | TaskDetail | The Project fact: picker with dots, No project, New project…; "Add to a project" when empty                                                                       |
| C04-U13 | Editor     | Attach a file inserts the chip at the caret with name and size; the chip renders read-only with a link; the cleaner keeps it                                      |
| C04-U14 | client     | Set project, create a project, and a task made from Quick Add with notes and a project apply at once and queue; the row and panel follow                          |
| C04-U15 | client     | Uploads: progress, done, failed (toast); an upload while offline is refused before it starts                                                                      |
| C04-U16 | core       | Project colours: the palette in order, the next free one, wrapping; project names trimmed, 1 to 60 characters                                                     |
| C04-U17 | core       | The foot's words: "Lands on Today", "Lands on Tomorrow", "Lands on Thu 22 Oct", "Lands in Backlog", with project, due, note and file counts                       |

API (`apps/server`):

| ID      | Case                                                                                                                                           |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| C04-A01 | Projects: create (next colour given when none sent), rename, recolour, delete; a task in a deleted project keeps no project; 403 for strangers |
| C04-A02 | Set a task's project: last write wins by clock; a project from another space is refused (400); the day's rows carry the project                |
| C04-A03 | A task created with notes and a project in one batch lands with both; its history says "Created from Quick Add"                                |
| C04-A04 | Upload: a file lands in the bucket under the space; the answer has id, name, size and type; over 25 MB is refused (413); no file is 400        |
| C04-A05 | Download: a member streams it back with its name and type; a stranger gets 403; an unknown id 404                                              |
| C04-A06 | Attachment chips in notes and comments survive the cleaner with their id, name and size, and nothing else                                      |
| C04-A07 | Deleting a task leaves its files readable until restore or a day later; a file nobody references is swept (job)                                |
| C04-A08 | Every project change publishes a live event to the space's people                                                                              |

End-to-end, group `quick-add`:

| ID      | Case                                                                                                                              |
| ------- | --------------------------------------------------------------------------------------------------------------------------------- |
| C04-E01 | New task opens the bar over the day; write a title, Add task; the row opens its gap on today with the wash; a reload shows it     |
| C04-E02 | Planned Tomorrow: "Added to Tomorrow" with Show; Show turns the sheet and washes the row                                          |
| C04-E03 | Planned Backlog: "Added to Backlog"; the day stays empty; the task is in the Backlog state on the server                          |
| C04-E04 | Due and Project: the foot reads them; the new row's byline says "Due Thu" and the project; the panel shows the Project fact       |
| C04-E05 | New project from the chip; it is in the picker next time, on the row and in the panel                                             |
| C04-E06 | A note becomes the task's notes; a file attached shows as a chip in the notes and opens                                           |
| C04-E07 | Drop a file on the bar: the outline, the chip, the upload; a 30 MB file is refused with a plain message                           |
| C04-E08 | Esc keeps the draft; reopening shows it; × and the veil close it too                                                              |
| C04-E09 | Enter adds; a failed save (route 500) says the draft is still here; Try again adds it                                             |
| C04-E10 | Phone: the round button opens the sheet above the keyboard; add a task; it is on today                                            |
| C04-E11 | Two days: a task added to the second sheet's day washes there                                                                     |
| C04-E12 | Offline: add a task from the bar; it shows at once and reaches the server when back; the attach button says it needs a connection |
| C04-E13 | `/quick-add` shows the bar alone; adding from it lands on today in another tab (live)                                             |
| C04-E14 | Attach a file from the notes editor in the panel; the chip is there after a reload and opens the file                             |
| C04-E15 | Dark mode: E01 and E04 again in dark                                                                                              |

Not automated: the bar's arrival and the veil, the chip width easing, the tick on Add; you judge those on staging.

## Done when

- The tests above pass three runs in a row locally and on the Dokploy runner (the runner gets the RustFS bucket).
- Staging lets you add from anywhere on desk, tablet and phone, with notes, files and a project, light and dark.
- The bar matches the 03 boards and the seven states; the row and panel show the project as drawn.
