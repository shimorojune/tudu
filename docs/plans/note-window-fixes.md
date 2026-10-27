# Note window: the browser, older Mac apps, update errors, and staging fixes

Status: proposal, awaiting Rohit's approval (27 Oct 2026). Canvas approved 27 Oct 2026 03:04Z ("looks good, let's go
for the proposal"), covering two drafts on the Notebook and Menu bar pages:

- **Web draft (v128):** P-Web(+Dark), P-OldApp(+Dark) and K-Updates(+Dark) errors. Sticky `p17-web-draft`.
- **Note window fixes (v133 to v146):** P-Floating, P-Web, P-MenuBar, K-MenuBar, K-Proto, K-Updates (all +Dark),
  and P-MakeTask section 1. Sticky `p18-window-draft`.

The ↗ question was settled as option 1: the Tudu mark opens the note on the Notebook page, as on the Mac.

This covers Rohit's staging items 2, 4, 5, 6, 7 and 10 (26 Oct). It also covers the web half of the 26 Oct report:
the browser note window can't be resized, ↗ opens a popup that has its own ↗, an old Mac app does nothing, and update
errors blame the connection.

## Why, item by item (causes found in code)

| #   | What Rohit saw                                                     | Cause                                                                                                                                                                                                                      |
| --- | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| W1  | Browser note window can't be resized                               | `NoteWindowHost.tsx` only drags. The corner grip in `NoteWindow.tsx` is Mac only.                                                                                                                                          |
| W2  | ↗ opens a popup with its own ↗                                     | `popOut()` opens `/note-window/<id>` in a 640×520 popup and leaves the panel open. `NoteWindowPage` (non-Mac branch) shows another Open button.                                                                            |
| W3  | Old Mac app: notes never open                                      | The remote web calls `invoke('open_note')` through `quiet()` (`desktop.ts`), which swallows the rejection. `openNoteWindow` (`notebook.ts`) has no fallback. `NoteWindowHost` returns null whenever `desktop()` exists.    |
| W4  | Updates fail at 100% with "Check your connection"                  | `updatesRow` always shows `CHECK_FAILED`. `updates.rs` keeps the error string but not what failed. A refused signature ("signature was created with a different key") reads as a network problem.                          |
| 2   | No shortcut for the note window                                    | `track.rs` registers only `SUMMON` (⌘⇧N). The global-shortcut handler always summons Quick Add.                                                                                                                            |
| 4   | Note window doesn't follow the app's theme                         | `NoteWindowPage` never mounts `useTheme()`. The note webview is built once at launch, so it keeps whatever `index.html` painted then and never hears a pick made on the desk (no `storage` listener, no `system` watcher). |
| 5a  | Dark band down the left of the window                              | The rail is `background: var(--muted)` (`.tp-nb-rail`, components.css). In dark mode, and next to a mismatched theme (item 4), it reads as a tint.                                                                         |
| 5b  | Drag and resize handles are hard to find, and corners don't resize | The bar is the only drag area and nothing marks it. Resizing only works from an 18px bottom-right grip: `startResizing()` always calls `startResizeDragging('SouthEast')`.                                                 |
| 6   | Pin, close, reopen: shows pinned but isn't                         | `notes::hide()` keeps `NoteState.pinned = true`, and the page takes it back on `note:open`. The window's level and that flag can disagree after hide/show. Unpinning on close removes the mismatch either way.             |
| 7   | Fill the screen jumps                                              | `set_expanded` calls `set_size` then `set_position` with no animation, so the webview reflows twice.                                                                                                                       |
| 10  | Formatting bar should be above the text, without jank              | Since PR #35 the bar floats at the foot of the note (`.tp-nb-body … .tp-rte-bar { order: 2; position: sticky; bottom }`).                                                                                                  |

## Design (approved canvas)

### Browser note window (W1, W2, 5b)

- **Resizing:** from every edge and corner, like the Mac.
  - 6px bands along the edges and 16px corners, each with its own cursor.
  - A short line shows on the edge under the pointer.
  - The corner marks show while the pointer is on the window. The bottom-right mark always shows.
  - Size limits: never smaller than 420×320, never past the page. Where and how big it was is kept per browser, as
    today.
