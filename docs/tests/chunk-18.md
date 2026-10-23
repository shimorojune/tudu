# Chunk 18 · Projects per space · test cases

Status column is kept by `pnpm test:status` in [STATUS.md](STATUS.md). Run this chunk's tests with
`pnpm test -- --project ui --project core --project web` and `pnpm e2e settings -g C18-`. End-to-end tests fix the
clock at Sunday 18 October 2026, 10:00. These replace C09-U06 and C09-E06, which tested the old inline rows.

## Unit (`packages/ui`, `packages/core`, `apps/web`)

| ID      | Component       | Case                                                                                                                                     |
| ------- | --------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| C18-U01 | ProjectSettings | The head with New project; rows with dot, name, "5 open" and "None open"; ⋯ with its two items; the empty state                          |
| C18-U02 | ProjectSettings | New project opens the editor at the top, name focused, the next unused colour picked; Create project reports name and colour; Esc closes |
| C18-U03 | ProjectSettings | A row opens its editor with its name and colour; Save reports only what changed; an empty or unchanged name keeps Save off               |
| C18-U04 | ProjectSettings | One editor at a time; Delete project and ⋯ › Delete report the project; the preview line is the byline as it will read                   |
| C18-U05 | ProjectMenu     | Edit projects… is the last line when `onEdit` is given and calls it; absent without it                                                   |
| C18-U06 | web             | The delete toast's words for 0, 1 and 3 open tasks; Undo calls restore                                                                   |
| C18-U07 | web             | Edit projects… from Quick Add opens Settings on Projects for the bar's space, and Quick Add reopens with its draft when Settings closes  |

## End-to-end (`packages/e2e/tests/settings/projects.spec.ts`)

| ID      | Case                                                                                                                                        |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| C18-E01 | Personal › Space: New project, name and colour, Create project; it shows in the list and in Quick Add's picker                              |
| C18-E02 | Click a row, rename and recolour, Save; its tasks on Today show the new name and dot                                                        |
| C18-E03 | ⋯ › Delete: the toast reads "… Its 2 tasks keep no project."; the dots go; Undo brings the project and the dots back                        |
| C18-E04 | A team space: a member (not admin) can create and edit; a second person sees the change within a second over the live stream                |
| C18-E05 | Edit projects… from Quick Add, the task panel and the Backlog filter each open Settings on that space's Projects; Quick Add keeps its draft |
| C18-E06 | Phone: E01 and E03 in the Space page (phone)                                                                                                |
| C18-E07 | Tablet: E02 in the dialog (tablet)                                                                                                          |
| C18-E08 | Dark: E01 and E03 again in dark                                                                                                             |
| C18-E09 | The kit shows the list, the editor (new and existing) and the empty state, light and dark, and nothing overflows at phone width             |
