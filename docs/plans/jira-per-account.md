# Connectors once per account, turned on per space (Jira first)

Status: approved by Rohit 25 Oct ("let's go ahead") and implemented; see **As built** for where the code differs from
this proposal. Revised 25 Oct after Rohit's "yes, we need to generalize": the
schema no longer names Jira; Jira is the first connector of a general model. Canvas: approved by Rohit 25 Oct 2026 on the Jira page (boards
`J-Acct-Settings`, `J-Acct-Settings-Dark`, `J-Acct-Space`, `J-Acct-Space-Dark`, `J-Acct-Motion`, sticky
`p04-acct-draft`), with the Settings boards on the G-, N-, R-C- and U- pages updated to match. Kit: Tudu Paper v23
(`Settings` Apps under You with `AccountApps`, `AppsPanel` off here, `JiraPanel` account copy, `JPLinked` space tag).

## The change in one paragraph

Today a Jira connection belongs to one user in one space (`jira_connections` is unique on `user_id, space_id`), so
you paste the same address and token again in every space, and each space has its own saved views. Jira is also
hardcoded through the schema: `tasks.jira_key`, `jira_connections`, `jira_views`, the `jira_state` enum and the
`jira.linked` / `jira.unlinked` history kinds.

After this change:

1. **Generic connectors.** The database knows "connectors" with a `provider` column (`'jira'` is the only value
   today). A task's links to outside issues live in `task_links`, not in a Jira column. Adding a second connector
   (GitHub issues, Linear) means a new enum value, a new adapter on the server and its UI, and no new tables.
