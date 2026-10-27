# Notebook: drawing in a note (Excalidraw)

Status: proposal, 27 Oct 2026. Rohit approved the inline layout on 27 Oct after trying the working prototype
(https://claude.ai/artifact/RencArR69vtudtWLTKJUxC, source in the project files under `drawing-prototype/`). Canvas:
Notebook page, boards `P-Drawing` and `P-Drawing-Dark`, sticky `p20-drawing-draft` (v156).

Decisions so far (27 Oct):

- **Excalidraw, not tldraw.** tldraw needs a paid licence key in production (price only through sales; the free hobby
  licence is non-commercial and shows a watermark). Excalidraw 0.18.1 is MIT.
- **No design parity inside the drawing.** Excalidraw ships as it is: its tools, menus and hand-drawn look. Only light
  and dark follow Tudu. Everything around it (the block in the note, the bar over the drawing, toasts) is Tudu.
- **Inline.** A note holds words and any number of drawings. A drawing is a block between paragraphs.
- **Images.** You can paste or drop an image into a drawing and draw over it. The image is kept in your Notebook's file
  storage, not inside the drawing.

## 1. What people get

- **Draw** sits at the end of the note's formatting strip. It drops an empty drawing block where the cursor is and
  opens it full size straight away.
- **In the note,** a block shows a picture of the drawing, as wide as the words and up to 360 px tall. Pointing at it
  shows **Edit** and ⋯ (Delete drawing). A click or Enter on the block opens it too.
- **Full size,** the drawing covers the note pane (Notebook page), the whole note window (Mac), the floating note (web)
  or the screen (phone). A thin Tudu bar sits on top with back, "<note> · Drawing N", the save ring and **Done**.
  Everything under the bar is Excalidraw.
- **Done or back** saves, closes, and returns to the same spot in the note. If the drawing is empty, it is removed and
  its block leaves the note.
- **The block is part of the note.** Arrow keys step over it. Backspace next to it selects it (a ring), and a second
  Backspace deletes it. ⋯ › Delete drawing removes it with an Undo toast. You drag it by its edge to move it up or
  down, like a paragraph.
- **Images:** paste (⌘V), drop a file, or use Excalidraw's image tool. The image shows at once, faded, with a spinner
  while it uploads, and you can keep drawing. If the upload fails, the image gets a dashed frame with **Try again**.
  Over 25 MB, or not an image, nothing lands and a toast says why.
- **Search** finds words typed in a drawing (Excalidraw text, including labels in shapes). Handwriting and words inside
  images are not read.
- **Lists** don't change. A note that is only a drawing shows "Drawing" as its first line until it has a title.
- **Trash:** deleting a note takes its drawings and their images with it, and Put back brings them all back.

## 2. Storage

### 2.1 A drawing is its own row

New table `note_drawings` (migration `0018_note_drawings.sql`, or the next free number when this is built):

| column                     | type                                | notes                                                                    |
| -------------------------- | ----------------------------------- | ------------------------------------------------------------------------ |
| `id`                       | text pk                             | client-made, like note ids                                               |
| `note_id`                  | text → `notes.id` on delete cascade | the note it sits in                                                      |
| `user_id`                  | text → `user.id` on delete cascade  | owner (always the note's)                                                |
| `scene`                    | jsonb                               | Excalidraw `elements` plus the image map (below); no appState, no pixels |
| `text`                     | text                                | words from text elements, for search                                     |
| `preview_light`            | text → `attachments.id`, null       | PNG picture for the note, light                                          |
| `preview_dark`             | text → `attachments.id`, null       | PNG picture for the note, dark                                           |
| `rev`                      | integer, default 0                  | +1 per save; a save on an older rev is turned down (`stale`)             |
| `created_at`, `updated_at` | timestamptz                         |                                                                          |
| `orphaned_at`              | timestamptz, null                   | set when the note's words stop mentioning it                             |

Why not inside `notes.html`: a scene is large and changes on every stroke. Inside the HTML, every stroke would be a
`note.body` save, and a stroke would collide with typing on the note's single `rev`. Its own row and rev keep drawing
and typing apart: an open drawing and an edit to the words never turn each other down.

The note's HTML holds only a reference: `<div data-drawing="<id>"></div>`. `cleanHtml` learns to keep `div` with
`data-drawing` matching the id pattern, and nothing else on that div.

### 2.2 Images

- Pasting or dropping an image uploads it through the existing `POST /notebook/files` (25 MB, `notes/<you>/…`).
- The scene's `files` map keeps `{ fileId: { attachmentId, mimeType } }` with no `dataURL`. Opening a drawing fetches
  each image from `/files/:id` and hands it to Excalidraw (`addFiles`).
- `drawing.save` claims the attachment ids it mentions for the note, the way `claimFiles` does for chips. The existing
  sweep removes files nobody claims after a day.
- **Scene limit:** 2 MB of JSON (`DRAWING_MAX`). With pixels kept out, a dense drawing is well under that. Over it, the
  save is turned down with "This drawing is too big to save. Split it into two drawings."

### 2.3 The picture in the note

- On Done, the client renders two PNGs (`exportToBlob`, light, and dark with Excalidraw's own dark export) at 2× the
  block's width, capped at 1600 px. It uploads both as note files and sends their ids with the save.
- The block shows the PNG for the current theme with a plain `<img>`. That's cheap and has no XSS surface: no SVG
  from the client is ever inserted into the page. Reading a note never loads Excalidraw.
- A drawing saved without a picture yet (it was closed offline, or the upload failed) shows the drawing's word count
  and "Picture not ready". The picture is made the next time the drawing opens.

### 2.4 Wire changes

The sync batch gets two Notebook changes. They queue offline and are never sent twice, like the rest:

| type             | writes                                                                                                                                |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `drawing.save`   | `{ id, noteId, scene, text, previewLight?, previewDark?, baseRev }`; creates on `baseRev: 0`; else only on its rev, otherwise `stale` |
| `drawing.delete` | `{ id }`: sets `orphaned_at` (the Undo window); a later save with the same id clears it                                               |

- `note.body` sets `orphaned_at` on drawings of that note its new HTML no longer mentions, and clears it on those it
  mentions again (Undo, or a block dragged back in).
- The daily sweep removes orphaned drawings and their images after 30 days, the same as Trash.
- Search: on `drawing.save` and `note.body`, `notes.text` becomes the words plus the text of the note's live drawings.
  `searchNotes` is unchanged.
- Reads: `GET /notebook/notes/:id` returns `drawings: { id, rev, previewLight, previewDark, words }[]` for its blocks.
  `GET /notebook/drawings/:id` returns the scene, and answers 404 for someone else's drawing, as notes do.

### 2.5 Saving while drawing

- Excalidraw's `onChange` fires on every pointer move. The client keeps the latest scene and sends `drawing.save`
  after 800 ms of quiet, and on Done or close (flushed). The save ring works as it does for the words.
- Images wait: a save never goes out while an image in it is still uploading. The bar's ring stays on. Done closes
  anyway, and the save follows once the upload lands or fails. A failed image stays on the device (IndexedDB, next to
  the outbox) with **Try again**.
- **Two windows on one drawing** (note window and the page): the later save gets `stale`. That window loads the newer
  scene and shows the toast "This drawing changed in another window. Showing the newest one." with **Open mine**, which
  puts its own scene back and saves it on the new rev. This is the note body's rule, worded for drawings.

## 3. Loading Excalidraw

- `packages/ui` gets `NoteDrawing` (the block: picture, Edit, ⋯) and `DrawingSheet` (the bar and the Excalidraw host).
  `DrawingSheet` imports Excalidraw with `import()`, so it lives in its own Vite chunk. The app, the note list and
  reading a note never load it.
- Measured with the prototype: Excalidraw adds about 950 KB minified (about 1.1 MB with its dependencies) when the first
  drawing opens. Mermaid, KaTeX and the rest stay in lazy chunks and only load if someone uses Excalidraw's
  text-to-diagram. While it loads, the sheet shows the bar and a shimmering toolbar (canvas "Opening").
- **Fonts:** Excalidraw's fonts are copied into the web build at `/excalidraw/fonts/` (a Vite static copy), and
  `window.EXCALIDRAW_ASSET_PATH` points there before the chunk loads. Nothing comes from a CDN, so it works offline in
  the Mac app. The 13 MB Chinese/Japanese font (Xiaolai) is left out; those scripts fall back to system fonts.
- The Tiptap block is a new node in `editorExtensions()` (`drawing`, atom, draggable). Only the Notebook editor turns
  it on. Task notes, comments and Quick Add don't offer Draw.

## 4. Platforms, theme and motion

- **Mac app.** The sheet fills the note window, with the rail hidden. Fill the screen works as today. Excalidraw's
  shortcuts only act while it has focus, so ⌥⌘N and ⌘⇧N still reach Tudu. **Dropping** an image from Finder depends
  on the folder-drag work (`notebook-folders-drag.md` §2.2), which turns off Tauri's drop handler. Until that ships,
  paste works and drop does nothing on the Mac.
- **Phone.** The sheet is full screen with Excalidraw's own phone layout: tools at the foot, one finger draws, two
  fingers pan and zoom. The image tool opens the photo library.
- **Web floating note.** The sheet fills the floating card.
- **Light and dark.** `theme` follows `useTheme`. The block swaps between its light and dark PNGs.
- **Motion.** Opening is a clip-path reveal from the block's frame to the full pane (240 ms, `--ease-arrive`), and
  closing clips back onto the block (220 ms). The drawing is never scaled. The prototype showed that scaling
  Excalidraw's box makes it pick its phone layout and misplace the pointer. A new block grows from 0 height
  (200 ms). The ⋯ menu and toasts use the existing motion.
- **Less motion** (`data-motion='less'` or `prefers-reduced-motion`): instant swaps, no grow. Excalidraw has almost no
  motion of its own.
- **Text measured too early.** Text in a scene can be measured before Excalifont has loaded and come out clipped (seen
  in the prototype). After `document.fonts.ready`, the sheet re-measures text once with
  `restoreElements(…, { refreshDimensions: true })`.

## 5. Design system and canvas

- The canvas is done (P-Drawing, approved). After the PR, the DS gets `NoteDrawing` (block, hover controls, "Picture
  not ready", the error frame) and `DrawingSheet`'s bar. Excalidraw itself is not added to the DS bundle: the DS
  preview shows the sheet with a picture in place of the live drawing.
- `NoteEditor`'s formatting strip gains Draw on every board that shows the Notebook editor: P-Desktop, P-Floating,
  P-Web, P-Phone, P-Task (note window), P-MakeTask and P-FolderDrag. I update each one in the same pass so nothing
  drifts.
- No new tokens.

## 6. Files

| Area                                                                                                                 | Change                                                                                                    |
| -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `packages/db/src/tudu-schema.ts`, `migrations/0018_note_drawings.sql`                                                | `note_drawings` table                                                                                     |
| `packages/core/src/notebook.ts`                                                                                      | `drawing.save` / `drawing.delete` in `notebookMutationSchema`; `DRAWING_MAX`; `NoteDrawingInfo` on `Note` |
| `packages/core/src/notes.ts`                                                                                         | `cleanHtml` keeps `div[data-drawing]`; `drawingIds(html)`                                                 |
| `apps/server/src/notebook.ts`                                                                                        | apply the two changes; orphan marking in `note.body`; search text; claim images; purge with the note      |
| `apps/server/src/routes/notebook.ts`                                                                                 | `GET /notebook/drawings/:id`                                                                              |
| `apps/server/src/files.ts`                                                                                           | the sweep removes drawings orphaned for over 30 days, with their files                                    |
| `packages/client/src/notebook.ts`                                                                                    | drawing store: debounce, flush, image waits, `stale` handling, previews                                   |
| `packages/ui/src/components/NoteDrawing.tsx` (new), `DrawingSheet.tsx` (new), `RichTextEditor.tsx`, `NoteEditor.tsx` | the block, the sheet, the Tiptap node, Draw in the strip                                                  |
| `packages/ui/src/styles/components.css`, `less-motion.css`                                                           | `.tp-nb-draw*` styles; reduced-motion rules                                                               |
| `apps/web/vite.config.ts`, `apps/web/src/app/notebook.ts`, `NoteWindowView.tsx`                                      | font copy and asset path; wiring on the page, the note window and the floating note                       |
| `packages/ui/package.json`                                                                                           | `@excalidraw/excalidraw` 0.18.1, pinned                                                                   |

## 7. Test scenarios

Other threads are numbering C22 tests at the same time, so these start at U80, E80 and D40.

### New

| ID      | Where                                     | Scenario                                                                                                                                                        |
| ------- | ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C22-U80 | core `notes.test.ts`                      | `cleanHtml` keeps `<div data-drawing="d1">`, drops any other attribute on it, drops a bad id, and still drops a plain `div` with handlers                       |
| C22-U81 | core `notebook.test.ts`                   | `drawing.save` schema: needs `noteId` and `baseRev`; a scene over `DRAWING_MAX` fails with the split-it message                                                 |
| C22-U82 | server `notebook.test.ts`                 | `drawing.save` on `baseRev: 0` creates the row for your own note; on someone else's note it is turned down (404 wording)                                        |
| C22-U83 | server `notebook.test.ts`                 | A save on an old rev is `stale`; on the current rev it bumps `rev`; a `note.body` save at the same time succeeds (separate revs)                                |
| C22-U84 | server `notebook.test.ts`                 | The note's `text` includes the drawing's words; `searchNotes` finds the note by a word typed only in a drawing                                                  |
| C22-U85 | server `notebook.test.ts`                 | A `note.body` without the block sets `orphaned_at`; putting the block back clears it; the sweep removes a drawing orphaned over 30 days, with its images        |
| C22-U86 | server `notebook.test.ts`                 | Images named in the scene are claimed for the note; note to Trash and back keeps drawing and images; purge removes both                                         |
| C22-U87 | server `routes` test                      | `GET /notebook/drawings/:id` returns the scene to its owner and 404 to anyone else; `GET /notebook/notes/:id` lists its drawings with preview ids               |
| C22-U88 | client `notebook.test.ts`                 | Drawing saves debounce to one `drawing.save` per 800 ms of quiet and flush on close; each carries the last rev                                                  |
| C22-U89 | client `notebook.test.ts`                 | A save waits while an image is uploading and goes once it lands; a failed upload keeps the image and offers Try again                                           |
| C22-U90 | client `notebook.test.ts`                 | `stale`: loads the newer scene and raises the toast; Open mine resends the local scene on the new rev                                                           |
| C22-U91 | client `notebook.test.ts`                 | Done on an empty drawing sends no save and removes the block from the note's body                                                                               |
| C22-U92 | ui `NoteDrawing.test.tsx`                 | Shows the light or dark picture by theme; "Picture not ready" without one; Edit, click and Enter all call `onOpen`; ⋯ › Delete calls `onDelete`                 |
| C22-U93 | ui `RichTextEditor.test.tsx`              | The drawing node round-trips through HTML; Backspace next to it selects it, a second deletes it; arrows step over it; only the notes editor has Draw            |
| C22-U94 | ui `DrawingSheet.test.tsx`                | Bar shows "<note> · Drawing N", the save ring and Done; Excalidraw is imported lazily (mocked), with a loading state and the "didn't open" state with Try again |
| C22-U95 | ui `DrawingSheet.test.tsx`                | Opening animates `clip-path` and never `transform`; with Less motion there is no animation                                                                      |
| C22-U96 | ui `NoteEditor.test.tsx`                  | Draw is the last item in the strip; it inserts a block at the cursor and calls `onOpenDrawing` with its id                                                      |
| C22-E80 | e2e web `notebook.spec.ts`                | Draw in a note, add a rectangle and a text, Done: the block shows a picture, the server has the scene, and a reload shows the same picture                      |
| C22-E81 | e2e web `notebook.spec.ts`                | Paste an image into a drawing (clipboard with a PNG): it uploads, survives a reload, and the scene holds no `dataURL`                                           |
| C22-E82 | e2e web `notebook.spec.ts`                | Drop an image file into a drawing (DataTransfer): same as E81                                                                                                   |
| C22-E83 | e2e web `notebook.spec.ts`                | Search finds the note by a word typed in its drawing                                                                                                            |
| C22-E84 | e2e web `notebook.spec.ts`                | Delete a block from ⋯, Undo brings it back; delete the note and Put back, the drawing comes back                                                                |
| C22-E85 | e2e web `notebook.spec.ts`                | Dark mode: the block swaps to its dark picture; the open sheet is in Excalidraw's dark theme                                                                    |
| C22-E86 | e2e web `notebook.spec.ts`                | The drawing chunk isn't requested until a drawing opens; fonts load from `/excalidraw/fonts/`, never from a CDN                                                 |
| C22-E87 | e2e web `notebook.spec.ts`, phone project | Open a drawing on the phone: full screen, tools at the foot, Done returns to the note                                                                           |
| C22-D40 | mac `notebook.spec.ts`                    | In the note window, Draw opens the sheet over the whole window; drawing and Done work in WKWebView; ⌥⌘N still reaches Tudu while drawing                        |
| C22-D41 | mac `notebook.spec.ts`                    | Offline (server stopped): draw, Done, start the server: the save goes through and the picture appears                                                           |
| C22-D42 | mac `notebook.spec.ts`                    | Paste an image from the pasteboard into a drawing in the Mac app; it uploads and stays after a reload                                                           |

### Updated

| ID                       | Change                                                                     |
| ------------------------ | -------------------------------------------------------------------------- |
| C22-U06                  | `cleanHtml` on a note body also keeps drawing blocks                       |
| C22-E62                  | The formatting strip ends with Draw on the Notebook page and in the window |
| `docs/tests/chunk-22.md` | Add the rows above; reword U06 and E62                                     |

### Manual

- Mac app, after the folder-drag fix: drag an image from Finder into an open drawing; it lands and uploads.
- iPhone Safari on staging: draw with a finger, pinch to zoom, paste a photo.

All tests run on Rohit's Mac, not in the cloud.

## 8. Risks and open points

- **Bundle.** About 1.1 MB the first time a drawing opens. Cached after that, and never paid by people who don't draw.
- **Excalidraw upgrades.** Pinned to 0.18.1. It changes its scene format now and then; `restoreElements` migrates old
  scenes, so stored drawings stay readable. Upgrades get their own PR with E80–E82 as the check.
- **Release.** Migration `0018` adds a table only (no backfill). Back up production before releasing, as with 0016.
- **Rollout queue.** This waits until the six queued PRs are in. It depends on `notebook-folders-drag` only for
  dropping images on the Mac.
