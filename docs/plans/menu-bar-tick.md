# Menu bar tick: the bare ink tick, and keeping it in a crowded menu bar

Status: approved by Rohit (24 Oct 2026); built on branch `claude/project-thread-0gyuix`. Test cases: [docs/tests/menu-bar-tick.md](../tests/menu-bar-tick.md). Design approved on the canvas the same day: board
"The menu bar tick" (`K-TrayIcon`) on the page "Menu bar & This Mac".

## Why

1. The Mac app's menu bar icon is the tick inside a box (`apps/desktop/src-tauri/icons/tray.png`). Every menu bar board
   draws the bare ink tick. Rohit chose the bare tick, no box: the app moves to the boards.
2. When the menu bar is full (a long app menu, the notch), macOS hides apps' icons from the left with no overflow.
   Tudu, opened late, starts out leftmost, so it is the first to go.

## What macOS allows (and doesn't)

- No API sets a status item's priority. Apple's own icons always sit right of every app's.
- macOS remembers where each app's icon was ⌘-dragged, in the app's own defaults under
  `NSStatusItem Preferred Position <autosaveName>` (points from the right edge of the screen), and puts it back there on
  the next launch. Tudu's tray (tray-icon 0.25.1) sets no autosave name, so macOS uses its default one for the first
  item (`Item-0`). This key is macOS's own setting, not a published API: the first step of the build checks it on
  Rohit's Mac.
- A menu bar manager (Bartender, Ice) or hiding the icon in System Settings › Menu Bar beats anything Tudu does.

## The change

### 1. The bare tick

- `apps/desktop/scripts/icons.mjs`: the tray SVG becomes the ink tick alone (same `INK_SHAPE`, no box), black on clear,
  fitted to 36×36 (18pt @2x) with the optical margin the boards use (the tick at 16pt inside the 18pt slot).
  Re-run `pnpm --filter @tudu/desktop icons`; commit `tray.png` and `tray.svg`. The Dock icon is untouched.
- Still a template image (`icon_as_template(true)`), so macOS inks it for light, dark and tinted bars.
- Canvas: the logo board's "On macOS" panel still draws box + tick for the menu bar; it is redrawn to the bare tick in
  the same PR's design pass. (Design-system Logos: checked for a tray file; updated if one exists.)

### 2. Start next to the system icons

- New `tray_place` in `background.rs` (pure) + a `mac::seed_tray_position` call in `lib.rs` setup, **before** `tray()`
  builds the status item:
  - read `NSStatusItem Preferred Position Item-0` from the app's `NSUserDefaults`;
  - if it is absent, write the seed value (the right end of the apps' icons; the exact number comes from the spike on
    Rohit's Mac, kept as one constant);
  - if it is present (Rohit dragged it, or an earlier launch seeded it), leave it alone. His drag always wins.
- Tudu, Tudu Staging and Tudu Test have separate bundle ids, so separate defaults and separate places.

### 3. Stay narrow

- The tick's title (the Inbox count while the window is closed) caps at `99+`. The Dock badge keeps the real number.

### 4. Never unreachable (only if detectable)

- Spike first: watch the status item button's window (`NSWindowDidChangeOcclusionStateNotification`) and check whether
  macOS reports it not visible when the bar hides it.
- If it does: `policy()` gains a `tick_hidden` input; while hidden, Tudu stays a regular app (Dock icon shown) even
  with the window closed. The count then rides on the Dock badge, as it already does under Regular.
- If it doesn't (or the signal is noisy): this part is dropped and the proposal says so in the PR. ⌘⇧N and opening
  Tudu from Spotlight/Finder still reach it either way.
- Only change policy on a real change (the chunk 16 lesson: re-setting the activation policy breaks hide-on-blur).

### Motion

None added: the menu bar icon is a static template image (animating it means swapping frames on a timer, which is
costly and unlike native items). The pressed highlight is macOS's own.

## Tests

### Rust unit tests (`apps/desktop/src-tauri`, run on the macOS runner with the crate)

| ID     | Scenario                                                                                                                                                                       |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| MB-U01 | `tray_title(count)`: `None`/0 → none; 7 → "7"; 99 → "99"; 100 → "99+"; 12345 → "99+"                                                                                           |
| MB-U02 | `count_places(Accessory, Some(150))` → (no badge, "99+"); `count_places(Regular, Some(150))` → (150, none)                                                                     |
| MB-U03 | `tray_place(stored)`: none stored → seed value; any stored number (incl. 0 and far left) → leave as is                                                                         |
| MB-U04 | `policy(dock, desk_open, tick_hidden)`: closed + While open + shown → Accessory; closed + hidden → Regular; Always → Regular either way; open → Regular (only if part 4 ships) |

### Script test (vitest, Linux CI)

| ID     | Scenario                                                                                                 |
| ------ | -------------------------------------------------------------------------------------------------------- |
| MB-S01 | `icons/tray.svg` is the ink tick only: one `<path>` with `INK_SHAPE`, no `<rect>`, black on clear, 36×36 |
| MB-S02 | `icons/tray.png` is 36×36 RGBA and its alpha matches a render of `tray.svg` (guards a stale PNG)         |

### Mac E2E (`packages/e2e/mac/tests/desktop.spec.ts`, macOS runner)

The control channel's state gains `background.trayPosition` (the stored default, or null) and, if part 4 ships,
`background.tickHidden`; `POST /act` gains `trayHidden` (test builds only) to fake the occlusion signal.

| ID     | Scenario                                                                                                                            |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| MB-D01 | Fresh defaults domain: launch → `trayPosition` equals the seed; the tray rect exists                                                |
| MB-D02 | A stored position (test writes 400 before launch) → after launch still 400; after a relaunch still 400                              |
| MB-D03 | Window closed with 120 in the Inbox → `trayTitle` is "99+"; window open → title null, badge "120"                                   |
| MB-D04 | (part 4) window closed, `trayHidden` true → policy regular, Dock icon and badge shown; false → back to accessory, count on the tick |
| MB-D05 | Regression: C16-D01, C16-D02, C20-D01, C20-D04 still pass (policy is set only on change)                                            |

### Manual on Rohit's Mac (checked before merge, results in the PR)

| ID     | Scenario                                                                                                      |
| ------ | ------------------------------------------------------------------------------------------------------------- |
| MB-M01 | Delete Tudu Staging's defaults key, launch → the tick sits at the right end of the apps' icons                |
| MB-M02 | ⌘-drag it elsewhere, quit, relaunch → it stays where dragged                                                  |
| MB-M03 | Crowd the bar (an app with many menus, on the notched screen) → other apps' icons go first, the tick stays    |
| MB-M04 | (part 4) force the tick hidden → the Dock icon appears; uncrowd → the Dock icon leaves with the window closed |
| MB-M05 | The bare tick reads right in light, dark and a tinted wallpaper bar, idle and pressed, with a count           |

## Out of scope

- Any new icon shape (Rohit chose the bare tick).
- Bartender/Ice integration, or moving Apple's own icons.

## Risks

- The preferred-position key could change in a future macOS. Failure mode is harmless: Tudu lands where it does today.
- Occlusion may not report menu bar overflow; then part 4 is dropped.
- The macOS-only Rust and E2E tests only run on the macOS runner (the desktop crate doesn't build on Linux).
