# Step 8: Command palette and keyboard shortcuts

Status: Done
Depends on: step 7
Blocks: step 9

## Goal

After this step:

- Cmd+K (Ctrl+K on Windows) opens a command palette from any authenticated screen.
- Palette lists navigation and action commands only. No task search.
- N still opens the existing NewTaskDialog via `requestAddTask()`.
- Cmd+Shift+W jumps to this week on the desktop app only. Web uses the palette or week picker.
- Esc closes the palette.

## Non goals

- Cmd+L JIRA link palette (step 10).
- Global Cmd+Shift+T quick capture (step 12).
- Inbox accept shortcuts Cmd+1 / Cmd+2 (step 9).
- Row j/k navigation, complete, delete keys.
- Rollover undo via Cmd+Z.
- Task search or a new search API.
- C8 thin capture modal (step 12).

## Key files

| Path | Role |
|------|------|
| `packages/ui/src/lib/commands.ts` | Static command registry |
| `packages/ui/src/components/chrome/CommandPalette.tsx` | Cmd+K dialog, keyboard owner |
| `packages/ui/src/routes/RootLayout.tsx` | Mounts palette in app shell |
| `packages/ui/src/components/chrome/WeekPicker.tsx` | Jump to this week shortcut hint |
| `packages/ui/src/hooks/useNewTaskShortcut.ts` | N shortcut (unchanged) |

## Decisions (settled)

1. **Reuse shadcn CommandDialog + cmdk.** No kbar or other palette library.
2. **Commands only.** Go to Today / Week / Inbox / Unscheduled / Team / Settings. New task. Jump to this week.
3. **Include placeholder routes.** Inbox, Team, and Settings appear even though those screens are empty.
4. **New task uses existing flow.** Palette dispatches `requestAddTask()`. Same modal as N and the top bar button.
5. **A4 overlay feel.** ~620px centered panel, dim backdrop, grouped rows, Esc footer. No close X.
6. **Cmd+Shift+W is desktop only.** Chrome treats it as close window on web.
7. **Rollover undo deferred** again.

## Commands

| Label | Action |
|-------|--------|
| Go to Today | Navigate `/`, reset selected date to today |
| Go to Week | Navigate `/week` |
| Go to Inbox | Navigate `/inbox` |
| Go to Unscheduled | Navigate `/unscheduled` |
| Go to Team | Navigate `/team` |
| Go to Settings | Navigate `/settings` |
| New task | `requestAddTask()` |
| Jump to this week | Navigate `/week?week=` + effective today week |

## Verification

```bash
pnpm test
pnpm lint:copy
pnpm --filter @tudu/ui exec tsc --noEmit
```

Browser (signed in as `testuser@egain.com`):

1. Cmd+K on `/`, `/week`, `/unscheduled`, `/inbox`. Palette opens and closes.
2. Filter "week". Week and Jump to this week remain.
3. Run Go to Unscheduled. Route changes.
4. Run New task. Modal opens.
5. Run Jump to this week from palette on a past week. Returns to current week.
6. N with palette closed still opens New task. N ignored while another dialog is open.
7. Console clean on every route.
