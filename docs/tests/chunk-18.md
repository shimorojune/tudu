# Chunk 18 · Projects per space · test cases

Status column is kept by `pnpm test:status` in [STATUS.md](STATUS.md). Run this chunk's tests with
`pnpm test -- --project ui --project core --project web` and `pnpm e2e settings -g C18-`. End-to-end tests fix the
clock at Sunday 18 October 2026, 10:00. These replace C09-U06 and C09-E06, which tested the old inline rows. The
New project popup (U02 to U04, U08 to U18, S01, E01, E02, E09 to E15) is planned in
[new-project-flow.md](../plans/new-project-flow.md).

## Unit (`packages/ui`, `packages/core`, `apps/web`)

| ID      | Component       | Case                                                                                                                                                                        |
| ------- | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C18-U01 | ProjectSettings | The head with New project; rows with dot, name, "5 open" and "None open"; ⋯ with its two items; the empty state                                                             |
| C18-U02 | ProjectSettings | New project opens a popup dialog "New project", name focused, the next unused colour picked; Create project reports name and colour; Esc closes and focus is on New project |
| C18-U03 | ProjectSettings | A row opens its popup "Edit X" anchored to the row; Save reports only what changed; an empty or unchanged name keeps Save off; focus returns to the row                     |
| C18-U04 | ProjectSettings | One popup at a time; Delete project and ⋯ › Delete report the project; there is no preview line                                                                             |
| C18-U05 | ProjectMenu     | Edit projects… is the last line when `onEdit` is given and calls it; absent without it                                                                                      |
| C18-U06 | web             | The delete toast's words for 0, 1 and 3 open tasks; Undo calls restore                                                                                                      |
| C18-U07 | web             | Edit projects… from Quick Add opens Settings on Projects for the bar's space, and Quick Add reopens with its draft when Settings closes                                     |
| C18-U08 | core            | `projectNamed` matches ignoring case and extra spaces; empty matches nothing; `exceptId` skips that project                                                                 |
| C18-U09 | ProjectSettings | A new project named like an existing one shows "Northwind already has Hiring.", Create is off, Enter does nothing                                                           |
| C18-U10 | ProjectSettings | Renaming to another project's name is refused; renaming to its own name in another case is allowed                                                                          |
| C18-U11 | ProjectSettings | A click outside the popup closes it without reporting anything, and focus goes back to what opened it                                                                       |
| C18-U12 | ProjectSettings | The count shows from 50 characters ("50/60") to 60; the field takes no 61st                                                                                                 |
| C18-U13 | ProjectSettings | After Create the new row gets focus and the arrival wash; after Save the edited row gets the wash                                                                           |
| C18-U14 | core / ui       | Project colours have names (Navy … Umber) and the swatches use them as labels                                                                                               |
| C18-U15 | client          | `applyToProjects` puts a created project first (`POSITION_STEP` when alone, before the first otherwise)                                                                     |
| C18-U16 | QuickAdd        | In the picker's name card, picking Plum then Add reports the name with Plum                                                                                                 |
| C18-U17 | QuickAdd        | Typing an existing name offers "Use Platform"; Enter picks it and creates nothing                                                                                           |
| C18-U18 | QuickAdd        | ‹ and Esc in the name card go back to the list without closing the picker or creating anything                                                                              |

## Server (`apps/server`)

| ID      | Case                                                                                              |
| ------- | ------------------------------------------------------------------------------------------------- |
| C18-S01 | Three projects created one after another list newest first, at the positions the client predicted |

## End-to-end (`packages/e2e/tests/settings/projects.spec.ts` unless noted)

| ID      | Case                                                                                                                                        |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| C18-E01 | Personal › Space: New project popup, name and colour, Create project; it is first in the list and in Quick Add's picker                     |
| C18-E02 | Click a row, rename and recolour, Save; its tasks on Today show the new name and dot                                                        |
| C18-E03 | ⋯ › Delete: the toast reads "… Its 2 tasks keep no project."; the dots go; Undo brings the project and the dots back                        |
| C18-E04 | A team space: a member (not admin) can create and edit; a second person sees the change within a second over the live stream                |
| C18-E05 | Edit projects… from Quick Add, the task panel and the Backlog filter each open Settings on that space's Projects; Quick Add keeps its draft |
| C18-E06 | Phone: E01 and E03 in the Space page (phone)                                                                                                |
| C18-E07 | Tablet: E02 in the dialog (tablet)                                                                                                          |
| C18-E08 | Dark: E01 and E03 again in dark                                                                                                             |
| C18-E09 | The kit shows the list, the popup (new and existing) and the empty state, light and dark, and nothing overflows at phone width              |
| C18-E10 | New project → Create: the new row is first, in view, washed and focused; the rows did not move while the popup was open                     |
| C18-E11 | An existing name in any case shows "Personal already has Home." and Create stays off; the server still has one Home                         |
| C18-E12 | A click outside closes the popup without creating anything and Settings stays open; Esc closes the popup, then Settings                     |
| C18-E13 | Editing the last of 12 projects on a 1440x700 window: the popup opens upward and is fully on screen                                         |
| C18-E14 | Phone: the popup fits the screen and Create works from the keyboard                                                                         |
| C18-E15 | Quick Add (`quick-add.spec.ts`): New project… with Teal makes "Errands" first in teal; typing "errands" again offers "Use Errands"          |