2. **Once per account.** You connect Jira once, in Settings › Apps (now in the You group). Below the connection,
   "Use Jira in" lists your spaces with a switch each. Jira (the sidebar entry, the top-bar button, the phone tab,
   the panel, the task panel's Jira fact) shows only in spaces where your switch is on. The switch is yours alone: a
   teammate's switch, connection and token are never seen or used by you, and yours never by them.

What the person sees is exactly the approved canvas: there is one connector, so the generalisation is invisible in
the UI.

## As built (25 Oct)

Where the implementation differs from the sections below:

- **One migration, `0015_connectors.sql`.** drizzle-kit's two generated steps were merged by hand. `history_kind` is
  recreated (rename the old type, create the new one, cast through text, rewrite the Jira kinds, drop the old type)
  instead of `ADD VALUE`, because the migrator runs every pending migration in one transaction and a value added that
  way can't be used in the same transaction. `jira_state` is dropped and `connection_state` created fresh.
- **Old clients keep working for one release.** The Task keeps `jira` (filled from its Jira link) next to `links`; the
  server still takes `task.jira` and `task.create` with `jira` / `source: 'jira'` and stores them as links. So the
  offline-queue rewrite (C10-U19) is not needed and was not written; the client test C10-U11 covers both mutations.
- **No `GET /api/connectors`.** The routes are per provider: `/api/connectors/:provider` (read, connect, disconnect),
  `/spaces`, `/links`, `/views`, `PUT /api/spaces/:id/connectors/:provider {on}`, and Jira's reads under
  `/api/spaces/:id/connectors/jira/…`. An unknown provider is 404 on all of them.
- **Query keys keep the `jira` prefix** (`['jira', 'connection']`, `['jira', 'spaces']`, `['jira', 'links']`, and
  `['jira', spaceId, …]` for issues); `connector.changed {provider}` invalidates by the provider name.
- **C10-A17 (a second fake provider) was dropped.** A provider is a value of a Postgres enum and of a zod enum, so a
  test-only provider would need a test-only migration. Its checks that still apply (unknown provider 404, one link per
  provider per task) are in C10-A12 and C10-U18.
- **Search has no Jira section.** Searching Jira itself stays in the Jira panel (E08); C10-E21 checks the task search
  finds a task by its link key, connected or not.
- **Disconnect asks first** in Settings › Apps ("Disconnect Jira?": it goes from every space; tasks keep their keys).
  From the Jira panel's More menu it is still one step, as before.
- **Add a new token from Settings › Apps** opens the Jira panel on the reconnect form in the space you're in; a
  reconnect never changes the switches.
- The CORS allow-list gained `PUT` (the switch is the first PUT route).
- A pre-release backup step for migrations that drop data is in `docs/release.md`.

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
  `AUTH_SECRET` (`apps/server/src/jira/seal.ts`, which moves to `connectors/seal.ts` with the same `v1.iv.tag.ct`
  format and HKDF info string, so existing sealed tokens open unchanged). No shared or workspace-level credential
  exists, before or after.
- Tasks store only the issue key as text. Issue details are always read with the viewer's own connection, so a
  teammate never reads Jira through your token. The one known leak stays as it is: a task created from an issue copies
  the summary into its title, which every member who can see the task can read. That is the task's title, not a Jira
  read, and is unchanged by this proposal.
- The SSRF guard (`checkSite`), the Jira HTTP client (`jira/http.ts`), and the issue, preview and search shapes are
  unchanged; they become the Jira adapter.
- One link per provider per task, as the design draws it (one Jira fact). The schema allows more later by dropping
  one unique index; showing several issues on a task needs a design first.
- All spaces (PR #22) has no Jira entry, as today. A task opened there shows the Jira fact by the task's own space:
  on there, the normal fact; off there, the key alone with Unlink only (the PR #20 rule, now keyed on the switch).

## Schema (migrations `0015_link-history.sql` and `0016_connectors.sql`)

New enum `connector_provider` with one value, `'jira'`. `jira_state` is renamed `connection_state` (same values,
`ok` and `expired`).

| Table               | Columns                                                                                                                                                                       | Keys                                                                                                                        |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `connections`       | `id`, `user_id` (FK user, cascade), `provider`, `site`, `token_sealed`, `account_name`, `account_email`, `state`, `connected_at`, `synced_at`, `checked_at`                   | unique `(user_id, provider)`                                                                                                |
| `connection_spaces` | `user_id` (FK user, cascade), `space_id` (FK spaces, cascade), `provider`, `enabled_at`                                                                                       | primary key `(user_id, space_id, provider)`. A row means on; no row means off.                                              |
| `connection_views`  | `id`, `connection_id` (FK connections, cascade), `name`, `query` (JQL for Jira), `position`, `created_at`                                                                     | unique `(connection_id, name)`                                                                                              |
| `task_links`        | `task_id` (FK tasks, cascade), `space_id` (FK spaces, cascade; copied from the task for the per-space index), `provider`, `key`, `linked_by` (FK user, set null), `linked_at` | primary key `(task_id, provider)` (one per provider for now); index `(space_id, provider, key)` replaces `tasks_space_jira` |

`tasks.jira_key`, its index, `jira_connections` and `jira_views` are dropped at the end of the migration.

Data migration, in the same migration, before the drops:

- **Connections.** For each user with one or more `jira_connections` rows, keep one: the newest `connected_at` among
  rows with `state = 'ok'`, or the newest row if all are expired. It becomes a `connections` row with
  `provider = 'jira'` and the same id, so its views follow without remapping.
- **Switches.** Every space where the user had a row whose `site` equals the kept row's site gets a
  `connection_spaces` row (on). A space whose row pointed at a different site is left off: one site per account, and
  the kept token can't read the other site.
- **Views.** Views from the dropped rows move to the kept connection. A name already used is dropped (the kept
  connection's view wins), since the same name almost always means the same JQL copied across spaces.
- **Links.** Every task with `jira_key IS NOT NULL` gets a `task_links` row (`provider = 'jira'`, `space_id` from the
  task, `linked_by` the task's owner, `linked_at` from its newest `jira.linked` event, else the task's
  `updated_at`). Soft-deleted tasks keep theirs, so a restore keeps the link.
- **History.** Postgres can't use an enum value in the transaction that adds it, so old `jira.linked` /
  `jira.unlinked` rows stay as they are and the reader maps them. New events are written as `link.added` /
  `link.removed` with `data = {provider, key}`, added to `history_kind` by `0015_link-history.sql`, which runs before `0016`.

Most users have one connection, so for them this is a re-key. The many-rows case is still handled and tested
(C10-A09), because anyone who connected in two spaces has it.

## Server

The Jira code moves from `apps/server/src/jira/` to `apps/server/src/connectors/`:

- `connectors/types.ts`: a `Connector` interface, the seam a second provider implements: `checkSite`, `connect(site,
token) → who`, `assigned()`, `search(query)`, `issue(key)`, `keyPattern`, `keyMax`. Jira's `JiraHttp`, `guard.ts`
  and `fake.ts` become `connectors/jira/` and implement it.
- `connectors/registry.ts`: `provider → Connector`. Routes reject an unknown provider with 404.
- `connectors/service.ts`: what used to be `jira/service.ts`, keyed by `(userId, provider)` for the connection and
  `(userId, spaceId, provider)` for the switch: `connectionOf`, `isOn`, `needOnHere` (connected and on, or 404
  `off-here` / 409 `not-connected`), `connect`, `disconnect`, `setOn`, `spacesOf`, `linksOf`, views.

Routes (`apps/server/src/routes/connectors.ts`, replacing `routes/jira.ts`):

| Route                                                                             | Before                    | After                                                                                                                                                                                                  |
| --------------------------------------------------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET /api/connectors`                                                             | new                       | Your connections, one entry per known provider (`null` when not connected): site, who, state, synced, `assigned` count, `onIn` (how many spaces). Feeds Settings › Apps and the space Apps panel.      |
| `POST /api/connectors/:provider`                                                  | `POST /spaces/:id/jira`   | Connect or reconnect. Body `{site, token, spaceId?}`; with `spaceId` (connecting from a space's Apps panel) that space turns on in the same transaction. A reconnect keeps the views and the switches. |
| `DELETE /api/connectors/:provider`                                                | `DELETE /spaces/:id/jira` | Disconnect: the connection, its views and all your switches for that provider go. Tasks keep their links as words.                                                                                     |
| `GET /api/connectors/:provider/spaces`                                            | new                       | Your spaces in sidebar order: `{id, name, tile, personal, on, linked}` where `linked` counts your linked tasks there.                                                                                  |
| `PUT /api/spaces/:spaceId/connectors/:provider`                                   | new                       | `{on: boolean}`. Membership checked with `roleIn` (any role, including viewer: the switch is about your view, not the space). Idempotent. On without a connection is 409 `not-connected`.              |
| `GET /api/spaces/:spaceId/connectors/:provider/issues`, `/issues/:key`, `/search` | `/spaces/:id/jira/...`    | Read with the account connection, only when your switch is on there: off is 404 `off-here` and no outside request is made. The space in the path keeps the gate on the server, not only in the UI.     |
| `GET /api/connectors/:provider/links`                                             | `/spaces/:id/jira/links`  | Your linked tasks in every space you're a member of, each with `spaceId`, `spaceName`, `tile`. A space you left is not yours to see and is left out.                                                   |
| `POST /api/connectors/:provider/views`, `DELETE .../views/:id`                    | per space                 | Per account.                                                                                                                                                                                           |

Tasks and sync:

- The task's wire shape replaces `jira: string | null` with `links: { provider, key }[]` (`packages/core/src/tasks.ts`).
  The `task.jira` mutation becomes `task.link` `{id, provider, key | null}` (null unlinks), validated by the
  provider's `keyPattern` and `keyMax`. `task.create` takes `link?: {provider, key}` and `source: 'quick-add' |
'connector'` with the provider in the event data.
- The `'jira'` field in the change list becomes `'links'`. History reads `link.added` / `link.removed` and the legacy
  `jira.*` kinds into the same words ("Linked TUDU-212", "Created from TUDU-212").
- `tasks.ts`, `spaces.ts` (people view), `closeMatches.ts` and every task read join `task_links` (one left join with
  `json_agg`, like the other per-task lists) instead of reading `tasks.jira_key`.

Other server changes:

- `JIRA_CHANGED` becomes `CONNECTOR_CHANGED {provider}`, published to the user only, on connect, reconnect, expiry,
  disconnect, a switch flip, and a view save or removal. Never to other members.
- `settings.ts`: the shared departure path (used by `removeMember` and `leaveSpace`) deletes the user's
  `connection_spaces` rows for that space, next to the existing `allSpacesPlaces` delete. `restoreMember` does not put
  them back (decision 6). `deleteSpace` needs nothing: the FKs cascade.
- `createSpace` and `join` add no row (decision 4).
- `firstRun.ts`: the "jira" step reads `exists (connections where user_id and provider = 'jira')`. The step's name
  stays `jira` because the first-run card is about Jira by design.
- Expiry: `state = 'expired'` is on the one connection, so the banner shows in every space where Jira is on, and
  one new token fixes all of them.

## Search

Three places read a task's Jira key today, and all three move to links. What you see and how results rank does not
change.

1. **Task search** (`packages/core/src/search.ts`). `Searchable.jira: string | null` becomes `keys: string[]` (every
   link's key). A key typed in full is an exact hit (`SCORE_REF`) like a task ID; a word found in a key scores like
   one found in the ID (40). `isRefLike` already accepts any `ABC-123` shape. The web's search index
   (`apps/web/src/app/search*`) builds `keys` from `links`.
2. **Close matches** (`apps/server/src/closeMatches.ts`). It selects `tasks.jira_key` today; it joins `task_links` and
   returns the keys, so the result row still shows the task's key.
3. **Searching Jira itself** (the Search panel's Jira section and the panel's search box) goes to
   `/api/spaces/:spaceId/connectors/jira/search`, and only runs where Jira is on in that space. Off there, the
   section isn't shown and no request is made.

## Client and web

- `packages/client/src/connectors.ts` (was `jira.ts`): query keys become `['connectors']`,
  `['connectors', provider, 'spaces' | 'links' | 'views']`, and `['connectors', provider, spaceId, 'issues' | 'issue' |
'search', ...]`. `CONNECTOR_CHANGED` invalidates `['connectors', provider]` and `['connectors']`. New
  `useConnectorSpaces(provider)` and `setOnHere(provider, spaceId, on)` with an optimistic flip that reverts on error
  (the canvas `J-Acct-Motion` timings: 520ms settle, the row's error line).
- `apps/web/src/app/jira.ts` stays the Jira-specific layer on top: `useJira(spaceId)` returns `conn` only when the
  account is connected and on in `spaceId`; it also returns `connected` and `onHere` so the Apps panel can draw
  "Connected · off here". `count` uses the account-wide links. The per-browser view pick `tudu.jira.view` becomes one
  value, not per space, since views are per account; an old per-space value is read once and rewritten.
- `taskStore.linkJira(id, key)` becomes `taskStore.link(id, 'jira', key)`; the offline queue's pending `task.jira`
  mutations from before the deploy are rewritten to `task.link` on load, so nothing queued is lost.
- `settings.tsx`: Apps moves from the space group to You. It renders `Settings` with `appsScope` at its default
  (account), `jira.spaces` from `useConnectorSpaces('jira')`, `onJiraSpace`, `onJiraReconnect`, `onRetry`. `?jira`
  still deep-links to the Connect form.
- `JiraHost.tsx` (`AppsHost`): Connected and off here shows "Turn on here"; connecting from here passes `spaceId`.
- `AppShell.tsx`: the Jira entries follow `useJira(spaceId).conn`, so off hides them with no other change. All spaces
  stays without Jira.
- `TaskPanel.tsx`: the PR #20 gate is unchanged in shape, because `conn` now means "connected and on here"; the fact
  reads the task's `jira` link from `links`. In All spaces it uses the task's own space id.
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

| Id                               | Where                                                     | Scenario                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| -------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C10-U13 (new)                    | `packages/ui/src/components/Settings.apps.test.tsx`       | Apps sits in the You group with "Jira · on in 2 spaces". Not connected: Connect, no "Use Jira in". Connected: one row per space with tile, name, "You're here" on the current one, the sub-line (On / "3 linked tasks" / Off / "Off · 2 tasks keep their keys"), "2 of 3 on". Flipping a switch shows "Turning on…" and calls `onJiraSpace(id, true)`; a rejected promise flips it back and shows the row's error line. Loading draws skeleton rows; `error` shows "Couldn't load your spaces" with Try again and hides the list. Expired: "Add a new token" calls `onJiraReconnect`. |
| C10-U14 (new)                    | `packages/ui/src/components/AppsPanel.test.tsx`           | `off`: "Connected · off here" and Turn on here calls `onEnable`; `busy` shows "Turning on…" and disables it. Not connected: the account Connect copy names `spaceName` as the space that turns on.                                                                                                                                                                                                                                                                                                                                                                                    |
| C10-U15 (new)                    | `packages/ui/src/components/JiraPanel.test.tsx`           | `JPLinked` with `l.space` shows "· N Northwind"; without it nothing extra. Reconnect copy says Jira comes back in every space it was on.                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| C10-U07 (changed)                | `AppsPanel.test.tsx`                                      | Its Connect copy assertion moves to the account wording.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| C10-U11 (changed)                | `packages/client` links test                              | The links read is account-wide and is invalidated by `CONNECTOR_CHANGED {provider}`, not by a space id.                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| C10-U16 (new)                    | `apps/web` `jira.test.ts`                                 | `useJira(spaceId).conn` is null when connected but off here, and set when on; the old per-space `tudu.jira.view` value migrates to the one key once.                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| C10-A09 (new)                    | `apps/server/src/connectors.test.ts` (was `jira.test.ts`) | Migration: a user with rows in Personal (ok, site A, views "Mine", "Bugs"), Northwind (expired, site A, views "Mine", "Ops") and Harbour (ok, site B) ends with one connection (the newest ok one on site A), switches on in Personal and Northwind, off in Harbour, and views "Mine", "Bugs", "Ops" once each. A second user's rows are untouched by the first user's merge.                                                                                                                                                                                                         |
| C10-A10 (new)                    | same                                                      | Connect once from Personal with `spaceId`: Personal on, Northwind off. `GET /api/spaces/:northwind/connectors/jira/issues` is 404 `off-here` and the fake Jira saw no request. `PUT .../northwind/connectors/jira {on:true}` then the same read returns issues. `PUT ... {on:false}` makes it 404 again. Two PUTs in a row are idempotent.                                                                                                                                                                                                                                            |
| C10-A11 (new)                    | same, two users                                           | Isolation: Ada connects and turns Northwind on. Ben, a member of Northwind with no connection, gets `null` from `GET /api/connectors`, 404 `off-here` from Northwind's issues, and `jira.spaces` shows only his own switches. Ben connects his own token: reads in Northwind use Ben's token (the fake Jira sees Ben's header, never Ada's). Ada's `CONNECTOR_CHANGED` events never reach Ben's socket, and his never reach hers.                                                                                                                                                     |
| C10-A12 (new)                    | same                                                      | Membership: Ben cannot `PUT /api/spaces/:harbour/connectors/jira` (not a member, 404). A viewer in Northwind can flip their own switch. `PUT ... {on:true}` with no connection is 409 `not-connected`.                                                                                                                                                                                                                                                                                                                                                                                |
| C10-A13 (new)                    | same                                                      | Links across spaces: Ada has keyed tasks in Personal (TUDU-1) and Northwind (TUDU-2), Ben has TUDU-3 in Northwind. Ada's `GET /api/connectors/jira/links` has TUDU-1 and TUDU-2 with their space ids, not TUDU-3. The assigned count leaves out both of Ada's keys. Turning Northwind off keeps TUDU-2 in the links (the key stays on the task).                                                                                                                                                                                                                                      |
| C10-A14 (new)                    | same                                                      | Leaving and removal: Ada leaves Northwind → her `connection_spaces` row is gone; the owner's undo of a removal of Ada brings her back with Jira off; deleting Harbour removes its row by cascade. A new space Ada creates starts off; joining by invite starts off.                                                                                                                                                                                                                                                                                                                   |
| C10-A15 (new)                    | same                                                      | Expiry and disconnect: the fake Jira refuses the token → the connection is expired, and both on spaces' reads answer `expired`. A reconnect with a good token clears it everywhere and keeps the views and the switches. `DELETE /api/connectors/jira` removes the connection, the views and every switch; tasks keep their `task_links`.                                                                                                                                                                                                                                             |
| C10-A01..A08 (changed)           | same                                                      | Re-pointed at the connector routes; their assertions are otherwise unchanged. A08 additionally checks the switches go with the connection.                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| C10-E16 (new)                    | `packages/e2e/tests/jira/jira.spec.ts`, desk              | The reported case end to end: connect Jira once in Personal's Apps panel (Personal turns on). Create Northwind: no Jira in its sidebar or top bar, its Apps panel says "Connected · off here". Turn on here → the Jira entry appears with no token asked for, and Assigned to me lists the issues.                                                                                                                                                                                                                                                                                    |
| C10-E17 (new)                    | same, desk and phone                                      | Settings › Apps (You group): the spaces list, flip Northwind off → its row reads "Off · 1 task keeps its key"; go to Northwind: no Jira entries, and a keyed task's panel shows the key alone with Unlink only. Flip it on again → the entries come back. Phone: Settings › Apps pushes in, the switches work, ‹ goes back.                                                                                                                                                                                                                                                           |
| C10-E18 (new)                    | same, two browsers                                        | Two users in Northwind: Ada connected and on; Ben not connected. Ben sees no Jira in Northwind, and Ada's keyed task in Ben's panel shows the key as words with no status. Ada flipping her switch changes nothing on Ben's screen (no refetch, no entries).                                                                                                                                                                                                                                                                                                                          |
| C10-E19 (new)                    | same, desk                                                | Linked across spaces: link TUDU-226 to a task in Personal; in Northwind's Jira panel TUDU-226 shows linked with "· P Personal", and the Jira count in Northwind leaves it out. Open it → Personal, with the task in view.                                                                                                                                                                                                                                                                                                                                                             |
| C10-E20 (new)                    | same, desk                                                | Expired once, fixed once: with two spaces on, the token expires; both show the banner. Add a new token from Settings › Apps → both clear.                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| C10-E15 (changed)                | same                                                      | Was "connected in Personal, none in Northwind"; now "on in Personal, off in Northwind" set through the switch, same assertions.                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| C10-E01, E02, E10, E11 (changed) | same                                                      | Connect and Disconnect move to the account (Settings › Apps under You); the Disconnect confirm says Jira goes from all your spaces. The phone flow in E11 opens Settings › Apps from More.                                                                                                                                                                                                                                                                                                                                                                                            |
| C21-E (All spaces), re-run       | `packages/e2e/tests/all-spaces/*`                         | Add one case: a task from Northwind (off) opened in All spaces shows the key alone; one from Personal (on) shows the full fact.                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| C10-U17 (new)                    | `packages/core/src/search.test.ts`                        | Search by key: a task linked to TUDU-212 is the top hit for "TUDU-212" and "tudu-212" (`SCORE_REF`); "212" finds it at the ID score; a task with links from two providers (a fake second provider in the test registry) is found by either key; a task with no links scores as before (the existing C-search cases re-run unchanged).                                                                                                                                                                                                                                                 |
| C10-U18 (new)                    | `packages/core/src/tasks.test.ts`, `history.test.ts`      | `task.link` accepts a valid key for `jira`, refuses a bad one and an unknown provider; `null` unlinks. History words for `link.added`, `link.removed` and the legacy `jira.linked` / `jira.unlinked` read the same ("Linked TUDU-212", "Unlinked TUDU-212"), and `created` with `source: 'connector'` reads "Created from TUDU-212".                                                                                                                                                                                                                                                  |
| C10-U19 (new)                    | `apps/web` offline queue test                             | A queued `task.jira {id, jira: 'TUDU-1'}` from the old build is rewritten to `task.link {id, provider: 'jira', key: 'TUDU-1'}` on load and applies once.                                                                                                                                                                                                                                                                                                                                                                                                                              |
| C10-A16 (new)                    | `apps/server/src/connectors.test.ts`                      | Link migration: tasks with `jira_key` (open, crossed off, soft-deleted) each get one `task_links` row with the task's space, owner and the newest `jira.linked` time; tasks without a key get none; a restore of the soft-deleted one shows its link. After the migration `tasks.jira_key`, `jira_connections` and `jira_views` are gone, and an existing sealed token still opens (the fake Jira accepts the same token).                                                                                                                                                            |
| C10-A17 (new)                    | same                                                      | Generic routes: an unknown provider is 404 on every connector route; a second fake provider registered only in the test can connect, be switched on per space and link a task alongside a Jira link, and its links and events never show under Jira (and the other way round). `PUT` a second link for the same provider on one task replaces it (one per provider).                                                                                                                                                                                                                  |
| C10-A18 (new)                    | same, close matches                                       | Close matches return a linked task with its key from `task_links`; unlinking removes the key from the next result; Ben (not the owner, can see the task) sees the key too, as words, since the key is part of the task, not a Jira read.                                                                                                                                                                                                                                                                                                                                              |
| C10-E21 (new)                    | `packages/e2e/tests/search/search.spec.ts`, desk          | Search after the move: link TUDU-226 to a task, open Search, type TUDU-226 → the task is first; the Jira section shows the issue from Jira. In Northwind with Jira off, the same search finds the Northwind task with its key but shows no Jira section.                                                                                                                                                                                                                                                                                                                              |

Re-run unchanged: C10-E03 to E09, E12 to E14, all search tests (`search.spec.ts`, `close-matches.spec.ts`), the
first-run tests (C01-E\*, the Jira hint), the desktop Quick Add test that creates from a key, and the Inbox and
People panel flows (C08-E10 to E20).

`docs/tests/chunk-10.md` gets the rows above, and the chunk's choice 1 note ("a connection belongs to one space")
is rewritten to say per account, on per space, with the date.

## Design parity

- Canvas v92 already shows every state above: the eight Settings states plus the Disconnect confirm
  (`J-Acct-Settings`, light and dark), the space-side states (`J-Acct-Space`), and the switch motion
  (`J-Acct-Motion`). The prototype boards (G-, N-, R-C-, U-) render Apps under You with the spaces list.
  `J-NoJira` now reads "Jira off in this space".
- Kit: Tudu Paper v23 holds the components and `index.d.ts`; `packages/ui` mirrors it, and the PR description lists
  the kit version it matches.
- The generalisation adds nothing visible: with one connector, every board stays as drawn. Nothing ships in the app
  that the canvas doesn't draw: if implementation finds a state the boards miss (for
  example the 409 `not-connected` from a stale tab), I add the board first and say so in the PR.

## Rollout

One PR (large: the rename touches every Jira file). The migration is one-way: `tasks.jira_key` and the old tables
are dropped, so rolling back the app needs a database restore. `docs/release.md` has no pre-deploy backup step today; the PR adds one (a `pg_dump` before the migration runs in production). Staging runs it first
against a copy of production data before the release. One PR on `claude/project-thread-x9qljg`. The migration runs on deploy; staging first, then a normal release. No
feature flag: every existing connection migrates to "connected, on in the spaces it was connected in", so nobody
loses Jira where they had it.
