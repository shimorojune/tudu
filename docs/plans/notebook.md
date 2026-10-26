# Notebook: your notes, in folders, linked to tasks

Status: approved by Rohit on 26 Oct 2026 and built (tests in [docs/tests/chunk-22.md](../tests/chunk-22.md)).
Design: canvas page "Notebook", approved by Rohit on 26 Oct 2026 (v108), with the changes he asked for after that up
to v117 (Move, Delete that asks first, Trash, folder Rename and Delete, popovers that animate out, row tooltips at the
side). Boards: P-Desktop, P-Floating, P-Popup, P-Web, P-Task, P-Search and P-Phone (each with a Dark twin), P-States
(and Dark), P-Motion, plus "New note" in the menu bar sheet (P-MenuBar and Dark on the Notebook page, v118; K-MenuBar on the Menu bar page). The canvas
kit's components move into the Tudu Paper design system before any app code is written (see **Design system
first**).

## Why

Rohit wants somewhere to think that isn't a task: notes in folders and subfolders, each of which can be linked to any
number of tasks in any space, and a small window to write in without opening the whole app.

## What changes for the person

1. **The Notebook is yours.** It belongs to you, not to a space. Nobody else ever sees your notes, your folders or
   which tasks you linked them to, even on a shared task.
2. **Where it lives.** On the desktop (Mac app and web) a Notebook button sits in the top bar between Search and Inbox.
   On a phone it's under More (there's no room for a fourth header button). Its address is `/notebook`, and a note is
   `/notebook/<id>`.
3. **The Notebook page.** On the left is a tree of folders and notes with Find a note at the top and Trash at the
   bottom. On the right is the open note: where it lives, a quiet save state, its title, the tasks it's linked to,
   then the words.
4. **Folders.** They go three levels deep (Northwind / Planning / Offsite). A folder row on hover offers New folder
   (not on the third level), New note, and ⋯ with Rename (in place; a double-click on the name does the same) and
   Delete. Notes and folders drag: onto a folder puts them in it, between rows reorders them, and anything that would
   land deeper than three levels shows "Folders go three levels deep" and goes back. Counts sit at the row's right
   edge.
5. **Writing.** The editor is the system's rich text editor (the task notes' variant), with headings, lists,
   checklists, quotes, links and files. Only the words scroll. On a phone the formatting bar floats at the bottom of
   the note as one row. It saves as you type. You see a small ring if a save takes more than half a second and a tick
   when it lands. Words appear only for problems: "Not saved yet" when offline, "Changed elsewhere" on a conflict,
   "Didn't save" on an error.
6. **Linking tasks.** "Link a task" opens a picker over your tasks from every space; tasks already linked say so.
   Linked tasks show as chips under the title, and × on a chip unlinks it. A note can link any number of tasks, and a
   task can carry any number of your notes.
7. **Make a task from words.** Select words in a note and a "Make a task" bubble rises above them. It makes a task in
   your Personal space on Today, with the selected words as its title, linked to this note. The toast offers Open.
8. **⋯ on a note.** Move opens a folder picker with every folder, its path and "Not in a folder"; the current folder
   says Here. Delete asks first ("Delete “Onboarding interview notes”?"), then the note fades out, the next one opens,
   and the toast offers Undo.
9. **Trash.** Deleted notes and folders stay 30 days, then they go for good. Trash shows where each note came from
   and how many days it has left. Put back returns a note to its folder (or to "Not in a folder" if that folder is
   gone). Delete now and Empty Trash ask first. Deleting a folder takes everything in it to Trash together, and
   putting the folder back brings its contents back with it.
10. **The task panel.** Under Notes, a section headed "From your notebook" (with "Only you see these") lists your notes
    linked to the task. New note opens the note window on a blank note already linked to the task. Link a note opens
    a picker. Clicking a note opens it in the note window over the task, never the Notebook page, so you don't lose
    your place. A colleague opening the same task sees no such section.
11. **The note window.** It's a small window for writing without the desk.
    - Mac: its own window, like Quick Add, but it stays when you click into another app. You can drag it by its bar
      and resize it from the corner. Pin keeps it above other apps (off to start). Expand fills the screen and
      takes it back. Close hides it. "Open in your Notebook" opens the note on the Notebook page and closes the window.
    - Web: a panel floating over the page, draggable, keeping its size. It has no pin or fill the screen, since
      browsers can't do either. ↗ opens the note in its own browser popup (P-Popup).
    - Phone: no window. A note opens as a page that turns in, and ‹ goes back where you were.
    - Inside: on the left, Recent and All notes tabs (All is the whole tree with Find). The list slides in from the
      tab's side. The rail can be hidden. On the right is the note.
    - It opens on a blank note. A blank note you close without writing anything isn't kept, so no "Untitled" notes
      pile up, and no toast shows. A note with only a title is kept. Untitled notes show their first line, in grey,
      wherever they're listed.
