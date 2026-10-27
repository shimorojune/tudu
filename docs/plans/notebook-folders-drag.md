# Notebook: dragging notes into folders, top-level notes, and new notes

Status: proposal, 27 Oct 2026. Canvas approved by Rohit on 27 Oct (Notebook page, boards `P-FolderDrag` and
`P-FolderDrag-Dark`, sticky `p19-folders-draft`). He picked "no heading" for notes outside a folder on 27 Oct.

These are items 8 and 9 from Rohit's staging list of 26 Oct:

- (8) A brand-new note that nobody has typed in shows ⋯ with Move and Delete.
- (9) A note in "Not in a folder" can't be dragged into a folder. "Not in a folder" is also a poor name.

## 1. Why nothing drags in the Mac app

`NoteTree` uses the browser's HTML5 drag and drop (`draggable`, `dragover`, `drop`). That works in Chromium, and
C22-E02 passes in CI. It never works in the Mac app:

- Tauri 2 (`tauri-runtime-wry` 2.12.3) installs a file drag-drop handler on every webview unless the window turns it
  off. The handler always returns `true`.
- wry's WKWebView subclass therefore never passes `draggingUpdated:` or `performDragOperation:` on to WebKit.
- So the page never gets `dragover` or `drop`.

This breaks every HTML5 drop in the app, not just the tree. Dropping a file from Finder into a note, a task comment,
Quick Add's note or Send feedback has been dead on the Mac for the same reason. Nobody reported it because those
features shipped while it was already broken.

## 2. What changes

### 2.1 The tree drags rows itself (pointer events)

`NoteTree` drops HTML5 drag and drop and carries rows with pointer events, as drawn on the canvas. One implementation
covers the Mac app, every browser and touch:

- **Lifting a row.** With a mouse, press and move 4 px. With touch or a pen, hold for 380 ms; the row sinks a little
  (`scale(.97)`) while you hold. Moving more than 8 px before the hold ends cancels it, so swipes still scroll and
  taps still open the note.
- **The card.** The lifted row becomes a small card (`.tp-nb-ghost`: popover surface, `--shadow-pop`, scale 1.03, or
  1.05 on touch). It follows the pointer inside the tree and the source row stays at 40%. The card is drawn inside the
  tree's `nav`, in the tree's own pixels.
- **Where it drops.** The target comes from `document.elementFromPoint` and the nearest `[data-nb-kind]`. The zones and
  the `canDrop` and `place` logic are the same as today:
  - a note onto a folder goes into it;
  - over a note, the top half drops before it and the bottom half after it;
  - a folder goes into another folder or beside it;
  - the area after the folders takes a note out of its folder.

  "Too deep" and the toast "Folders go three levels deep." are unchanged.

- **Opening a closed folder.** Hold over it for 600 ms and it opens.
- **Scrolling.** Within 36 px of the list's top or bottom edge, the list scrolls on each frame, faster the closer you
  are to the edge. On touch the page doesn't scroll while you carry a row: a non-passive `touchmove` listener calls
  `preventDefault` only while lifted, and rows have `touch-action: pan-y`.
- **Dropping.** The card glides (220 ms, `--ease-settle`) to the row's new spot, which stays hidden until the card
  lands. Then that row glows once (`LANDED_MS`). Into a folder, the card glides onto the folder, shrinks and fades
  ("sinks in"), and the folder glows.
- **Cancelling.** Esc, `pointercancel`, or letting go where nothing takes the row glides the card back home.
- **Clicks.** The click that follows a drag is swallowed (a one-shot capture listener, cleared after 60 ms). A plain
  click still opens the note.
- **Filtering.** No drag while Find a note is filtering, as today.
- **Reduced motion** (`prefers-reduced-motion` or `data-motion='less'`): no lift, glide or hold animation. The card
  still follows the pointer.
- **Keyboard and screen readers.** These keep using ⋯ › Move on the note. That is unchanged.
- **Other trees.** The note window's All notes list is the same `NoteTree`, so it gets this too.

### 2.2 The Mac window stops swallowing file drops

- In `apps/desktop/src-tauri/src/windows.rs` `builder()`, call `.disable_drag_drop_handler()` for every window. Nothing
  listens to Tauri's drag-drop events: I grepped for `onDragDropEvent` and found no hits.
- In `apps/web`, add a page guard (`installDropGuard()`, called once at startup). It adds window listeners for
  `dragover` and `drop`. If the event is carrying files and nothing on the page handled it (`!e.defaultPrevented`),
  the guard calls `preventDefault()` and sets `dropEffect = 'none'`.

