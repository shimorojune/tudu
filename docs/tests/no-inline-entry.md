# No typing in task lists · test cases

The plan is [docs/plans/no-inline-entry.md](../plans/no-inline-entry.md). These ids (`NI-…`) come from that plan, not
a chunk, so `pnpm test:status` does not list them in STATUS.md; the test names carry them for `-g`. Unit, web and Mac
tests run on PR CI (and Actions › Flake check for repeats), not on Rohit's Mac.

## Unit (vitest)

| ID     | Where                                            | Case                                                                                             |
| ------ | ------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| NI-U01 | `packages/ui/src/components/AddTask.test.tsx`    | The line is a button: click, Enter and Space call `onOpen`; never a textbox                      |
| NI-U02 | `packages/ui/src/components/TaskList.test.tsx`   | The line asks for Quick Add; the task that comes back is last with the wash; no handler, no line |
| NI-U03 | `packages/ui/src/components/TaskList.test.tsx`   | No slot between rows; no rule under the last row when no line follows                            |
| NI-U04 | `packages/ui/src/components/TaskGroups.test.tsx` | A header's "+" asks for its group (a folded one opens); one end line; no field                   |
| NI-U05 | `packages/ui/src/components/QuickAdd.test.tsx`   | A seed's project is picked; null clears it; one the space lacks is never sent                    |
| NI-U06 | `packages/ui/src/components/QuickAdd.test.tsx`   | A seed with only words keeps the day shown and the draft's project                               |
| NI-U07 | `packages/ui/src/components/QuickAdd.test.tsx`   | Closing gives focus back to what opened it; nothing focused before, nothing moved                |

## End-to-end, web (Playwright)

| ID     | Where                                  | Case                                                                                            |
| ------ | -------------------------------------- | ----------------------------------------------------------------------------------------------- |
| NI-E01 | `tests/today/today.spec.ts`            | The line opens Quick Add on today; the row lands last with the wash; a reload keeps it          |
| NI-E02 | `tests/backlog/backlog.spec.ts`        | "Add to the Backlog…" opens Quick Add on Backlog; last, no day, after a reload                  |
| NI-E03 | `tests/today/today.spec.ts`            | No "+" between rows on hover; no "New task" textbox anywhere                                    |
| NI-E04 | `tests/today/today.spec.ts`            | Two days: tomorrow's line plans on tomorrow; the Backlog beside the day plans on none           |
| NI-E05 | `tests/today/group-by-project.spec.ts` | A header's "+" sets the project; last in its group; a folded group opens; No project's line     |
| NI-E06 | `tests/today/today.spec.ts`            | Enter opens it; Esc makes nothing and focus is back on the line                                 |
| NI-E07 | `tests/motion/motion.spec.ts`          | The line never moves while Quick Add opens and closes (Today, Backlog; light, dark; WebKit too) |
| NI-E08 | `tests/all-spaces/all-spaces.spec.ts`  | C21-E06 and C21-E30: All spaces' line and "+" go through Quick Add into the right space         |
| NI-E09 | `tests/today/today.spec.ts`            | An empty day: New task plans on that day; no line under the empty state                         |
| NI-E10 | every spec above, `phone` project      | The same lines open the Quick Add sheet on phones                                               |
| NI-E11 | `tests/today/today.spec.ts`            | C02-E10: a task written offline through the line shows at once and syncs when back              |
| NI-E12 | `tests/today/today.spec.ts`            | C02-E14: writing through the line in the dark theme                                             |
| NI-E13 | `tests/today/today.spec.ts`            | After Quick Add was open in another space, the line writes into the space you are in            |

`writeTasks` (`fixtures/today.ts`) and `writeBacklog` (`fixtures/backlog.ts`) now go through Quick Add, so every spec
that sets up tasks with them exercises the line too.

## Desktop (Tudu Test on the macOS CI runner)

| ID             | Where                        | Case                                                                                     |
| -------------- | ---------------------------- | ---------------------------------------------------------------------------------------- |
| RM-D02, NI-D01 | `mac/tests/row-menu.spec.ts` | The line opens Quick Add; a right-click in its title is the system's; Add lands the task |

## Manual (Rohit, Mac app on staging)

| ID      | Case                                                                                                 |
| ------- | ---------------------------------------------------------------------------------------------------- |
| MC-NI01 | Click "Write the next thing…" a few times in a row: Quick Add opens each time, the line never shifts |

## Replaced

C02-U10, C02-U11, C02-U14 (the field), C02-U51, C02-U52, C02-E05, C02-E28, C02-E35, C06-E02, FX-E01..FX-E03 are
replaced by the cases above. C02-E30, C06-E14, C06-E16, C12-E01, C21-E06, C21-E22, C21-E24, C21-E30, RM-U09 and
SK-E03 were rewritten to the new way in.
