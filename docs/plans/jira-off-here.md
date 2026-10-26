# Turn Jira off in one space, from inside it

Status: proposal, awaiting Rohit's approval. Canvas: approved by Rohit 26 Oct 2026 on the Jira page (boards
`J-OffHere` and `J-OffHere-Dark`, the "Turning it off" card on `J-Acct-Motion`, sticky `p04-offhere-draft`). Kit:
Tudu Paper v26/v27 (`JiraPanel` More menu, `AppsPanel` Turn off here).

## The report

Staging, 26 Oct (item 7): "There is no way to de-associate a space with Jira. I can add a space with an existing Jira
connection, but to disassociate it I have to completely disconnect Jira from my account."

## What is actually wrong

Nothing is broken. The per-space switch shipped with PR #24 and works end to end: Settings › Apps (You group) ›
"Use Jira in" has one switch per space, `PUT /api/spaces/:spaceId/connectors/:provider {on:false}` removes the
`connection_spaces` row, and the connection, views and other spaces are untouched (C10-A10, C10-E17 cover it).

The gap is that nothing inside a space leads to it:

- The Jira panel's More menu (`packages/ui/src/components/JiraPanel.tsx`, the `tp-jp-morew` block) has one item,
  "Disconnect Jira", which is the account-wide disconnect. In a space, that is the only "remove Jira" you can find.
- The Apps panel has "Turn on here" when Jira is off in a space, but when it is on it only offers Open. So turning on
  is one click where you are, and turning off means knowing that Settings › Apps under You holds the switch.
- From the panel, Disconnect Jira runs at once with no confirm (`apps/web/src/app/JiraHost.tsx`, `onDisconnect`), while
  the same action in Settings asks first. Reaching for "remove Jira from this space" and getting "Jira gone from all
  your spaces" without a question is the worst version of this gap.

## The change

**1. Kit (`packages/ui`), ported from Tudu Paper v26.**