Without the guard, a file dropped anywhere else would make the webview navigate to `file://…`. On the Mac, our
`on_navigation` would then open that file in another app. Browsers navigate away from Tudu. With the guard, nothing
happens.

### 2.3 Notes in no folder sit at the top of the Notebook

Rohit's pick:

- In the tree, the "Not in a folder" heading goes. Notes in no folder come after the folders, below a hairline
  (`.tp-nb-loose-sep`, only when there are folders).
- While you carry a filed note, that area takes the drop: it gets an accent fill and an inset edge. When it is empty,
  it shows a dashed box that says "Drop here to take it out of its folder".
- Every place that names the spot says **Notebook**:
  - the first row of Move (`moveTargets`), with the note icon;
  - the line above a note's title (`NoteEditor` crumb);
  - Search (`NoteHit`, `notebook.ts` `where`);
  - the note window's list sub-line;
  - Trash: "From Notebook" (it was "Not in a folder").
- Server and data are unchanged: `folderId: null`.

### 2.4 A new note has no ⋯ until its first character

- `NoteEditorNote` gains `draft?: boolean`. `editorNote()` passes `NoteView.draft`, which the store already flips to
  `false` on the first kept character.
- While `draft` is true, the ⋯ keeps its place but is hidden: `.tp-nb-more-hide` sets `opacity: 0`, `scale(.6)`
  `rotate(-45deg)`, `visibility: hidden`, `inert` and `aria-hidden`. Nothing in the top row shifts.
- When the note stops being a draft, ⋯ fades in, scaling up and turning a quarter (`--dur-arrive`, `--ease-arrive`).
- ↗ and Link a task stay. Linking already creates the note.
- This covers the Notebook page, the Mac note window and the browser's floating note, because all three use
  `NoteEditor`.

### 2.5 A move the server turns down

- Today a rejected op toasts the server's message and the tree reloads. The row jumps back.
- For `note.move` and `folder.move` the toast now reads `Couldn’t move “<name>”. It’s back where it was.`, with
  **Try again**, which sends the same move again.
- The reload still puts the row back. It slides back through the existing `.tp-nb-kids` transition; there's no
  separate glide.
- Offline moves wait in the outbox as today, with no toast.

## 3. Design system and canvas

- The canvas kit (`PadTree`, `PadEditor`, `scratchpad.css`) already has all of this (canvas v140–142). After the PR,
  the DS artifact gets the same changes: `NoteTree`, `NoteEditor`, `NoteTrash` and `NoteHit`. Then I check every board
  that uses the tree (Notebook page, phone, note window, Search, States) for drift.
- No new tokens. The card uses `--popover`, `--shadow-pop`, `--radius-sm`, `--ease-settle` and `--ease-arrive`.

## 4. Files