- **Drag handle:** a 36×4 bar at the top centre of the window's bar shows where to drag. It darkens and widens to 44
  under the pointer.
- **↗ becomes the Tudu mark ("Open in your Notebook"):** the tab goes to `/notebook/<id>` (or `/notebook` for an
  untouched blank note) and the floating window closes. No popup windows anywhere.
- **`/note-window/<id>` opened in a browser** (old bookmarks) lands on `/notebook/<id>`. The route stays for the Mac
  app's own window.

### Older Mac app (W3)

When the app refuses `open_note`, the note opens in the page's floating window instead. A toast says: "This version
of Tudu can't float notes over other apps, so this one opens here." Its **Update Tudu** button opens Settings ›
This Mac and starts a check (`UPDATES_GO`, as the sheet's ⋯ › Check for updates… does). The toast shows once per
launch of the page.

### Update errors (W4), K-Updates

Settings › This Mac › Updates says what actually failed:

| What failed              | Line                                                                                                           | Button                  | Shown after                                            |
| ------------------------ | -------------------------------------------------------------------------------------------------------------- | ----------------------- | ------------------------------------------------------ |
| Check (feed unreachable) | "Couldn't check for updates. Check your connection and try again."                                             | Try again               | Check now only (as today)                              |
| Download                 | "Couldn't download Tudu 0.37.1. Check your connection and try again."                                          | Try again               | Check now only                                         |
| Signature refused        | "Tudu 0.37.1 didn't pass its safety check, so it wasn't installed. Download it from the Tudu website instead." | Get it from the website | Every check, automatic ones too: retrying can't fix it |

"Get it from the website" opens the release page for the app's track:

- Staging: `https://github.com/shimorojune/tudu/releases/tag/staging`
- Production: `https://github.com/shimorojune/tudu/releases/latest`

It opens through `openExternal`.

### Shortcut (item 2)

- ⌥⌘N opens the note window on a blank note from any app. It does exactly what the sheet's New note does: the sheet
  goes first, the desk stays where it is, and signed out it opens the desk on Sign in.
- The sheet's New note button gets the tooltip "New note ⌥⌘N" and `aria-keyshortcuts="Alt+Meta+N"`.
- An app too old to register ⌥⌘N sends no `noteShortcut` in `app_info`, and the tooltip stays "New note".
- While Tudu runs, ⌥⌘N belongs to Tudu in every app, the same trade-off as ⌘⇧N today. If registering it fails (it's
  taken), the app logs that, the tooltip stays "New note" and nothing else changes.

### Theme (item 4)

No design change: the note window paints your pick (Light, Dark, or System following the Mac) and changes with it
live.

The native window theme (title bar materials, the window background) belongs to the startup-flash thread's
`set_appearance` command (`docs/plans/launch-screen.md`, branch `claude/project-thread-04i5wc`). That command sets
`WebviewWindow::set_theme` on all four windows. This plan does only the page side, so the two don't overlap.

### Handles and rail (item 5)

- The rail (Recent / All notes) uses the window's own paper (`var(--card)`) with its hairline. There is no darker
  band.
- Handles as in the browser section above. On the Mac each handle calls `startResizeDragging` with its direction, so
  macOS does the resize natively.

### Pin (item 6)

Closing the window unpins it (state and window level), so it always opens unpinned with the plain pin icon and no
outline. That matches the window's own rule, "off to start".

### Fill the screen (item 7)

The window's frame glides to fill the screen and back: native `NSWindow setFrame:display:animate:YES`, about 200ms
with the system curve. The note's corner radius already eases from 14 to 10px with it. Less motion and Reduce motion
make it instant.

### Formatting bar (item 10), Notebook page and note window

- **Layout:** the bar is a fixed 40px strip above the writing, under the title and linked tasks, with a hairline
  under it. Only the words under it scroll, cut off at its lower edge, so no text shows above or behind it.
- **Focus:** it's always there, so nothing moves when you click in. Away from the note only its controls dim (to
  50%); the strip itself stays solid.
- **Phones** keep the bar at the foot, over the keyboard.

## The change

