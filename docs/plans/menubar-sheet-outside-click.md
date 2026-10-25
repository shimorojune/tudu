# Menu bar sheet: hide on any click outside it, not only when Tudu loses focus

Status: approved by Rohit 25 Oct 2026; implemented. Canvas: not applicable (no visible change; the sheet already should hide
on an outside click, this makes it do so every time). Skipping it approved by Rohit 25 Oct 2026.

## The failure

`Desktop (macOS)` fails on C20-D04 ("clicking another app hides the sheet; so does Esc"), and only on that case:

| Run         | Where           | Result         |
| ----------- | --------------- | -------------- |
| 40092342595 | master (PR #11) | C20-D04 failed |
| 40105725121 | PR #14          | C20-D04 failed |
| 40155729889 | master (PR #14) | C20-D04 failed |
| others      | master and PRs  | passed         |

Every time the state dump after 13 s is the same: `menubar.visible: true`, `menubar.focused: true`,
`main.focused: false`. The sheet is still the key window long after the test "clicked another app".

## Root cause

The sheet is a non-activating `NSPanel` (`windows.rs`, `make_panel`/`make_key`): a click on the tick makes it key
**without activating Tudu**. The only thing that hides it is `WindowEvent::Focused(false)`, i.e. `resignKey`.

A key window in an app that is not active only resigns key when the **active app changes**. So:

- Tudu was the active app, another app activates: Tudu deactivates, the sheet resigns key, it hides. Test passes.
- Another app (Finder, Safari…) was already the active app: clicking into it, or `tell application "Finder" to
activate` in the test, changes nothing about activation. No `resignKey`, no `Focused(false)`, the sheet stays.
  Test fails.

Which of the two the test hits depends on whether macOS made the freshly launched Tudu Test frontmost (launches from a
background process are not guaranteed activation), which is why it is intermittent. `clickAnotherApp()` also ignores
`osascript`'s exit status.

This is not only a test problem. For a person it is the common case: Tudu is an accessory app in the menu bar, they
click the tick over Safari, then click back into Safari, and the sheet stays open over it. The designed behaviour
(C20 "clicking anywhere else hides it") holds only when Tudu happened to be active.

Inferred from the state dump and the code; not yet reproduced by hand on a Mac (can be, on Rohit's machine, before
merging).

## The change

1. `windows.rs` (macOS): while the sheet is shown, also hide it when
   - a mouse down lands outside Tudu: `NSEvent::addGlobalMonitorForEventsMatchingMask` for left, right and other
     mouse down (global monitors only see events sent to other apps, so clicks on the tick and in the sheet are not
     seen; mouse monitors need no Accessibility permission);
   - another app activates: `NSWorkspaceDidActivateApplicationNotification` (covers ⌘Tab and `open -a` when Tudu
     was not active).
     Implemented as installed once at launch (with the sheet), acting only while the sheet shows, rather than added and
     removed on each show: same behaviour, nothing to leak between shows. Both go through
     the same path as `Focused(false)` (stamp `SHEET_BLURRED`, then `hide_menubar`), so the tick's 300 ms grace keeps
     working.
2. The decision stays in one pure function next to `opens`: `outside_hides(visible, from_own_app) -> bool`, unit
   tested.
3. Control channel (`control` feature only): `act {"do": "outside-click"}` calls the same handler the global monitor
   calls, because CI cannot post a real click into another app without Accessibility rights.
4. `desktop.spec.ts`: `clickAnotherApp()` checks `osascript`'s status, and C20-D04 is split so each path is forced
   instead of left to launch timing.

## Test scenarios

New / updated (rows go in `docs/tests/chunk-20.md`):

| ID      | Kind    | Case                                                                                                                                                |
| ------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| C20-U06 | Rust    | `outside_hides`: shown + event from another app → hide; hidden → nothing; event from Tudu's own windows → nothing                                   |
| C20-D04 | Mac E2E | (updated) Tudu active, sheet open, Finder activates → sheet hidden; Esc hides it too. `osascript` must exit 0                                       |
| C20-D06 | Mac E2E | Another app already frontmost (TextEdit activated first, Tudu not active), open the sheet, then activate Finder → sheet hidden                      |
| C20-D07 | Mac E2E | Another app frontmost, sheet open, `outside-click` → sheet hidden; after the 400 ms grace a tick click opens it again                               |
| C20-D08 | Mac E2E | Dropped: clicks inside the sheet are already C20-D02 (tick a task, sheet stays) and C20-D01 (the tick toggles); a real click cannot be posted on CI |

Regression: C20-D01..D05, C16-D01..D07, MB-D01..D04 unchanged.

Check before merging: the Mac job passes 3 runs in a row (re-run the job twice on the PR), since one green run says
little for a race.
