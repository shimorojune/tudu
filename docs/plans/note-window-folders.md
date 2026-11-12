# Folders in the note window (#90) and the Mac note window's shadow (#88)

Status: canvas approved by Rohit 12 Nov 2026 (sheets "Draft · Folders in the note window", light and dark, Notebook
page, canvas Version 206). Proposal approved by Rohit 12 Nov 2026; implemented.

## The reports

- **#90** (Mac 0.41.1): "Why am I not able to create folders in floating view? I should be able to."
- **#88** (Mac 0.41.1, dark): "Weird shadow seen on left side of notes popup."

## What is actually wrong

**#90.** The note window's All notes list is the Notebook page's tree with everything but opening a note switched off.
`NoteWindow` (`packages/ui/src/components/NoteWindow.tsx`) renders `<NoteTree bare>` with only `onPick`, and
`NoteWindowView` (`apps/web/src/app/NoteWindowView.tsx`) has no folder handlers to give it. Three things follow:

- The bare tree has no New button at all, so there is no way to start a folder or a note in a folder.
- Folder rows still draw their ⋯ menu (Rename, Delete), but both do nothing. That is a dead control, not just a
  missing one.
- The window never passes the tree's error state, so if your notes fail to load the list is just empty.

It hits the Mac's note window and the browser's floating note the same way (they share `NoteWindowView`).

**#88.** The Mac note window is a clear window with the note drawn 10px inside it
(`.app-note-window.app-note-mac { padding: 10px }`, native shadow off in `windows.rs`). The note's CSS shadow
(`--shadow-pop` plus `0 40px 80px -30px`) reaches about 50px. A window can't paint past its own edge, so the shadow
is cut off 10px out, as a hard line. It shows most in dark, where the shadow colour is 75% black.

## The change

### 1. `packages/ui` NoteTree

- **Bare tree gets New.** With `onNewNote` or `onCreateFolder`, the bare tree draws the same "New note or folder"
  button and menu as the page, beside Find (32px, plus at 15). Disabled while `loading` or `error`.
- **Naming row motion.** The row where a new folder is named opens its own height (`--dur-arrive`,
  `--ease-settle`), so rows under it slide down; the field's ring turns `--destructive` while its error line shows.
  Applies on the Notebook page too (same component).
- **Kept glow.** When the folder you just named appears in the tree, its row gets the existing landed glow once
  (`LANDED_MS`). The tree finds it by parent and name; the `onCreateFolder` contract doesn't change.
- **No dead menu.** A folder's ⋯ only draws when `onRenameFolder` or `onDeleteFolder` is given, and only lists what
  it can do.

### 2. `packages/ui` NoteWindow

- New optional props, passed straight to the tree: `onNewNote(folder)`, `onCreateFolder`, `onRenameFolder`,
  `onDeleteFolder`, `onMoveNote`, `onMoveFolder`, `treeError`, `onTreeRetry`.
- Recent stays as it is. Trash stays on the Notebook page (the bare tree still has no Trash row).

### 3. `apps/web`

- `NoteWindowView` wires those props to `notebookStore`, the same calls the Notebook page makes.
- The folder-delete flow (count the notes, delete, toast with Undo) moves out of `NotebookPage.tsx` into one helper
  in `app/notebook.ts`, used by both. If the open note was in the deleted folder, the window goes to a blank note.
- `showInWindow` takes an optional folder, so New note in a folder opens a blank note already filed there (the line
  above its title names the folder). An untouched blank note is still dropped on close.
- Confirm dialogs and toasts inside the Mac note window: the dialog's scrim is held inside the note (10px in, same
  corners) so it never paints the clear edge, and the dialog must fit the window's smallest size (420×320).

### 4. The shadow

- `.tp-nb-win.tp-root:not(.tp-nb-web)`: `0 0 0 1px var(--hair), 0 1px 2px var(--hair), 0 4px 10px -4px
var(--shadow-color)`. It reaches 6px at the sides and 10px below. Pinned swaps the hairline for the existing
  `1.5px var(--border-strong)` ring.