### UI package (`packages/ui`), then the design system

1. **`NoteWindow.tsx`**
   - Grip and edge handles for both variants:
     `onResizeStart?: (e, dir: 'n'|'ne'|'e'|'se'|'s'|'sw'|'w'|'nw') => void`. Handles render only when
     `onResizeStart` is given, and never while expanded.
   - The drag mark `<span className="tp-nb-win-grab" aria-hidden>` in the bar.
   - Web variant: Tudu mark with label `openLabel ?? 'Open in your Notebook'`. The external-link icon goes away.
2. **`components.css`**
   - `.tp-nb-rail` background `var(--card)`.
   - New `.tp-nb-win-grab` and `.tp-nb-edge-*` rules (as in the canvas kit).
   - Formatting bar:
     - `.tp-nb-body` stops scrolling and becomes a flex column.
     - `.tp-rte-notes` fills it.
     - `.tp-rte-bar` becomes a static `flex: none` strip with a solid `var(--card)` background. Its children dim when
       not `.tp-on`.
     - `.tp-rte-host` becomes the scroller (`flex: 1; min-height: 0; overflow-y: auto`), with the padding moved
       onto it.
     - The placeholder offset follows the padding.
   - Applies to the desktop editor and to `.tp-nb-win` (compact). `.app-notebook-phone` keeps today's foot bar.
   - Matching `less-motion.css` rules.
3. **`MenuBarSheet.tsx`:** new `noteShortcut?: string` gives New note `tipLabel={`New note ${noteShortcut}`}` and
   `aria-keyshortcuts`, reusing the existing `keyShortcuts()`.
4. **`Settings.tsx`:** `SettingsUpdates` gains `onGetIt?: () => void`. With it, the error row's button reads "Get it
   from the website" in place of Try again.
5. **Design system artifact:**
   - Port NoteWindow (handles, drag mark, web Tudu mark, rail), the editor bar CSS, Settings `onGetIt` and
     MenuBarSheet notes (the design system has no MenuBarSheet component; README note only, as in PR #38).
   - `index.d.ts` and the READMEs.
   - Bump `lastChange`.

### Web (`apps/web`)

1. **`notebook.ts`**
   - New pure `resizeFrame(frame, dir, dx, dy, vw, vh)`: the far edge stays put, clamped to `NOTE_WINDOW_MIN` and
     the page.
   - `openNoteWindow` awaits the bridge. When `openNote` rejects, it opens the in-page window, shows the fallback
     toast and sets a `fallback` flag that `NoteWindowHost` reads.
2. **`NoteWindowHost.tsx`**
   - Resize handler using `resizeFrame`, saved on pointer up.
   - `popOut` removed. `onOpenApp` navigates to `/notebook/<id>` and closes the window.
   - Renders inside the Mac app only in fallback mode.
3. **`desktop.ts`**
   - `openNote` returns `Promise<void>` that rejects when the app refuses (no longer `quiet`).
   - `startResizing(dir)` maps to Tauri's `North`…`NorthWest`.
   - `AppInfo.noteShortcut?: string`.
   - `UpdateStatus.errorKind?: 'check'|'download'|'signature' | null` and `errorVersion?: string | null`.
   - The fake bridge follows: `refuseOpenNote`, `errorKind`.
4. **`NoteWindowPage.tsx`**
   - Mounts `useTheme()` and calls `syncThemeChoice()` on every `note:open` (a hidden window may miss the storage
     event).
   - Wires `onResizeStart(e, dir)` to `startResizing(dir)`.
   - The browser branch redirects to `/notebook/<id>`, and `PopupQuickAdd`/`toOpener` go.
5. **`updates.ts`**
   - `updatesRow` picks the line from `errorKind`, with the signature line shown even after automatic checks.
   - New `releasePage(track)`.
   - Settings wires `onGetIt` to `openExternal(releasePage(track))`.
6. **Menu bar page:** passes `info.noteShortcut` to `MenuBarSheet`.

### Mac app (`apps/desktop/src-tauri`)

1. **`track.rs`:** `NOTES = "CommandOrControl+Alt+N"`, `NOTES_LABEL = "⌥⌘N"`.
2. **`lib.rs`**
   - Registers `NOTES` next to `SUMMON`.
   - The handler matches the pressed shortcut: summon for `SUMMON`, `notes::open(app, None, None)` for `NOTES`.
   - A failed registration only logs.
3. **`bridge.rs`:** `app_info` adds `noteShortcut: NOTES_LABEL`, but only when `NOTES` is registered.
4. **`notes.rs`**
   - `hide()` unpins: `set_always_on_top(false)` and `pinned = false`, via a small pure `on_close(&mut NoteState)`.
   - `set_expanded` and `place_window` call a new `windows::animate_frame(&w, frame)`. That function runs
     `setFrame:display:animate:` on the main thread (objc2, as `panel::make_panel` does), converting Tauri's
     top-left physical frame to Cocoa's bottom-left points with a pure `cocoa_rect(frame, scale, primary_height)`.
     It is instant when the app's Less motion is on (`this-mac.json` / `set_appearance`'s `lessMotion`, once that
     lands) or `NSWorkspace.accessibilityDisplayShouldReduceMotion` is set.
   - `remember()` already ignores frames while expanded.
