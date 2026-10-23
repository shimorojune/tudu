# Tudu rewrite: the plan

Status: proposed, 20 Oct 2026. Awaiting your approval of this plan and of chunks 00 and 01.

The "Tudu, Redesign" canvas and the Tudu Paper design system are the only source of truth for how the app looks and moves. The old code lives on the `legacy` branch and nothing from it carries over except the tooling listed under Stack.

## What we agreed

- Full wipe: new UI, new API, new schema from migration 0000. No old data survives.
- Same repo, work on `master` through one PR per chunk. Old code on `legacy`.
- Vertical slices: each chunk ships its UI, API, schema, unit tests and end-to-end tests, then pauses for your review.
- Writes are local-first: the UI updates at once, an outbox queue replays each change to the server, last write wins per field. Reads come from the live server; nothing is shown offline.
- Live updates from teammates arrive over a server-sent events stream.
- Sign in is email plus a 6-digit code. No passwords.
- Phone and tablet are the responsive web app, installable as a PWA for the home screen and a cached shell. No native app, no push.
- Desktop is macOS on Tauri 2, with the floating Quick Add window, one global summon shortcut and a tray icon. Two apps, Tudu and Tudu Staging, each on its own update track.
- Jira is Data Center only, connected with a personal access token.
- Team spaces: everyone sees everyone's tasks unless a task is "Only me". Others can comment, never edit. Personal is yours alone. Roles are admin and member.
- Everything runs on the Dokploy host at dokploy.mcp.egainqa.cloud under the Tudu project: dev (CI only), staging and production environments. CI tests run there too, on a self-hosted runner. Local development uses Postgres and storage in Docker on your laptop.
- Tests are grouped by chunk, runnable alone, documented in plain tables, and never flaky by design. No screenshot comparisons. Chromium only for now.
- Versions continue from 0.37.

Deferred work is tracked in [later.md](later.md).

## Stack

| Layer         | Choice                                                                                                                                                                                                              |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Monorepo      | pnpm workspaces, TypeScript strict, Node 22                                                                                                                                                                         |
| Web           | React 19, Vite 7, Tailwind v4, shadcn/ui restyled by `paper-theme.css`, TanStack Router, TanStack Query, Tiptap, dnd-kit, lucide icons, vite-plugin-pwa                                                             |
| Desktop       | Tauri 2, same web bundle, plugins: updater, global-shortcut, tray, notification, deep-link                                                                                                                          |
| API           | Hono on Node, zod, Drizzle ORM, node-postgres, Better Auth with the email OTP plugin, Resend, S3 SDK against RustFS (MinIO stand-in)                                                                                |
| Database      | Postgres 18 with pgvector available (not used yet)                                                                                                                                                                  |
| Tests         | Vitest + Testing Library, Playwright (Chromium), one throwaway database per run                                                                                                                                     |
| CI and deploy | GitHub Actions: static checks on GitHub runners, every test job on the Dokploy self-hosted runner, images to GHCR (arm64), Dokploy deploys. macOS desktop builds on GitHub macOS runners because Tauri needs macOS. |

## Repository layout

| Path              | Holds                                                                    |
| ----------------- | ------------------------------------------------------------------------ |
| `apps/web`        | The web app and PWA shell                                                |
| `apps/desktop`    | Tauri shell, Quick Add window, tray, updater                             |
| `apps/server`     | Hono API, auth, mail, files, Jira proxy, SSE, jobs                       |
| `packages/ui`     | Tudu Paper components ported to React, screens, the kit page             |
| `packages/core`   | Domain types, zod schemas, date and week logic, sync protocol types      |
| `packages/client` | Local-first data layer: query client, outbox, SSE subscriber, API client |
| `packages/db`     | Drizzle schema and migrations                                            |
| `packages/e2e`    | Playwright projects, fixtures, test docs                                 |
| `infra/`          | CI runner image, compose files, deploy scripts                           |
| `docs/rewrite`    | This plan, one file per chunk                                            |
| `docs/tests`      | One test table per chunk, plus the generated status page                 |

## How a change flows

1. The UI calls a mutation from `packages/client`. The mutation applies the change to the in-memory query cache immediately.
2. The same mutation is appended to the outbox in IndexedDB with a client id, a mutation id and the fields it touches.
3. The outbox worker posts batches to `POST /sync` in order. Each mutation is idempotent by its id, so a retry never doubles a change.
4. The server applies each mutation with last-write-wins per field, using the client's timestamp, and returns the resulting rows.
5. The server publishes a change event to every session in that space. Each client's SSE subscriber invalidates the affected queries, so teammates see it within a second.
6. If the server rejects a mutation (not allowed, task deleted), the client rolls the cache back and shows a toast.

Reads use TanStack Query against the API, cached in memory so navigation is instant. No local replica.

Task numbers (ME-58) are assigned by the server, so the ID appears in the byline when the save lands.

## Environments

|                                 | dev                                                                                  | staging                                  | production                           |
| ------------------------------- | ------------------------------------------------------------------------------------ | ---------------------------------------- | ------------------------------------ |
| Web                             | local Vite on :5173                                                                  | https://staging.tudu.ezdev.net           | https://tudu.ezdev.net               |
| API                             | local on :3456                                                                       | https://api.staging.tudu.ezdev.net       | https://api.tudu.ezdev.net           |
| Postgres                        | local Docker (`docker compose up`); CI uses `tudu-dev-postgres` on Dokploy, internal | `tudu-staging-postgres`, internal        | `tudu-production-postgres`, internal |
| Object storage (RustFS, S3 API) | local Docker; CI uses `tudu-dev-minio` on Dokploy, internal                          | `tudu-staging-minio`, internal           | `tudu-production-minio`, internal    |
| Mail                            | in-memory outbox (readable by tests)                                                 | Resend from `mail.tudu.ezdev.net`        | same                                 |
| Desktop                         | `pnpm tauri dev`                                                                     | Tudu Staging, updater on the staging API | Tudu, updater on the production API  |

