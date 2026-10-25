# Jira once per account, turned on per space

Status: proposal, awaiting Rohit's approval. Canvas: approved by Rohit 25 Oct 2026 on the Jira page (boards
`J-Acct-Settings`, `J-Acct-Settings-Dark`, `J-Acct-Space`, `J-Acct-Space-Dark`, `J-Acct-Motion`, sticky
`p04-acct-draft`), with the Settings boards on the G-, N-, R-C- and U- pages updated to match. Kit: Tudu Paper v23
(`Settings` Apps under You with `AccountApps`, `AppsPanel` off here, `JiraPanel` account copy, `JPLinked` space tag).

## The change in one paragraph

Today a Jira connection belongs to one user in one space (`jira_connections` is unique on `user_id, space_id`), so
you paste the same address and token again in every space, and each space has its own saved views. After this change
you connect Jira once, for your account, in Settings › Apps (now in the You group). Below the connection, "Use Jira
in" lists your spaces with a switch each. Jira (the sidebar entry, the top-bar button, the phone tab, the panel, the
task panel's Jira fact) shows only in spaces where your switch is on. The switch is yours alone: a teammate's
switch, connection and token are never seen or used by you, and yours never by them.

## Decisions (Rohit, 25 Oct)

1. One Jira site per account. No second site.
2. Jira is turned on per space ("enroll connectors for specific workspaces").
3. The linked count and the "already linked" marks span all your spaces.
4. New spaces start with Jira off, and so does a space you join or rejoin.
5. Saved views are one set per account.
6. Leaving a space, or being removed from it, deletes your switch for it. Coming back (a new invite, or the owner's
   undo of a removal) starts with Jira off there.

## What stays the same

- The token is still your own personal access token, sealed with AES-256-GCM under the key derived from
  `AUTH_SECRET` (`apps/server/src/jira/seal.ts`). No shared or workspace-level credential exists, before or after.
- Tasks still store only `jira_key` as text. Issue details are always read with the viewer's own connection, so a
  teammate never reads Jira through your token. The one known leak stays as it is: a task created from an issue copies
  the summary into its title, which every member who can see the task can read. That is the task's title, not a Jira
  read, and is unchanged by this proposal.
