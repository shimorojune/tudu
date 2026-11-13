# Shortcuts: switch spaces from the keyboard, and pick your own keys

Status: approved by Rohit on 12 Nov 2026 (space keys in Tudu only) and built. Issues #60 (shortcuts to switch spaces, especially to All spaces) and
#57 (change the keys for Quick Add and the note window). Design approved by Rohit on 12 Nov 2026: canvas page
"Settings & theme", boards `KS-Shortcuts`, `KS-Shortcuts-Dark` and `KS-Motion` (canvas v226). Test cases are listed
below with the `SK-` prefix; they move to `docs/tests/shortcuts.md` when this is built.

Rohit's one condition on approval (12 Nov): the keys must be reliable, and work whenever they are pressed, even when
Tudu is not in front and only the menu bar icon is running. The section [Working from the menu bar](#working-from-the-menu-bar)
is about that.

## Why

- #60: the only way to change space is the list under the space's name. Rohit wants keys for it, All spaces most of all.
- #57: ⌘⇧N (New task) and ⌥⌘N (New note) are constants in `apps/desktop/src-tauri/src/track.rs`. If another app holds
  either one, or you just want other keys, there is no way out.

## What changes for the person

1. **Settings › Shortcuts**, under You after This Mac (web and Mac app; not listed on phones). Two groups:
   - **From anywhere** (Mac app only): New task (⇧⌘N) and New note (⌥⌘N). They work in every app, with Tudu's window
     closed, and when Tudu runs only in the menu bar.
   - **In Tudu** (Mac app and web): All spaces (⌃0) and A space (⌃1 to ⌃9, the space's place in your list: All spaces
     is not counted, so ⌃1 is the first space after it, Personal). On the web outside macOS they read Alt+0 and Alt+1
     to Alt+9.
   - The web shows only In Tudu, with the line "New task and New note from anywhere come with the Mac app."
2. **Changing one**: click the keys, press the new ones. It saves the moment the last key lands. Esc, Tab or a click
   elsewhere keeps the old keys. Delete or Backspace turns it off (the row says Off). A back arrow appears only on a
   row you changed and restores the usual keys. The space row listens for modifiers plus any digit and keeps the
   modifiers for all nine.
3. **What is refused**, each as a red line under the row's name, the field still listening:
   - no ⌘, ⌃ or ⌥ ("Add ⌘, ⌃ or ⌥, so it can't go off while you type.");
   - keys another Tudu shortcut has ("⌥⌘N is New note. Pick other keys."), including any digit under the space keys;
   - keys Tudu or macOS keep (⌘Q, ⌘W, ⌘C, ⌘V, ⌘X, ⌘Z, ⌘A, ⌘, , ⌘Space, ⌘Tab);
   - From anywhere only: macOS or another app holds them. The old keys stay on and the line says "macOS or another app
     already uses ⌥Space. Still ⇧⌘N."
4. **Other states**: loading (the From anywhere fields shimmer until the Mac app answers), couldn't save (the keys
   that still work come back), couldn't read the Mac app's shortcuts (a banner with Try again), stopped working
   (another app took the keys after Tudu set them: the row says so and asks for other keys).
5. **Switching spaces by key** keeps the page you are on (Today, Week, Backlog). A page the next space doesn't have
   lands on Today, as picking from the list does. The keys work while you type (writing line, a title, a note) and
   never leave a character behind. The key of the space you are in does nothing. While a dialog, Quick Add, Search,
   Settings or any other layer is open, the space keys are ignored. With one space only there is no All spaces and
   ⌃0 does nothing. A tenth space has no key.
6. **The space list** shows each space's key at the row's end, in the quiet mono type menus use, before "5 new" and the
   tick. A shortcut that is off shows no key.
7. **The menu bar sheet**: New task and New note tooltips (and `aria-keyshortcuts`) show the keys you set; one that is
   off or not working shows the name alone (New note already does this).
8. **Modifier order follows macOS** everywhere a shortcut is shown: ⌃ ⌥ ⇧ ⌘. New task now reads **⇧⌘N** (it read
   ⌘⇧N). This is a design change: every canvas board and DS piece that draws ⌘⇧N is redrawn in the same PR.
9. **Per computer.** The Mac app keeps its shortcuts on the Mac, a browser keeps its own. Nothing syncs to the server.
10. **Motion** (KS-Motion): the listening ring breathes (1.8s); each held modifier pops in (140ms ease-settle); saving
    pops the caps in left to right (180ms, 35ms apart) and the tick opens its space and draws in, holds 1.5s, then
    fades and folds shut (220ms ease-leave) so the caps glide back; error lines fade up (tp-label-in); the back arrow
    fades up (160ms). Switching by key reuses the switcher's motion (tick 150ms, name tp-ssw-swap 240ms, page 280ms).
    Reduce motion: fades only.

## Working from the menu bar

