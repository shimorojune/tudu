# Chunk 22 · Notebook · test cases

Status column is kept by `pnpm test:status` in [STATUS.md](STATUS.md). The feature's proposal is
[docs/plans/notebook.md](../plans/notebook.md). Run this chunk's tests with `pnpm test`, `pnpm e2e notebook` and,
on a Mac, `pnpm e2e:mac -g C22` and `cargo test --features control` in `apps/desktop/src-tauri`.

## Unit (`packages/core`, `packages/client`, `packages/ui`, `apps/web`)

| ID      | Where                                    | Case                                                                                                                                                            |
| ------- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C22-U01 | core `notebook.test.ts`                  | `buildTree` nests folders and notes by parent and position; trashed ones are left out; a note whose folder is gone shows as not in a folder                     |
| C22-U02 | core `notebook.test.ts`                  | `canDrop`: a folder can't go into itself or below itself; nothing may land deeper than three levels; a note can go anywhere                                     |
| C22-U03 | core `notebook.test.ts`                  | `moveTargets` lists every folder with its path, "Not in a folder" first, and marks the current one Here                                                         |
| C22-U04 | core `notebook.test.ts`                  | First line of an untitled note: tags stripped, cut at 80 chars; a note with neither title nor words is "empty" and isn't kept                                   |
| C22-U05 | core `notebook.test.ts`                  | Days left in Trash: 30 on the day, 1 on the last day, never below 1; folder delete counts every note below it; folder names unique in a place                   |
| C22-U06 | core `notes.test.ts`                     | `cleanHtml` on a note body keeps checklists, files and links and drops scripts, handlers and unknown tags (the task notes' rules)                               |
| C22-U07 | client `notebook.test.ts`                | A blank new note sends nothing; the first word sends `note.create` then `note.body`; closing it blank leaves the outbox empty                                   |
| C22-U08 | client `notebook.test.ts`                | Body saves debounce to one `note.body` per 600 ms of quiet and flush on close; each carries the last known `rev`                                                |
| C22-U09 | client `notebook.test.ts`                | Save state: saving while queued (the ring once it has taken 500 ms), saved on ack, offline while disconnected, conflict on `stale`, error when turned down      |
| C22-U10 | client `notebook.test.ts`                | "Keep mine" resends the local body on the server's rev; "Show the newer one" drops it and loads the server's                                                    |
| C22-U11 | client `notebook.test.ts`                | `NOTEBOOK_CHANGED` from another client invalidates only the named notes and the tree; from this client it does nothing                                          |
| C22-U12 | ui `NoteTree.test.tsx`                   | Folder row: New folder hidden at the third level; ⋯ Rename edits in place (Enter saves, Esc keeps the old name); a taken name shows its line; Delete asks first |
| C22-U13 | ui `NoteTree.test.tsx`                   | Find narrows the tree and opens folders holding a match; no match says "No note matches “…”."                                                                   |
| C22-U14 | ui `NoteEditor.test.tsx`                 | ⋯ has Move and Delete only; Move picks a folder and calls `onMove`; Delete opens the confirmation and only calls `onDelete` after Delete                        |
| C22-U15 | ui `NoteEditor.test.tsx`                 | Selecting words shows Make a task; it calls `onMakeTask` with the words; a selection outside the note shows nothing                                             |
| C22-U16 | ui `NoteEditor.test.tsx`                 | Popovers: a click off one (on the title, in the words) or Esc closes it; opening Link closes Move; each leaves with the leaving class                           |
| C22-U17 | ui `NoteWindow.test.tsx`                 | Opens on a blank note; Recent and All notes switch the rail; pin and expand show only on the Mac variant; ↗ only on web                                         |
| C22-U18 | ui `NoteLinks.test.tsx`                  | Lists linked notes with count and time at the right edge; × unlinks; Link a note marks already linked notes; error line offers Try again                        |
| C22-U19 | ui `NoteTrash.test.tsx`                  | Rows show where they came from and days left; Put back calls `onRestore`; Delete now and Empty Trash ask first; empty says "Nothing in Trash."                  |
| C22-U20 | ui `NotebookFixes.test.tsx`              | Banner buttons drop under the words below 520 px; the comment box has equal side padding; ConfirmDialog opens over the whole app                                |
| C22-U21 | web `shell.test.ts`, `notebook.test.tsx` | The top bar has Notebook between Search and Inbox; on phones More has a Notebook row; neither shows when signed out                                             |
| C22-U22 | web `notebook.test.tsx`                  | Notes come under "Notes" after tasks; picking one opens the note window on desktop and the note page on a phone                                                 |

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
| C22-A10 | `note.restore` of a note whose folder is gone puts it in "Not in a folder"; `note.purge` and `trash.empty` remove rows and their files                                |
| C22-A11 | The sweep deletes notes and folders 30 days after `deleted_at` and keeps younger ones                                                                                 |
| C22-A12 | Search: words in a note's title and body find it; trashed notes and Meera's notes never appear; at most 5; title hits rank first                                      |
| C22-A13 | Body HTML is cleaned on the server: a script tag or `onerror` sent in `note.body` is not stored                                                                       |
| C22-A14 | Files: an upload to `/api/notebook/files` is served to its owner and is 404 to Meera                                                                                  |
| C22-A15 | Every notebook change publishes `NOTEBOOK_CHANGED` to the owner only                                                                                                  |
| C22-A16 | Folder names: a duplicate name in the same parent is rejected `name-taken`; the same name under another parent is fine                                                |

## End-to-end (`packages/e2e/tests/notebook`, group `notebook`, desktop web unless noted)

| ID      | Case                                                                                                                                                      |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C22-E01 | First visit: the Notebook button opens the empty Notebook; New note, type a title and words, see the ring then the tick; reload keeps them                |
| C22-E02 | Folders: make Northwind / Planning / Offsite; New folder isn't offered in Offsite; drag a note into Planning; drag Planning under Offsite is refused      |
| C22-E03 | Rename a folder from ⋯ and by double-click; Esc keeps the old name                                                                                        |
| C22-E04 | Move a note with ⋯ Move: Here is marked, picking Offsite moves it in the tree, Undo puts it back                                                          |
| C22-E05 | Delete a note: the confirmation shows, Cancel keeps it, Delete fades it out and opens the next one, Undo brings it back                                   |
| C22-E06 | Trash: delete a folder with two notes, see it in Trash with days left, Put back restores both; Delete now and Empty Trash ask, then remove for good       |
| C22-E07 | Link a task from another space; the chip shows; the task's panel shows the note under "From your notebook"; × on either side unlinks                      |
| C22-E08 | Task panel New note opens the note window linked to the task; typing saves; closing a blank one leaves nothing behind                                     |
| C22-E09 | Clicking a note in the task panel opens the note window over the task; the task panel stays open behind it                                                |
| C22-E10 | Meera opens the same shared task: no "From your notebook" note of Rohit's; her search for Rohit's note words finds nothing                                |
| C22-E11 | Make a task: select words, Make a task, the toast's Open shows ME-n on Today in Personal, linked to the note                                              |
| C22-E12 | Search: a word only in a note's body finds it under Notes with the line washed in ink; picking it opens the note window                                   |
| C22-E13 | Offline: go offline, keep typing, "Not saved yet" shows; back online it saves and the tick shows                                                          |
| C22-E14 | Conflict: two windows edit the same note; the later save shows the banner; Keep mine wins in both; Show the newer one drops local words                   |
| C22-E15 | Note window (web): drag it, ↗ opens the popup with the same note, edits in the popup show in the panel                                                    |
| C22-E16 | Recent and All notes in the window: All shows the tree; picking a note there opens it in the window                                                       |
| C22-E17 | Phone (iPhone viewport): More › Notebook, open a folder and a note, type, the format bar stays at the bottom of the note, ‹ goes back                     |
| C22-E18 | States: the note list and a note fail to load (route stubbed) and show their messages with Try again, in light and dark; nothing overflows at 320 px wide |
| C22-E19 | Motion: popovers leave with the leaving animation; reduced motion turns slides into fades                                                                 |
| C22-E20 | Task panel comment box: equal padding left and right at desktop and phone widths                                                                          |

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

## Note window fixes ([docs/plans/note-window-fixes.md](../plans/note-window-fixes.md))

| ID      | Where                         | Case                                                                                                                                         |
| ------- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| C22-U60 | ui `NoteWindow.test.tsx`      | Both variants: the grip and seven edge handles, each calls `onResizeStart` with its direction; none while expanded                           |
| C22-U61 | ui `NoteWindow.test.tsx`      | Web: the open button is the Tudu mark, "Open in your Notebook" (no ↗); the bar holds the drag mark                                           |
| C22-U62 | web `notebook.test.tsx`       | `resizeFrame`: each edge moves only its edges; never below 420×320, stops 8px inside the page                                                |
| C22-U63 | web `desktop.test.tsx`        | An app that refuses `open_note`: the note opens over the page, the toast's Update Tudu checks and opens This Mac, once                       |
| C22-U64 | web `NoteWindowPage.test.tsx` | The Mac note window paints a theme stored by the desk, and one picked while hidden on `note:open`                                            |
| C22-U65 | web `NoteWindowPage.test.tsx` | After pin and close, `note:open` with pinned false shows "Keep on top of other windows", not pressed                                         |
| C22-U66 | web `NoteWindowPage.test.tsx` | `/note-window/abc` in a browser goes on to `/notebook/abc`                                                                                   |
| C22-U67 | Rust `notes.rs`               | `on_close` unpins and leaves expanded and the last ask alone                                                                                 |
| C22-U68 | Rust `place.rs`               | `cocoa_rect` flips a top-left physical frame to Cocoa points, on a 2× primary and on a screen above it                                       |
| C22-U69 | Rust `place.rs`               | `resize` moves only the named edges, never below the least size                                                                              |
| C22-U70 | web `NoteWindowPage.test.tsx` | An edge's pointer down asks the app to begin, then to resize by how far the pointer moved on the screen                                      |
| C22-U71 | Rust `place.rs`               | `between` eases a glide from one frame to the other (slow at the ends), on whole pixels, and stops at the end                                |
| C22-E15 | e2e `notebook`                | (Replaces the popup steps.) The window drags; the Tudu mark opens the note on the Notebook page and closes it; no popup                      |
| C22-E60 | e2e `notebook`                | Every edge and corner resizes the window; never below 420×320 or past the page; the frame is kept across a reload                            |
| C22-E61 | e2e `notebook`                | Light and dark: the drag mark shows, the rail is the note's own paper, each handle has its cursor                                            |
| C22-E62 | e2e `notebook`                | (Replaces C22-E24.) The formatting bar is a solid strip above the writing on the Notebook page and in the window; phones keep it at the foot |
| C22-E63 | e2e `notebook`                | An older Mac app: the note opens over the page with the toast; Update Tudu opens This Mac and checks                                         |
| C22-D30 | mac `notebook.spec.ts`        | ⌥⌘N is registered and opens the note window on a blank note over another app; with the sheet open the sheet goes first                       |
| C22-D31 | mac `notebook.spec.ts`        | Pinned, closed (its button or ⌘W) and opened again: unpinned, not on top, and the button says so                                             |
| C22-D32 | mac `notebook.spec.ts`        | Fill the screen glides there and back (widths in between), ending where C22-D03 does                                                         |
| C22-D33 | mac `notebook.spec.ts`        | The note window paints Dark picked on the desk while hidden, and Light picked while open within a second                                     |
| C22-D34 | mac `notebook.spec.ts`        | Every edge and corner resizes the real window, its far edges staying put, never below 420×320                                                |