Every test run creates `tudu_test_<run id>` on its Postgres (your local Docker one, or the Dokploy dev one for CI) and drops it afterwards, so runs never share a database. Nothing on the Dokploy host is reachable from outside except the web and API domains.

## CI

- Pull request: lint and typecheck on a GitHub runner. Unit, API and end-to-end tests on the Dokploy runner. End-to-end runs the groups for chunks whose files changed, plus the smoke group.
- Merge to master: the full end-to-end suite, then build images and deploy staging, then run the smoke group against staging.
- Release: manual, semantic-release, macOS build and notarize, production deploy.
- The runner is a Dokploy application in the dev environment built from `infra/ci-runner/Dockerfile` (Playwright image plus the Actions runner), registered to this repository with the labels `self-hosted` and `dokploy`. It persists its registration on a volume.

## Testing

| Level      | Tool                                                                            | What it covers                                                                            |
| ---------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Unit       | Vitest, Testing Library, jsdom                                                  | Every component in `packages/ui`, every function in `packages/core` and `packages/client` |
| API        | Vitest against a real throwaway database, Hono app in-process                   | Every endpoint, permissions, sync rules                                                   |
| End-to-end | Playwright, Chromium, projects desktop 1440×900, tablet 834×1112, phone 390×844 | Every user-visible flow from the canvas, light and dark                                   |

Rules that keep tests stable:

- Every end-to-end test signs in its own fresh user and makes its own data. No shared fixtures, no ordering.
- No fixed sleeps. Tests wait on visible state or on the outbox being empty (exposed as `window.__tudu.idle()`).
- "Today" is fixed with Playwright's clock API, so date tests give the same answer every day.
- End-to-end runs with reduced motion so no assertion lands mid-animation. Motion is verified by unit tests on the motion tokens and classes, and by your review of the running app. (Flagging this one for your approval.)
- Mail is read from the test outbox endpoint, never from a real inbox.

Grouping and running:

```
pnpm test                 # all unit and API tests
pnpm test ui              # one package
pnpm e2e                  # everything
pnpm e2e today            # one chunk's group
pnpm e2e today --project=phone
pnpm e2e -g "C02-E07"     # one case by id
```

Documentation: `docs/tests/<chunk>.md` holds one table per level, one row per case: ID, what it checks, the scenario, status. `pnpm test:status` rewrites `docs/tests/STATUS.md` from the last run's reports so you can see pass, fail and not-yet-written per chunk without reading output.

The loop per chunk:

1. I post the chunk file with scope and the test table. You approve or edit.
2. I build it and write the tests, then run everything three times in a row to prove they are stable.
3. I open the PR with the status table in its description. You review the app on staging and the code.
4. You approve, it merges, the next chunk starts.

## Chunks

| #   | Chunk                       | Needs   | When it ships you can                                                                              |
| --- | --------------------------- | ------- | -------------------------------------------------------------------------------------------------- |
| 00  | Foundations                 | nothing | Open the kit page and see every primitive, light and dark, with its motion                         |
| 01  | Sign in and app shell       | 00      | Sign in with a code, see the empty Today with the sidebar, rail or tabs, switch theme, sign out    |
| 02  | Today                       | 01      | Write tasks on the sheet, tick them off, reorder, turn the day, two days, carry-over               |
| 03  | Task detail                 | 02      | Open a task, edit everything in place, subtasks, notes, comments, history, delete with undo        |
| 04  | Quick Add                   | 02      | Add from the top bar, on the desktop the floating bar and the global summon                        |
| 05  | Week                        | 02      | Seven tiles and the Backlog tile, drag between days, the week picker                               |
| 06  | Backlog                     | 02      | The backlog list, give a task a day, project filter, crossed off                                   |
| 07  | Search                      | 02      | Word search, recent, create from search                                                            |
| 08  | Spaces, People, Inbox       | 03      | Create a space, invite, switch spaces, send a task, accept or decline, People                      |
| 09  | Settings                    | 08      | Account, Appearance, Notifications, Space, Members, Apps, leave and delete                         |
| 10  | Jira                        | 03, 09  | Connect with a token, the panel, add an issue to a day, linked tasks                               |
| 11  | Desktop and release tracks  | 04      | Install Tudu and Tudu Staging, get updates, restart to update from the Inbox                       |
| 12  | First run                   | 09      | Getting started card that ticks itself off                                                         |
| 13  | Close matches               | 07      | Find a task by what it means in Search and Quick Add                                               |
| 14  | Notifications               | 08, 11  | Your Mac or browser tells you of a task sent, an answer, a comment, a Jira issue, a new version    |
| 15  | Backups (parked)            | nothing | Daily copies of the database and files off the host, a check that emails you, a restore you can do |
| 16  | Tudu in the background      | 11      | Close the window and Tudu stays in the menu bar with no Dock icon; open it at login                |
| 17  | Quick Add always says where | 04, 08  | See "In Personal for Me" on every Quick Add, the floating bar included                             |
| 18  | Projects per space          | 09      | Make, change and delete a space's projects in one editor; Edit projects… from every picker         |
| 19  | Send feedback               | 01      | Report a bug or an idea with a screenshot from the avatar menu, More or the menu bar               |
| 20  | Today in the menu bar       | 16, 19  | Click the tick for today across your spaces, tick tasks off, open Tudu                             |

Projects (the coloured dot) arrive with chunk 02 as data and get their picker in chunk 04.