12. **Mac menu bar.** The sheet's footer gets "New note" beside "New task". It opens the note window on a blank note
    without bringing the desk forward, and the sheet closes first.
13. **Search.** One Search for everything that's yours. Notes come under their own heading, "Notes", after the
    tasks. Each one is matched on its title and its words, and shows the matched line with the words washed in ink,
    then its folder and when it changed. Picking one opens it in the note window (on a phone, the note's page).
14. **States**, all drawn in light and dark on P-States:
    - Loading: the tree and the note shimmer in their final shapes.
    - Empty: a first visit.
    - "Your notes didn't load", or one note didn't open while the rest are fine.
    - Offline: you keep writing, and it saves when you're back.
    - Changed in another window: a banner with "Show the newer one" and "Keep mine". Nothing is overwritten quietly.
    - Find with no match: "No note matches “…”."
    - Empty Trash: "Nothing in Trash."
    - Every message reflows at any width, and nothing is ever squeezed.
15. **No keyboard shortcuts** in this chunk: none are added and none are shown. They come later.

## Decided (Rohit approved the proposal 26 Oct 02:55Z; all three recommendations taken)

1. **What the web top-bar button does.** P-Web draws it toggling the floating panel. P-Desktop draws the same button
   opening the Notebook page in the Mac app. Recommendation: the button opens the Notebook page in both, and the
   floating panel opens from a note (task panel, Search) and from New note. Otherwise the web has no way to the
   Notebook page and its Trash. If you agree, I'll change the P-Web board's caption to match before building.
2. **Two folders with the same name in one place.** Recommendation: refuse it. Rename and New folder show a line
   under the field: "Planning already has a folder called Offsite." The line isn't drawn yet. If you agree, I'll add
   it to P-States in the same style as the project name check.
3. **Where "Make a task" puts the task.** The canvas shows Personal on Today (ME-71). Recommendation: keep that.
   The alternative is the space of the note's first linked task.

## Data (packages/db, migration `0016_notebook.sql`)

The migration only adds things; nothing is dropped and no existing row changes.

| Table              | Columns                                                                                                                                                                                                                                                                                                                                                 | Keys                                                                                                                                         |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `notebook_folders` | `id` (client-made), `user_id` (FK user, cascade), `parent_id` (FK self, cascade, null at the top), `name` (1 to 80 chars), `position`, `created_at`, `updated_at`, `deleted_at`, `deleted_with` (the folder whose deletion took it, null when deleted on its own), `clocks` (jsonb: name, parent, position, deleted)                                    | index `(user_id, parent_id, position)`; unique `(user_id, coalesce(parent_id,''), lower(name)) where deleted_at is null` if decision 2 holds |
| `notes`            | `id` (client-made), `user_id` (FK user, cascade), `folder_id` (FK notebook_folders, set null), `title` (up to 200 chars, may be empty), `html` (cleaned, up to `NOTES_MAX`), `text` (the words alone, for search and the first line), `position`, `rev` (integer, +1 per body save), `created_at`, `updated_at`, `deleted_at`, `deleted_with`, `clocks` | index `(user_id, folder_id, position)`; index `(user_id, updated_at desc)` for Recent; index `(user_id, deleted_at)`                         |
| `note_links`       | `note_id` (FK notes, cascade), `task_id` (FK tasks, cascade), `linked_at`                                                                                                                                                                                                                                                                               | primary key `(note_id, task_id)`; index `(task_id)`                                                                                          |
| `attachments`      | gains `owner_id` (FK user, cascade) and `note_id` (FK notes, set null); `space_id` becomes nullable, with a check that exactly one of `space_id` and `owner_id` is set                                                                                                                                                                                  | index `(note_id)`                                                                                                                            |

- The depth rule (three levels) and the folder's owner are checked on the server on every create and move. A
  folder can't be moved into itself or below itself.
- `note_links` has no `user_id`: a link belongs to the note, and the note to its owner. Links are read only through
  the note owner's own routes, and only to tasks the owner can still read (`readableBy`). A link to a task in a
  space you've left stays in the table but isn't shown, and it comes back if you rejoin. A task deleted for good
  takes its links with it (cascade).
- Trash: `deleted_at` set means in Trash. A daily sweep (next to `sweepAttachments`) deletes notes and folders whose
  `deleted_at` is older than 30 days, and their files.
- Deleting your account removes everything through the user FK.

## Server (apps/server)

New `apps/server/src/notebook.ts` (queries and the apply step) and `routes/notebook.ts`. Every route requires a
session and is scoped by `user_id = session user`. Asking for someone else's note or folder answers 404, never 403,
so ids can't be probed.

Reads:

| Route                              | Returns                                                                                                                                                                               |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/notebook`                | The tree: folders (id, parent, name, position) and note headers (id, folder, title, first line, position, updated, link count). No bodies. Trash is left out; its count is included.  |
| `GET /api/notebook/notes/:id`      | One note: title, html, rev, folder path, updated, word count, linked tasks (id, ref, title, space tile and name), only those you can read.                                            |
| `GET /api/notebook/recent?limit=8` | Note headers, newest change first, for the window's Recent list.                                                                                                                      |
| `GET /api/notebook/trash`          | Trashed notes and folders, newest first, each with where it came from and days left.                                                                                                  |
| `GET /api/tasks/:taskId/notes`     | Your notes linked to that task (headers plus where). Checks you can read the task. Asked by the task panel separately from the task, so a shared task's own read never carries notes. |

Writes go through the existing sync batch (`POST /api/sync`), so they queue offline, replay in order and never
double. New mutation types in `taskMutationSchema` (core), each applied in `applyBatch` with per-field clocks (last
write wins), like tasks:

- `note.create {id, folderId, title, html, linkTo?}`. The client sends it only once the note has a title or a
  word, so an empty note never reaches the server. `linkTo` links it to a task in the same step (task panel New
  note).
- `note.title {id, title}`, `note.move {id, folderId, position}`, `note.delete {id}`, `note.restore {id}`,
  `note.purge {id}`.
- `note.body {id, html, baseRev}`. The body is the one field that doesn't use last write wins. If `baseRev` isn't
  the stored `rev`, the mutation is rejected with code `stale` and nothing changes. The client then shows the
  "changed in another window" banner. "Keep mine" sends the body again on the new rev. "Show the newer one" drops
  the local copy.
- `note.link {id, taskId}`, `note.unlink {id, taskId}`. Linking checks you can read the task.
- `folder.create {id, parentId, name, position}`, `folder.rename {id, name}`, `folder.move {id, parentId, position}`,
  `folder.delete {id}` (it and its subtree, with `deleted_with` set), `folder.restore {id}` (what went with it comes
  back), `trash.empty {}`.

HTML is cleaned by `cleanNotes` in `packages/core/src/notes.ts`, the same cleaner as task notes, on both sides.
After every batch with notebook changes the server publishes `NOTEBOOK_CHANGED {notes, folders, clientId}` to
the owner only. Other windows (the desk, the note window, another device) refresh what they show from it.

Files: `POST /api/notebook/files` uploads into the owner's space-less bucket path (`notes/<userId>/…`).
`GET /api/files/:id` serves a space-less file only to its owner.

## Search

`GET /api/search` gains `notes`: your notes (not in Trash) whose title or words contain every word typed. They're
ranked title hits first, then by newest change, up to 5. Each comes with the matched line (the same snippet rule as
task notes), its path and when it changed. The task part of the response doesn't change. Notes aren't part of
"by meaning" search in this chunk.

## Client (packages/client, packages/core)

- `packages/core/src/notebook.ts`: the pure parts. Tree building and depth checks (`depthOf`, `canDrop`), positions
  between neighbours (reusing `positions.ts`), the folder picker list (`moveTargets`, which marks Here), the first
  line of an untitled note, days left in Trash, and the rule that an empty new note isn't kept.
- `packages/client/src/notebook.ts`: the store. Its queries are `['notebook']`, `['notebook', 'note', id]`,
  `['notebook', 'recent']`, `['notebook', 'trash']` and `['notebook', 'task', taskId]`. It applies every change
  locally at once and queues it in the outbox. `NOTEBOOK_CHANGED` from another client invalidates exactly what it
  names.
- Body saves are debounced (600 ms of quiet, and always on blur or close). The save state is derived from the
  outbox: it's saving while a `note.body` for that note is queued, saved once it's acknowledged, offline while the
  connection is down, conflict on a `stale` rejection, and error after the outbox gives up.

## Design system first (packages/ui and the Tudu Paper artifact)

The kit components move into the design system artifact, then into `packages/ui` with the same markup and `tp-*`
classes (`tp-nb-*`). Their tests:

- `NoteRow`, `NoteTree` (folders, drag and drop, Find, folder ⋯ with Rename and Delete, Trash entry) and
  `NoteEditor` (path, `SaveState`, title, linked task chips with the glide and shrink out, Link a task, Make a task
  bubble, ⋯ with Move and Delete, Delete confirmation).
- `NoteWindow` (bar, Recent and All notes rail, pin, expand, open in Notebook, close) and `NoteLinks` (the task
  panel section).
- `NotePicker` (keeps inside its pane, opens upward when there's no room), `NoteTrash` and `NoteHit` (search).
- Popovers leave with motion (130 ms). Every popover closes on a click off it or on Esc. Row tooltips sit to the
  side of the button, so they never cover the next row.

Shared fixes found while drawing, made in the system so every screen gets them:

- **Banner:** below 520 px wide its buttons drop under the words; below 270 px they're indented to the text.
- **EmptyState:** the title wraps instead of squeezing.
- **Task panel comment box:** the padding is 36 px both sides (20 px compact), not 36 left and 24 right. Today's
  `packages/ui` has the same uneven padding, so this ships here too.
- **ConfirmDialog:** it opens over the whole app wherever it's asked from (Radix portals already do this in the app;
  the system's preview gets the same).

## Web (apps/web)

- Routes `/notebook`, `/notebook/$noteId` and `/notebook/trash` sit at the root, outside any space, like `/inbox`.
  The top bar gets the Notebook button. On phones, More gets a Notebook row.
- `NoteWindowHost` in `AppShell` draws the floating panel on desktop web. It opens from a note in the task panel,
  from Search and from New note. It keeps its place and size per browser (`tudu.noteWindow`).
- The pop-out is `window.open('/note-window/<id>', 'tudu-note', 'popup,width=640,height=520')`, a bare route that
  shows `NoteWindow` alone.
- The task panel loads `['notebook', 'task', taskId]` and puts `NoteLinks` under Notes.
- Search shows the Notes section from the same response.

## Mac app (apps/desktop)

- A fourth window, `note` (`shell/note.html`, going to `/note-window`).
  - It's undecorated, transparent and resizable, with a minimum size of 420 × 320. It isn't on top to start.
  - It's a panel like Quick Add (it takes the keyboard without bringing the desk forward), but it doesn't hide when
    it loses focus.
  - Its frame (place and size) is saved and restored, and kept on screen when displays change (`place.rs`).
- Commands:
  - `open_note(id?, linkTo?)`: shows the window on that note, or on a blank note.
  - `set_note_pinned(on)`: always on top, plus the stronger edge drawn on P-Floating.
  - `set_note_expanded(on)`: fills the screen and back.
  - `open_in_notebook(id)`: shows the desk on `/notebook/<id>` and hides the window.
  - `hide_note`.
- The menu bar sheet's New note calls `open_note()` after the sheet hides.
- The test control channel reports the note window's visibility, pin, expanded state and frame, so desktop tests
  can check them.

## Performance

- The tree is one query of folders and one of note headers, never bodies. A body loads when its note opens.
- Search over notes is an `ILIKE` on `title` and `text` limited to one user's rows (index `(user_id, …)`). With
  thousands of notes it stays a single-user scan. If it gets slow, a trigram index is the next step, measured
  first.
- The note window keeps its React tree while hidden (like Quick Add), so it opens at once.

## Test scenarios

New chunk 22 (`docs/tests/chunk-22.md`, added in the same PR). Each ID goes in its test's name. Per Rohit, every
test run happens on his Mac, not in the cloud environment.

### Unit (vitest)

| ID      | Where                                       | Case                                                                                                                                           |
| ------- | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| C22-U01 | core `notebook.test.ts`                     | `buildTree` nests folders and notes by parent and position; trashed ones are left out; a note whose folder is gone shows as not in a folder    |
| C22-U02 | core `notebook.test.ts`                     | `canDrop`: a folder can't go into itself or below itself; nothing may land deeper than three levels; a note can go anywhere                    |
| C22-U03 | core `notebook.test.ts`                     | `moveTargets` lists every folder with its path, "Not in a folder" first, and marks the current one Here                                        |
| C22-U04 | core `notebook.test.ts`                     | First line of an untitled note: tags stripped, cut at 80 chars; a note with neither title nor words is "empty" and isn't kept                  |
| C22-U05 | core `notebook.test.ts`                     | Days left in Trash: 30 on the day, 1 on the last day, never below 1 in the list; folder delete counts every note below it                      |
| C22-U06 | core `notes.test.ts`                        | `cleanNotes` on a note body keeps checklists, files and links and drops scripts, handlers and unknown tags (the task notes' rules)             |
| C22-U07 | client `notebook.test.ts`                   | A blank new note sends nothing; the first word sends `note.create` then `note.body`; closing it blank leaves the outbox empty                  |
| C22-U08 | client `notebook.test.ts`                   | Body saves debounce to one `note.body` per 600 ms of quiet and flush on close; each carries the last known `rev`                               |
| C22-U09 | client `notebook.test.ts`                   | Save state: saving only after 500 ms queued, saved on ack, offline while disconnected, conflict on `stale`, error when the outbox gives up     |
| C22-U10 | client `notebook.test.ts`                   | "Keep mine" resends the local body on the server's rev; "Show the newer one" drops it and loads the server's                                   |
| C22-U11 | client `notebook.test.ts`                   | `NOTEBOOK_CHANGED` from another client invalidates only the named notes and the tree; from this client it does nothing                         |
| C22-U12 | ui `NoteTree.test.tsx`                      | Folder row: New folder hidden at the third level; ⋯ Rename edits in place (Enter saves, Esc keeps the old name); Delete asks first             |
| C22-U13 | ui `NoteTree.test.tsx`                      | Find narrows the tree and opens folders holding a match; no match says “No note matches “…”.”                                                  |
| C22-U14 | ui `NoteEditor.test.tsx`                    | ⋯ has Move and Delete only; Move picks a folder and calls `onMove`; Delete opens the confirmation and only calls `onDelete` after Delete       |
| C22-U15 | ui `NoteEditor.test.tsx`                    | Selecting words shows Make a task; it calls `onMakeTask` with the words; a selection outside the note shows nothing                            |
| C22-U16 | ui `NoteEditor.test.tsx`                    | Popovers: a click off one (on the title, in the words) or Esc closes it; opening Link closes Move; each leaves with the leaving class          |
| C22-U17 | ui `NoteWindow.test.tsx`                    | Opens on a blank note; Recent and All notes switch the rail; pin and expand show only on the Mac variant; ↗ only on web                        |
| C22-U18 | ui `NoteLinks.test.tsx`                     | Lists linked notes with count and time at the right edge; × unlinks; Link a note marks already linked notes; error line offers Try again       |
| C22-U19 | ui `NoteTrash.test.tsx`                     | Rows show where they came from and days left; Put back calls `onRestore`; Delete now and Empty Trash ask first; empty says "Nothing in Trash." |
| C22-U20 | ui `Banner.test.tsx`, `TaskDetail.test.tsx` | Banner buttons drop under the words below 520 px; the comment box has equal side padding                                                       |
| C22-U21 | web `shell.test.ts`                         | The top bar has Notebook between Search and Inbox; on phones More has a Notebook row; neither shows when signed out                            |
| C22-U22 | web `search.test.ts`                        | Notes come under "Notes" after tasks; picking one opens the note window on desktop and the note page on a phone                                |

### API (apps/server, against the test database)

| ID      | Case                                                                                                                                                         |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| C22-A01 | `note.create`, `note.title`, `note.body`, `note.move` round trip: `GET /api/notebook` and the note read show them; `rev` goes up by one per body save        |
| C22-A02 | Privacy: Meera's `GET` of Rohit's note, folder, trash or task notes answers 404; her mutations on his ids are rejected; nothing of his appears in her search |
| C22-A03 | `note.body` with an old `baseRev` is rejected `stale` and the stored body is unchanged; with the current rev it lands                                        |
| C22-A04 | Clocks: an older `note.title` or `note.move` loses to a newer one; replaying the same mutation id is a no-op                                                 |
| C22-A05 | Depth: `folder.create` or `folder.move` that would make a fourth level is rejected; moving a folder into its own subtree is rejected                         |
| C22-A06 | `note.link` to a task you can read works in any of your spaces; to a task in a space you aren't in, or Meera's "only me" task, is rejected                   |
| C22-A07 | `GET /api/tasks/:id/notes` on a shared task returns only the caller's notes; Meera on the same task gets her own (none), never Rohit's                       |
| C22-A08 | Leaving a space hides links to its tasks from the note read; rejoining shows them again; a task deleted for good removes its links                           |
| C22-A09 | `folder.delete` trashes the subtree with `deleted_with`; `folder.restore` brings back exactly what went with it, not notes trashed before                    |
| C22-A10 | `note.restore` of a note whose folder is gone puts it in "Not in a folder"; `note.purge` and `trash.empty` remove rows and their files                       |
| C22-A11 | The sweep deletes notes and folders 30 days after `deleted_at` and keeps younger ones                                                                        |
| C22-A12 | Search: words in a note's title and body find it; trashed notes and Meera's notes never appear; at most 5; title hits rank first                             |
| C22-A13 | Body HTML is cleaned on the server: a script tag or `onerror` sent in `note.body` is not stored                                                              |
| C22-A14 | Files: an upload to `/api/notebook/files` is served to its owner and is 404 to Meera                                                                         |
| C22-A15 | Every notebook change publishes `NOTEBOOK_CHANGED` to the owner only                                                                                         |
| C22-A16 | Folder names: a duplicate name in the same parent is rejected `name-taken` (if decision 2 holds); the same name under another parent is fine                 |

### End to end (`packages/e2e/tests/notebook`, group `notebook`, desktop web unless noted)

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
| C22-E10 | Meera opens the same shared task: no "From your notebook" section; her search for Rohit's note words finds nothing                                        |
| C22-E11 | Make a task: select words, Make a task, the toast's Open shows ME-n on Today in Personal, linked to the note                                              |
| C22-E12 | Search: a word only in a note's body finds it under Notes with the line washed in ink; picking it opens the note window                                   |
| C22-E13 | Offline: go offline, keep typing, "Not saved yet" shows; back online it saves and the tick shows                                                          |
| C22-E14 | Conflict: two tabs edit the same note; the later save shows the banner; Keep mine wins in both tabs; Show the newer one drops local words                 |
| C22-E15 | Note window (web): drag it, ↗ opens the popup with the same note, edits in the popup show in the panel                                                    |
| C22-E16 | Recent and All notes in the window: All shows the tree; picking a note there opens it in the window                                                       |
| C22-E17 | Phone (iPhone viewport): More › Notebook, open a folder and a note, type, the format bar stays at the bottom of the note, ‹ goes back                     |
| C22-E18 | States: the note list and a note fail to load (route stubbed) and show their messages with Try again, in light and dark; nothing overflows at 320 px wide |
| C22-E19 | Motion: popovers leave with the leaving animation; reduced motion turns slides into fades                                                                 |
| C22-E20 | Task panel comment box: equal padding left and right at desktop and phone widths                                                                          |

### Desktop (`packages/e2e/mac/tests`, the real Tudu Test app)

| ID      | Case                                                                                                                   |
| ------- | ---------------------------------------------------------------------------------------------------------------------- |
| C22-D01 | Menu bar sheet New note: the sheet hides, the note window shows on a blank note, the desk stays hidden                 |
| C22-D02 | The note window stays when another app comes forward; it hides on close; it opens again where it was, at the same size |
| C22-D03 | Pin keeps it on top (control channel reports `pinned`); unpinned to start; expand fills the screen and back            |
| C22-D04 | Open in your Notebook shows the desk on `/notebook/<id>` and hides the window                                          |
| C22-D05 | Clicking a note in the desk's task panel opens it in the note window, not the desk's Notebook page                     |
| C22-D06 | A note edited in the window shows the change in the desk's Notebook page within a second (`NOTEBOOK_CHANGED`)          |

Each end-to-end group runs three times on Rohit's Mac before it's called stable.

## Out of scope

- Keyboard shortcuts of any kind (summoning the window, moving through the list).
- Drawing (Excalidraw) inside notes: a later chunk.
- Sharing a note with anyone, or notes that belong to a space.
- Search by meaning over notes.
- Version history of a note beyond the conflict banner.

## Rollout

1. Port the kit and the shared fixes into the Tudu Paper design system artifact, and re-check the canvas against it.
2. One PR: migration `0016_notebook.sql` (additive), server, client, ui, web, desktop and tests. The migration drops
   nothing, so no pre-release backup step is needed beyond the usual.
3. Tests run on Rohit's Mac (`pnpm verify`, `pnpm e2e notebook` three times, `pnpm e2e:mac -g C22`).
4. Staging deploy and a look on the Mac app and in the browser, then a release.