| Area                                                                       | Change                                                                                                                                 |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/ui/src/components/NoteTree.tsx`                                  | Pointer drag replaces HTML5 drag and drop; ghost card; spring-open; edge scroll; separator instead of the heading                      |
| `packages/ui/src/components/NoteEditor.tsx`                                | `draft` hides ⋯ in place; crumb says Notebook                                                                                          |
| `packages/ui/src/components/NoteTrash.tsx`, `NoteHit.tsx`, `NoteParts.tsx` | "Notebook" wording                                                                                                                     |
| `packages/ui/src/styles/components.css`, `less-motion.css`                 | `.tp-nb-ghost`, `.tp-nb-pressing`, `.tp-nb-flying`, `.tp-nb-loose-sep`, `.tp-nb-root-hint`, `.tp-nb-more(-hide)`; reduced-motion rules |
| `packages/core/src/notebook.ts`                                            | `moveTargets` first row titled "Notebook"; comments                                                                                    |
| `packages/client/src/notebook.ts`                                          | Rejected move: `onRejected` gets `{ kind: 'move', name, retry }` so the app can word the toast                                         |
| `apps/web/src/app/notebook.ts`                                             | `editorNote` passes `draft`; "Notebook" in `where` and `sub`; move toast with Try again                                                |
| `apps/web/src/app/dropGuard.ts` (new) + startup                            | Page file-drop guard                                                                                                                   |
| `apps/desktop/src-tauri/src/windows.rs`                                    | `.disable_drag_drop_handler()` in `builder()`                                                                                          |

## 5. Test scenarios

Other open threads are numbering new C22 tests at the same time, so these start at U40, E40 and D20.

### New

| ID      | Where                                     | Scenario                                                                                                                                                                                                    |
| ------- | ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C22-U40 | ui `NoteTree.test.tsx`                    | Mouse: pointerdown then a 3 px move doesn't lift; a 5 px move lifts (ghost shown, source row dimmed); pointerup over a folder calls `onMoveNote(id, folderId)`                                              |
| C22-U41 | ui `NoteTree.test.tsx`                    | A click with no movement still calls `onPick`; the click right after a drag doesn't                                                                                                                         |
| C22-U42 | ui `NoteTree.test.tsx`                    | Touch: 380 ms hold lifts (fake timers); moving 9 px before then cancels and nothing moves                                                                                                                   |
| C22-U43 | ui `NoteTree.test.tsx`                    | Over a note: upper half gives `before`, lower half `after`, and the index passed to `onMoveNote` matches                                                                                                    |
| C22-U44 | ui `NoteTree.test.tsx`                    | Esc mid-drag and dropping on nothing call no move handler; the ghost is gone after the glide                                                                                                                |
| C22-U45 | ui `NoteTree.test.tsx`                    | A folder onto a third-level folder shows "Too deep" and on drop toasts "Folders go three levels deep." with no `onMoveFolder`                                                                               |
| C22-U46 | ui `NoteTree.test.tsx`                    | Holding 600 ms over a closed folder opens it                                                                                                                                                                |
| C22-U47 | ui `NoteTree.test.tsx`                    | No heading for notes in no folder; a separator only when folders exist; dragging a filed note with none unfiled shows "Drop here to take it out of its folder"; dropping there calls `onMoveNote(id, null)` |
| C22-U48 | ui `NoteTree.test.tsx`                    | Rows don't lift while Find a note is filtering                                                                                                                                                              |
| C22-U49 | ui `NoteEditor.test.tsx`                  | `draft: true`: ⋯ is in the DOM, hidden (`aria-hidden`, `inert`, `tp-nb-more-hide`) and not reachable by Tab; the crumb's box doesn't move when `draft` turns false and ⋯ shows                              |
| C22-U50 | ui `NoteEditor.test.tsx`                  | Crumb for a note in no folder reads "Notebook"                                                                                                                                                              |
| C22-U51 | client `notebook.test.ts`                 | A rejected `note.move` calls `onRejected` with the move kind, the note's name and a retry that resends the same move                                                                                        |
| C22-U52 | web `dropGuard.test.ts`                   | A file `drop` nobody handled is prevented; one an editor handled is left alone; a drag with no files is ignored                                                                                             |
| C22-E40 | e2e web `notebook.spec.ts`                | Mouse drag (`page.mouse` down/move/up, not `dragTo`) of a note in no folder onto a folder: the crumb shows the folder and the server agrees                                                                 |
| C22-E41 | e2e web `notebook.spec.ts`                | Drag a note out of its folder to below the separator: the crumb says Notebook and the server has `folderId: null`                                                                                           |
| C22-E42 | e2e web `notebook.spec.ts`, phone project | Touch hold 0.5 s then move onto a folder moves the note; a quick swipe scrolls the list and moves nothing                                                                                                   |
| C22-E43 | e2e web `notebook.spec.ts`                | New note: no visible ⋯; type one letter and ⋯ shows; Move and Delete then work                                                                                                                              |
| C22-D20 | mac `notebook.spec.ts`                    | In the real WKWebView, a pointer-event drag of a note onto a folder moves it (the Mac case that was broken)                                                                                                 |

### Updated

| ID                           | Change                                                                                              |
| ---------------------------- | --------------------------------------------------------------------------------------------------- |
| C22-E02                      | Uses the mouse helper instead of `dragTo` for both the note into Planning and Planning onto Offsite |
| C22-U03                      | `moveTargets` first row is "Notebook" (was "Not in a folder")                                       |
| C22-U01                      | Wording only: a note whose folder is gone sits at the top of the Notebook                           |
| NoteTrash / NoteWindow tests | "From Notebook" / "Notebook" instead of "Not in a folder"                                           |
| `docs/tests/chunk-22.md`     | Add the rows above; reword U01, U03, E02                                                            |

### Manual (can't be scripted)

- Mac app: drag a file from Finder into a note, a task comment, Quick Add's note and Send feedback; each attaches it.
- Mac app: drop a file on the sidebar; nothing happens and no other app opens.

All tests run on Rohit's Mac, not in the cloud.

## 6. Risks

- **Phone hold and long-press.** iOS Safari's long-press callout and text selection could fight the hold. Rows get
  `-webkit-touch-callout: none` and `user-select: none`. E42 covers the phone project in Playwright; a real iPhone
  check is worth doing once on staging.
- **The guard on web.** The guard also changes the web build. Today a stray file dropped on a Tudu tab in a browser
  navigates away from Tudu; after this, nothing happens. That's an improvement, but it is a change on web too.