5. **`updates.rs`**
   - `Status` gains `error_kind` and `error_version`.
   - A pure `kind(&tauri_plugin_updater::Error) -> &'static str` maps `Minisign`/signature variants to
     `signature`.
   - The download arm sets `download` (with the version), and the check arm sets `check`.
6. **`control.rs`:** state gains `shortcuts.notes { accelerator, registered }`. `/act` gains `"notes-shortcut"`,
   which calls the same handler, so the Mac tests can press it.

## Test scenarios

IDs avoid ranges other open threads use: C22 U40–52 / E40–43 / D20, C22-U31 / E26, C20-U12 / E10, and C11 up to
U25 / E22 / D20.

### Unit (Vitest, cloud and Mac)

- **C22-U60** `NoteWindow`, both variants:
  - Renders the corner grip and 7 edge handles.
  - Pointer-down on each calls `onResizeStart` with its direction.
  - No handles while `expanded`, or without `onResizeStart`.
- **C22-U61** `NoteWindow` web variant:
  - The open button is named "Open in your Notebook" and shows the Tudu mark, not the external icon.
  - Clicking calls `onOpenApp`.
  - The bar holds the drag mark.
- **C22-U62** `resizeFrame`:
  - Each of the 8 directions moves the right edges by dx/dy while the opposite edges stay put.
  - It stops at 420×320 and at the page's edges (x≥0, top≥0, right≤vw, bottom≤vh).
- **C22-U63** `openNoteWindow` with a bridge whose `openNote` rejects:
  - The in-page window opens on that note.
  - The toast shows with "Update Tudu", and that button calls the `UPDATES_GO` path.
  - With a bridge that resolves: no in-page window and no toast.
- **C22-U64** `NoteWindowPage` (Mac branch):
  - A theme stored by another window (storage event) toggles `html.dark`.
  - A pick made while hidden is painted on `note:open`.
- **C22-U65** `NoteWindowPage`: after the window was pinned, `note:open` with `pinned: false` shows "Keep on top of
  other windows" with `aria-pressed="false"`.
- **C22-U66** `NoteWindowPage`, browser branch: `/note-window/abc` navigates to `/notebook/abc`.
- **C20-U20** `MenuBarSheet`:
  - With `noteShortcut="⌥⌘N"`, focusing New note shows the tooltip "New note ⌥⌘N" on top, and it has
    `aria-keyshortcuts="Alt+Meta+N"`.
  - Without it: tooltip "New note" and no attribute.
- **C11-U40** `updatesRow`:
  - `check` and `download` errors show their lines only when `lastManual`.
  - The `signature` error shows its line (with the version) whether manual or not.
- **C11-U41** `Settings` updates row: an error with `onGetIt` shows "Get it from the website" (no Try again), and
  clicking it calls `onGetIt`. Without it: Try again.

### Rust (`cargo test --features control`, Mac)

- **C22-U67** `on_close` turns `pinned` off and leaves `expanded` and `ask` alone.
- **C22-U68** `cocoa_rect`: a top-left frame on a 2× primary screen flips to the right bottom-left rect, and on a
  second screen above the primary.
