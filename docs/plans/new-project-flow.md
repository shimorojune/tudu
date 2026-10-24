# New project: a popup, not a card in the list

Status: proposal, waiting for Rohit's approval. Canvas: board `K-Projects-Flow` ("13b · New project, smoothed") on the
Spaces page, approved by Rohit 24 Oct 2026 (v52).

## Why it feels janky today

Found in the code, all in `packages/ui/src/components/ProjectSettings.tsx` and `ProjectMenu.tsx`:

1. **The project lands somewhere else.** The New project card opens at the top of the list, but `project.create` puts
   the project last (`position = last + POSITION_STEP`, in both `applyToProjects` in `packages/client/src/tasks.ts`
   and `project()` in `apps/server/src/tasks.ts`). The card vanishes and the row turns up at the bottom, often out
   of view.
2. **The list jumps.** The card is inserted into the list with a 3px fade and no height change, so every row below
   it jumps; Save and Cancel remove it in one frame. The empty state is swapped for the list in one frame.
3. **Same name twice is allowed** everywhere. Board 13 promised "Northwind already has Platform." and it was never
   built.
4. **Focus is lost.** After Save or Cancel the focused card unmounts, focus falls to `<body>`, and the next Esc closes
   all of Settings.
5. **New project… in a picker** swaps the menu for a 240px box with a bare field (`.tp-pm-new`): the panel changes
   width, and you get whatever colour comes next with no say.

## The change

### Settings › Space › Projects

