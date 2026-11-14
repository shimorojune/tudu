# Projects list polish: one row fill, no jump after Save

Status: proposal, waiting for Rohit. Canvas approved 14 Nov 2026: boards "Projects list, polished" (K-ProjectsPolish,
K-ProjectsPolish-Dark) on the "Spaces, people & projects" page of the design canvas.

## The report

Rohit, 14 Nov 2026, Settings › Space › Projects: "projects view is not as polished as it should be. Some random border
radius, once I edit the color, its shifting in place for some reason..." The screenshot shows the hovered Astra row
with a large rounded fill that does not line up with anything around it.

## What is actually wrong

Both come from `packages/ui/src/components/ProjectSettings.tsx` and the `.tp-prj-*` rules in
`packages/ui/src/styles/app.css`.

### The radius

The hover (`--accent`) and open (`--selection`) fill sits on `.tp-prj-main`, the name button, with
`border-radius: var(--radius-lg)` (12px) on all four corners. The row has 6px of right padding and the ⋯
`IconButton` sits outside the button. So the lit area is a pill that is rounded where it meets square hairlines and
stops short of the card's right edge. The focus ring (`inset 0 0 0 2px var(--ring)` on the button) has the same shape.

### The shift after Save

`save()` calls `markFresh(project.id)` for an edit as well as for a create, and `.tp-prj-fresh` runs two animations:
`tp-row-wash` and `tp-row-open` (`max-height: 0` to `160px`, `opacity` 0 until 60%, 360ms). `tp-row-open` is the
arrival of a new row. On a row that was already there, it folds the row to 0 height for the first frame. Everything
under it jumps up and back, and the row stays invisible for about 200ms before it fades in. I measured this on the
canvas replica of the CSS: the row's height went 49 → 27 → 49px across two frames, and the line under the list moved
by 22px and back.

A smaller part of the same problem: while a row is being edited it is rendered inside `<Popover.Anchor asChild>`, and
otherwise it is not. React sees a different element type at that position, so the row's DOM node is unmounted and
mounted again on open and on close. That restarts its transitions and is why focus has to be put back by an effect.

### Design system drift

The design system has no ProjectSettings component. Only canvas board 13b (K-Projects-Flow) draws this list, so
nothing in the design system would have caught either problem.

## The change

### Row fill (CSS only, `app.css`)

- The fill moves from `.tp-prj-main` to `.tp-prj-row`. `.tp-prj-row:hover` is `--accent`, `.tp-prj-row.tp-on` is
  `--selection`, with `transition: background-color var(--dur-menu) var(--ease-change)` on the row. The fill now runs
  edge to edge and covers ⋯. The ⋯ button keeps its own hover; `--accent` is translucent, so it reads one step darker
  on a lit row.
- `.tp-prj-main` loses its `border-radius`, its hover background and its focus box-shadow.
- Only the card's outer corners are round. The first row gets `radius-lg` on its top corners and the last row on its
  bottom corners. The selectors are written on the list's children
  (`.tp-prj-list > :first-child`, `> :last-child`, and `> * + *` for the hairline) so the kit's inline editor, which
  wraps the open row in `.tp-prj-anchor`, keeps its hairlines and corners too. Today that wrapper drops the hairline
  above and below the open row in the kit.
- Keyboard focus: `.tp-prj-row:has(.tp-prj-main:focus-visible)` draws the 2px `--ring` inset on the row, so the ring
  follows the row's shape. `:has` works in every engine we ship (WebKit 15.4+, Chromium 105+).
- `.tp-prj-dot` gets `transition: background-color var(--dur-menu) var(--ease-change)`, so a new colour crossfades
  in 160ms.

### Save vs create (`ProjectSettings.tsx` + `app.css`)

- `fresh` becomes `{ id, kind: 'new' | 'saved' }`. `markFresh(id, kind)`; Create passes `'new'`, Save passes
  `'saved'`.
- `.tp-prj-fresh` is split in two:
  - `.tp-prj-arrive` (Create): `tp-row-open` + `tp-row-wash`, exactly as today.
  - `.tp-prj-saved` (Save): `tp-row-wash` only. No height or opacity change, so nothing moves.
- Saving the same row twice inside the 2.2s wash restarts the wash: the class is cleared, then set again on the next
  animation frame.
- Reduced motion: a `prefers-reduced-motion` rule makes `.tp-prj-arrive` the wash alone, and `less-motion.css` is
  regenerated with `scripts/less-motion.mjs` (it is generated, never edited by hand).

