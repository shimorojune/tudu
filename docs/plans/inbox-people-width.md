# Inbox and People: use the width the design gives them

Status: approved by Rohit 24 Oct 2026; implemented. Canvas: approved 24 Oct 2026 (notes `p08-width` on the Inbox page and
`p09-width` on the Spaces page of the canvas, v32), with a 1120px cap as drawn.

## The bug

On the desk, the canvas draws the Inbox (`I-B-Panes`, `I-Desktop-Dark`) and People (`X-People`, `X-Member`, `X-Sent`)
as two panes in a column capped at **1120px**, centred. At a 1440 window the page column is about 1164px, so the
panes run nearly wall to wall.

The app gives both pages the same 800px centred column as Today and Backlog: `.app-page > .tp-sheet` and
`.app-page > .tp-banner-wrap` in `apps/web/src/app/shell.css` use `--sheet-max-width` (800px). At 1440 that leaves
about 180px empty on each side, and the right pane (the picked item, Everyone, one person's week) is cramped.

## The change

1. New token `--panes-max-width: 1120px` next to `--sheet-max-width` in `packages/ui/src/styles/tokens-extra.css`,
   and the same token added to the Tudu Paper design system's tokens so the canvas and the app share the value.
2. In `apps/web/src/app/shell.css`, the desk and tablet Inbox and People pages use it for the sheet and the banner:

   ```css
   .app-page:is(.app-inbox, .app-people):not(.app-inbox-phone, .app-people-phone) > .tp-sheet,
   .app-page:is(.app-inbox, .app-people):not(.app-inbox-phone, .app-people-phone) > .tp-banner-wrap {
     max-width: var(--panes-max-width);
   }
   ```

3. Nothing else moves. The left lists keep their widths (Inbox 380px, People 300px; tablet 320px and 260px); the right
   pane takes the rest. Phones keep their one-column pages.
4. Fix the stale comment in `apps/web/src/routes/inbox/inbox.css` ("360px wide", the value is 380px).

Motion: none new. The page fade, the pane ease-in, the list turn and the banner grow are unchanged; resizing the window
just reflows.

Who sees a difference: windows whose page column is wider than 800px, so the desk from roughly 1080px up. Tablet's
column is narrower than 800px already, so it does not change.

## Tests

New end-to-end cases, in the existing groups (Playwright, desktop project at 1440x900 unless said):

| Id      | Where                                      | Scenario                                                                                                                                                                                                                                                                         |
| ------- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C08-E21 | `packages/e2e/tests/inbox/inbox.spec.ts`   | Desk at 1440x900: the Inbox sheet is 1120px wide (±1) and centred in the page column (left and right gaps equal ±1). Resize to 1920x1080: still 1120px and centred. Resize to 1100x800: the sheet fills the column (its width equals the column's). Skipped on tablet and phone. |
| C08-E22 | `packages/e2e/tests/spaces/spaces.spec.ts` | The same three checks for People in Northwind, with Everyone and then one person picked (picking only turns the right side; the sheet width does not change). Skipped on tablet and phone.                                                                                       |
| C08-E23 | `packages/e2e/tests/inbox/inbox.spec.ts`   | Offline on the desk at 1440: the "You're offline." banner on the Inbox and on People is as wide as the sheet below it and lines up with its left edge.                                                                                                                           |
| C01-E09 | `packages/e2e/tests/shell/shell.spec.ts`   | Regression: the Backlog at 1440 stays at 800px, centred, so the change does not leak to the one-sheet pages. (Today on the desk is a spread with its own width, so it is not part of this check.)                                                                                |

Existing cases to re-run, unchanged: C08-E05, C08-E08, C08-E09 (People on all three sizes), C08-E10 to C08-E20 (the
Inbox flows), and the kit pages' visual checks if they cover the Inbox or People.

No unit tests: the change is CSS only and jsdom has no layout, so the end-to-end cases are the right level.

## Out of scope

The other items from the same report (Personal's Inbox, the menu bar icon, the version link, the menu bar priority,
the New project flow) are handled in their own threads.
