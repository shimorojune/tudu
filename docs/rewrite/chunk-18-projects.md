# Chunk 18 · Projects per space

Status: approved 23 Oct 2026 and built on `claude/project-thread-fsltm1` (one branch for chunks 17 to 20).

Boards: 13 Next, K-Projects ("Projects, per space") and K-Proto's Settings › Personal › Space. The data is already
per space: `projects.space_id` since chunk 02, the `project.create`, `project.update`, `project.delete` and
`project.restore` mutations since chunks 04 and 09, and Undo by the project's `detached` list. What you asked for is
the part people touch. Chunk 09's Projects block (names you type into without knowing it, a dot that hides the
swatches, a Delete on every row, a bare field at the foot) becomes the redrawn list and editor, and every project
picker gains a way to it.

## Scope

- **Settings › Space › Projects, redrawn.** The block in each space's Space section (Personal and every team
  space):
  - **The head.** The heading "Projects", the line "A coloured dot on a task, to group and filter by. Changing one
    changes it on every task.", and **New project** (a secondary button) on the right.
  - **The list.** One row per project, in its saved order: the dot, the name, how many are open ("5 open", "None
    open"), and ⋯. Clicking the row opens the editor. ⋯ offers Edit name and colour, and Delete.
  - **The editor card.** It opens in place of the row, or at the top of the list for New project. It holds Name (up
    to 60 characters, focused), Colour (the swatches, the next unused one picked for a new project), and a preview
    line showing the task byline exactly as it will read. Then Delete project (an existing one only), Cancel, and
    Create project or Save. Enter saves, Esc cancels. One editor at a time: opening another closes the first,
    keeping nothing.
  - **Empty.** "No projects yet", with "A project puts a coloured dot on tasks, so you can see what belongs together
    and filter the Backlog by it." and New project.
- **Delete, with Undo.** From ⋯ or the editor, without asking. The toast reads "Platform deleted. Its 3 tasks keep no
  project." (or just "Offsite deleted." when nothing was open) with Undo, which puts the project and its dots back
  (the existing `project.restore`).
- **Who can.** Anyone in the space, admins and members alike, as today. Personal is yours alone.
- **Edit projects…** ends every project picker: Quick Add, the task panel, the floating bar, and the Backlog's
  project filter. It opens Settings on that space's Projects (`?settings=space#projects` on the desk and tablets,
  `/northwind/settings/space` on phones, scrolled to the block). Quick Add keeps its draft and comes back after
  Settings closes, as it does after Search. New project… stays as built (a name on the spot, the next colour).
- **Phones and tablets.** The same block in the Space page and in the dialog. On a phone the editor card is
  full-width in the list. The ⋯ menu is the same menu.
- **Data.** None new. `GET /api/spaces/:id/projects` already returns `open` counts.

Out of scope: reordering projects by drag (not drawn; the order stays creation order), archiving a project (not
drawn; open question on the sticky: "whether projects need more than the shortcut"), and moving a project between
spaces.

## Choices

1. **One editor for making and changing.** Create and edit are the same card with a different button, so there is
   one place to learn. The alternative keeps inline renaming in the row, which is what read as confusing.
2. **No confirm on delete.** Undo covers it, the same as a task's delete. The toast says what happened to the tasks,
   because that is the part people worry about. The alternative, a confirm dialog, is one more click every time for
   a rare mistake Undo already fixes.
3. **Edit projects… goes to Settings, not a popover editor.** One place to manage projects, linked from where you
   notice you need it. The alternative, editing inside the picker, crowds a menu that is meant to be quick.
4. **`ProjectSettings` is rewritten, not patched.** The component keeps its props (`onRename`, `onRecolour`,
   `onDelete`, `onCreate`), and `onCreate` gains the colour. Undo stays in the app's toast, which already calls
   restore. The markup and the kit states are new. The design system gains the list and the editor card as Tudu Paper parts (`tp-prj-*`).

## Changes to earlier chunks

- Chunk 09: choice 4's Projects block is replaced. C09-U06 and C09-E06 are rewritten (below) rather than kept.
- Chunk 04 and chunk 06: the project picker and the Backlog filter gain the last line.

## Test plan

Unit (`packages/ui`, `apps/web`):

| ID      | Component       | Case                                                                                                                                     |
| ------- | --------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| C18-U01 | ProjectSettings | The head with New project; rows with dot, name, "5 open" and "None open"; ⋯ with its two items; the empty state                          |
| C18-U02 | ProjectSettings | New project opens the editor at the top, name focused, the next unused colour picked; Create project reports name and colour; Esc closes |
| C18-U03 | ProjectSettings | A row opens its editor with its name and colour; Save reports only what changed; an empty or unchanged name keeps Save off               |
| C18-U04 | ProjectSettings | One editor at a time; Delete project and ⋯ › Delete report the project; the preview line is the byline as it will read                   |
| C18-U05 | ProjectMenu     | Edit projects… is the last line when `onEdit` is given and calls it; absent without it                                                   |
| C18-U06 | web             | The delete toast's words for 0, 1 and 3 open tasks; Undo calls restore                                                                   |
| C18-U07 | web             | Edit projects… from Quick Add opens Settings on Projects for the bar's space, and Quick Add reopens with its draft when Settings closes  |

End-to-end, group `settings` (each test makes its own space and projects):

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

## Done when

- The tests above pass three runs in a row locally and in CI.
- On staging, the Projects block matches K-Projects light and dark, and Edit projects… works from all four places.
- The design deviations register drops its 13 Next lines for Projects and Edit projects….
