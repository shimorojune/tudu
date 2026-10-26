# Mac note window frame and menu bar sheet buttons

Status: proposal, awaiting Rohit's approval (26 Oct 2026). Canvas approved 26 Oct 2026 (v125: P-MenuBar(+Dark),
K-MenuBar(+Dark), K-Proto, K-Updates(+Dark)). Reported by Rohit on staging 0.38.1-staging.28, right after the
signing-key fix (PR #34) let the Mac app update.

## Why

1. **Black frame around the note window (Mac).** The note window is a clear, frameless Tauri window. Its page pads
   the window 10px (`.app-note-window.app-note-mac`) so the window's own shadow can show. But nothing clears the
   page behind it: `html` and `body` keep the paper background. Quick Add (`html[data-app='floating']`) and the menu
   bar sheet (`html[data-app='menubar']`) both clear theirs; the note window (`data-app='note'`, set in
   `apps/web/src/main.tsx`) was missed. So the 10px shows as a dark slab in dark mode.
2. **Menu bar sheet buttons don't fit (Mac).** The sheet is 360px wide. Its foot draws
   `New task ⌘⇧N · New note · Open Tudu Staging · ⋯` as text buttons, which is wider than 360px, so they squash and
   clip ("pen Tudu Stagin"). Rohit asked for fewer, smaller buttons, with the shortcut in a tooltip.

## Design (approved canvas v125)

The foot becomes **[+] [note] ··· Open Tudu [⋯]**:

- **New task**: 32px icon button (plus). Tooltip above: "New task ⌘⇧N". Accessible name "New task", with
  `aria-keyshortcuts="Meta+Shift+N"` so VoiceOver reads the shortcut too. Only in the day state, as today: the empty
  state keeps its primary "New task" button in the body.
- **New note**: 32px icon button (note icon). Tooltip above: "New note". In both the day and empty states, when
  `onNewNote` is passed.
- **Open Tudu**: quiet text button. It always says "Open Tudu"; its accessible name stays `Open <app name>`
  (`aria-label`), so Staging and Test stay distinct for VoiceOver and for the Mac tests that find it by name.
- **⋯**: unchanged.
- Tooltips open above (`tipSide="top"`), because the foot sits at the bottom edge of the sheet window and a tooltip
  below would be cut off. Same hover/focus timing and fade as every other tooltip.
- Icon colour `--foreground-2`, `--foreground` on hover. Light and dark come from the tokens.

## The change

1. `apps/web/src/routes/notebook/notebook.css`: clear the page in the Mac note window, the same way Quick Add and
   the sheet do:
   ```css
   html[data-app='note'],
   html[data-app='note'] body {
     background: transparent !important;
   }
   ```
2. `packages/ui/src/components/MenuBarSheet.tsx` foot:
   - New task and New note become the shared `IconButton` (`label`, `tipSide="top"`), not new markup, so they match
     every other icon button in the app. New task's tooltip text is `New task  {shortcut}`; `IconButton` gains an
     optional `tipLabel` (tooltip text when it differs from `label`). `aria-keyshortcuts` already passes through.
   - The `shortcut` prop stays (MenuBarPage passes the real one from `app_info`); `.tp-mb-kbd` is removed.
   - The open button shows "Open Tudu" with `aria-label={`Open ${appName}`}`.
   - Foot items get `flex: none` and the text button `white-space: nowrap`, so nothing can squash or clip again.
   - `packages/ui/src/styles/app.css`: foot icon button size and colours from the canvas
     (`.tp-mb-f .tp-ib { width: 32px; height: 32px; color: var(--foreground-2) }`, hover `--foreground`).
3. Docs: the component's doc comment and the kit story (if any) updated to the new foot.
4. DS: the design system has no MenuBarSheet component, so nothing to port. `IconButton`'s new `tipLabel` prop is added
   to the DS IconButton docs so they don't drift.

## Tests

| ID      | Where                                 | What                                                                                                                                                |
| ------- | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| C20-U02 | ui `MenuBarSheet.test.tsx` (update)   | Day state foot: buttons named New task (with `aria-keyshortcuts="Meta+Shift+N"`), New note, "Open Tudu Staging" showing the text "Open Tudu", and ⋯ |
| C20-U07 | ui `MenuBarSheet.test.tsx` (new)      | Hovering/focusing New task shows a tooltip "New task ⌘⇧N" above (`tp-above`); New note shows "New note"                                             |
| C20-U08 | ui `MenuBarSheet.test.tsx` (new)      | Empty state: body keeps the primary New task button, the foot has New note but no New task icon; without `onNewNote` there is no New note           |
| C20-U09 | ui `IconButton.test.tsx` (new)        | `tipLabel` overrides the tooltip text while `label` stays the accessible name                                                                       |
| C22-D09 | e2e mac `notebook.spec.ts` (new)      | Opened note window: `html` and `body` computed backgrounds are transparent; the note section is the only painted surface                            |
| C20-D02 | e2e mac `desktop.spec.ts` (unchanged) | Still finds the sheet's open button by its name, "Open Tudu Test"                                                                                   |

IDs checked against master and the open Notebook staging-fixes work (which holds C22-U23..U27, C22-D07, C22-D08).

All run on Rohit's Mac (`pnpm test`, `pnpm e2e:mac`), per the project rule.
