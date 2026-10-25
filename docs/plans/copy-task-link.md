# The task ID chip copies the task's link

Status: approved by Rohit 25 Oct 2026; implemented. Canvas: approved 24 Oct 2026 (board `D-CopyLink` on the Task detail page, v67),
light and dark.

## What Rohit asked for

"I should also be able to copy link to a task from the task id copy button since that is what I would share with
others." The link is what gets sent to people; the bare ID is the rarer need.

## What changes for the person

- **The ID chip in the task panel** (top left, `LM-1`) copies the task's link, `<origin>/t/LM-1`, the same address
  "Copy link to task" in ⋯ copies today. Tooltip "Copy link", accessible name "Copy link to LM-1".
- **The ID in a row's byline** (Today and Backlog; Week's tiles show no ID) does the same.
- On hover or keyboard focus a small link mark fades in and slides 4px out beside the ID (dur-menu 160ms,
  ease-arrive). The chip grows only to the right, into empty space, so nothing else moves.
- On a successful copy the mark scales into a tick (160ms), the chip keeps its wash for `COPY_FLASH_MS` (700ms) and a
  toast says **Link copied**.
- If the clipboard refuses, no tick and the toast says **Couldn’t copy the link. Try again.** Today the toast says
  "Copied" before the write has even finished, whether or not it worked. The ⋯ menu items get the same honesty.
- **⋯ is unchanged:** "Copy link to task" and "Copy task ID · LM-1" both stay, so the bare ID (for Jira, commit
  messages) is one click away.
- A task with no ID yet shows no chip, as now. A row or panel rendered without a link (the design kit pages) keeps
  copying the ID, so nothing breaks where no address exists.
- Reduced motion: fades only, no slide or scale.

## How

1. `packages/ui/src/lib/clipboard.ts` (new): `copyText(text): Promise<boolean>`: resolves `true` when
   `navigator.clipboard.writeText` succeeds, `false` when it is missing, throws or rejects. One place instead of the
   two copy-paste `try { void writeText }` blocks in `TaskRow` and `TaskDetail`.
2. `packages/ui/src/lib/icons.tsx`: add `link` (lucide `Link2`) and `check` (lucide `Check`).
3. `TaskDetail`: the `tp-td-id` chip copies `p.link` when there is one (else the ID, as today), awaits `copyText`,
   then flashes and toasts "Link copied" or the error. ⋯ items use the same helper. Chip markup gains the
   `tp-id-ic` icon slot (link mark and tick stacked).
4. `TaskRow`: new `link?: string` prop; `copyId` becomes `copy`, same rules as the panel. The `tp-flash` class only
   lands after a successful write.
5. `TaskList`: new `linkFor?: (t: TaskItem) => string | undefined` prop, passed to each row as `link`.
6. `apps/web`: one `taskLink(ref)` in `app/links.ts` (`${window.location.origin}/t/${ref}`) replaces the five inline
   `linkFor` lambdas (Today, Week, Backlog, Inbox, People) and is passed to `TaskList` on Today and Backlog (Week's brief rows have no ID chip).
   On the Mac app the window's origin is the hosted app (`tudu.ezdev.net`, or staging), so the link is shareable there
   too.
7. CSS in `components.css`: the icon slot (`width 0 → 13px`, opacity, `translateX(-4px) → 0`), the tick swap and the
   reduced-motion override, for both `.tp-td-id` and `.tp-byline .tp-sg-id`. Tokens only, so light and dark both
   follow the theme.
8. **Design parity:** after implementation, update the Tudu Paper design system's `TaskDetail` and `TaskRow`
   components with the same chip (link mark, tooltip, copy rules), refresh the canvas's copy of the bundle, and fold
   the `D-CopyLink` board's notes into `D-Motion` (one "Copy the link" card) so canvas and app say the same thing.

## Test scenarios

Unit (Vitest, `packages/ui`):

| ID               | Where           | Scenario                                                                                                                             |
| ---------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| C02-U04 (update) | TaskRow.test    | With `link`, clicking the ID writes the link, flashes in place, toast "Link copied", the row does not open; flash clears after 700ms |
| C02-U24 (new)    | TaskRow.test    | Without `link`, the ID chip keeps copying the ID ("Copy task ID ME-58", "Copied ME-58")                                              |
| C02-U25 (new)    | TaskRow.test    | Clipboard rejects: no `tp-flash`, toast "Couldn’t copy the link. Try again."                                                         |
| C02-U26 (new)    | TaskRow.test    | Accessible name "Copy link to ME-58", tooltip "Copy link"; the link and tick icons are `aria-hidden`                                 |
| C03-U08 (update) | TaskDetail.test | ⋯ still lists Copy link to task, Copy task ID · ME-52, Delete task; the copies toast only after the write resolves                   |
| C03-U25 (new)    | TaskDetail.test | The top ID chip copies `https://tudu.test/t/ME-52`, gets `tp-flash`, toast "Link copied"; without `link` it copies the ID            |
| C03-U26 (new)    | TaskDetail.test | Clipboard missing or rejecting: error toast, no flash, nothing thrown                                                                |
| C03-U27 (new)    | TaskDetail.test | CSS: the icon slot animates width/opacity/transform with `--dur-menu` `--ease-arrive`; reduced motion drops the transform            |
| new              | clipboard.test  | `copyText` true on resolve, false on reject, false when `navigator.clipboard` is absent or `writeText` throws synchronously          |
| new              | TaskList.test   | `linkFor` reaches each row: the byline chip of the second task is named "Copy link to" its ID                                        |

E2E (Playwright, `packages/e2e`):

| ID               | Where         | Scenario                                                                                                                |
| ---------------- | ------------- | ----------------------------------------------------------------------------------------------------------------------- |
| C02-E09 (update) | today.spec    | Clicking the row's ID says "Link copied" and the clipboard holds `<origin>/t/ME-1`; opening that address opens the task |
| C03-E10 (extend) | detail.spec   | The panel's ID chip copies `<origin>/t/ME-1` with "Link copied"; ⋯ › Copy task ID still copies `ME-1`                   |
| C03-E17 (new)    | detail.spec   | Clipboard permission denied: the error toast shows and no "Link copied"                                                 |
| detail.spec:58   | detail.spec   | Update the locator from "Copy task ID ME-2" to "Copy link to ME-2"                                                      |
| week / backlog   | week, backlog | One check each that the row chip is "Copy link to …" (the `linkFor` wiring on those pages)                              |

`docs/tests/chunk-02.md` and `chunk-03.md` get the new and changed rows.

## Not doing

- No Shift-click or second chip for the bare ID: ⋯ already has it.
- No change to what `/t/<ref>` does when opened.
