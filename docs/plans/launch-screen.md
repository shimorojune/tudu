# Opening Tudu in your theme, with the mark while it loads; What's new opens the release

Status: proposal, awaiting Rohit's approval. Canvas: approved 27 Oct 2026 (boards `K-Launch` and `K-Launch-Dark`,
"Opening Tudu", on the Menu bar & This Mac page, v139).

## What Rohit reported (26 Oct 2026)

- **13.** The app update's "What's new" button does nothing.
- **14.** When the app opens there is a long stretch of a blank dark or light page. It starts dark and then switches to
  light, which feels odd. Could it show the logo animating instead?
- **15** (owned by the "Fix fuzzy text, small icons, white header icons" thread, fixed here). In light mode the window's
  traffic lights are pure white. That thread found the same root cause and agreed this change owns the native window
  theme for all four windows.

## Why it happens

**What's new.** `InboxItem` draws What's new in the reading pane and calls `onOpen(it)`. `InboxPage.onOpen` sees an
app item, finds it is already the picked one, and returns (`apps/web/src/routes/inbox/InboxPage.tsx:360`). So the
button re-selects the item you're reading. `C11-E02` even asserts "What's new keeps you on the item". The notes are
already drawn in the item, so there is nothing more to show in place.

**Startup.** On the Mac a launch passes through four blank stages:

1. `windows.rs` builds the desk with no theme and no background colour, so the native window paints in the macOS
   appearance (dark on Rohit's Mac).
2. The bundled loader (`apps/desktop/shell/index.html`, the `tauri://` origin) picks its colours by
   `prefers-color-scheme`, which follows macOS, because the Tudu choice (`tudu.theme`) lives in `localStorage` on the
   web origin and the loader can't read it. It shows nothing while `loader.js` checks the site answers.
3. It moves to the web app. `index.html` paints the saved theme before first paint (it already does this), so the
   switch to light happens here, on a blank page.
4. The app route's `beforeLoad` awaits `loadMe` before anything renders, with no pending UI. That's blank for the JS
   download plus the `/me` round trip.

The same missing native theme is why the traffic lights are white in Light mode on a dark Mac. The window's
appearance is dark even though the page is light. The floating Quick Add, the menu bar sheet and the note window are
transparent panels, but their native controls and vibrancy follow the same wrong appearance. The note window's own
theme bug (item 4, owned by the note window thread) builds on this command.

## What changes for the person

As drawn on the canvas:

- Every Tudu window follows the theme picked in Settings › Appearance from its first frame: Light, Dark, or System
  (follows macOS). The traffic lights match.
- If Tudu isn't ready within 300ms, the stacked ink tick appears at the centre, a little above the middle, at 56px, on
  the page's background:
  - the box pops from 40% with a springy overshoot (112%, 95%, 100%) over 480ms;
  - the ember sheet is flicked in from the top right, lands past −10° and wobbles back to it (480ms from 120ms);
  - the ink tick draws left to right in 310ms as the box settles, and lands with the day-complete spark burst;
  - while waiting, the mark hops every 1.25s: squash, a 14px jump with a stretch, squash on landing with a small puff
    of sparks, the sheet flapping with the jump;
  - when the app is ready, the mark swells to 118% as it fades out in 180ms, and the app fades up 4px in 220ms.
- A fast open (under 300ms) shows only the right background, never the mark.
- After 6s, "Still opening Tudu…" fades up under the mark.
- Mac app offline: the loader's offline page now draws in your theme. The mark stays where it was and stops
  hopping, and "You're offline." with Try again fades up beneath it.
- Less motion (Settings › Less motion, or macOS Reduce motion): there's no pop, flick, hop or sparks. The mark fades in
  over 120ms and holds still.
- The web gets the same mark and timing in place of its blank wait. Its theme was already right.
- What's new opens that version's release on GitHub in the default browser: the `tudu-<version>` tag, or the rolling
  staging release for Tudu Staging. It gains a 13px trailing up-right arrow, the same icon as the Settings version
  line, which nudges 1px up and right on hover. The item stays selected and read. There's no loading state.

## Desktop (apps/desktop/src-tauri)

- **New command `set_appearance { theme: "light" | "dark" | "system", lessMotion: bool }`** in `bridge.rs`, allowed for
  the `web` capability (`allow-set-appearance`, in `tauri.conf.json` and `permissions/`).
  - It saves both values in `this-mac.json`. `background.rs`'s `Prefs` gains `theme` and `less_motion`, each
    `#[serde(default)]`, so an older file still reads, and an unknown theme counts as `system`.
  - It calls `WebviewWindow::set_theme` on main, floating, menubar and note: `Some(Light)`, `Some(Dark)`, or `None` for
    System, so a System choice keeps following macOS live.
  - It sets the desk's background colour (`#eeece6` light, `#111211` dark, the Paper `--background`), resolving System
    from `window.theme()`. The three transparent panels keep their transparent background.
  - Saving does nothing when the values haven't changed, so the web can call it on every load.
- **At build**, `windows::builder` reads the saved appearance:
  - `.theme(...)` on every window, and `.background_color(...)` on the desk only;
  - the initialization script also sets `window.__TUDU_LOOK__ = { theme, lessMotion, launchedAt }`, where `launchedAt`
    is the epoch ms when the app started. Every page of every window gets it, so the loader and the web page can
    agree on how long the launch has been running.
  - With nothing saved yet (first launch, or an app updated from before this change), the theme is System. That is
    what Settings › Appearance defaults to anyway, and the first web load sends the real choice.
- **`control.rs`** (Tudu Test only): `window` info gains `theme` (the NSWindow appearance name) and
  `background`, and there's a new `appearance` read of the saved prefs, for the Mac suite.

## Loader (apps/desktop/shell)

- `index.html` gets the launch markup: the mark (the same SVG geometry as `Logo`), a sparks span, the slow line, and the
  offline block beneath them. They live in one centred column, so offline only fades text in under the mark that's
  already there.
- `shell.css` gets `[data-theme]` blocks for both palettes, keeping `prefers-color-scheme` only as the fallback when
  no theme was injected. It also gets the launch keyframes.
- A two-line inline script at the top of `<head>` sets `data-theme` from `__TUDU_LOOK__` (System resolves from
  `matchMedia`, which now follows the window's appearance too) and `data-motion="less"`. It runs before first paint.
- `loader.js` is unchanged in flow: it probes, then `location.replace`s to the web. Offline now adds `.offline` to
  the column (stops the hop, fades the text in) instead of unhiding a separate `<main>`.

## Web (apps/web) and kit (packages/ui)

- **Boot screen.** `apps/web/index.html` gets `<div id="boot" role="status" aria-label="Opening Tudu">` beside
  `#root`, with the same markup and an inline `<style>` with the same keyframes as the loader.
  - The existing inline theme script also reads `__TUDU_LOOK__.launchedAt`. If more than 300ms has already passed
    (we came from the loader with the mark already showing), it adds `.held`, which skips the delay and the intro and
    starts in the hopping pose, so the mark doesn't redraw across the document swap.
  - The slow line's 6s delay is also counted from `launchedAt`.
- **Dismissal.** `main.tsx` subscribes once to the router's first `onResolved`, so a redirect to Sign in counts too.
  It adds `.leaving` to `#boot` (the swell and fade) and removes it on `animationend`, with a 400ms fallback timer.
  `#root` fades up with the existing `tp-fade-in`. If the boot screen was never shown (under 300ms), it's removed at
  once with no animation.
- **One source for the keyframes.** The CSS is kept twice, in the loader and in the web `index.html`, because the
  loader can't fetch from the web before it knows the web is reachable. A unit test (C11-U19) asserts the two blocks
  are identical, so they can't drift.
- **Sending the choice to the app.** `DesktopHost` (the desk, Quick Add, the sheet and the note window all mount the
  bridge) calls `bridge.setAppearance({ theme, lessMotion })` once on mount and again on every
  `onThemeChoice` / `syncThemeChoice` and Less motion change.
  - `packages/ui/src/lib/theme.ts` gets a `onThemeChange` hook that fires after both a pick and a sync, so the
    bridge hears changes made in another window too.
  - `paintTheme`'s signature stays as it is (agreed with the other thread).
  - `setAppearance` goes through `quiet(...)`, so an app from before this change (no command) just ignores it.
- **What's new.**
  - `InboxItem` gains `onNotes?: (it) => void`. When it's set, What's new calls it and draws the trailing `external`
    icon; when it isn't, there's no What's new button at all. A button that does nothing is the bug.
  - `InboxPage` passes `onNotes` for app items. It opens `releaseUrl(info.track, version)` with `bridge.openExternal`,
    using the app's own track from `app_info` (as `appVersion` does).
  - With no URL (Tudu Test, dev), What's new isn't drawn.
  - New CSS: `.tp-btn-label` becomes `inline-flex; align-items: center; gap: 4px` when it holds an icon after the text,
    plus the hover nudge (`transform: translate(1px, -1px)`, `--dur-menu`, the change ease; no nudge under Less motion).
- **Design system and canvas parity** (same PR):
  - DS `InboxItem` in `bundle.js` gets `onNotes` and the arrow;
  - the canvas DS bundle gets the same;
  - the DS README gets a "Launch" entry describing the mark's motion and timings, since it's static HTML, not a React
    component;
  - `I-All-States` gets the arrow on its app item;
  - the canvas `K-Launch` boards already show the final design.

## Test scenarios

IDs continue chunk 11's series in `docs/tests/chunk-11.md`: U17, E18 and D17 (the last ones taken are U16, E17 and
D16). If another thread lands chunk 11 IDs first, these renumber upward. Each ID goes in its test's name so
`pnpm test:status` finds it. Per the project rule, every suite runs on Rohit's Mac.

### Unit (vitest, cargo)

| ID      | Where                           | Case                                                                                                                                                                                                                           |
| ------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| C11-U17 | desktop `background.rs` (cargo) | Prefs round-trip: theme and less motion save and load; an old file with only `dock` reads as System, no less motion, and keeps its dock; an unknown theme reads as System; a torn file reads as defaults                       |
| C11-U18 | desktop `bridge.rs` (cargo)     | The appearance mapping: light, dark and system map to `Some(Light)`, `Some(Dark)` and `None`; the desk's background colour for light and dark, and system resolved through the window's theme; an unchanged value doesn't save |
| C11-U19 | web `boot.test.ts`              | The launch keyframes and markup in `apps/web/index.html` and `apps/desktop/shell/index.html` + `shell.css` are identical (extracted between the `/* launch */` markers)                                                        |
| C11-U20 | web `boot.test.ts` (jsdom)      | The boot script: under 300ms since `launchedAt` no `.held`; over 300ms `.held`; no `__TUDU_LOOK__` (the web) uses the page's own start; Less motion from `tudu.motion` sets `data-motion`                                      |
| C11-U21 | web `boot.test.ts`              | Dismissal: the first `onResolved` adds `.leaving` and removes `#boot` on `animationend`; without the event it's gone by 400ms; a boot screen never shown is removed at once; a second `onResolved` does nothing                |
| C11-U22 | ui `theme.test.ts`              | `onThemeChange` fires for a pick and for a sync from another window, never twice for one change, and stops when unsubscribed                                                                                                   |
| C11-U23 | web `desktop.test.tsx`          | `DesktopHost` sends `setAppearance` on mount with the stored choice and Less motion, again on a pick, a storage sync and a Less motion change; an app without the command (rejects) is ignored, no error toast                 |
| C11-U24 | ui `InboxItem.test.tsx`         | An app item with `onNotes`: What's new has the trailing arrow and calls `onNotes` with the item; without `onNotes` there's no What's new; Restart to update is unchanged                                                       |
| C11-U25 | web `InboxPage` test, core      | `onNotes` opens `releaseUrl`: production `…/releases/tag/tudu-0.38.0`, staging `…/releases#release-staging`; test and dev give no button; the item stays picked and read                                                       |

### End to end, web against the app fake (`packages/e2e/tests/desktop`, plus the web group)

| ID      | Case                                                                                                                                                                                                               |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| C11-E02 | Changed: in the reading pane, What's new (with its arrow) asks the app fake to open `…/releases/tag/tudu-<version>`, and the item stays picked and read. This replaces "keeps you on the item"                     |
| C11-E18 | The app fake records `set_appearance`: one call on load with the stored choice; picking Dark in Settings sends `dark`; System sends `system`; Less motion on sends `lessMotion: true`; the floating page sends too |
| C11-E19 | Web boot, slow: with `/me` held for 2s, `#boot` shows the mark after 300ms (not before), it leaves with `.leaving` once the app renders, and `#boot` is gone; in dark the mark draws in the dark palette           |
| C11-E20 | Web boot, fast: with nothing held, `#boot` never becomes visible and is removed; with `/me` held 7s, "Still opening Tudu…" shows; Less motion: the mark has no running animations besides the fade                 |
| C11-E21 | Web boot, signed out: the mark gives way to Sign in the same way; a held page with `__TUDU_LOOK__.launchedAt` 1s ago starts `.held` (no intro)                                                                     |
| C11-E22 | Dark: What's new with its arrow in the reading pane, and the boot mark mid-wait                                                                                                                                    |

### Real app (`pnpm e2e:mac`, Tudu Test)

| ID      | Case                                                                                                                                                                                                                                                             |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C11-D17 | Pick Light with macOS in dark: all four windows report the Light appearance (the traffic lights follow) and the desk's background is `#eeece6`; Dark gives Dark and `#111211`; System gives no override and follows macOS                                        |
| C11-D18 | Across launches: quit with Light picked on a dark Mac and launch: the desk is built Light with the light background before any page loads, and the loader page reports `data-theme="light"` and the light background on its first read                           |
| C11-D19 | The web held (the test web server delays `/`): the loader shows the mark in the picked theme after 300ms; once the web answers the page starts `.held`, then the app; with the web down the offline text fades in under the same mark, Try again reaches the app |
| C11-D20 | What's new on the real app's Inbox item hands `…/releases/tag/tudu-<next>` to the default browser (the opener the suite already records, as C11-D10) and the window stays put                                                                                    |

The existing C11-D11 ("the dark theme you picked holds") keeps its ID. It now also implies D18's native side.

Not automated: how the motion feels at 60fps, and macOS Reduce motion as a system setting (the suite drives Tudu's
Less motion instead).

## Rollout

- The web half (boot mark, What's new, sending the choice) ships with staging on merge.
- The native half (window theme, the loader) needs the next app update. An installed app without `set_appearance`
  keeps today's startup, and the web just ignores the missing command. Staging updates work again since PR #34 fixed
  the signing key.

## Out of scope

- Splash for the menu bar sheet, Quick Add and the note window: they're built hidden and shown when ready, so they
  only get the window theme.
- Speeding up the load itself (code splitting, caching `/me`). That's worth doing, but it's a separate change.
- Phone home-screen launch images.