- `.tp-nb-web` (the browser's floating note) keeps today's deep shadow.
- No native change. The 10px padding stays, so window sizes and Fill the screen are untouched.

### 5. Design system and canvas, after merge

Rebuild the DS Notebook tail from the merged source, patch `bundle.css`, update the NoteTree and NoteWindow READMEs.
On the canvas, the kit already matches; drop the draft wording once shipped.

No migration, no server change, no new copy beyond what the page already uses.

## Not in this change

- **#92** (nested folder's ⋯ menu clipped) and **#93** (long folder names under the hover buttons) are in their own
  thread. They matter more in the window's 216px list, so that fix should land before or with this one. Both threads
  touch `NoteTree.tsx` and `components.css`; whichever merges second rebases.
- **#91** (note window goes when the desk closes) has its own proposal.

## Test scenarios

All on PR CI (unit, web e2e, Mac e2e). Nothing runs on Rohit's Mac.

### New: `packages/ui` unit

- **C22-U110** NoteTree bare, New button: shows beside Find when `onNewNote` or `onCreateFolder` is given, not
  otherwise; the menu lists New note then New folder; New note calls `onNewNote(null)`; disabled while `loading` and
  while `error`.
- **C22-U111** NoteTree bare, naming: New folder opens the naming row with the cursor in it; Enter calls
  `onCreateFolder(null, name)`; Esc and an empty name call nothing; a returned line shows under the field with
  `aria-invalid`, goes on the next key, and clicking away then drops the row.
- **C22-U112** NoteTree: the naming row carries the opening class; after the new folder arrives in `folders`, its row
  has the landed class and loses it after `LANDED_MS`; a folder that arrives without being named here doesn't glow.
- **C22-U113** NoteTree: no ⋯ on folders without `onRenameFolder`/`onDeleteFolder`; with only one of them, the menu
  lists only that one.
- **C22-U114** NoteWindow, All notes: New folder in a folder and New note in a folder call their handlers with that
  folder; Rename and Delete reach `onRenameFolder`/`onDeleteFolder`; a third-level folder has no New folder;
  `treeError` shows "Your notes didn't load." and Try again calls `onTreeRetry`.

### New: `apps/web` unit

- **C22-U115** NoteWindowView: New folder calls `notebookStore.createFolder` and a taken name comes back as the line;
  New note in a folder opens a draft with that `folderId`; Rename and both moves reach the store.
- **C22-U116** NoteWindowView, delete: the folder goes, the toast names it and its note count, Undo calls
  `restoreFolder`; when the open note was inside it the window shows a blank note; when it wasn't, the open note stays.
- **C22-U117** `showInWindow(null, undefined, folderId)` drafts in that folder; leaving the window with the draft
  untouched still discards it.

### New: web e2e (`packages/e2e/tests/notebook`)

- **C22-E95** Floating note, All notes: + then New folder, type a name, Enter. The folder is in the window's list,
  and on the Notebook page after a reload.
- **C22-E96** A name already used shows "You already have a folder called …"; Esc puts the row away and nothing is
  made.
- **C22-E97** New note in a folder from the window: the note opens with the folder named above its title; after
  typing, it is listed inside that folder.
- **C22-E98** In the window: rename a folder in place; delete it (confirm), Undo on the toast brings it and its notes
  back; drag a note onto a folder and it moves in.
- **C22-E99** The tree request fails: the window's All notes says "Your notes didn't load."; Try again loads it.
- **C22-E100** The browser's floating note still has the deep shadow (computed `box-shadow` includes the 80px layer).

### New: Mac e2e (`packages/e2e/mac/tests/notebook.spec.ts`)

- **C22-D50** In the Mac note window, make a folder in All notes; with the desk open on the Notebook page, it shows
  there without a reload.
- **C22-D51** The Mac note window's computed shadow: every layer's reach (offset + blur + spread) is at most the
  10px padding, unpinned and pinned, light and dark.
- **C22-D52** Delete a folder in the Mac note window at its smallest size: the dialog sits wholly inside the note,
  and the scrim's box is the note's box, not the window's.

### Updated

- **C22-U17** (the note window: Recent and All notes switch the rail): also checks that with no handlers All notes
  stays read-only (no New, no ⋯), so a caller without handlers gets the old behaviour.
- **C22-U12** (a folder row): its ⋯ cases now pass `onRenameFolder` and `onDeleteFolder`.
- **C22-U40** (a mouse drag): one case added for a drag inside the bare tree.
- **C22-D03** (Fill the screen keeps a small margin) unchanged; it guards that the 10px padding didn't move.

### Manual, for Rohit

- **MC-W01** Mac app, light and dark, over a light and a dark window behind it: the note window's shadow fades out
  with no line on any side, pinned and unpinned.
- **MC-W02** Make, rename, delete and drag folders in the note window; check it feels the same as the Notebook page.