- **C11-U42** `kind()`: signature/minisign errors map to `signature`, a network error to `download` in the download
  arm, and feed errors to `check`.
- **C11-U43** `NOTES` parses as `Alt+Super+KeyN`, differs from `SUMMON`, and `NOTES_LABEL == "⌥⌘N"`.

### Web E2E (Playwright)

- **C22-E15 (updated)** The browser note window drags. The Tudu mark takes the tab to `/notebook/<id>` on that note
  and closes the floating window. No popup opens. This replaces the popup steps.
- **C22-E60** Resize from every edge and corner:
  - Dragging each of the 8 handles by 60px changes the frame as expected.
  - It never goes below 420×320 or past the page.
  - The frame is the same after a reload.
- **C22-E61** Handles and rail:
  - The drag mark is visible in the bar.
  - The rail's computed background equals the note's (`--card`), light and dark.
  - Each handle's computed cursor matches its direction.
- **C22-E62** Formatting bar, Notebook page and note window:
  - The bar's bottom equals the scroller's top.
  - After typing 60 lines and scrolling to the end, no text line's box is above the bar's bottom edge within the
    scroller's visible area.
  - The bar's background alpha is 1 with the editor blurred.
  - The first line's top doesn't move when the editor is focused and blurred (±0.5px).
  - On a phone viewport the bar is below the last line.
- **C22-E63** Old Mac app: with the desktop fake set to `refuseOpenNote`, clicking a note in the task panel opens
  the in-page note window and the fallback toast. Update Tudu opens Settings › This Mac and starts a check.
- **C11-E40** This Mac › Updates with the desktop fake:
  - `signature` shows the safety line after an automatic check, and the website button opens the staging release
    page.
  - `download` shows its line after Check now only.
  - `check` shows the connection line after Check now only.
- **C20-E20** Menu bar page with the fake: `noteShortcut: '⌥⌘N'` gives the tooltip "New note ⌥⌘N". Without it, the
  tooltip is "New note".

### Mac E2E (`pnpm e2e:mac`, on Rohit's Mac)

- **C22-D30** ⌥⌘N:
  - `state.shortcuts.notes.registered` is true.
  - `/act notes-shortcut` with another app in front opens the note window on a blank note, with the desk hidden.
  - It works with the sheet open (the sheet hides first).
- **C22-D31** Pin, close, reopen: after reopening, `note.state.pinned` and `windows.note.alwaysOnTop` are false and
  the button reads "Keep on top of other windows".
- **C22-D32** Fill the screen animates:
  - Sampling `windows.note.width` every 30ms during expand finds at least 3 distinct widths strictly between the
    start and the end.
  - The same coming back.
  - Final frames as in C22-D03.
- **C22-D33** Theme:
  - Pick Dark on the desk with the note window hidden, then open it: `html.dark` is set and the note's background
    is the dark card.
  - Pick Light while it's open: it repaints within 1s.
- **C22-D34** Each edge handle's pointer-down asks the app to resize in its direction (recorded through the control
  channel's bridge log).
- **C22-D03 and C22-D09** stay as they are and must pass.

### By hand (Rohit, once on staging)

- Grab each edge and corner of the Mac note window.
- Fill the screen and back with Less motion on and off.
- ⌥⌘N from Safari, from VS Code and with Tudu's desk in front.
- Note window theme vs the desk after switching Light/Dark/System.

## Not in this change

- Native window theme: the startup-flash thread's `set_appearance`.
- Keyboard shortcuts in the browser (the canvas still says "later").
- The phone formatting bar (stays at the foot).

## Risks

- **⌥⌘N** steals that combination in other apps while Tudu runs (Xcode uses it for New Group). It can't be changed
  in Settings yet.
- **`setFrame:animate:`** blocks the main thread for the animation's length (about 200ms). Tauri events queue
  meanwhile, which is fine for a user-triggered resize.
- **Old apps:** the fallback relies on `open_note` being missing there. A new app never rejects it (signed out, it
  opens Sign in on the desk), so new apps never fall back.
