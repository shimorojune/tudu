# Connect Jira from All spaces, and On/Off beside the switch

Status: proposal, awaiting Rohit's approval. Issues: #59 (Connect apps does nothing in All spaces) and #63 (the
apps' On/Off in the spaces list). Canvas: approved by Rohit 2 Nov 2026 on the Jira page (boards `J-AllApps` and
`J-AllApps-Dark`, sticky `p04-allapps-draft`; captions on `J-Acct-Settings`, `J-Acct-Settings-Dark` and
`J-Acct-Motion` updated). Kit: Tudu Paper v54/v55 (`Settings` Use Jira in rows, `JiraPanel` `allSpaces`).

Decided with Rohit (2 Nov): connecting from All spaces turns Jira on **nowhere**; you pick the spaces in Settings ›
Apps. AI access is unchanged (its rows have no switch).

## #59: what is wrong

All spaces renders `AppShell` with `all`, and the shell skips the two Jira hosts there
(`apps/web/src/app/AppShell.tsx`, the `hosts` block: `{all ? null : <JiraHost …/>}` and the same for `AppsHost`).
Three things in All spaces still try to open them:

1. Settings › Apps › **Connect** calls `openJira()` in `apps/web/src/app/settings.tsx`, which sets `?jira`. Nothing
   reads it, so nothing happens. This is #59.
2. Settings › Apps › **Add a new token** (expired) goes the same way.
3. Getting started's **Bring your Jira issues** calls `openApps()` (`apps/web/src/app/firstRun.tsx`), which sets the
   Apps panel flag that only `AppsHost` reads.

One more slip: in All spaces `SettingsHost` gets `space` = Personal (`router.tsx`, `target`), so Personal's row in
Use Jira in says "You're here".

Phones are not affected: Settings is a page under a space there (`/<slug>/settings`), so Connect goes to that space's
Jira page as it does today.

## #63: what is wrong

In Use Jira in, the state word (On, Off, "Off · 2 tasks keep their keys") sits on the line under the space's name, a
dialog's width away from the switch it describes, and a space with linked tasks shows no On at all ("4 linked
tasks" replaces it).

## The change

### 1. Kit (`packages/ui`), ported from Tudu Paper v54

`Settings` (`AccountApps`), the Use Jira in rows:

- The switch sits inside `<label class="tp-set-sw">` with its state word before it (`.tp-set-state`): **On** (ink,
  `.tp-on`), **Off** (muted), or a spinner and **Turning on… / Turning off…** while busy (`.tp-busy`). The word is
  `aria-hidden` (the switch already has its role, name and checked state); the label makes the word clickable.
  Right-aligned, so the switch never moves when the word changes.
- The line under the name is only the linked count: "4 linked tasks" while on, "2 tasks keep their Jira keys" while
  off, nothing without links. `jiraSpaceLine` becomes `jiraSpaceWord(on, busy)` + `jiraSpaceCount(on, linked)`
  (exported for tests; `jiraSpaceLine` is removed from `index.ts`, nothing else uses it).
- An off row (`.tp-set-sp2.tp-off`) rests quieter: the tile at opacity .5, the name in `--foreground-2`.
- Skeleton rows draw a short word bar beside the switch bar.
- New `SettingsProps.allSpaces`: no row says "You're here". New `jira.glowAll`: every row glows once (the existing
  `tp-row-wash`), for the moment you come back from connecting in All spaces.
- `spaceRows?: 'paired' | 'stacked'` exists only on the canvas/DS for the Before frame; the app has no old row, so the
  kit doesn't take the prop.
- CSS: the Tudu Paper tail (`.tp-set-sw`, `.tp-set-state`, `.tp-set-sp2`) goes into `components.css` after
  `.tp-set-here`, plus the matching lines in `less-motion.css` (word without the rise, colours at once).

Motion (all existing tokens): the word crossfades up 3px in 160ms linear (`tp-label-in`, keyed on the word); the
knob 200ms ease-settle (unchanged); the off row's tile and name 180ms ease-change; the error line 200ms
(`tp-banner-in`, unchanged); after connecting, rows rise 260ms (`tp-set-in`) and glow 1.9s.

`JiraPanel` / `JPConnect`: new `allSpaces` prop. Its connect line reads "Connect once for your account with a
personal access token. Then pick the spaces it shows in; it starts off everywhere until you do." Reconnect words are
unchanged.

### 2. Web (`apps/web`, so the Mac app too)

- **New `JiraConnectHost`** in `JiraHost.tsx`, mounted by `AppShell` only when `all` (desktop and tablet). It reads
  `?jira` like `JiraHost` and opens the same `Drawer` with `JiraPanel` in `connect`, `connecting` or `reconnect`
  only (`allSpaces`, `account`, no list, no `spaceName`):
  - Not connected: the connect form. `jiraClient.connect(site, token)` **without** `spaceId`, so no space turns on
    (the server already supports that: `connections` row, no `connection_spaces` row).
  - Expired: the reconnect form, as in a space (the switches come back as they were).
  - Connected and fine (a stale `?jira` link): the param is dropped, nothing opens.
  - On the Connected tick (`onConnected`): `glowJiraSpace(ALL_GLOW)`, then one navigation that removes `?jira` and
    sets `?settings=apps`. The Drawer slides out and Settings fades in on Apps.
  - Close (× / Esc) just removes `?jira`.