- `JiraPanel`: the More menu holds, in order,
  - **Turn off in {spaceName}** ("Turn off in this space" without a `spaceName`) → new prop `onTurnOff`,
  - **Manage spaces…** → new prop `onManage`,
  - **Disconnect Jira**, now `danger` (red text, destructive-soft hover; the DS README's "never red" line is replaced).
  The menu sizes to its longest item, 200 to 280px, and ellipsizes a long space name (`.tp-jp-morepop`). Each item
  closes the menu first (130ms Pop out, as today).
- `AppsPanel`: a connected app that is on here gets a quiet **Turn off here** button under its status line
  (`.tp-app-off`, `aria-label` "Turn off Jira in {spaceName}") → new prop `onDisable(id)`. `busy` on an app that is
  on swaps it for a spinner and "Turning off…" and disables it. A new `error?: string` on an app rises in under the row
  in `destructive` (`role="alert"`, 200ms Pop in). Off here and not connected are unchanged.
- `Menu`/`MenuList`: no change, `danger` already exists.

**2. Web (`apps/web`, so the Mac app too: it runs the same pages).**

- New `useTurnOffHere(spaceId)` beside `useTurnOnHere` in `JiraHost.tsx`. It is optimistic: it writes `on: false` for
  the space into the `jiraSpacesKey()` query data (which is what `useJira(spaceId).onHere` reads), so the panel closes,
  and Jira fades from the top bar, sidebar and phone tabs at once (the existing 160ms leave). It then calls
  `jiraClient.setOn(spaceId, false)` and shows the toast **"Jira is off in {space}."** with **Undo** (Undo calls
  `setOn(spaceId, true)` and `markJiraFresh()`, so Jira plays back in the way it does after Turn on here). On failure
  it puts the old data back and shows **"Couldn't turn Jira off here."** with **Try again**.
- The Jira panel passes `onTurnOff` (the hook; on the phone it then goes to More, as Disconnect does today) and
  `onManage` (closes the panel and opens Settings › Apps with this space's row glowing).
- The Apps panel (`AppsList`) passes `onDisable` for the on state, with `busy` while the PUT is out. Here it is not
  optimistic: the row shows "Turning off…" and then settles to "Connected · off here" with Turn on here, and the toast
  arrives; a failure shows the row's `error` line and the app stays on.
- **Disconnect from the panel now asks first**, with the same `ConfirmDialog` as Settings and one more sentence:
  "To hide it only in {space}, use Turn off in {space} instead." Settings keeps today's wording.
- **Manage spaces… glow.** `SettingsHost` maps a new `highlight` search param (`?settings=apps&highlight=<spaceId>`;
  on the phone `/:slug/settings/apps?highlight=<spaceId>`) onto the matching row's `highlight`, which the kit already
  draws (`tp-set-hl`, the 1.9s wash). The param is dropped after the first render so a reload doesn't glow again.

**3. Server.** No change. The route, the membership check and the event (`CONNECTOR_CHANGED`) that tells other tabs
already exist.

## Tests

All of these run on Rohit's Mac (unit, server and E2E), per the project rule.

| ID                 | Where                                            | What it checks |
| ------------------ | ------------------------------------------------ | -------------- |
| C10-U20 (new)      | `packages/ui/src/components/JiraPanel.test.tsx`  | More opens a menu with exactly "Turn off in Northwind", "Manage spaces…", "Disconnect Jira" in that order. Each calls its own prop once (`onTurnOff`, `onManage`, `onDisconnect`) and closes the menu. Disconnect carries `tp-mi-danger`; the other two don't. Without `spaceName` the first item reads "Turn off in this space". No More button while connecting. |
| C10-U21 (new)      | `packages/ui/src/components/AppsPanel.test.tsx`  | Connected and on: "Turn off here" (`aria-label` "Turn off Jira in Acme Studio") calls `onDisable('jira')`; Open still calls `onOpen`. `busy` shows "Turning off…", disables it and draws the spinner. `error` shows the message with `role="alert"` and the button stays. Off here: Turn on here and no Turn off here. Not connected: Connect only. |
| C10-U02 (changed)  | `JiraPanel.test.tsx`                             | Its More › Disconnect Jira step now picks the third item; the rest is unchanged. |
| C10-U22 (new)      | `apps/web/src/app/jira.test.ts`                   | `useTurnOffHere` with a mocked client: the spaces data flips to off before the PUT resolves; success shows the toast with Undo, and Undo calls `setOn(id, true)`; a rejected PUT restores the data and shows "Couldn't turn Jira off here." with Try again, which retries once. |
| C10-U23 (new)      | `apps/web/src/app/settings.test.ts`               | `?settings=apps&highlight=<id>` marks only that row `highlight`, and the param is gone from the address after it renders; an unknown id glows nothing. |
| C10-E22 (new)      | `packages/e2e/tests/jira/jira.spec.ts`, desk     | The reported case: Jira on in Personal and Northwind. In Northwind, Jira › More › Turn off in Northwind: the panel closes, no Jira in Northwind's top bar or sidebar, the toast says "Jira is off in Northwind." Go to Personal: Jira is still there with its views. Settings › Apps: Northwind off, Personal on, still Connected. Back in Northwind, Undo from a fresh turn-off brings Jira back with no token asked for. |
| C10-E23 (new)      | same, desk                                       | Add an app in Northwind with Jira on: Turn off here → "Turning off…" → "Connected · off here" with Turn on here; Turn on here → Jira returns. With the PUT forced to fail (route intercept, 500), the row shows the error line and Jira stays on. |
| C10-E24 (new)      | same, desk                                       | Jira › More › Manage spaces…: the panel closes, Settings opens on Apps and the Northwind row has the glow; the address no longer carries `highlight`. |
| C10-E25 (new)      | same, desk                                       | Jira › More › Disconnect Jira asks first, and the dialog names "Turn off in Northwind". Cancel: still connected everywhere. Confirm: Jira is gone from every space and Settings › Apps shows Connect. |
| C10-E26 (new)      | same, phone                                      | Jira tab › More › Turn off in Northwind: back on More, the Jira tab fades out of the tab bar, the toast has Undo; Undo brings the tab back. |
| C10-E10, E11 (changed) | same                                         | Wherever they disconnect from the panel, they now confirm the dialog first. |

Re-run unchanged: C10-A01 to A18 (server; A10 already covers on/off/idempotent PUTs and A15 the disconnect), C10-E01
to E21, C10-U01 to U19, and the Mac app's Jira E2E (C11-D10).

## Design parity

- Canvas: `J-OffHere` and `J-OffHere-Dark` (Jira page, under "Jira per account, on per space") and the "Turning it
  off" card on `J-Acct-Motion`. The canvas copy of the kit bundle carries the same `JiraPanel` and `AppsPanel`
  changes, ungated, so every board that draws the More menu or a connected app card shows them.
- Tudu Paper: `bundle.js`, `bundle.css`, `index.d.ts`, and the `JiraPanel` and `AppsPanel` READMEs updated (v26), and
  the `AppsPanel` preview shows Turn off here (v27).
- After merge the canvas sticky turns green ("BUILT") with the PR number.

## Motion

All existing tokens: menu out 130ms (Pop); panel out `dur-panel-out` / `ease-leave`; Jira leaving the top bar and
sidebar 160ms `ease-leave`; toast 200ms `ease-arrive`; Turning off… is the same `tp-spin` as Turning on…; the error
line 200ms `ease-arrive`; the Settings glow 1.9s `ease-change`. Reduced motion turns each into a plain fade, as today.

## Out of scope

- Per-space views. Views stay one set per account (decided 25 Oct), so turning a space off and on again keeps them.
- Turning Jira off for other people in a team space. The switch is yours alone, as before.
