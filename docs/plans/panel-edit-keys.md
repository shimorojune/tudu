# ⌘V, ⌘C and the other edit keys in Tudu's floating windows (#119)

Status: proposal, awaiting Rohit's approval. No canvas: Rohit chose "Skip canvas, go to proposal" on 25 Nov 2026,
since nothing visible changes.

## The report

Issue #119 (Rohit, Mac 0.43.1): pasting into a note in the floating note window does nothing. The same paste works in
the Notebook on the desk.

## What is actually wrong

The paste code is the same in both places: `RichTextEditor`'s `handlePaste` only takes over for files and leaves text to
TipTap, and the note window and the Notebook both mount it through `useNoteEditor`. So the web side is not the cause.

The difference is the window. The note window, Quick Add and the menu bar sheet are turned into a `TuduFloatingPanel`
by `make_panel` (`apps/desktop/src-tauri/src/windows.rs`, `mod panel`): an `NSPanel` with the `NonactivatingPanel`
style, `canBecomeKeyWindow` true and `canBecomeMainWindow` false. That is what lets them take the keyboard without
bringing the desk forward or taking focus from the app you were in.

On macOS, ⌘V is not a key the web view handles by itself. It is the key equivalent of Edit > Paste in the app's main
menu (Tauri's default menu, since Tudu sets none). `NSApplication` offers a ⌘ key first to the key window's
`performKeyEquivalent:` and then to the main menu. When the panel is key but Tudu is **not the active app** (the usual
case: you summon the note window over another app), the main menu is not the one in the menu bar and the Edit items
never fire, so `paste:` never reaches the `WKWebView`. Typing works because plain keys go straight to the first
responder. The desk is a normal window and Tudu is active when you use it, so the Notebook pastes fine.

This is the leading cause, not yet proven. The first commit adds the failing test below and pushes it alone, so CI shows
it failing on master's code before the fix lands. If it passes on master, the cause is something else and I come back
to you before changing anything.

The same gap should hit ⌘C, ⌘X, ⌘A, ⌘Z and ⇧⌘Z, in Quick Add and the menu bar sheet as well as the note window. The tests
cover those too.

## The change

- `windows.rs`, `FloatingPanel`: add a `performKeyEquivalent:` override. For a key-down with ⌘ (and only ⇧ besides) on
  V, C, X, A, Z, it sends the matching action to the first responder with
  `NSApp.sendAction(sel, to: nil, from: self)`:

  | Keys | Action       |
  | ---- | ------------ |
  | ⌘V   | `paste:`     |
  | ⌘C   | `copy:`      |
  | ⌘X   | `cut:`       |
  | ⌘A   | `selectAll:` |
  | ⌘Z   | `undo:`      |
  | ⇧⌘Z  | `redo:`      |

  If the action was handled, it returns true. Anything else, or an action no responder takes, goes to `super`, so Tudu's
  own ⌘ shortcuts (⌘Enter to save in Quick Add, ⌘W, the rebindable keys) are untouched. The first responder is the
  `WKWebView`, which implements all six. TipTap and plain inputs then do what they do on the desk: text paste, file
  paste through `onAttach`, undo history.

- The key-to-action table is a plain function, `edit_action(chars: &str, flags) -> Option<&'static str>`, so it can be
  unit tested without AppKit.
- One class is shared by the note window, Quick Add and the menu bar sheet, so all three get the fix. No web change, no
  CSS, no server change, no migration.
- **Test hook** (`control.rs`, test builds only, like the other acts): a new act, `"edit-key"`, with `{ window, key,
shift }`. It builds a real key-down `NSEvent` with ⌘ for that window and sends it through `NSApp.sendEvent`, the same
  path a key press takes, so the test exercises the override and not a shortcut around it. A second act, `"activate-other"`,
  makes Finder the active app first (through `NSRunningApplication`), so the test runs in the "Tudu is not active" case
  the bug needs.

## States

There are no new states. A paste of a file still uploads as now, and when offline it shows the existing attach error. A
paste into Quick Add's title still goes through the `#` project menu as typed text. When Tudu is the active app, the
main menu used to handle these keys. Now the panel handles them first, and the result is the same.

## Design system and canvas

Nothing visible changes, so there is no DS or canvas change.

## Test scenarios

Tests run on PR CI (Rohit, 10 Nov 2026: no test runs on his Mac). IDs continue `C22-D` (note window, highest is D52) and
`C20-D` (desktop, highest is D09). The rows go in `docs/tests/chunk-22.md` under a new "## Edit keys in the floating
windows" section, and in the desktop chunk for C20.

### New

| ID      | File                                                | Scenario                                                                                                                                                                                                                                                                      |
| ------- | --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C20-U24 | `apps/desktop/src-tauri/src/windows.rs` (Rust test) | `edit_action`: ⌘V → `paste:`, ⌘C → `copy:`, ⌘X → `cut:`, ⌘A → `selectAll:`, ⌘Z → `undo:`, ⇧⌘Z → `redo:`; ⌘S, ⌥⌘V, ⌃⌘V, ⌘Enter and V without ⌘ → none.                                                                                                                         |
| C22-D53 | `packages/e2e/mac/tests/notebook.spec.ts`           | Finder active, note window open on a note, caret at the end. The pasteboard holds "Bought milk". Sending ⌘V through `edit-key` makes the note end with "Bought milk", and it stays after closing and reopening the window. This test is pushed first and must fail on master. |
| C22-D54 | same                                                | In the same setup: ⌘A then ⌘C puts the note's text on the pasteboard; ⌘X empties the note; ⌘Z brings the text back; ⇧⌘Z removes it again.                                                                                                                                     |
| C22-D55 | same                                                | A PNG on the pasteboard and ⌘V in the note window: it uploads and shows as an attachment, as a paste does in the Notebook (C22-D42).                                                                                                                                          |
| C20-D10 | `packages/e2e/mac/tests/` (the Quick Add spec)      | Finder active, Quick Add open. "Call the bank" on the pasteboard and ⌘V in the title puts it in the title; ⌘A then ⌘X empties it.                                                                                                                                             |
| C20-D11 | same                                                | Tudu's own ⌘ keys still work in a panel: ⌘Enter in Quick Add still saves the task (the override hands it to `super`).                                                                                                                                                         |

### Unchanged, must still pass

All `notebook.spec.ts` and Quick Add Mac tests, the shortcuts tests (`docs/tests/shortcuts.md`), and C22-D42 (a paste
into a drawing, which dispatches its own paste event and does not use the key path).

### Not automated

A real key press from the keyboard (CI cannot post one into another app's session). Manual check MC-EK01 for Rohit after
release: over another app, open the note window, ⌘V some text, then ⌘Z. Do the same in Quick Add's title.