- **The glow store** (`jira.ts`) accepts the sentinel `ALL_GLOW = '*'`: `SettingsView` maps it to
  `jira.glowAll: true` instead of one row's `highlight`, and clears it once drawn, as today.
- **`SettingsHost` / `SettingsView`** get `all` from `AppShell` and pass `allSpaces` (no "You're here").
- **Getting started** (`firstRun.tsx`): in All spaces on the desk, Bring your Jira issues opens
  `settingsHref(loc, space.slug, 'apps', false)` instead of `openApps()`. In a space, and on phones, unchanged.
- Nothing changes on the server, in `packages/client` or in the database.

### 3. Docs

- `docs/tests/chunk-10.md` and `chunk-21.md`: the rows below; C10-U13 and C10-E17 reworded for the new row.
- This plan gets an "As built" section in the PR.

## Test scenarios

New IDs continue each chunk. All run on Rohit's Mac (`pnpm test …` and `pnpm e2e jira`, `pnpm e2e all-spaces`).

### Unit

| ID | Where | Case |
| --- | --- | --- |
| C10-U24 | ui `Settings.apps.test.tsx` | Use Jira in rows: the word beside the switch reads On / Off; busy reads Turning on… with a spinner and the switch is disabled; the line under the name is "4 linked tasks" when on, "2 tasks keep their Jira keys" when off, absent with no links; an off row has `tp-off`; clicking the word flips the switch and calls `onJiraSpace`; a refusal puts the word back to Off with the reason under the row |
| C10-U25 | ui `Settings.apps.test.tsx` | `allSpaces`: no row says You're here even when `current` is set; `jira.glowAll`: every row has `tp-set-hl`; skeleton rows draw the word bar |
| C10-U26 | ui `JiraPanel.test.tsx` | `allSpaces`: the connect form says you pick the spaces next and names no space; without it the form still names `spaceName` (C10-U15 unchanged) |
| C10-U27 | web `JiraHost.test.tsx` | `JiraConnectHost`: `?jira` while not connected opens the form; Connect calls `jiraClient.connect` with no space id; after the tick the address has `?settings=apps` and no `jira`, and the glow store holds `*`; expired opens Reconnect; already connected drops `?jira` and renders nothing; × removes `?jira` |
| C10-U28 | web `settings.test.ts` | `SettingsView` with the `*` glow passes `glowAll` and clears it after the first draw; in All spaces it passes `allSpaces` |
| C21-U23 | web `firstRun.test.tsx` | In All spaces on the desk, Bring your Jira issues navigates to `?settings=apps` and does not open the Apps panel; in a space it still opens the Apps panel; on a phone it still goes to the space's Apps page |
| C10-U13 | ui (reworded) | Expectations follow the new row: the word beside the switch, the count-only line |

### End to end (Playwright, fake Jira at `/__test/jira`)

| ID | Spec | Case |
| --- | --- | --- |
| C10-E27 | `jira.spec.ts` | Two spaces, no Jira. In All spaces: avatar › Settings › Apps › Connect opens the token form beside All spaces (no Jira in the top bar); a `good-` token → Checking… → Connected → the panel goes and Settings is open on Apps: every row Off, "0 of 2 on", no You're here. Back in Personal, no Jira in the top bar until its switch is turned on in Settings |
| C10-E28 | `jira.spec.ts` | In All spaces, a refused token shows the reason under the token field and keeps what was typed; close the panel: `GET /api/connectors/jira` still says not connected |
| C10-E29 | `jira.spec.ts` | Connected and on in Personal, then the token expires (`/__test/jira/expire`). In All spaces: Settings › Apps › Add a new token opens Reconnect beside All spaces; a new `good-` token brings Personal back on and the other space stays off |
| C10-E30 | `jira.spec.ts` | Settings › Apps row layout: each row's state word is in the same row as its switch and to its left (bounding boxes), On for Personal and Off for the other; flipping the other shows Turning on… then On; with the PUT aborted (route) it goes back to Off with the reason under the row. Light and dark |
| C21-E28 | `all-spaces.spec.ts` | A new account with two spaces: in All spaces, Getting started › Bring your Jira issues opens Settings on Apps (not connected, Connect visible) |
| C10-E17 | `jira.spec.ts` (reworded) | "Off · 1 task keeps its key" becomes the word Off beside the switch and "1 task keeps its Jira key" under the name |

## Risks

- The new host shares `?jira` with `JiraHost`; they never mount together (`all` picks one), so there is no double
  drawer.
- Connecting in All spaces with no space on is new for the server path, but `connect` without `spaceId` already exists
  and is what every reconnect uses; C10-E27 checks the stored state.
- Wording "tasks keep their Jira keys" is longer than before; the count line wraps under the name on a phone before the
  word beside the switch does (checked on the canvas phone frame).
