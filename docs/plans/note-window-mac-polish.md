# Mac note window frame and menu bar sheet buttons

Status: proposal, awaiting Rohit's approval (26 Oct 2026). Reported by Rohit on staging 0.38.1-staging.28, right
after the signing-key fix (PR #34) let the Mac app update.

## Why

1. **Black frame around the note window (Mac).** The note window is a clear, frameless Tauri window. Its page pads
   the window 10px (`.app-note-window.app-note-mac`) so the window's own shadow can show. But nothing clears the
   page behind it: `html` and `body` keep the paper background. Quick Add (`html[data-app='floating']`) and the menu
   bar sheet (`html[data-app='menubar']`) both clear theirs; the note window (`data-app='note'`, set in
   `apps/web/src/main.tsx`) was missed. So the 10px shows as a dark slab in dark mode.
2. **Menu bar sheet buttons don't fit (Mac).** The sheet is 360px wide. Its foot draws
   `New task ⌘⇧N · New note · Open Tudu Staging · ⋯`, which is wider than 360px, so the buttons squash and clip
   ("pen Tudu Stagin"). The approved canvas (P-MenuBar, K-MenuBar, v108) draws `New task · New note · Open Tudu · ⋯`:
   no shortcut hint (dropped to fit when New note was added) and "Open Tudu" whatever the track. The app drifted from
   the design.

## Design

Neither change alters the approved design: the app catches up to the canvas. So no new canvas draft (Rohit to
confirm). Light and dark mode both get the same fix.

## The change

1. `apps/web/src/routes/notebook/notebook.css`: clear the page in the Mac note window, the same way Quick Add and
   the sheet do:
   ```css
   html[data-app='note'],
   html[data-app='note'] body {
     background: transparent !important;
   }
   ```
2. `packages/ui/src/components/MenuBarSheet.tsx` foot, matching P-MenuBar:
   - New task loses the `⌘⇧N` hint (`shortcut` prop and `.tp-mb-kbd` removed).
   - The open button always says **Open Tudu**. Its accessible name stays `Open <app name>` (`aria-label`), so
     Staging and Test stay distinct for VoiceOver and for the Mac tests that find it by name.
   - Foot buttons get `white-space: nowrap; flex: none`, so a longer word can never squash or clip them again.

## Tests

| ID      | Where                                 | What                                                                                                                            |
| ------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| C20-U02 | ui `MenuBarSheet.test.tsx` (update)   | The foot shows New task (no `⌘⇧N`), New note, the text "Open Tudu" for appName "Tudu Staging", named "Open Tudu Staging", and ⋯ |
| C20-U07 | ui `MenuBarSheet.test.tsx` (new)      | Foot buttons are `nowrap` and don't shrink (class check), so nothing clips at 360px                                             |
| C22-D07 | e2e mac `notebook.spec.ts` (new)      | Opened note window: `html` and `body` backgrounds are transparent; the window section is the only painted surface               |
| C20-D02 | e2e mac `desktop.spec.ts` (unchanged) | Still finds the sheet's open button by its name, "Open Tudu Test"                                                               |

All run on Rohit's Mac (`pnpm test`, `pnpm e2e:mac`), per the project rule.
