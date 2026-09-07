# Step 7: Week view and drag to reschedule

Status: Done
Depends on: step 6
Blocks: step 8

## Goal

After this step:

- `/week` shows a Monday to Sunday grid with a 220px Unscheduled rail on the left.
- Tasks render as compact cards on their `scheduledDate` only (start/deadline as meta).
- Drag between days always lands in Later. Drag within a day can change bucket and order.
- Drag from the rail onto a day schedules into Later. Drag onto the rail unschedules.
- Click a card for a popover: change bucket, complete, delete, Open day.
- Click a day header to highlight it. New task defaults to the highlighted day.
- Highlighted day uses a header underline, not a column bar.
- Week picker in the top bar replaces DateNav and DayJump on `/week`.
- URL: `/week?week=YYYY-Www` (bare `/week` uses the effective today week).

## Non goals

- Option-drag copy (no duplicate API yet).
- JIRA keys on week cards (step 10).
- Detail inspector on Week (Open day jumps to Today).
- `Cmd+Shift+W` shortcut (step 8).
- Now cap nudge on Week.

## Key files

| Path | Role |
|------|------|
| `packages/ui/src/lib/week.ts` | ISO week helpers, container ids |
| `packages/ui/src/lib/weekDrag.ts` | Cross-day Later forcing |
| `packages/ui/src/components/week/WeekGrid.tsx` | DndContext, grid layout |
| `packages/ui/src/components/week/WeekColumn.tsx` | Day column with bucket zones |
| `packages/ui/src/components/week/WeekCard.tsx` | Compact card |
| `packages/ui/src/components/week/WeekCardPopover.tsx` | Card actions popover |
| `packages/ui/src/components/week/UnscheduledRail.tsx` | Left rail |
| `packages/ui/src/components/chrome/WeekPicker.tsx` | Top bar week navigation |
| `packages/ui/src/routes/WeekRoute.tsx` | Route shell, New task dialog |
| `packages/ui/src/hooks/useWeekTaskQueries.ts` | Seven day queries + unscheduled |

## Decisions (settled)

1. **Columns show scheduled tasks only.** Start and deadline appear as card meta.
2. **Unscheduled rail on Week.** The `/unscheduled` tab remains.
3. **Cross-day drag always Later.** Even if the source was Now.
4. **In-column drag respects buckets.** Faint Now / Next / Later labels on every day.
5. **Card popover, not inspector.** Open day navigates to Today with task selected.
6. **Header click highlights only.** Does not navigate.
7. **Completed tasks stay visible**, struck through.
8. **No new API.** Reuses `getTasksForDay` x7 and existing reorder endpoint.

## Verification

```bash
pnpm test
pnpm lint:copy
pnpm --filter @tudu/ui exec tsc --noEmit
```

Browser (signed in as `testuser@egain.com`):

1. Open `/week`. Today column marked. Weekends dim.
2. Prev/next week, picker, Jump to this week.
3. Highlight a day, press N, task lands on that day in Later.
4. Drag rail task onto a day.
5. Drag across days (lands Later). Drag within day into Now.
6. Drag day card back to rail.
7. Card popover: bucket, complete, delete, Open day.
8. `/unscheduled` still loads.
