# Pick a project with # · test cases

The plan is [docs/plans/project-hash.md](../plans/project-hash.md). These ids (`PH-…`) come from that plan, not a
chunk, so `pnpm test:status` does not list them in STATUS.md; the test names carry them for `-g`. Unit, web and Mac
tests run on PR CI (and Actions › Flake check for repeats), not on Rohit's Mac.

`#` is read in Quick Add's title only (web, phones, the Mac Quick Add window). The writing-line cases of the first
plan (PH-U11, PH-U12, PH-E03..E06, PH-E08, PH-E09, MC-PH02) were dropped with inline task entry.

## Unit (vitest)

| ID     | Where                                                 | Case                                                                                                                             |
| ------ | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| PH-U01 | `packages/core/src/projectHash.test.ts`               | `hashAt`: start of title, after a space, letters after `#`; `#92`, `C#`, `a#b`, caret elsewhere; two `#`s                        |
| PH-U02 | `packages/core/src/projectHash.test.ts`               | `hashMatches`: name prefix before word prefix, any case, no letters keeps all; `hashMark`; `exactProject`                        |
| PH-U03 | `packages/core/src/projectHash.test.ts`               | `dropHash` at the end, start and middle, spaces closed up, caret; `hashProjectName` capitals                                     |
| PH-U04 | `packages/ui/src/components/ProjectHashMenu.test.tsx` | `#` opens "Projects in Northwind" with the first row lit; letters narrow, bold part; `#92` and `C#` don't open                   |
| PH-U05 | `packages/ui/src/components/ProjectHashMenu.test.tsx` | ↑ ↓ wrap; Enter and Tab pick; a click picks and keeps the cursor; Enter never adds while it is open                              |
| PH-U06 | `packages/ui/src/components/ProjectHashMenu.test.tsx` | Esc closes the menu, not the bar, and keeps `#`; that `#` stays shut; a new `#` opens                                            |
| PH-U07 | `packages/ui/src/components/ProjectHashMenu.test.tsx` | `#home ` picks Home; `#pla ` (a part) types the space                                                                            |
| PH-U08 | `packages/ui/src/components/ProjectHashMenu.test.tsx` | No match: "No project called garden", New project Garden makes and picks it; a part never offers one; over 60 characters says so |
| PH-U09 | `packages/ui/src/components/ProjectHashMenu.test.tsx` | An empty space says how to make one; loading shows three quiet rows and Enter waits                                              |
| PH-U10 | `packages/ui/src/components/ProjectHashMenu.test.tsx` | Opens above when the box around it has no room below; under the title with room; always above on phones                          |
| PH-U13 | `packages/ui/src/components/QuickAdd.test.tsx`        | A pick fills the Project chip (one wash) and takes `#pla` out; onSave gets the project; no menu while saving                     |
| PH-U14 | `packages/ui/src/components/QuickAdd.test.tsx`        | A project left from another space is not sent with the task                                                                      |
| PH-U15 | `apps/mcp/test/tools.test.ts`                         | `create_task` with `project` (any case); `update_task` sets one or `"none"`; an unknown name lists the space's and sends nothing |
| PH-U16 | `apps/mcp/test/tools.test.ts`                         | `list_spaces` lists each space's projects, in text and data                                                                      |

## End-to-end web (Playwright)

| ID     | Where                                       | Case                                                                                            |
| ------ | ------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| PH-E01 | `packages/e2e/tests/quick-add/hash.spec.ts` | `#pla` Enter, Enter: the task is on today in Platform, titled without `#pla`, on the server too |
| PH-E02 | `packages/e2e/tests/quick-add/hash.spec.ts` | `#garden` makes Garden; the task has it; the space's projects list it                           |
| PH-E07 | `packages/e2e/tests/quick-add/hash.spec.ts` | `Fix #92` and an Esc'd `#urgent` are saved as typed; Esc closed the menu, not the bar           |
| PH-E10 | `packages/e2e/tests/quick-add/hash.spec.ts` | Phone: the menu opens above the title; a tap on a row picks; the task has the project           |
| PH-E11 | `packages/e2e/tests/quick-add/hash.spec.ts` | Offline: a task with a project made by `#` shows at once; both reach the server when back       |

## Mac (Tudu Test on the macOS CI runner)

| ID     | Where                                         | Case                                                                                                                       |
| ------ | --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| PH-D01 | `packages/e2e/mac/tests/project-hash.spec.ts` | The Quick Add window: the menu opens inside the window; Enter picks and does not add; the next Enter adds with the project |

## Manual (Rohit, on staging)

| ID      | Case                                                                                                       |
| ------- | ---------------------------------------------------------------------------------------------------------- |
| MC-PH01 | Mac Quick Add window: type `#` and pick with the keyboard; the menu is not clipped and reads right in dark |
