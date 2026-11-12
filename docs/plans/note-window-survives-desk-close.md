# Note window goes away when the desk closes (#91)

Status: approved by Rohit 12 Nov 2026. Canvas: not applicable (no design change; the note window should simply
stay where it is). Skipped with Rohit's OK (12 Nov 2026).

## The report

Production 0.41.1, Mac app (issue #91): "When floating notes window is open, and we open the main Tudu window and close
it, the floating notes window also closes."

Rohit's notes (12 Nov):

- It does not happen with Settings › This Mac › Show Tudu in the Dock set to **Always**.
- It reproduces from a clean start: close every window, open the note window from the menu bar sheet, open the desk
  from the same sheet, close the desk. The note window goes with it.

## What is actually wrong

Nothing in Tudu's own code hides the note window on this path. Closing the desk runs exactly two things
(`windows.rs`, the desk's `CloseRequested`): `main.hide()` and `background::desk(false)`. `notes::hide` is only called
by the note window's own close button, ⌘W in it, and Open in your Notebook.

`background::desk(false)` ends in `background::apply`, which, with the Dock on "While the window is open", tells macOS
the app is now an accessory app (`setActivationPolicy`, Regular to Accessory). That switch is the only thing that
differs between the failing setup and "Always" (where the policy stays Regular and the note window stays). So the
policy switch takes the note window down.

What I can't tell from the code is which of two things macOS does to it, and both fit the report:

1. **It orders the panel out.** Going from Regular to Accessory deactivates the app, and AppKit is known to pull an
   app's windows off screen during that transition. `hidesOnDeactivate` is already off for the panel, but the policy
   transition does not go through that flag.
2. **It stays "visible" but drops behind.** The app deactivates, the next app comes forward, and its windows cover an
   unpinned note window. To the eye that is also "it closed".

Quick Add and the menu bar sheet never show this because both hide themselves the moment they lose focus. The note
window is the only panel meant to outlive the desk.

**Update 12 Nov, from Rohit:** a pinned note window does not vanish. A pinned window floats above other apps'
windows, so macOS is not ordering the panel out. It is case 2: the note window is still there, covered by the app that
comes forward when Tudu leaves the Dock. The fix below is the same (put it back in front), and the tests must read
`onScreen` and the window order, since `visible` stays true throughout.

## The change

All in `apps/desktop/src-tauri/src`. Nothing in the web app, no copy, no design, no migration.

1. **`background.rs`, `apply`**: when the policy really changes to Accessory, note first whether the note window is
   showing (`is_visible`). After `set_policy`, if it was showing, put it back in front without making Tudu the active
   app: `orderFrontRegardless` on the panel, on the main thread, right after the switch.
2. **A second look shortly after.** macOS finishes the policy change asynchronously, so one immediate re-front can
   lose the race. A short follow-up (at about 150ms and 500ms) checks again: if the note window was showing before
   the switch, nobody closed it since, and it is not on screen, it is ordered front again. The check is skipped when
   the user closed the note window in between or the policy went back to Regular.
3. **`notes.rs`**: a small "shown" flag on `Notes` (set in `open`, cleared in `hide`), so step 2 knows the user's
   intent and never brings back a window they closed. A pure function decides the re-front, so it is unit tested:
   `keeps_note(from: Option<Policy>, to: Policy, note_shown: bool) -> bool`.
4. **Keyboard**: the note window comes back in front but is not made the key window. Closing the desk should not
   move your typing into the note by itself; a click in it takes the keyboard as it does today.
5. **Pin, place, size, fill the screen**: untouched. The window is never hidden by Tudu on this path, so `on_close`
   (which unpins) does not run, and it stays exactly where and how it was.
6. **`control.rs` (Tudu Test only)**: the window state gains `onScreen` for each window (AppKit's occlusion state:
   at least partly drawn on screen), since `visible` alone cannot see case 2.

The same code path also covers the other way into Accessory: the menu bar tick reappearing after being hidden by a
full menu bar while the desk is closed and a note is open.

### If macOS shows a blink

If the CI run or your Mac shows the note window blinking off and on during the switch, re-fronting is not good
enough. The fallback is to hold the Dock icon while the note window is open (policy Regular while the desk **or** the
note window shows, Accessory once both are gone). That changes what "While the window is open" means, so I will stop
and ask before doing it.

## Test scenarios

Mac app tests run on PR CI (macOS runner), not on your Mac. Rust unit tests and `pnpm verify` run in CI too.

### New

- **C16-U06** `background.rs` (Rust unit), `keeps_note`:
  - Regular to Accessory with the note shown: true.
  - Regular to Accessory with the note not shown: false.
  - Accessory to Accessory (no real change), Accessory to Regular, first apply at launch (`None` to either): false.
- **C22-U69** `notes.rs` (Rust unit): the shown flag is set by an open and cleared by a close; closing still unpins
  and keeps the rest (extends what C22-U67 covers).
- **C22-D45** mac `notebook.spec.ts`, the report as filed: signed in, desk open, Dock on "While the window is open".
  Open the note window, bring the desk forward (`reopen`), close the desk. Wait for policy `accessory`, then for one
  more second: the note window is `visible` and `onScreen` the whole time, same place and size, `pinned` unchanged,
  the desk hidden.
- **C22-D46** mac `notebook.spec.ts`, Rohit's clean-start path: close the desk first (accessory). Open the sheet,
  New note. Open the sheet, Open Tudu Test. Close the desk. The note window is still `visible` and `onScreen` after
  the policy is `accessory` again.
- **C22-D47** mac `notebook.spec.ts`, it does not come back when you closed it: note window open, desk open. Close
  the note window, then close the desk. One second after the policy is `accessory` the note window is still hidden.
  Also: close the desk, and within the follow-up window close the note window; it stays hidden.
- **C22-D48** mac `notebook.spec.ts`, pinned: pin the note window, open and close the desk. Still `visible`,
  `onScreen`, `pinned` and `alwaysOnTop`.

For C22-D45 and C22-D46 another app's window (Finder, sized to cover the note window) sits behind Tudu before the
desk closes, so the bug shows on CI: without the fix the note window ends up under it.

C22-D45 is pushed first, alone, before the fix, to confirm CI reproduces the bug and to log which of the two cases
it is. If CI cannot reproduce it (hosted runners have no real user session quirks), I will say so and the proof
becomes your manual check below.

### Updated

- **C16-D01** (close: hidden, accessory): add that Quick Add and the sheet are still hidden after the switch, so the
  re-front never shows a panel that was not showing.
- **C16-D07** (Dock on Always): add an open note window before the close and check it is still `visible` and
  `onScreen`, so the case that works today stays covered.
- **C22-D02** (stays when another app comes forward): also read `onScreen`.
- `docs/tests/chunk-16.md` and `docs/tests/chunk-22.md`: the new and changed rows.

### Manual check (yours, on the staging build)

- **MC-N01**: Dock on "While the window is open". Close every window, open a note from the menu bar, open Tudu from
  the menu bar, close Tudu. The note window stays, with no blink, and the Dock icon goes.
- **MC-N02**: the same with the note window pinned, and once with another app's window behind it.

## Risk

- The follow-up timing is a guess until the CI run. If neither re-front holds, the fallback above applies and needs
  your OK.
- `orderFrontRegardless` on a window in another Space: the panel already joins all Spaces, so it shows on the
  current one, as it does today.