- The editor becomes a **popup** (Radix `Popover` from `radix-ui`, already a dependency through `Menu`), on the
  popover surface with `shadow-pop` and `radius-lg`, 340px wide (`min(340px, 100vw - 16px)` on phones):
  - **New project** (the head button, or the empty state's button) is its trigger; the popup opens under it, aligned
    to its end (centred under the empty state's button).
  - **A row**, or ⋯ › Edit name and colour, opens the popup anchored under that row (`Popover.Anchor` on the row),
    aligned to its start with a 28px inset. The row keeps the `selection` fill while its popup is open.
  - Contents: a heading ("New project" / "Edit Onboarding"), Name (`Field`), Colour (`ColorPick`), then the footer
    (Delete project on an existing one, Cancel, Create project / Save). **The "On a task" preview line is removed.**
  - It opens and closes like `Menu`: fade from scale .96 in `dur-menu` (160ms, `ease-arrive`), out to .97 in 110ms
    (`ease-leave`). It flips upward when there is no room below (`collisionPadding` 8). Nothing in the list moves.
  - It closes on Save, Cancel, Esc, and **any click outside it**. A click outside is Cancel: the draft is dropped.
  - One popup at a time: opening another row's popup closes the first (and drops its draft).
- **New projects go first.** `project.create` places the project before the first one: `position = first.position -
POSITION_STEP`, or `POSITION_STEP` when the space has none. Changed in both `applyToProjects` (client, optimistic)
  and `project()` (server) so they agree; no schema or migration change (`position` is any finite number). This also
  makes new projects first in every picker and the Backlog filter, as agreed.
- **The new row arrives** with the new-task motion: it opens its gap at the top of the list (`dur-row-open`) and holds
  the `selection` wash for 2s (`--animate-wash`). The same wash marks a row after Save. From the empty state, the empty
  card is replaced by the list rising in (`dur-arrive`, 3px).
- **Same name check.** A new helper in `packages/core/src/projects.ts`:
  `projectNamed(projects, name, exceptId?)` returns the project whose name matches after trimming, collapsing inner
  spaces and lower-casing (`toLocaleLowerCase`), or null. While it matches, the Name field shows the error
  "<Space> already has <Name>." (e.g. "Northwind already has Hiring.", "Personal already has Hiring.") and Create /
  Save stays off. Renaming a project to its own name in another case ("hiring" → "Hiring") is allowed.
  `ProjectSettings` gets a `spaceName` prop for the sentence.
- **Focus.** After Create, focus moves to the new row's button (once it renders); after Save, to that row's button;
  after Cancel, Esc or a click outside, back to what opened it (New project, the row, or ⋯).
- **Long names.** A quiet "52/60" count appears beside the Name label for the last ten characters (`PROJECT_NAME_MAX`).
- **Kit.** `defaultEditing` still opens a popup at once. For the kit only, a new `inline` prop draws the popup in place
  (no portal) so the kit's cards can show it without overlapping each other.

### Any project picker (Quick Add, task panel, floating bar)

- **New project…** turns the same panel into the name card in place, with a 160ms fade (no width or slide change):
  - a header "‹ New project" (the ‹ button goes back to the list; Esc does the same),
  - the name field with a 9px dot showing the colour it will get (the next unused one),
  - the eight swatches under it (a radio group, 20px), so the colour can be picked here,
  - a hint line and the button: "Its colour, here or later in Settings." and **Add** (primary).
- When the typed name matches a project (same helper): the hint says "Hiring is already here." and the button becomes
  **Use Hiring** (secondary); Enter or the button picks the existing project instead of making a twin.
- `ProjectMenu`'s `onNew` becomes `onNew(name, color)`; `QuickAdd` and `TaskDetail` pass the colour through to
  `onNewProject(name, color)`, and the web app to `taskStore.createProject(space, name, color)` (which already takes a
  colour).
- The chip's label fades to the new name (`dur-menu`).

### Swatch names

`ColorPick` labels swatches with their hex today ("#3d5a80"), which a screen reader reads out as letters. Each project
colour gets a name in `packages/core/src/projects.ts` (Navy, Moss, Ochre, Plum, Teal, Rust, Slate, Umber), used as the
radio's label in Settings and in the picker. Space colours keep their labels unless they share the palette.

### Reduced motion

Every animation above becomes the 120ms fade from `less-motion.css`; the wash stays (it is colour, not movement).

### Not changing

- No server-side duplicate check. Two people creating "Hiring" in the same second can still both succeed; the
  outbox has no way to reject a create politely today, and it is rare enough not to justify one.
- Delete, Undo and the delete toast are unchanged.
- The Backlog filter (`ProjectFilter`) only gains the new order.

## Tests

### Unit (Vitest + Testing Library)

Updated:

| Id      | File                                                  | Change                                                                                                                                                                                                                                         |
| ------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C18-U02 | `packages/ui/src/components/ProjectSettings.test.tsx` | New project opens a `dialog` named "New project" (not inside the list); name focused; next unused colour; New project disabled while open; Create reports `('Hiring', colour)` with spaces trimmed; Esc closes it and focus is on New project. |
| C18-U03 | same                                                  | A row opens a `dialog` "Edit Onboarding" anchored to the row, which has the selected class; unchanged and empty names keep Save off; Save reports only what changed; focus returns to the row's button.                                        |
| C18-U04 | same                                                  | One popup at a time; Delete project and ⋯ › Delete report it. The "On a task" preview assertions are removed; assert there is no element labelled "On a task".                                                                                 |
| C04-U04 | `packages/ui/src/components/QuickAdd.test.tsx`        | New project… shows the name card: field focused, a radio group "Project colour" with the next unused colour checked; typing " Home " + Enter calls `onNewProject('Home', colour)` and picks it.                                                |

New:

| Id      | File                                                  | Scenario                                                                                                                                                                                                                           |
| ------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C18-U08 | `packages/core/src/projects.test.ts`                  | `projectNamed`: matches ignoring case, outer and doubled inner spaces; empty name matches nothing; `exceptId` skips that project; no match returns null.                                                                           |
| C18-U09 | `packages/ui/src/components/ProjectSettings.test.tsx` | New project, type " hiring " with Hiring in the list and `spaceName="Northwind"`: the field shows "Northwind already has Hiring." (role alert, `aria-invalid`), Create is off, Enter does nothing; change the name and both clear. |
| C18-U10 | same                                                  | Editing Onboarding: renaming it to "Offsite" shows the error and keeps Save off; renaming it to "onboarding" is allowed and reports the rename.                                                                                    |
| C18-U11 | same                                                  | A pointer-down outside the popup closes it without calling `onCreate` / `onRename` / `onRecolour`, and focus goes back to what opened it.                                                                                          |
| C18-U12 | same                                                  | The count: hidden at 49 characters, "50/60" at 50, "60/60" at 60; the field never takes a 61st.                                                                                                                                    |
| C18-U13 | same                                                  | After Create, when the new project arrives in `projects`, focus is on its row button and the row has the arrival (wash) class; after Save the edited row has it too.                                                               |
| C18-U14 | same                                                  | Swatches are named: the radios read Navy, Moss, Ochre, Plum, Teal, Rust, Slate, Umber.                                                                                                                                             |
| C18-U16 | `packages/ui/src/components/QuickAdd.test.tsx`        | In the name card, picking Plum then Add calls `onNewProject(name, '#7a4e7a')`; the field's dot shows the picked colour.                                                                                                            |
| C18-U17 | same                                                  | Typing "platform" when Platform exists: hint "Platform is already here.", the button reads "Use Platform"; Enter picks Platform and `onNewProject` is not called.                                                                  |
| C18-U18 | same                                                  | ‹ and Esc in the name card go back to the list without closing the picker and without creating anything.                                                                                                                           |
| C18-U15 | `packages/client/src/tasks.test.ts`                   | `applyToProjects` on `project.create`: into an empty space gets `POSITION_STEP`; into a space with projects at 1024 and 2048 gets 0 and sorts first.                                                                               |

### Server (Vitest, against the test database)

| Id      | File                            | Scenario                                                                                                                                             |
| ------- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| C18-S01 | `apps/server/src/tasks.test.ts` | Creating three projects one after another: `GET /api/spaces/:id/projects` lists them newest first, and positions match the client's optimistic ones. |

### End to end (Playwright)

Updated, in `packages/e2e/tests/settings/projects.spec.ts`:

- **C18-E01**: the editor is found by `role=dialog name="New project"`; after Create the first list item is "Hiring", and
  the server list has it first.
- **C18-E02**: the edit popup is a dialog; after Save the row keeps its place.
- **C18-E09** (kit): "Projects, editing one" and "Projects, a new one" show the popup (dialog) inside their card; nothing
  overflows at phone width.

New:

| Id      | Where                         | Scenario                                                                                                                                                                                                                                    |
| ------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C18-E10 | `projects.spec.ts`            | With two projects, New project → "Garden" → Create: "Garden" is the first row and in view, has the wash, and has focus; the rows below did not move while the popup was open (their bounding boxes are unchanged before and after opening). |
| C18-E11 | `projects.spec.ts`            | Typing an existing name in any case shows "Personal already has Home." and Create stays off; the server still has one Home.                                                                                                                 |
| C18-E12 | `projects.spec.ts`            | Clicking the Settings header outside the popup closes it, creates nothing, and Settings stays open; a second Esc after Cancel closes the popup only once, then Settings on the next one.                                                    |
| C18-E13 | `projects.spec.ts`            | Editing the last row in a long list (seed 12 projects) on a 1440x700 window: the popup opens upward and is fully on screen.                                                                                                                 |
| C18-E15 | `quick-add/quick-add.spec.ts` | New project… in Quick Add: pick Teal, "Errands", Enter: the chip reads Errands with a teal dot, Settings › Projects lists Errands first in teal; typing "errands" again offers "Use Errands" and picks it.                                  |
| C18-E14 | `projects.spec.ts` (phone)    | The popup fits the screen (no horizontal overflow) and Create works with the keyboard up.                                                                                                                                                   |

The new ids are also added to `docs/tests/chunk-18.md`.

Existing cases to re-run unchanged: C18-E03 to C18-E08, C18-U01, C18-U05 to C18-U07, the task panel project picker
cases, and the Backlog filter cases (they now see newest first; any that assert order get updated with it).

## Out of scope

The other items from the same report (Inbox width, Personal's Inbox, the menu bar icon, version link and priority) are
in their own threads.
