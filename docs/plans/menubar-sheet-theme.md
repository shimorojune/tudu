# Menu bar sheet keeps an old theme (#74)

Status: approved by Rohit 11 Nov 2026 (Less motion included); implemented. Canvas: not applicable (no design change;
the sheet already has light and dark boards, K-MenuBar and its dark twin, and the code already draws both). Skipped
with Rohit's OK (5 Nov).

## The report

Production 0.41.1, Mac app (issue #74): "App is in dark mode but mac title bar widget is in light mode. It was dark
mode before, then I switched the app to light mode, but it remained in dark mode, and then I switched app into dark
mode again and check the widget is in light mode now."

## What is actually wrong

The menu bar sheet's page never listens for a theme change.

- The `menubar` window is built once at launch and kept alive, hidden, for the whole session. `MenuBarPage`
  (`apps/web/src/routes/menubar/MenuBarPage.tsx`) mounts neither `useTheme()` nor `syncThemeChoice()`. So the only
  thing that ever paints its theme is the boot script in `apps/web/index.html`, which reads `tudu.theme` **once, when
  the page loads**.
- A pick on the desk (`setThemeChoice` in `packages/ui/src/lib/theme.ts`) writes `tudu.theme` and fires a `storage`
  event in the other windows. Nothing in the menu bar page listens for it. Nothing re-reads storage on
  `menubar:shown` either.
- The other two hidden windows already handle this. `QuickAddPage` mounts `useTheme()` and calls `syncThemeChoice()`
  on `floating:shown`. `NoteWindowPage` does the same on `note:open` (fixed in `note-window-fixes.md`, C22-U64). The
  menu bar page was left out.
- System is also broken. With the theme on System, the native side (`look.rs`, `set_theme(None)`) lets the window
  follow macOS. But without `useTheme`'s `prefers-color-scheme` watcher the page never repaints when macOS flips.

So the sheet shows whatever theme was stored the last time its page loaded. The "one step behind" pattern in the
report means the page reloaded at some point between Rohit's two switches. That can happen when WebKit restarts the
hidden webview's content process, or when the loader swaps back after a network drop. I can't point to the exact reload
from the code. The fix doesn't depend on it, because the page will follow the choice whether or not it reloads.

**Same gap, Less motion (in scope unless you say otherwise):** Settings › Appearance › Less motion has the same
problem in **all three** hidden windows: the menu bar sheet, floating Quick Add and the note window. `setLessMotion`
only tells listeners in its own page. No `storage` listener exists for `tudu.motion`, so the other windows keep the
motion setting they loaded with. It's a few lines, it's the same mechanism, and the fix belongs in the same place. If you'd
rather keep this PR to #74 only, I'll drop it and file it as its own issue.

## The change

1. **`packages/ui/src/lib/theme.ts`**
   - Add `syncLessMotion()`: read `tudu.motion`, and if it differs from what's painted, `paintMotion` and tell
     `motionListeners`.
   - `useLessMotion()` and a new `useLook()` listen for the `storage` event on `tudu.motion` (and `null`, which
     means storage was cleared), the same way `useTheme` already does for `tudu.theme`.
   - Add `syncLook()` = `syncThemeChoice()` + `syncLessMotion()`, for the "the window was just shown" moments.
   - `useLook()` = `useTheme()` plus the motion listener, for pages that need to follow both and render no
     Appearance controls themselves.
2. **`apps/web/src/routes/menubar/MenuBarPage.tsx`**
   - Mount `useLook()` at the top of `MenuBarPage`. This covers the `storage` event while the sheet exists and the
     System watcher.
   - On `menubar:shown`, call `syncLook()` before `setShown(true)`, as Quick Add does. A pick made while the window was
     hidden (if WebKit held the event back) is painted before the sheet's 160ms drop-in finishes. The sheet starts at
     opacity 0, so there is no visible wrong-theme frame.
3. **`QuickAddPage.tsx`, `NoteWindowPage.tsx`**: swap `useTheme()` / `syncThemeChoice()` for `useLook()` /
   `syncLook()` (Quick Add still reads `theme` from it for `<Desk theme>`).
4. Nothing native changes. `keepAppearance` stays desk-only (`DesktopHost`, `main`). The menu bar page must **not**
   call `setAppearance`, and C11-E18 already guards that for the floating page.

No design change, no copy change, no migration.

## Test scenarios

All run on Rohit's Mac (`pnpm test`, `pnpm e2e`, and the desktop group).

### New

- **C20-U21** `MenuBarPage` (web unit, `MenuBarPage.test.tsx`, desktop fake):
  - Starts light. Write `tudu.theme = dark` and dispatch the `storage` event: `html.dark` is set.
  - With the sheet hidden (`menubar:hidden`), store `light` without an event, then emit `menubar:shown`: `html.dark`
    is gone.
  - Store `system` with the fake media query dark, then emit `menubar:shown`: dark. Flip the media query to light:
    light, with no event from the desk.
  - It never calls `setAppearance`.
- **C20-U22** `MenuBarPage` Less motion: store `tudu.motion = less` and dispatch `storage`: `html[data-motion=less]`.
  Remove it while hidden, then emit `menubar:shown`: the attribute is gone.
- **C11-U44** `theme.ts` (`theme.test.ts`):
  - `syncLessMotion()` paints and notifies only on a real change (a second call with the same value notifies no one).
  - A `storage` event with `key: null` re-reads both theme and motion.
  - `syncLook()` does both.
- **C20-E21** e2e (`menubar.spec.ts`, browser with the desktop fake, two pages sharing storage like the app's
  windows): open the desk and the menu bar page side by side. Pick Dark on the desk: the sheet turns dark (`html.dark`,
  sheet background `--card` dark value) without a reload. Hide the sheet, pick Light, show it: light. Pick System with
  the page's colour scheme emulated dark: dark.
- **C20-E22** e2e: turn Less motion on on the desk. The menu bar page and the floating Quick Add page get
  `data-motion="less"` without a reload.
- **C20-D09** desktop (real Tauri app, desktop group): launch light, open the sheet, close it. Pick Dark in Settings
  on the desk, open the sheet again: the sheet's `html` has `dark`. Pick Light, then Dark again (Rohit's exact
  sequence): after each pick the sheet matches the desk. This is the regression test for #74.

### Updated

- **C22-U64** (`NoteWindowPage.test.tsx`): also covers Less motion through `syncLook()` on `note:open` (one extra
  assertion; the theme part is unchanged).
- **Quick Add** `QuickAddPage.test.tsx`, the existing `floating:shown` theme test: add the motion assertion.
- **docs/tests/chunk-20.md** and **chunk-11.md**: list C20-U21, U22, E21, E22, D09 and C11-U44.

### Manual (Rohit, on the Mac build)

- **MC-T01** Rohit's sequence from #74: Dark → open sheet → Light → open sheet → Dark → open sheet. The sheet matches
  every time.
- **MC-T02** System + flip macOS appearance in System Settings while the sheet is closed, then open it: it matches
  macOS.
- **MC-T03** Less motion on, open the sheet: it appears without the drop-in motion.

## Risks

- The `storage` event may not reach a hidden WKWebView until it's shown. That's why `syncLook()` on
  `menubar:shown` is there too. Both paths end in the same paint, and `syncThemeChoice` does nothing when there's
  no change, so the two can't fight.
- Nothing else in the menu bar page reads the theme, so there's no re-render cost beyond one state update per pick.