- The SSRF guard (`checkSite`), the client (`jira/http.ts`), and the issue, preview and search shapes are unchanged.
- All spaces (PR #22) has no Jira entry, as today. A task opened there shows the Jira fact by the task's own space:
  on there, the normal fact; off there, the key alone with Unlink only (the PR #20 rule, now keyed on the switch).

## Schema (migration `0015_jira-per-account.sql`)

1. `jira_spaces` (new): `user_id` (FK user, cascade), `space_id` (FK spaces, cascade), `enabled_at timestamptz`,
   primary key `(user_id, space_id)`. A row means "on". No row means off. Deleting the space deletes the row.
2. `jira_connections`: drop the `jira_connections_user_space` index and the `space_id` column and its FK; add a unique
   index `jira_connections_user` on `user_id`.
3. `jira_views` keeps `connection_id`, which now means per account. Its unique `(connection_id, name)` stays.

Data migration, inside the same migration before the column is dropped, for each user with one or more rows:

- Keep one connection: the newest `connected_at` among rows with `state = 'ok'`, or the newest row if all are
  expired.
- Every space where the user had a row whose `site` equals the kept row's site gets a `jira_spaces` row (on). A
  space whose row pointed at a different site is left off: one site per account, and the kept token can't read the
  other site. The user can turn it on by hand if the keys happen to match.
- Views from the dropped rows move to the kept connection. A name already used is dropped (the kept connection's
  view wins), since the same name almost always means the same JQL copied across spaces.
- The dropped rows are deleted.

Most users will have one row, so for them this is a re-key. The many-rows case is still handled and tested
(C10-A09), because anyone who connected in two spaces has it.

## Server

`apps/server/src/jira/service.ts`, `apps/server/src/routes/jira.ts`:

| Route                                                             | Before                        | After                                                                                                                                                                                                              |
| ----------------------------------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET /api/jira`                                                   | per space                     | The account connection: site, who, state, synced, views, `assigned` count. `null` when not connected.                                                                                                              |
| `POST /api/jira`                                                  | per space                     | Connect or reconnect. Body `{site, token, spaceId?}`; with `spaceId` (connecting from a space's Apps panel) that space turns on in the same transaction. A reconnect keeps the views and the switches.             |
| `DELETE /api/jira`                                                | per space                     | Disconnect: the connection, its views and every `jira_spaces` row of yours go. Tasks keep their keys.                                                                                                              |
| `GET /api/jira/spaces`                                            | new                           | Your spaces in sidebar order: `{id, name, tile, personal, on, linked}` where `linked` counts your tasks with a key in that space.                                                                                  |
| `PUT /api/spaces/:spaceId/jira`                                   | new                           | `{on: boolean}`. Membership checked with `roleIn` (any role, including viewer: the switch is about your view, not the space). Idempotent. Turning on without a connection is 409 `not-connected`.                  |
| `GET /api/spaces/:spaceId/jira/issues`, `/issues/:key`, `/search` | per-space connection          | Same paths, read with the account connection, and only when your switch is on there: off is 404 `off-here` (no Jira read happens). Keeping the space in the path keeps the gate on the server, not only in the UI. |
| `GET /api/spaces/:spaceId/jira/links`                             | your keyed tasks in the space | Moves to `GET /api/jira/links`: your keyed tasks in every space you're a member of, each with `spaceId`, `spaceName`, `tile`. Tasks in a space you left are not yours to see and are left out.                     |
| `/views`, `/views/:id`                                            | per space                     | Move to `/api/jira/views`, `/api/jira/views/:id`.                                                                                                                                                                  |

Other server changes:

- `connectionOf(db, userId)` loses `spaceId`; a new `jiraOn(db, userId, spaceId)` reads the switch. `needConnection`
  becomes `needJiraHere(db, userId, spaceId)` (connected and on).
- `JIRA_CHANGED` is published as `{}` to the user only (it was `{spaceId}`), on connect, reconnect, expiry,
  disconnect, a switch flip, and a view save or removal. Never to other members.
- `settings.ts`: the shared departure path (used by `removeMember` and `leaveSpace`) deletes the user's
  `jira_spaces` row for that space, next to the existing `allSpacesPlaces` delete. `restoreMember` does not put it
  back (decision 6). `deleteSpace` needs nothing: the FK cascades.
- `createSpace` and `join` add no row (decision 4).
- `firstRun.ts`: "has Jira" stays `exists (jira_connections where user_id)`, which is now exactly right.
- Expiry: `state = 'expired'` is on the one connection, so the banner shows in every space where Jira is on, and
  one new token fixes all of them.

## Client and web

- `packages/client/src/jira.ts`: query keys become `['jira', 'conn']`, `['jira', 'spaces']`, `['jira', 'links']`,
  `['jira', 'views']`, and `['jira', spaceId, 'issues' | 'issue' | 'search', ...]` for the in-space reads.
  `JIRA_CHANGED` invalidates `['jira']`. New `useJiraSpaces()` and `setJiraHere(spaceId, on)` with an optimistic flip
  that reverts on error (the canvas `J-Acct-Motion` timings: 520ms settle, the row's error line).
- `apps/web/src/app/jira.ts`: `useJira(spaceId)` returns `conn` only when the account is connected and `on` is true
  for `spaceId`; it also returns `connected` (account) and `onHere` so the Apps panel can draw "Connected · off here".
  `count` uses the account-wide links. The per-browser view pick `tudu.jira.view` becomes one value, not per space,
  since views are per account; an old per-space value is read once for the current space and rewritten.
- `settings.tsx`: Apps moves from the space group to You. It renders `Settings` with `appsScope` left at its default
  (account), `jira.spaces` from `useJiraSpaces()`, `onJiraSpace` → `setJiraHere`, `onJiraReconnect` → the token form,
  `onRetry` for the spaces read. `?jira` still deep-links to the Connect form; `?jira=on` from a space's Apps panel is
  not needed (the panel's own Turn on here button calls `setJiraHere`).
- `JiraHost.tsx` (`AppsHost`): Connected and off here shows "Turn on here"; connecting from here passes `spaceId`.
- `AppShell.tsx`: the Jira entries follow `useJira(spaceId).conn`, so off hides them with no other change. All spaces
  stays without Jira.
- `TaskPanel.tsx`: the PR #20 gate is unchanged in code, because `conn` now already means "connected and on here";
  in All spaces it uses the task's own space id.
- `JPLinked`: a link in another space shows "· tile name" and opening it goes to that space.

## Kit port (`packages/ui`)

Mirror Tudu Paper v23 exactly: `Settings` (Apps under You, `AccountApps`, its loading, error, highlight and
"Turning on…" states, the note about new spaces), `AppsPanel` (`off`, `busy`, `spaceName`, `onEnable`), `JiraPanel`
(`account`, `spaceName`, the account Connect and reconnect copy), `JPLinked` (`l.space`), and the CSS block "Jira
per account, turned on per space". `index.ts` exports `JiraSpaceRow`. Each component's README in the kit already
says this; the repo's component docs follow.

## Tests

Ids continue chunk 10. Ada and Ben are two test users made by the test; Northwind is a team space both are in;
Harbour is a team space only Ada is in.

| Id                               | Where                                               | Scenario                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| -------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C10-U13 (new)                    | `packages/ui/src/components/Settings.apps.test.tsx` | Apps sits in the You group with "Jira · on in 2 spaces". Not connected: Connect, no "Use Jira in". Connected: one row per space with tile, name, "You're here" on the current one, the sub-line (On / "3 linked tasks" / Off / "Off · 2 tasks keep their keys"), "2 of 3 on". Flipping a switch shows "Turning on…" and calls `onJiraSpace(id, true)`; a rejected promise flips it back and shows the row's error line. Loading draws skeleton rows; `error` shows "Couldn't load your spaces" with Try again and hides the list. Expired: "Add a new token" calls `onJiraReconnect`. |
| C10-U14 (new)                    | `packages/ui/src/components/AppsPanel.test.tsx`     | `off`: "Connected · off here" and Turn on here calls `onEnable`; `busy` shows "Turning on…" and disables it. Not connected: the account Connect copy names `spaceName` as the space that turns on.                                                                                                                                                                                                                                                                                                                                                                                    |
| C10-U15 (new)                    | `packages/ui/src/components/JiraPanel.test.tsx`     | `JPLinked` with `l.space` shows "· N Northwind"; without it nothing extra. Reconnect copy says Jira comes back in every space it was on.                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| C10-U07 (changed)                | `AppsPanel.test.tsx`                                | Its Connect copy assertion moves to the account wording.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| C10-U11 (changed)                | `packages/client` links test                        | The links read is account-wide and is invalidated by `JIRA_CHANGED {}`, not by a space id.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| C10-U16 (new)                    | `apps/web` `jira.test.ts`                           | `useJira(spaceId).conn` is null when connected but off here, and set when on; the old per-space `tudu.jira.view` value migrates to the one key once.                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| C10-A09 (new)                    | `apps/server/src/jira.test.ts`                      | Migration: a user with rows in Personal (ok, site A, views "Mine", "Bugs"), Northwind (expired, site A, views "Mine", "Ops") and Harbour (ok, site B) ends with one connection (the newest ok one on site A), switches on in Personal and Northwind, off in Harbour, and views "Mine", "Bugs", "Ops" once each. A second user's rows are untouched by the first user's merge.                                                                                                                                                                                                         |
| C10-A10 (new)                    | same                                                | Connect once from Personal with `spaceId`: Personal on, Northwind off. `GET /api/spaces/:northwind/jira/issues` is 404 `off-here` and the fake Jira saw no request. `PUT .../northwind/jira {on:true}` then the same read returns issues. `PUT ... {on:false}` makes it 404 again. Two PUTs in a row are idempotent.                                                                                                                                                                                                                                                                  |
| C10-A11 (new)                    | same, two users                                     | Isolation: Ada connects and turns Northwind on. Ben, a member of Northwind with no connection, gets `null` from `GET /api/jira`, 404 `off-here` from Northwind's issues, and `jira.spaces` shows only his own switches. Ben connects his own token: reads in Northwind use Ben's token (the fake Jira sees Ben's header, never Ada's). Ada's `JIRA_CHANGED` events never reach Ben's socket, and his never reach hers.                                                                                                                                                                |
| C10-A12 (new)                    | same                                                | Membership: Ben cannot `PUT /api/spaces/:harbour/jira` (not a member, 404). A viewer in Northwind can flip their own switch. `PUT ... {on:true}` with no connection is 409 `not-connected`.                                                                                                                                                                                                                                                                                                                                                                                           |
| C10-A13 (new)                    | same                                                | Links across spaces: Ada has keyed tasks in Personal (TUDU-1) and Northwind (TUDU-2), Ben has TUDU-3 in Northwind. Ada's `GET /api/jira/links` has TUDU-1 and TUDU-2 with their space ids, not TUDU-3. The assigned count leaves out both of Ada's keys. Turning Northwind off keeps TUDU-2 in the links (the key stays on the task).                                                                                                                                                                                                                                                 |
| C10-A14 (new)                    | same                                                | Leaving and removal: Ada leaves Northwind → her `jira_spaces` row is gone; the owner's undo of a removal of Ada brings her back with Jira off; deleting Harbour removes its row by cascade. A new space Ada creates starts off; joining by invite starts off.                                                                                                                                                                                                                                                                                                                         |
| C10-A15 (new)                    | same                                                | Expiry and disconnect: the fake Jira refuses the token → the connection is expired, and both on spaces' reads answer `expired`. A reconnect with a good token clears it everywhere and keeps the views and the switches. `DELETE /api/jira` removes the connection, the views and every switch; tasks keep `jira_key`.                                                                                                                                                                                                                                                                |
| C10-A01..A08 (changed)           | same                                                | Re-pointed at the account routes; their assertions are otherwise unchanged. A08 additionally checks the switches go with the connection.                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| C10-E16 (new)                    | `packages/e2e/tests/jira/jira.spec.ts`, desk        | The reported case end to end: connect Jira once in Personal's Apps panel (Personal turns on). Create Northwind: no Jira in its sidebar or top bar, its Apps panel says "Connected · off here". Turn on here → the Jira entry appears with no token asked for, and Assigned to me lists the issues.                                                                                                                                                                                                                                                                                    |
| C10-E17 (new)                    | same, desk and phone                                | Settings › Apps (You group): the spaces list, flip Northwind off → its row reads "Off · 1 task keeps its key"; go to Northwind: no Jira entries, and a keyed task's panel shows the key alone with Unlink only. Flip it on again → the entries come back. Phone: Settings › Apps pushes in, the switches work, ‹ goes back.                                                                                                                                                                                                                                                           |
| C10-E18 (new)                    | same, two browsers                                  | Two users in Northwind: Ada connected and on; Ben not connected. Ben sees no Jira in Northwind, and Ada's keyed task in Ben's panel shows the key as words with no status. Ada flipping her switch changes nothing on Ben's screen (no refetch, no entries).                                                                                                                                                                                                                                                                                                                          |
| C10-E19 (new)                    | same, desk                                          | Linked across spaces: link TUDU-226 to a task in Personal; in Northwind's Jira panel TUDU-226 shows linked with "· P Personal", and the Jira count in Northwind leaves it out. Open it → Personal, with the task in view.                                                                                                                                                                                                                                                                                                                                                             |
| C10-E20 (new)                    | same, desk                                          | Expired once, fixed once: with two spaces on, the token expires; both show the banner. Add a new token from Settings › Apps → both clear.                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| C10-E15 (changed)                | same                                                | Was "connected in Personal, none in Northwind"; now "on in Personal, off in Northwind" set through the switch, same assertions.                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| C10-E01, E02, E10, E11 (changed) | same                                                | Connect and Disconnect move to the account (Settings › Apps under You); the Disconnect confirm says Jira goes from all your spaces. The phone flow in E11 opens Settings › Apps from More.                                                                                                                                                                                                                                                                                                                                                                                            |
| C21-E (All spaces), re-run       | `packages/e2e/tests/all-spaces/*`                   | Add one case: a task from Northwind (off) opened in All spaces shows the key alone; one from Personal (on) shows the full fact.                                                                                                                                                                                                                                                                                                                                                                                                                                                       |

Re-run unchanged: C10-E03 to E09, E12 to E14, the first-run tests (C01-E\*, the Jira hint), and the Inbox and People
panel flows (C08-E10 to E20).

`docs/tests/chunk-10.md` gets the rows above, and the chunk's choice 1 note ("a connection belongs to one space")
is rewritten to say per account, on per space, with the date.

## Design parity

- Canvas v92 already shows every state above: the eight Settings states plus the Disconnect confirm
  (`J-Acct-Settings`, light and dark), the space-side states (`J-Acct-Space`), and the switch motion
  (`J-Acct-Motion`). The prototype boards (G-, N-, R-C-, U-) render Apps under You with the spaces list.
  `J-NoJira` now reads "Jira off in this space".
- Kit: Tudu Paper v23 holds the components and `index.d.ts`; `packages/ui` mirrors it, and the PR description lists
  the kit version it matches.
- Nothing ships in the app that the canvas doesn't draw: if implementation finds a state the boards miss (for
  example the 409 `not-connected` from a stale tab), I add the board first and say so in the PR.

## Rollout

One PR on `claude/project-thread-x9qljg`. The migration runs on deploy; staging first, then a normal release. No
feature flag: every existing connection migrates to "connected, on in the spaces it was connected in", so nobody
loses Jira where they had it.