### Stable row node (`ProjectSettings.tsx`)

- Rows are always rendered the same way. The popup anchors to the open row with
  `<Popover.Anchor virtualRef={…}>`, which points at the row element from the existing `rows` ref map, instead of
  wrapping the row in `Popover.Anchor asChild`. The row is no longer unmounted when its popup opens or closes. The
  focus effect stays, because Create still needs it for the row that arrives a render later.
- The inline (kit) path keeps its in-flow popup, under the row inside `.tp-prj-anchor`.

### Not changing

New project still opens the popup, and the project is only made on Create project. The popup itself, its motion,
placement and focus rules, the empty state, the name-taken check, the 50/60 count, Delete with Undo, and the
newest-first order all stay as they are. There is no loading or error state to add: the list is the space's local
data and draws at once, and a save that fails to sync retries in the background like every other change.

## Design system and canvas (no drift)

- Design system: add a ProjectSettings component (README, and a preview with the list, a hovered row, the open popup,
  the just-saved wash and the empty state, light and dark), and add its CSS to `bundle.css`. Settings' README gets a
  `projects` line pointing to it.
- Canvas: the approved boards become "built" once this merges. Board 13b (K-Projects-Flow) is updated to the
  row fill and the save behaviour so it doesn't contradict the new boards. Its "How it moves" line "Create: the new
  row opens its gap…" stays; I'll add "Save: the wash only".
- The canvas's own copy of the kit has no `tp-prj` rules, so nothing else there changes.

## Test scenarios

Tests run on PR CI (Rohit, 10 Nov 2026: no test runs on his Mac).

### Updated

| ID      | File                                                  | Change                                                                                                                                                                   |
| ------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| C18-U13 | `packages/ui/src/components/ProjectSettings.test.tsx` | After Create the new row has `tp-prj-arrive` and focus; after Save the edited row has `tp-prj-saved` and not `tp-prj-arrive`. (Today it checks `tp-prj-fresh` for both.) |
| C18-E10 | `packages/e2e/tests/settings/projects.spec.ts`        | Checks `tp-prj-arrive` on the new first row instead of `tp-prj-fresh`. Otherwise unchanged.                                                                              |

### New

| ID      | File                                                     | Case                                                                                                                                                                                                                                                                                       |
| ------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| C18-U19 | `ProjectSettings.test.tsx`                               | Saving a second time on the same row inside the wash restarts it: the class goes off, then on again on the next frame.                                                                                                                                                                     |
| C18-U20 | `ProjectSettings.test.tsx`                               | Opening and closing a row's popup keeps the same row DOM node (the element before open `===` the element after close), and the popup is anchored to it.                                                                                                                                    |
| C18-E16 | `projects.spec.ts`                                       | Recolour a row and Save, with three rows: sampled every animation frame for 600ms after Save, every row's top and height and the section under the list stay within 0.5px of where they were before Save, and the edited row's opacity never drops below 1.                                |
| C18-E17 | `projects.spec.ts`                                       | The fill: hover the middle row; its computed background is `--accent` on the row and transparent on the name button, and the row spans the list's full width. Hover the first and last rows: their outer corners are 12px and their inner corners 0. Tab to a row: the ring is on the row. |
| C18-E18 | `projects.spec.ts`                                       | Dark: E16 and E17 again in dark.                                                                                                                                                                                                                                                           |
| C18-E19 | kit (`SettingsStates`), `projects.spec.ts` C18-E09 block | The kit's open-row state keeps the hairline above and below the open row and the card's corners (light and dark).                                                                                                                                                                          |

The chunk-18 test list (`docs/tests/chunk-18.md`) gets these rows, and STATUS.md is refreshed with `pnpm test:status`.

### Manual check (Rohit, Mac app, after the release)

- MC-PR01: Settings › Space › Projects, hover a row in light and dark: the fill runs edge to edge with no rounded
  inner corners. Change a project's colour and Save: nothing below the list moves, and the row washes once.

## Risks

- `:has()` on the focus ring: if an older WebKit lacked it, the fallback is no ring on the row. That would be an
  accessibility regression, so the button keeps `outline: none` only inside an `@supports selector(:has(*))` block.
  Without `:has` it keeps today's ring.
- `virtualRef` is a Radix Popper prop that `Popover.Anchor` passes through. If the popup's placement changes in
  C18-E13 (opens upward near the bottom), I fall back to keeping `asChild` but wrapping every row in it all the time,
  which also keeps the node stable.