The From anywhere keys are system-wide hot keys (`tauri-plugin-global-shortcut`, Carbon `RegisterEventHotKey` on
macOS). macOS delivers those to the app whatever its activation policy, so they fire while Tudu is in the background,
with no window and no Dock icon. Today's code already relies on that. What makes them unreliable after this change is
everything around the hot key, so the build covers each of these:

1. **The keys live in Rust, not in the page.** The bindings are saved by the Mac app in `shortcuts.json` in its config
   folder and registered in `setup`, before any webview loads. A launch at login with no window gets your keys
   straight away. `localStorage` is never the source for From anywhere keys, because the page may not have loaded yet
   (or ever, at login).
2. **The handler reads the current bindings.** `pressed()` today compares against the `NOTES` constant. It will look
   up the pressed shortcut in the live bindings (a `Mutex` in managed state), so a rebind takes effect at once with no
   restart, and an old shortcut that is still finishing its key-up can't fire the wrong action.
3. **Rebinding never leaves you with nothing.** Register the new keys first; only if that works, unregister the old
   ones and write the file. If registering fails, the old keys stay registered and the row says why. If writing the
   file fails, the registration is rolled back so what runs and what is saved agree.
4. **A press before the page is ready still counts.** `summon` and `notes::open` decide on `seen.signed_in`, which the
   hidden main window reports after it loads. At login, a press in the first seconds currently finds `false` and opens
   the desk on Sign in. `signed_in` becomes `Option<bool>` (`None` until the page reports), and a press while it is
   `None` is held and run when the report arrives (or after 8 seconds, falling back to today's behaviour). (Built
   without the planned `state.json` copy of the last value: the held press already covers a relaunch.)
5. **It checks itself.** On launch, on wake (the existing `updates::watch_wake` hook) and when Settings opens, the app
   asks `is_registered` for each binding. One that is no longer registered is registered again; if that fails the row
   shows "stopped working" and the menu bar drops it from the tooltip.
6. **The windows they open are ready.** The floating Quick Add and the note window already exist hidden from launch
   and are shown with `focus_floating` / `place_window`, which work while Tudu is an accessory app (the C11 and C22
   desktop tests already summon with the desk closed). No change there, but the new tests press with only the menu
   bar running (see `SK-D03`, `SK-D04`).

What no app can get past: while another app has **Secure Keyboard Entry** on (Terminal's option, password fields in
some apps), macOS delivers no hot keys to anyone. The keys work again once that field loses focus.

