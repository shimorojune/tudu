# Chunk 22 · Notebook · test cases

Status column is kept by `pnpm test:status` in [STATUS.md](STATUS.md). The feature's proposal is
[docs/plans/notebook.md](../plans/notebook.md). Run this chunk's tests with `pnpm test`, `pnpm e2e notebook` and,
on a Mac, `pnpm e2e:mac -g C22` and `cargo test --features control` in `apps/desktop/src-tauri`.

## Unit (`packages/core`, `packages/client`, `packages/ui`, `apps/web`)

| ID      | Where                                    | Case                                                                                                                                                                             |
| ------- | ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C22-U01 | core `notebook.test.ts`                  | `buildTree` nests folders and notes by parent and position; trashed ones are left out; a note whose folder is gone sits at the top of Notebook                                   |
| C22-U02 | core `notebook.test.ts`                  | `canDrop`: a folder can't go into itself or below itself; nothing may land deeper than three levels; a note can go anywhere                                                      |
| C22-U03 | core `notebook.test.ts`                  | `moveTargets` lists every folder with its path, "Notebook" first, and marks the current one Here                                                                                 |
| C22-U04 | core `notebook.test.ts`                  | First line of an untitled note: tags stripped, cut at 80 chars; a note with neither title nor words is "empty" and isn't kept                                                    |
| C22-U05 | core `notebook.test.ts`                  | Days left in Trash: 30 on the day, 1 on the last day, never below 1; folder delete counts every note below it; folder names unique in a place                                    |
| C22-U06 | core `notes.test.ts`                     | `cleanHtml` on a note body keeps checklists, files and links and drops scripts, handlers and unknown tags (the task notes' rules)                                                |
| C22-U07 | client `notebook.test.ts`                | A blank new note sends nothing; the first word sends `note.create` then `note.body`; closing it blank leaves the outbox empty                                                    |
| C22-U08 | client `notebook.test.ts`                | Body saves debounce to one `note.body` per 600 ms of quiet and flush on close; each carries the last known `rev`                                                                 |
| C22-U09 | client `notebook.test.ts`                | Save state: saving while queued (the ring once it has taken 500 ms), saved on ack, offline while disconnected, conflict on `stale`, error when turned down                       |
| C22-U10 | client `notebook.test.ts`                | "Keep mine" resends the local body on the server's rev; "Show the newer one" drops it and loads the server's                                                                     |
| C22-U11 | client `notebook.test.ts`                | `NOTEBOOK_CHANGED` from another client invalidates only the named notes and the tree; from this client it does nothing                                                           |
| C22-U12 | ui `NoteTree.test.tsx`                   | Folder row: New folder hidden at the third level; ⋯ Rename edits in place (Enter saves, Esc keeps the old name); a taken name shows its line; Delete asks first                  |
| C22-U13 | ui `NoteTree.test.tsx`                   | Find narrows the tree and opens folders holding a match; no match says "No note matches “…”."                                                                                    |
| C22-U14 | ui `NoteEditor.test.tsx`                 | ⋯ has Move and Delete only; Move picks a folder and calls `onMove`; Delete opens the confirmation and only calls `onDelete` after Delete                                         |
| C22-U15 | ui `NoteEditor.test.tsx`                 | Selecting words shows Make a task; it calls `onMakeTask` with the words; a selection outside the note shows nothing                                                              |
| C22-U16 | ui `NoteEditor.test.tsx`                 | Popovers: a click off one (on the title, in the words) or Esc closes it; opening Link closes Move; each leaves with the leaving class                                            |
| C22-U17 | ui `NoteWindow.test.tsx`                 | Opens on a blank note; Recent and All notes switch the rail; pin and expand show only on the Mac variant; ↗ only on web                                                          |
| C22-U18 | ui `NoteLinks.test.tsx`                  | Lists linked notes with count and time at the right edge; × unlinks; Link a note marks already linked notes; error line offers Try again                                         |
| C22-U19 | ui `NoteTrash.test.tsx`                  | Rows show where they came from and days left; Put back calls `onRestore`; Delete now and Empty Trash ask first; empty says "Nothing in Trash."                                   |
| C22-U20 | ui `NotebookFixes.test.tsx`              | Banner buttons drop under the words below 520 px; the comment box has equal side padding; ConfirmDialog opens over the whole app                                                 |
| C22-U21 | web `shell.test.ts`, `notebook.test.tsx` | The top bar has Notebook between Search and Inbox; on phones More has a Notebook row; neither shows when signed out                                                              |
| C22-U22 | web `notebook.test.tsx`                  | Notes come under "Notes" after tasks; picking one opens the note window on desktop and the note page on a phone                                                                  |
| C22-U40 | ui `NoteTree.test.tsx`                   | Mouse: a 3 px move doesn't lift, a 5 px one does (card shown, row dimmed); letting go over a folder calls `onMoveNote(id, folderId)`                                             |
| C22-U41 | ui `NoteTree.test.tsx`                   | A click with no movement picks the note; the click right after a drag doesn't                                                                                                    |
| C22-U42 | ui `NoteTree.test.tsx`                   | Touch: a 380 ms hold lifts; moving 9 px first cancels and nothing moves                                                                                                          |
| C22-U43 | ui `NoteTree.test.tsx`                   | Over a note: the upper half drops before it, the lower half after, with the matching index                                                                                       |
| C22-U44 | ui `NoteTree.test.tsx`                   | Esc mid-drag and a drop on nothing move nothing; the card goes after its glide                                                                                                   |
| C22-U45 | ui `NoteTree.test.tsx`                   | A folder over a third-level folder says Too deep; letting go toasts "Folders go three levels deep." and moves nothing                                                            |
| C22-U46 | ui `NoteTree.test.tsx`                   | Holding 600 ms over a closed folder opens it                                                                                                                                     |
| C22-U47 | ui `NoteTree.test.tsx`                   | Notes in no folder have no heading and sit after a hairline (only with folders); with none, dragging a filed note offers "Drop here to take it out of its folder" and unfiles it |
| C22-U48 | ui `NoteTree.test.tsx`                   | Rows don't lift while Find a note narrows the tree                                                                                                                               |
| C22-U49 | ui `NoteEditor.test.tsx`                 | A draft note keeps ⋯ in place but hidden (`aria-hidden`, `inert`) and out of Tab; the same node shows once the note is kept                                                      |
| C22-U50 | ui `NoteEditor.test.tsx`                 | The crumb of a note in no folder reads "Notebook"                                                                                                                                |
| C22-U51 | client `notebook.test.ts`                | A turned-down move tells `onRejected` the note's name; its retry sends the same move again                                                                                       |
| C22-U52 | web `dropGuard.test.ts`                  | A file dropped where nothing takes it is stopped; a handled drop and a drag with no files are left alone                                                                         |

## API (`apps/server/src/notebook.test.ts`, against the test database)

| ID      | Case                                                                                                                                                                  |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C22-A01 | `note.create`, `note.title`, `note.body`, `note.move` round trip: `GET /api/notebook` and the note read show them; `rev` goes up by one per body save                 |
| C22-A02 | Privacy: Meera's `GET` of Rohit's note, folder, trash or task notes answers 404 (or nothing of his); her mutations on his ids are rejected; none of his in her search |
| C22-A03 | `note.body` with an old `baseRev` is rejected `stale` and the stored body is unchanged; with the current rev it lands                                                 |
| C22-A04 | Clocks: an older `note.title` or `note.move` loses to a newer one; replaying the same mutation id is a no-op                                                          |
| C22-A05 | Depth: `folder.create` or `folder.move` that would make a fourth level is rejected; moving a folder into its own subtree is rejected                                  |
| C22-A06 | `note.link` to a task you can read works in any of your spaces; to a task in a space you aren't in, or Meera's "only me" task, is rejected                            |
| C22-A07 | `GET /api/tasks/:id/notes` on a shared task returns only the caller's notes; Meera on the same task gets her own (none), never Rohit's                                |
| C22-A08 | Leaving a space hides links to its tasks from the note read; rejoining shows them again; a task deleted for good removes its links                                    |
| C22-A09 | `folder.delete` trashes the subtree with `deleted_with`; `folder.restore` brings back exactly what went with it, not notes trashed before                             |
| C22-A10 | `note.restore` of a note whose folder is gone puts it at the top of Notebook;`note.purge` and `trash.empty` remove rows and their files                               |
| C22-A11 | The sweep deletes notes and folders 30 days after `deleted_at` and keeps younger ones                                                                                 |
| C22-A12 | Search: words in a note's title and body find it; trashed notes and Meera's notes never appear; at most 5; title hits rank first                                      |
| C22-A13 | Body HTML is cleaned on the server: a script tag or `onerror` sent in `note.body` is not stored                                                                       |
| C22-A14 | Files: an upload to `/api/notebook/files` is served to its owner and is 404 to Meera                                                                                  |
| C22-A15 | Every notebook change publishes `NOTEBOOK_CHANGED` to the owner only                                                                                                  |
| C22-A16 | Folder names: a duplicate name in the same parent is rejected `name-taken`; the same name under another parent is fine                                                |

## End-to-end (`packages/e2e/tests/notebook`, group `notebook`, desktop web unless noted)

| ID      | Case                                                                                                                                                                    |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C22-E01 | First visit: the Notebook button opens the empty Notebook; New note, type a title and words, see the ring then the tick; reload keeps them                              |
| C22-E02 | Folders: make Northwind / Planning / Offsite; New folder isn't offered in Offsite; drag a note into Planning with the mouse; dragging Planning under Offsite is refused |
| C22-E03 | Rename a folder from ⋯ and by double-click; Esc keeps the old name                                                                                                      |
| C22-E04 | Move a note with ⋯ Move: Here is marked, picking Offsite moves it in the tree, Undo puts it back                                                                        |
| C22-E05 | Delete a note: the confirmation shows, Cancel keeps it, Delete fades it out and opens the next one, Undo brings it back                                                 |
| C22-E06 | Trash: delete a folder with two notes, see it in Trash with days left, Put back restores both; Delete now and Empty Trash ask, then remove for good                     |
| C22-E07 | Link a task from another space; the chip shows; the task's panel shows the note under "From your notebook"; × on either side unlinks                                    |
| C22-E08 | Task panel New note opens the note window linked to the task; typing saves; closing a blank one leaves nothing behind                                                   |
| C22-E09 | Clicking a note in the task panel opens the note window over the task; the task panel stays open behind it                                                              |
| C22-E10 | Meera opens the same shared task: no "From your notebook" note of Rohit's; her search for Rohit's note words finds nothing                                              |
| C22-E11 | Make a task: select words, Make a task, the toast's Open shows ME-n on Today in Personal, linked to the note                                                            |
| C22-E12 | Search: a word only in a note's body finds it under Notes with the line washed in ink; picking it opens the note window                                                 |
| C22-E13 | Offline: go offline, keep typing, "Not saved yet" shows; back online it saves and the tick shows                                                                        |
| C22-E14 | Conflict: two windows edit the same note; the later save shows the banner; Keep mine wins in both; Show the newer one drops local words                                 |
| C22-E15 | Note window (web): drag it, ↗ opens the popup with the same note, edits in the popup show in the panel                                                                  |
| C22-E16 | Recent and All notes in the window: All shows the tree; picking a note there opens it in the window                                                                     |
| C22-E17 | Phone (iPhone viewport): More › Notebook, open a folder and a note, type, the format bar stays at the bottom of the note, ‹ goes back                                   |
| C22-E18 | States: the note list and a note fail to load (route stubbed) and show their messages with Try again, in light and dark; nothing overflows at 320 px wide               |
| C22-E19 | Motion: popovers leave with the leaving animation; reduced motion turns slides into fades                                                                               |
| C22-E20 | Task panel comment box: equal padding left and right at desktop and phone widths                                                                                        |
| C22-E40 | A note in no folder drags onto a folder with the mouse (pointer events); the crumb and the server agree                                                                 |
| C22-E41 | A note dragged out of its folder to the top level: the crumb says Notebook, the server has no folder; no "Not in a folder" heading                                      |
| C22-E42 | Phone: hold a note half a second, carry it onto a folder and it moves; a quick swipe moves nothing                                                                      |
| C22-E43 | A new note shows no ⋯ until its first letter; then Move and Delete work                                                                                                 |

## Desktop (`packages/e2e/mac/tests/notebook.spec.ts`, the real Tudu Test app)

The frame and fill-the-screen rules also have Rust tests under the same ids (`place.rs`, `notes.rs`).

| ID      | Case                                                                                                                   |
| ------- | ---------------------------------------------------------------------------------------------------------------------- |
| C22-D01 | Menu bar sheet New note: the sheet hides, the note window shows on a blank note, the desk stays hidden                 |
| C22-D02 | The note window stays when another app comes forward; it hides on close; it opens again where it was, at the same size |
| C22-D03 | Pin keeps it on top (control channel reports `pinned`); unpinned to start; expand fills the screen and back            |
| C22-D04 | Open in your Notebook shows the desk on `/notebook/<id>` and hides the window                                          |
| C22-D05 | Clicking a note in the desk's task panel opens it in the note window, not the desk's Notebook page                     |
| C22-D06 | A note edited in the window shows the change in the desk's Notebook page (`NOTEBOOK_CHANGED`)                          |
| C22-D20 | In the real WKWebView a pointer drag of a note onto a folder moves it (HTML drag and drop never reached the page)      |
