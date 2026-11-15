# Times on Planned and Due · test cases

The plan is [docs/plans/task-times.md](../plans/task-times.md). These ids (`TT-…`) come from that plan, not a chunk,
so `pnpm test:status` does not list them in STATUS.md; the test names carry them for `-g`. Unit, web and Mac tests run
on PR CI (and Actions › Flake check for repeats), not on Rohit's Mac.

## Where each one lives

| ID                    | Where                                                                        |
| --------------------- | ---------------------------------------------------------------------------- |
| TT-U01..U04           | `packages/core/src/times.test.ts`                                            |
| TT-U06                | `packages/ui/src/components/TimeField.test.tsx`                              |
| TT-U07, U08           | `packages/ui/src/components/TimeChoice.test.tsx`                             |
| TT-U09                | `packages/ui/src/components/PlanPicker.test.tsx`, `MiniCalendar.test.tsx`    |
| TT-U10                | `packages/ui/src/components/MiniCalendar.test.tsx`                           |
| TT-U11                | `packages/ui/src/components/PlanPicker.test.tsx`                             |
| TT-U12, U16           | `packages/ui/src/components/TaskRow.test.tsx` (U16 also `QuickAdd.test.tsx`) |
| TT-U14                | `packages/ui/src/components/TaskDetail.test.tsx`                             |
| TT-U15                | `packages/ui/src/components/QuickAdd.test.tsx`                               |
| TT-U17                | `packages/client/src/tasks.test.ts`                                          |
| TT-U18                | `apps/web/src/app/TimeClock.test.ts`                                         |
| TT-U19                | `packages/ui/src/components/WorkHoursSection.test.tsx`                       |
| TT-A01..A06           | `apps/server/src/tasks.test.ts`, `requests.test.ts`                          |
| TT-A07                | `apps/server/src/taskTimes.migration.test.ts`                                |
| TT-E01..E03, E06, E07 | `packages/e2e/tests/times/times.spec.ts`                                     |
| TT-D01                | `apps/desktop/src-tauri/src/times.rs` (cargo test, macOS runner)             |

## Not automated yet

- TT-U05 (week and menu bar counts with spans), TT-U13 (the row's red turn at the minute; the web's minute clock and
  `dueLabelAt` are tested instead), TT-E04, E05, E08, E09, E10, TT-D02, D03.

## Manual on Rohit's Mac (after merge, on staging)

| ID     | Case                                                                                           |
| ------ | ---------------------------------------------------------------------------------------------- |
| MC-T01 | A planned start two minutes ahead: the banner comes with Tudu's window closed; Cross off works |
| MC-T02 | Icons beside words line up on the Mac (pills, panel labels, Quick Add chips, banner)           |
