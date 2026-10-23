# Chunk 17 · Quick Add always says where · test cases

Status column is kept by `pnpm test:status` in [STATUS.md](STATUS.md). Run this chunk's tests with
`pnpm test -- --project ui --project web`, `pnpm e2e -g C17-` and, on a Mac, `pnpm e2e:mac -g C17-`. End-to-end
tests fix the clock at Sunday 18 October 2026, 10:00.

## Unit (`packages/ui`, `apps/web`)

| ID      | Component | Case                                                                                                                          |
| ------- | --------- | ----------------------------------------------------------------------------------------------------------------------------- |
| C17-U01 | QuickAdd  | Personal alone: "In Personal for Me", both chips plain (no button, no menu on click), Tab goes to the title                   |
| C17-U02 | QuickAdd  | Two spaces: the space chip opens the list; picking Meera makes the placeholder "What should Meera do?"                        |
| C17-U03 | QuickAdd  | A team space joining turns the plain chips into buttons without remounting the bar or losing the draft                        |
| C17-U04 | floating  | The floating page starts on the space the desk was last on (Personal before any), switches from its line, rereads on a summon |

## End-to-end (`packages/e2e/tests/quick-add`, `packages/e2e/tests/desktop`)

| ID      | Case                                                                                                                               |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| C17-E01 | A fresh person with Personal alone opens Quick Add: "In Personal for Me", the chips do not open, Add still works (desktop, tablet) |
| C17-E02 | With Northwind made, the space chip opens the list; a task added for Northwind from Personal lands on Northwind's Today            |
| C17-E03 | Phone: the sheet reads "In Personal for Me" with plain chips (phone)                                                               |
| C17-E04 | The floating page (desktop bridge faked) starts on the desk's last space; switching to Personal adds there                         |
| C17-E05 | Dark: the line reads the same and its chips stay plain                                                                             |

## Desktop (`packages/e2e/mac`)

| ID      | Case                                                                                                    |
| ------- | ------------------------------------------------------------------------------------------------------- |
| C17-D01 | ⌘⇧N after the desk was on Northwind: the floating bar's line reads "In Northwind for Me" and adds there |