**The In Tudu keys (spaces) are not system-wide**, as designed: ⌃1 to ⌃9 taken from every app would break other apps
(terminals, editors, Mission Control's own ⌃number keys when they are on). They work whenever a Tudu window is in
front. If you want a space key from anywhere too, that is a follow-up: a third From anywhere row that brings the desk
forward on that space.

## How

### Shared logic (`packages/core/src/shortcuts.ts`, new)

- Types: `Shortcut = { mods: Mod[]; key: string }` with `Mod = 'ctrl' | 'alt' | 'shift' | 'meta'`;
  `ShortcutId = 'newTask' | 'newNote' | 'allSpaces' | 'space'` (`space` has `key: 'digit'`).
- `DEFAULTS` per platform (Mac: ⌃0 / ⌃digit; elsewhere Alt).
- `fromEvent(e)`: reads `e.code` (layout independent: `KeyN`, `Digit1`, `Numpad1`, `Space`, arrows, F-keys), so a
  French or Dvorak keyboard still gets the physical key.
- `format(s, platform)`: `⇧⌘N` in macOS order on a Mac, `Ctrl+Shift+N` elsewhere; `aria(s)`: `Shift+Meta+N`.
- `check(id, s, all)`: the refusal reasons above, as data (`{ kind: 'modifier' | 'taken' | 'reserved', by? }`).
- `toAccelerator(s)` / `fromAccelerator(str)`: to and from the plugin's `CommandOrControl+Shift+N` form.
- `spaceForDigit(list, n)`: the space at place `n` in `switchSpaces` order, All spaces excluded; `0` is All spaces when
  it exists.

### Web (`apps/web`, `packages/ui`)

- `packages/ui`: `Keys` (one `kbd` cap per key, `.tp-keys`) and `ShortcutField` (`.tp-kf`, states `tp-rec`, `tp-bad`,
  `tp-saved`, the caret, the tick with its in and out animation), ported from the canvas board. Both go into the DS
  artifact too. `SpaceSwitch` gets an optional `hint` per space (`.tp-sswl-k`).
- `Settings.tsx`: new section `keys` ("Shortcuts", keyboard icon) with props
  `shortcuts?: { global?: GlobalRows | 'loading' | 'error'; app: AppRows; onSet; onReset; onRetry }`. Not listed on
  phones.
- `apps/web/src/app/shortcuts.tsx` (new): `useShortcuts()` store. In Tudu keys in `localStorage` (`tudu.shortcuts`,
  read in try/catch, defaults if missing or broken). In the Mac app the From anywhere rows go through the bridge.
- `AppShell.tsx`: one `keydown` listener on `window` in the capture phase, added once per main window. It acts only
  when no layer is open (Radix dialogs, Quick Add, Search, Settings: the same open-layer check Esc handling uses),
  calls `preventDefault` so no character is typed, and navigates to the same route under the new space, or `/` when
  the space has no such page. It ignores repeats (`e.repeat`).
- `MenuBarPage.tsx` / `MenuBarSheet.tsx`: tooltips and `aria-keyshortcuts` from the live bindings; the label format
  changes to macOS order.
- `desktop.ts`: `shortcuts()`, `setShortcut(id, accel | null)`, and a `shortcuts:changed` event, in the bridge and its
  test fake. `app_info` keeps `shortcut`/`noteShortcut` for older pages, now formatted from the live bindings.

### Mac app (`apps/desktop/src-tauri`)

- `shortcuts.rs` (new): `Bindings { new_task: Option<String>, new_note: Option<String> }` (accelerators), load and
  save `shortcuts.json` (a missing or broken file means the defaults), `register_all` at setup, `rebind(id, next)`
  with the order in step 3, `check()` for step 5, and `RESERVED` (⌘Q, ⌘W, ⌘, ...).
- Commands: `shortcuts_get() -> [{ id, accelerator, label, registered, error? }]`, `shortcuts_set(id, accelerator?)`
  (validates again in Rust: the page is not trusted to have checked), and the `shortcuts:changed` event to every
  window so the menu bar sheet updates.
- `lib.rs`: setup registers from `shortcuts.json`; `pressed()` looks the shortcut up in the bindings.
- `bridge.rs`: `Seen.signed_in: Option<bool>`, the held press (step 4).
- `track.rs`: `SUMMON`/`NOTES` stay as the defaults; labels in macOS order (`⇧⌘N`).
- `control.rs` (test build only): `/state` lists every binding with `registered`; `/act` gains `press` (with
  `accelerator`: goes through the same `pressed()` a real key reaches) and `TUDU_TEST_TAKEN` (accelerators the test
  build pretends another app holds, so the refusal path can run on CI).

### Design system and canvas

In the same PR: `Keys`, `ShortcutField` and the `.tp-sswl-k` hint into the Tudu Paper DS artifact (bundle.js,
bundle.css, preview), and every board that shows ⌘⇧N redrawn as ⇧⌘N (`K-MenuBar`, `K-Proto`, `Q-Floating`, `P-MenuBar`
and their dark twins; the list is checked with a search over the canvas files before publishing). The `KS-` draft
boards lose their Draft label once the PR merges.

## Test scenarios

Unit, API and desktop tests run on PR CI (and Actions › Flake check for repeats), not on Rohit's Mac.

### Unit (vitest)

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

### Unit (`apps/desktop/src-tauri`, Rust, on the macOS CI runner)

| ID     | Case                                                                                                                      |
| ------ | ------------------------------------------------------------------------------------------------------------------------- |
| SK-R01 | `shortcuts.json` missing, empty or broken gives the defaults; a saved file loads; Off is kept as Off                      |
| SK-R02 | `rebind` registers the new keys before dropping the old; a refused registration keeps the old ones and returns the reason |
| SK-R03 | A failed write rolls the registration back                                                                                |
| SK-R04 | Reserved and clashing accelerators are refused in Rust too                                                                |
| SK-R05 | `pressed()` routes by the live bindings: after a rebind the new keys open New task, the old ones do nothing               |
| SK-R06 | A press while `signed_in` is unknown is held and runs on the report; after 8 seconds it falls back                        |
| SK-R07 | Labels in macOS order: `⇧⌘N`, `⌥⌘N`                                                                                       |

### End-to-end, web (Playwright, `packages/e2e/tests/shortcuts/`)

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

### Desktop (the real Tudu Test app, `packages/e2e/mac/tests/`)

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

`press` goes through the same `pressed()` a key press reaches, but it is not the key press itself. As a first step of
the build, a spike checks whether the macOS runner lets a test post a real key event (`CGEventPost`, which needs
Accessibility permission for the runner's shell). If it does, `SK-D01`, `SK-D03` and `SK-D04` also press the real keys.
If it doesn't, the PR says so and these stay at the handler level.

## Risks

- Some browsers keep keys for themselves before the page sees them (⌘N, ⌘T, ⌘W in Chrome). On the web the In Tudu
  keys default to ⌃ / Alt digits, which browsers leave alone; Settings shows the same refusal if a browser swallows a
  choice (nothing arrives while listening).
- Mission Control's "Switch to Desktop N" uses ⌃1 to ⌃9 when it is turned on (off by default). Then macOS takes those
  keys first; you can pick other modifiers in Settings.
- Changing the shown order to ⇧⌘N touches every board and doc that shows ⌘⇧N. The PR lists each one it changed.
