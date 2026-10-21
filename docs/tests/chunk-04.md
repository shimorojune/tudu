# Chunk 04 · Quick Add · test cases

Status column is kept by `pnpm test:status` in [STATUS.md](STATUS.md). Run this chunk's tests with
`pnpm test -- --project ui --project client --project core --project server` and `pnpm e2e quick-add`.
End-to-end tests fix the clock at Sunday 18 October 2026, 10:00. Uploads land in the memory storage driver on a
laptop without Docker and in the RustFS bucket on the Dokploy runner (`TUDU_CI_S3_*`).

## Unit (`packages/ui`, `packages/client`, `packages/core`)

| ID      | What it checks        | Scenario                                                                                                                                                                                                       |
| ------- | --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C04-U01 | Just opened           | The line focused, Planned "Today" in the brand tone, Due and Project empty, "Lands on Today", Add task off, the veil behind the bar                                                                            |
| C04-U02 | Planned               | Today, Tomorrow, Backlog and the calendar; the chip and the foot follow ("Lands in Backlog"); the chip eases its width (stylesheet)                                                                            |
| C04-U03 | Due                   | The hover hint says how far; "Due Thu 22 Oct", red when overdue; Remove due date clears it and the foot                                                                                                        |
| C04-U04 | Project               | The list with dots, ✓ on the chosen one, No project; New project… asks for a name on the spot and picks it                                                                                                     |
| C04-U05 | The note line         | Opens on the note button and takes focus; three lines at most (a fourth joins the third); folds away when left empty; the foot says note                                                                       |
| C04-U06 | Files                 | The attach button, a drop (with the outline) and a paste add chips with their size; × removes one; a failed upload reads failed and toasts                                                                     |
| C04-U07 | Add                   | Enter or the button; onSave gets the draft; "Adding…" holds the form; "Added" then onAdded and onClose after 650ms; a rejected save keeps the draft and toasts                                                 |
| C04-U08 | Closing               | Esc closes a picker first, then the bar; × and the veil close it; it eases out, and the draft is still there when it opens again                                                                               |
| C04-U09 | Phone                 | The sheet with the grabber, no logo and no ×, the foot with the buttons and Add, pickers open upward, the keyboard height moves the sheet                                                                      |
| C04-U10 | Motion                | Arrives in 200ms, leaves in 150ms (210 on phones), the veil in 160ms; fades under reduced motion                                                                                                               |
| C04-U11 | The row's project     | The dot and the name sit in the byline after the Jira key; brief rows keep them                                                                                                                                |
| C04-U12 | The Project fact      | In the panel between Due and Visible to; the picker with dots, No project and New project…; "Add to a project" when empty; out without a list                                                                  |
| C04-U13 | Attachments           | Attach a file inserts the chip at the caret linking through the API; stored HTML keeps the API path; the cleaner keeps the chip's id, name and size                                                            |
| C04-U14 | Projects in the store | A new project shows with the next colour; set project shows on the row and in the panel; delete clears it everywhere; a Quick Add task queues as one change with its extras; a live event reads projects again |
| C04-U15 | Uploads               | An upload answers with the attachment; a refused one throws with the server's words                                                                                                                            |
| C04-U16 | Colours and names     | The palette in order, skipping taken colours, then round again; names trimmed, 1 to 60 characters                                                                                                              |
| C04-U17 | The foot's words      | Lands on Today, Tomorrow, Thu 22 Oct, in Backlog, with the project, due, note and file counts; "Added to Tomorrow"; file sizes                                                                                 |

## API (`apps/server`)

| ID      | What it checks        | Scenario                                                                                                                                                   |
| ------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C04-A01 | Projects              | Create with the next colour, rename, recolour, delete; a deleted project leaves its tasks without one; 410 after; 403 for strangers; a blank name is 400   |
| C04-A02 | A task's project      | Last write wins by clock; a project from another space is refused (400); the day's rows carry the project id                                               |
| C04-A03 | A task from Quick Add | Lands with its due day, cleaned notes, project and files (as chips at the end of the notes); history says Created from Quick Add; a strange project is 400 |
| C04-A04 | Upload                | A file lands in the bucket under its space; over 25 MB is 413; no file is 400; a stranger is 403; an unknown task is 404                                   |
| C04-A05 | Download              | A member streams it back with its type and name, inline for images, PDFs and text, as an attachment otherwise; strangers 403; unknown 404                  |
| C04-A06 | Chips in writing      | Attachment chips in notes and comments survive the cleaner with their id, name and size, and nothing else                                                  |
| C04-A07 | The sweep             | A file for a task that never came goes after a day; a deleted task's files go a day later; fresh and live ones stay                                        |
| C04-A08 | Live events           | Every project change tells the space's people, and nobody else                                                                                             |

## End-to-end (`packages/e2e/tests/quick-add`, group `quick-add`)

| ID      | What it checks        | Scenario                                                                                                                                   |
| ------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| C04-E01 | Add to today          | New task opens the bar over the day with the veil; Add task puts the row on today with the wash; a reload shows it; history says Quick Add |
| C04-E02 | Tomorrow              | "Added to Tomorrow" with Show; today stays empty; Show turns the sheet to Monday and washes the row                                        |
| C04-E03 | Backlog               | "Added to Backlog" with Show (since chunk 06, it opens the Backlog on the row); today stays empty; the server has it without a day         |
| C04-E04 | Due and Project       | The foot reads them; the row says "Due Thu" and the project; the panel's Project fact shows it; the server has both                        |
| C04-E05 | A new project         | Made from the chip; after a reload it is in the picker, on the row and in the panel                                                        |
| C04-E06 | Note and file         | The note becomes the task's notes; a file attached shows as a chip in the notes and opens with its type                                    |
| C04-E07 | Dropping files        | The outline, the chip, the upload; a 30 MB file is refused with a plain message and reads failed; × removes it (desktop, tablet)           |
| C04-E08 | Closing               | Esc keeps the draft and reopening shows it; × and the veil close it too                                                                    |
| C04-E09 | A failed save         | With the server failing, Enter still adds (local-first); the task reaches the server once it answers again                                 |
| C04-E10 | Phone                 | The round button opens the sheet; Add puts the task on today (phone)                                                                       |
| C04-E11 | Two days              | A task added to the second sheet's day washes there, with no toast (desktop)                                                               |
| C04-E12 | Offline               | A task from the bar shows at once and reaches the server when back; the attach button says files need a connection                         |
| C04-E13 | The floating page     | `/quick-add` shows the bar alone; adding from it says "Added to Today" and lands on today in another tab                                   |
| C04-E14 | Attach from the panel | A file attached in the notes editor is there after a reload and opens                                                                      |
| C04-E15 | Dark mode             | Add with a due date in the dark theme                                                                                                      |

Not automated: the bar's arrival and the veil, the chip width easing, the tick on Add, the sheet rising with the
keyboard. Judge those on staging and on the kit page's Quick Add section.
