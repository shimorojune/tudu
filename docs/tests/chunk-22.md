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
| C22-U06 | core `notes.test.ts`                     | `cleanHtml` on a note body keeps checklists, files, links and drawing blocks and drops scripts, handlers and unknown tags                                                        |
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

## Note window fixes ([docs/plans/note-window-fixes.md](../plans/note-window-fixes.md))

| ID      | Where                         | Case                                                                                                                                                           |
| ------- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C22-U60 | ui `NoteWindow.test.tsx`      | Both variants: the grip and seven edge handles, each calls `onResizeStart` with its direction; none while expanded                                             |
| C22-U61 | ui `NoteWindow.test.tsx`      | Web: the open button is the Tudu mark, "Open in your Notebook" (no ↗); the bar holds the drag mark                                                             |
| C22-U62 | web `notebook.test.tsx`       | `resizeFrame`: each edge moves only its edges; never below 420×320, stops 8px inside the page                                                                  |
| C22-U63 | web `desktop.test.tsx`        | An app that refuses `open_note`: the note opens over the page, the toast's Update Tudu checks and opens This Mac, once                                         |
| C22-U64 | web `NoteWindowPage.test.tsx` | The Mac note window paints a theme stored by the desk, and one picked while hidden on `note:open`                                                              |
| C22-U65 | web `NoteWindowPage.test.tsx` | After pin and close, `note:open` with pinned false shows "Keep on top of other windows", not pressed                                                           |
| C22-U66 | web `NoteWindowPage.test.tsx` | `/note-window/abc` in a browser goes on to `/notebook/abc`                                                                                                     |
| C22-U67 | Rust `notes.rs`               | `on_close` unpins and leaves expanded and the last ask alone                                                                                                   |
| C22-U68 | Rust `place.rs`               | `cocoa_rect` flips a top-left physical frame to Cocoa points, on a 2× primary and on a screen above it                                                         |
| C22-U69 | Rust `place.rs`               | `resize` moves only the named edges, never below the least size                                                                                                |
| C22-U70 | web `NoteWindowPage.test.tsx` | An edge's pointer down asks the app to begin, then to resize by how far the pointer moved on the screen                                                        |
| C22-U71 | Rust `place.rs`               | `between` eases a glide from one frame to the other (slow at the ends), on whole pixels, and stops at the end                                                  |
| C22-E15 | e2e `notebook`                | (Replaces the popup steps.) The window drags; the Tudu mark opens the note on the Notebook page and closes it; no popup                                        |
| C22-E60 | e2e `notebook`                | Every edge and corner resizes the window; never below 420×320 or past the page; the frame is kept across a reload                                              |
| C22-E61 | e2e `notebook`                | Light and dark: the drag mark shows, the rail is the note's own paper, each handle has its cursor                                                              |
| C22-E62 | e2e `notebook`                | (Replaces C22-E24.) The formatting bar is a solid strip above the writing on the Notebook page and in the window, ending with Draw; phones keep it at the foot |
| C22-E63 | e2e `notebook`                | An older Mac app: the note opens over the page with the toast; Update Tudu opens This Mac and checks                                                           |
| C22-D30 | mac `notebook.spec.ts`        | ⌥⌘N is registered and opens the note window on a blank note over another app; with the sheet open the sheet goes first                                         |
| C22-D31 | mac `notebook.spec.ts`        | Pinned, closed (its button or ⌘W) and opened again: unpinned, not on top, and the button says so                                                               |
| C22-D32 | mac `notebook.spec.ts`        | Fill the screen glides there and back (widths in between), ending where C22-D03 does                                                                           |
| C22-D33 | mac `notebook.spec.ts`        | The note window paints Dark picked on the desk while hidden, and Light picked while open within a second                                                       |
| C22-D34 | mac `notebook.spec.ts`        | Every edge and corner resizes the real window, its far edges staying put, never below 420×320                                                                  |

## Drawings in notes ([docs/plans/notebook-drawing.md](../plans/notebook-drawing.md))

