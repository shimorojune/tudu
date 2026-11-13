# Shortcuts · test cases

The plan is [docs/plans/shortcuts.md](../plans/shortcuts.md) (#60, #57). These ids (`SK-…`) come from that plan, not a
chunk, so `pnpm test:status` does not list them in STATUS.md; the test names carry them for `-g`. Unit, web and Mac
tests run on PR CI (and Actions › Flake check for repeats), not on Rohit's Mac.

## Unit (vitest)

| ID     | Where                                               | Case                                                                                                                                                                        |
| ------ | --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SK-U01 | `packages/core/src/shortcuts.test.ts`               | `fromEvent` uses the physical key (`KeyN` with an AZERTY `key`), digits from the row and the numpad, ignores lone modifiers                                                 |
| SK-U02 | `packages/core/src/shortcuts.test.ts`               | `format`: macOS order ⌃⌥⇧⌘ (`⇧⌘N`, `⌥⌘N`, `⌃0`); words elsewhere (`Ctrl+Shift+N`); `aria` is `Shift+Meta+N`                                                                 |
| SK-U03 | `packages/core/src/shortcuts.test.ts`               | `check`: no modifier, ⇧ alone, reserved keys, taken by another row, a digit under the space keys, the space row needs a digit                                               |
| SK-U04 | `packages/core/src/shortcuts.test.ts`               | `toAccelerator`/`fromAccelerator` round trip for every default and a sample of others                                                                                       |
| SK-U05 | `packages/core/src/shortcuts.test.ts`               | `spaceForDigit`: 0 is All spaces only with 2+ spaces; 1 is the first after it; past the list is nothing; a tenth space has none                                             |
| SK-U06 | `packages/ui/src/components/ShortcutField.test.tsx` | Click listens; held modifiers show; a full press calls `onSet` once; Esc, Tab and blur keep; Delete calls `onSet(null)`                                                     |
| SK-U07 | `packages/ui/src/components/ShortcutField.test.tsx` | An error keeps it listening with the reason announced (`role=alert`); the next good press clears it                                                                         |
| SK-U08 | `packages/ui/src/components/ShortcutField.test.tsx` | Saved: caps then tick; after 1.5s the tick gets `tp-out`, then leaves; Reduce motion has no pop                                                                             |
| SK-U09 | `packages/ui/src/components/Settings.test.tsx`      | Shortcuts listed under You after This Mac; Mac rows only with `global`; loading skeletons; error banner with Try again; not on phones                                       |
| SK-U10 | `packages/ui/src/components/Settings.test.tsx`      | The back arrow only on changed rows; its label names the usual keys; it calls `onReset`                                                                                     |
| SK-U11 | `packages/ui/src/components/SpaceSwitch.test.tsx`   | Each row shows its hint before the count and the tick; no hint for an Off shortcut                                                                                          |
| SK-U12 | `apps/web/src/app/shortcuts.test.tsx`               | `localStorage` broken or missing gives the defaults; a change survives a reload; Mac rows go through the bridge                                                             |
| SK-U13 | `apps/web/src/app/AppShell.test.tsx`                | ⌃0/⌃2 navigate keeping the view; a missing view lands on Today; the current space's key does nothing; ignored under an open layer; `preventDefault` called; repeats ignored |
| SK-U14 | `packages/ui/src/components/MenuBarSheet.test.tsx`  | Tooltips and `aria-keyshortcuts` follow the bindings; Off or not registered shows the name alone                                                                            |

## Unit (`apps/desktop/src-tauri`, Rust, on the macOS CI runner)

| ID     | Case                                                                                                                      |
| ------ | ------------------------------------------------------------------------------------------------------------------------- |
| SK-R01 | `shortcuts.json` missing, empty or broken gives the defaults; a saved file loads; Off is kept as Off                      |
| SK-R02 | `rebind` registers the new keys before dropping the old; a refused registration keeps the old ones and returns the reason |
| SK-R03 | A failed write rolls the registration back                                                                                |
| SK-R04 | Reserved and clashing accelerators are refused in Rust too                                                                |
| SK-R05 | `pressed()` routes by the live bindings: after a rebind the new keys open New task, the old ones do nothing               |
| SK-R06 | A press while `signed_in` is unknown is held and runs on the report; after 8 seconds it falls back                        |
| SK-R07 | Labels in macOS order: `⇧⌘N`, `⌥⌘N`                                                                                       |

## End-to-end, web (Playwright, `packages/e2e/tests/shortcuts/`)

| ID     | Case                                                                                                         |
| ------ | ------------------------------------------------------------------------------------------------------------ |
| SK-E01 | Personal plus two team spaces: ⌃0 opens All spaces, ⌃2 the second team space, ⌃1 Personal, on Week each time |
| SK-E02 | On People in a team space, ⌃1 (Personal) lands on Today                                                      |
| SK-E03 | Typing in the writing line, ⌃2 switches and leaves no character in the field                                 |
| SK-E04 | With Quick Add, Search or Settings open, ⌃2 does nothing                                                     |
| SK-E05 | Settings › Shortcuts: set All spaces to ⌥⌘0, it works after a reload; the back arrow restores ⌃0             |
| SK-E06 | Refusals: a bare letter, ⌘Q, a digit under the space keys; each shows its line and keeps listening           |
| SK-E07 | Delete turns the space keys off: ⌃2 does nothing, the space list shows no hints                              |
| SK-E08 | The space list shows ⌃0 to ⌃3 beside the spaces                                                              |
| SK-E09 | Web Settings has no From anywhere rows and says where they live; a phone viewport lists no Shortcuts         |

## Desktop (the real Tudu Test app, `packages/e2e/mac/tests/`)

| ID     | Case                                                                                                                                                                       |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SK-D01 | Settings shows ⇧⌘N and ⌥⌘N as registered; rebinding New task to ⌃⌥T: `/state` shows it registered, ⇧⌘N no longer is; `press ⌃⌥T` opens Quick Add; `press ⇧⌘N` does nothing |
| SK-D02 | Relaunch with the same data folder: ⌃⌥T is registered at launch and works                                                                                                  |
| SK-D03 | Launch as the login item (`TUDU_TEST_AT_LOGIN=1`, no window, accessory policy): the rebound keys are registered and a press opens Quick Add over nothing, not Sign in      |
| SK-D04 | Close the desk, Dock on While the window is open (menu bar only): New note's keys open the note window; New task's open Quick Add                                          |
| SK-D05 | `TUDU_TEST_TAKEN=⌃⌥T`: setting it is refused with the line, ⇧⌘N stays registered and works                                                                                 |
| SK-D06 | New note Off: unregistered, the sheet's tooltip says New note alone; back arrow brings ⌥⌘N back and registers it                                                           |
| SK-D07 | `wake`: a binding unregistered behind the app's back (test hook) is registered again                                                                                       |
| SK-D08 | Press at login before the page reports signed in: held, then Quick Add opens once the report lands                                                                         |
| SK-D09 | In the desk, ⌃2 switches space (the In Tudu keys inside WKWebView)                                                                                                         |

`press` goes through the same `pressed()` a key press reaches, but it is not the key press itself: CI posts no real
key events, so the Mac tests stay at the handler level. The test build's hooks: `press` (any `accelerator`),
`drop-shortcut` (macOS losing one), `signed-in` (null: the desk has not said yet) and `TUDU_TEST_TAKEN` (keys another
app holds).