| ID      | Where                             | Case                                                                                                                                                            |
| ------- | --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C22-U80 | core `notes.test.ts`              | `cleanHtml` keeps `<div data-drawing="d1">`, drops any other attribute on it, drops a bad id, and still drops a plain `div` with handlers                       |
| C22-U81 | core `notebook.test.ts`           | `drawing.save` schema: needs `noteId` and `baseRev`; a scene over `DRAWING_MAX` fails with the split-it message                                                 |
| C22-U82 | server `drawings.test.ts`         | `drawing.save` on `baseRev: 0` creates the row for your own note; on someone else's note it is turned down (404 wording)                                        |
| C22-U83 | server `drawings.test.ts`         | A save on an old rev is `stale`; on the current rev it bumps `rev`; a `note.body` save at the same time succeeds (separate revs)                                |
| C22-U84 | server `drawings.test.ts`         | The note's `text` includes the drawing's words; `searchNotes` finds the note by a word typed only in a drawing                                                  |
| C22-U85 | server `drawings.test.ts`         | A `note.body` without the block sets `orphaned_at`; putting the block back clears it; the sweep removes a drawing orphaned over 30 days, with its images        |
| C22-U86 | server `drawings.test.ts`         | Images named in the scene are claimed for the note; note to Trash and back keeps drawing and images; purge removes both                                         |
| C22-U87 | server `drawings.test.ts`         | `GET /notebook/drawings/:id` returns the scene to its owner and 404 to anyone else; `GET /notebook/notes/:id` lists its drawings with preview ids               |
| C22-U88 | client `drawings.test.ts`         | Drawing saves debounce to one `drawing.save` per 800 ms of quiet and flush on close; each carries the last rev                                                  |
| C22-U89 | client `drawings.test.ts`         | A save waits while an image is uploading and goes once it lands; a failed upload lets go too, and the sheet offers Try again                                    |
| C22-U90 | client `drawings.test.ts`         | `stale`: loads the newer scene and raises the toast; Open mine resends the local scene on the new rev                                                           |
| C22-U91 | client `drawings.test.ts`         | Done on an empty drawing sends no save and its block goes; one erased back to nothing sends `drawing.delete`                                                    |
| C22-U92 | ui `NoteDrawing.test.tsx`         | Shows the light or dark picture by theme; "Picture not ready" without one; Edit, click and Enter all call `onOpen`; ⋯ › Delete calls `onDelete`                 |
| C22-U93 | ui `RichTextEditor.test.tsx`      | The drawing node round-trips through HTML; only the notes editor has Draw; Backspace, ← and → at a line's edge select the block (C22-E88 in a browser)          |
| C22-U94 | ui `DrawingSheet.test.tsx`        | Bar shows "<note> · Drawing N", the save ring and Done; Excalidraw is imported lazily (mocked), with a loading state and the "didn't open" state with Try again |
| C22-U95 | ui `DrawingSheet.test.tsx`        | Opening animates `clip-path` and never `transform`; with Less motion there is no animation                                                                      |
| C22-U96 | ui `NoteEditor.test.tsx`          | Draw is the last item in the strip; it inserts a block at the cursor and opens its sheet ("Drawing N"); an empty Done takes the block out                       |
| C22-E80 | e2e web `notebook`                | Draw in a note, add a rectangle and a text, Done: the block shows a picture, the server has the scene, and a reload shows the same picture                      |
| C22-E81 | e2e web `notebook`                | Paste an image into a drawing (clipboard with a PNG): it uploads, survives a reload, and the scene holds no `dataURL`                                           |
| C22-E82 | e2e web `notebook`                | Drop an image file into a drawing (DataTransfer): same as E81                                                                                                   |
| C22-E83 | e2e web `notebook`                | Search finds the note by a word typed in its drawing                                                                                                            |
| C22-E84 | e2e web `notebook`                | Delete a block from ⋯, Undo brings it back; delete the note and Put back, the drawing comes back                                                                |
| C22-E85 | e2e web `notebook`                | Dark mode: the block swaps to its dark picture; the open sheet is in Excalidraw's dark theme                                                                    |
| C22-E86 | e2e web `notebook`                | The drawing chunk isn't requested until a drawing opens; fonts load from `/excalidraw/fonts/`, never from a CDN                                                 |
| C22-E87 | e2e web `notebook`, phone project | Open a drawing on the phone: full screen, tools at the foot, Done returns to the note                                                                           |
| C22-E88 | e2e web `notebook`                | Over a block: Backspace selects it, a second deletes it, Undo brings it back; ArrowLeft steps onto it; Enter opens it                                           |
| C22-D40 | mac `notebook.spec.ts`            | In the note window, Draw opens the sheet over the whole window; drawing and Done work in WKWebView; ⌥⌘N still reaches Tudu while drawing                        |
| C22-D41 | mac `notebook.spec.ts`            | Offline (the server drops every connection): draw, Done, back up: the save goes through and the picture shows                                                   |
| C22-D42 | mac `notebook.spec.ts`            | An image pasted into a drawing (WebKit paste event with a PNG) uploads, survives a reload, and the scene holds no `dataURL`                                     |
