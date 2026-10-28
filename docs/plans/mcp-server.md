# Tudu MCP server: use Tudu from Claude, Cursor and other AI tools

Status: proposal, awaiting Rohit's approval. Canvas approved by Rohit on 28 Oct 2026 ("design drafts look good"),
after the clickable prototype ([AI access prototype](https://claude.ai/artifact/Xj9YMx6Kj6ouRBkfXgS7nM)). Boards
`AI-Settings`(+Dark), `AI-Create`(+Dark), `AI-Consent`(+Dark) and `AI-Motion` on the page "AI access (MCP)", canvas
v171; design system v53 (`AiAccess`, `ApiKeyDialog`, `OAuthConsent`, `CopyBox`, `CopyLink`, `AppMark`). Discussion:
[Plan Tudu MCP server with API keys](https://claude.ai/artifact/7CqPa7kQdn2AQ4BQXKJ446).

## Why

Rohit (27 Oct): an MCP server for Tudu, built with Skybridge, that can reach everything you can reach in Tudu. It signs
in two ways, OAuth 2.1 with PKCE (for apps like Claude and ChatGPT) and API keys (for tools like Claude Code and
Cursor), and Settings is where you make and revoke keys.

## Decisions taken

1. **A separate service**, `apps/mcp`, at `https://mcp.tudu.ezdev.net/mcp` (staging `mcp.staging.tudu.ezdev.net`). It
   has no database and no secrets of its own: every call forwards the caller's token to the Tudu API, and the API
   decides what it may see and change.
2. **Access levels:** Read only, or Read and write, plus a **Can delete** switch (write only). Each grant also picks
   **spaces** (all, or some) and a **Notebook** switch.
3. **Tools only** for now. Skybridge stays, so MCP Apps views can come later without a rewrite.
4. **Both client registration routes:** Client ID Metadata Documents (CIMD) and Dynamic Client Registration (DCR,
   rate-limited).
5. From the canvas (orange note, approved with it):
   - The section is called **AI access**, under You, on every device. It is always listed; it reads "None yet" until
     something is connected.
   - New keys default to Read only, all spaces, Notebook on, 90 days. The consent page defaults to Read and write.
   - A grant's access can't be widened later. Make a new key, or connect again.
   - Revoke and Disconnect ask first. There is no Undo.
   - Every call is logged server-side for 90 days (not shown in the app in this cut).
6. **App icons:** only for verified apps, from the logo URL they registered. Unverified apps get their first letter and
   an "Unverified" tag. Tudu never fetches an icon an app did not register.
7. **Key setup** for Claude Code and Cursor is shown on the key screen, one tab each.

## What changes for the person

### Settings › AI access

On every device, after Apps (`?settings=ai` on desktop, `/space/settings/ai` on phones). The nav row has the link icon
and reads "None yet", or "2 apps · 3 keys".

- **Use Tudu elsewhere:** one row, "Claude, ChatGPT and other apps", with **Copy link** for the MCP address. The line
  under it says you add Tudu as a connector there with this link, then sign in to Tudu and choose what it can do.
- **Connected:** apps you allowed with OAuth.
  - Each row shows the app's mark (logo or letter), its name, "Unverified" when Tudu can't vouch for it, and one line,
    for example "Can read and change all your spaces and your Notebook · used 12 minutes ago". **Disconnect** is on
    the right.
  - When there are none: "Nothing yet. Apps you allow show up here."
- **Keys:**
  - **Make a key** comes first ("For tools that can’t sign in with a browser, like Claude Code.").
  - Then one row per key: a key mark, the name and the same line, with **Revoke** on the right.
  - An expired key says "Expired 3 days ago. It no longer works." and offers **Remove**.
- **Note at the foot:** "Apps and keys can do what you can in Tudu, never more. They can’t change your account or your
  spaces’ people."
- **Disconnect and Revoke** ask in a `ConfirmDialog`:
  - Title: "Revoke Claude Code on my Mac?", with **Revoke key** ("Revoking…", then "Revoked").
  - Body: "Anything using this key stops working right away: tudu_k7Qm… gets “not allowed” on its next call. Nothing it
    already did is undone."
  - If it fails: "Couldn’t revoke the key. Check your connection and try again. It still works until it’s revoked."
  - After confirming, the row fades and folds away.
- **Loading** shows skeleton rows in place.
- **Error** shows a warning banner, "Couldn’t load your apps and keys. They keep working as they were.", with
  **Try again**.
- **Back from the consent page**, the new app's row glows once.
- **On phones**, the same sections, with ‹ Settings above the title. This back button and the phone gutters for
  Apps-style sections are fixed for Apps too.

### Make a key

A dialog, or a sheet on phones.

- **Name:** must be new to you, or it says "You already have a key called “Raycast”.".
- **Access:** Read only / Read and write.
- **Summary line:** under those two, one line ("All spaces · Notebook · expires in 90 days") with **Change**. Change
  unfolds:
  - Spaces: All my spaces, or Only some, with a switch per space. Only some needs at least one.
  - Notebook.
  - Can delete (write only): "Things go to Trash, where you can bring them back."
  - Expires: 30 days, 90 days, 1 year, never.
- **Create key** works in place ("Creating…"). If it fails: "Couldn’t create the key. Check your connection and try
  again."
- **The key is shown once**, with Copy, and then **Add it to** with two tabs:
  - **Claude Code:** `claude mcp add --transport http tudu https://mcp.tudu.ezdev.net/mcp --header "Authorization: Bearer <key>"`
    with Copy, and "Add `--scope user` to use Tudu in every project."
  - **Cursor:** the `mcpServers` JSON with Copy, to paste into `~/.cursor/mcp.json` or the project’s
    `.cursor/mcp.json`.
- **Footer:** "You won’t see it again." and **Done**.

### Allow an app (the consent page)

What you see after adding Tudu's link in Claude or ChatGPT.

- The page is on the web app at `/oauth/consent`, in the same shell as sign-in.
- **Signed out**, the email code comes first, then this page.
- **The ask:** the app's mark, a dashed link and Tudu's mark, then "Allow Claude?" and "It will use your Tudu as you,
  then send you back to **claude.ai**.".
- **You:** your avatar, name and email in a card.
- **Summary line:** "Read and write · All spaces · Notebook" with **Change**, which opens the same choices as a key
  (without expiry).
- **Buttons:** Cancel, and Allow ("Allowing…", then "Allowed").
- **Fine print:** "It never gets your account, people or space settings. Revoke it in Settings › AI access."
- **States:**
  - Loading: the page keeps its shape.
  - "This link didn’t work": expired, used twice or changed on the way.
  - Cancelled: nothing was shared.
  - Connected: the tick draws in, then Tudu hands you back to the app.
- **The connection lasts until revoked.** Access tokens live 1 hour and refresh tokens 30 days, and the refresh token
  rotates on each use.

### What an app or key can do

| Level                   | Can                                                                                     |
| ----------------------- | --------------------------------------------------------------------------------------- |
| Read only               | Read days, weeks, backlog, tasks, comments, search, the Inbox, the Notebook (if on)     |
| Read and write          | The above, plus add, change, move, complete, comment, add notes                         |
| Read and write + delete | The above, plus delete tasks, subtasks, comments, notes and folders (Trash, as in Tudu) |
| Never, at any level     | Your account and email, sign-in, keys, members and invites, space settings, Jira setup  |

- **Some spaces:** answers that cross spaces are narrowed to those spaces, and changes elsewhere are refused.
- **Requests, the Inbox and All spaces order** cross spaces, so only grants for every space can use them.

### What the AI sees: tools

Every tool has a title and the hints `readOnlyHint`, `destructiveHint` and `idempotentHint`, as the Claude directory
needs. The server's `instructions` explain Tudu's words (space, day, backlog, Notebook, task IDs such as `NW-42`).

| Tool                            | Level  | What it does                                                       |
| ------------------------------- | ------ | ------------------------------------------------------------------ |
| `whoami`                        | read   | You, and what this grant may do                                    |
| `list_spaces`                   | read   | Spaces this grant reaches                                          |
| `get_day`, `get_week`           | read   | A day's or a week's tasks in a space (never rolls days forward)    |
| `get_backlog`                   | read   | A space's backlog                                                  |
| `search_tasks`                  | read   | Search across reachable spaces                                     |
| `get_task`                      | read   | A task by ID or link, with subtasks and comments                   |
| `list_inbox`                    | read   | Your Inbox (all-space grants only)                                 |
| `list_notes`, `get_note`        | read   | Notebook folders and notes (Notebook on)                           |
| `create_task`, `update_task`    | write  | Add or change a task (title, day, due, project, notes)             |
| `complete_task`, `move_task`    | write  | Tick a task, or move it to a day or the backlog                    |
| `add_subtask`, `add_comment`    | write  | Add a subtask, or comment on a task                                |
| `create_note`, `append_to_note` | write  | Add a note (optionally linked to a task), or add to the end of one |
| `delete_task`                   | delete | Delete a task (to Trash)                                           |

- **Results** come back as short text plus `structuredContent`.
- **Errors** are plain sentences, for example "This key can only read." or "No task with that ID.".

## How

### Data (`packages/db`)

The migration takes the next free number at build time (`0020` today).

- **`api_keys`:**
  - Columns: `id`, `user_id` (cascade), `name`, `start` (the first 4 characters after `tudu_`, for display), `hash`
    (SHA-256, unique), `level` (`read` | `write`), `can_delete`, `spaces` (jsonb, null means all), `notebook`,
    `expires_at`, `last_used_at`, `revoked_at`, `created_at`.
  - The key itself is never stored.
- **OAuth tables** from `@better-auth/oauth-provider` (generated with the Better Auth CLI as today): clients,
  consents, access and refresh tokens. Two additions:
  - A consent row carries our grant: `level`, `can_delete`, `spaces`, `notebook`.
  - A client row carries `verified` and `logo_uri`, so Settings can draw the app's row.
- **`access_log`:**
  - Columns: `id`, `user_id`, `grant_kind` (`key` | `app`), `grant_id`, `tool` or route, `status`, `at`.
  - A daily job trims it to 90 days.
- **Change history:** each change in the history records `via` (`app:Claude` or `key:Claude Code`), so a change an AI
  made can be told apart later. No UI in this cut.

### API (`apps/server`)

- **Keys:**
  - `GET /api/keys`, `POST /api/keys` (returns the key once), `DELETE /api/keys/:id`.
  - These need a cookie session (`requireSignIn`): a key or token can never make or list keys.
  - Duplicate name gives 409. A space you're not in gives 403.
- **Apps:**
  - `GET /api/apps` lists your connected apps with their grant and last use.
  - `DELETE /api/apps/:clientId` revokes every token for that client and removes the consent.
- **OAuth authorization server:** `@better-auth/oauth-provider` 1.7.x, matching our Better Auth.
  - The usual endpoints: `/.well-known/oauth-authorization-server`, `/api/auth/oauth2/authorize`, `/token`,
    `/register`, `/revoke`.
  - PKCE is S256 only. Tokens are opaque and stored hashed.
  - `resource` (RFC 8707) must be the MCP address. A token for anything else is refused.
  - The consent page is the web app's `/oauth/consent`. It posts the chosen grant back.
- **CIMD:** the plugin has DCR but not client metadata documents, so we add it.
  - When `client_id` is an `https` URL, the server fetches that JSON (https only, no private or loopback addresses,
    5 s timeout, 64 KB cap, cached by its HTTP cache headers, at most 1 hour).
  - It checks `client_id` equals the URL and that the `redirect_uris` match.
  - It then creates or refreshes the client row.
- **DCR:** open registration, rate-limited to 10 per hour per IP. Clients that register this way are unverified.
- **Verified apps:** a small list in code (Claude, ChatGPT, Cursor, matched by their CIMD URL or registered redirect
  host), with their logo URLs. Everything else shows the letter.
- **One access check for every non-cookie caller** (`sessionMiddleware` + `keyAccess`, generalised from the spike to
  OAuth tokens):
  - A `tudu_` bearer resolves to a key. Any other bearer is looked up as an OAuth access token.
  - Both give the same Better-Auth-shaped session plus an `access` object.
  - GETs are allowed only on a fixed list of routes.
  - `/api/sync` checks each change: the level, delete, never-allowed types (`me.rename`, `space.update`, members,
    invites), the Notebook switch, and the space (through the task's space).
  - Answers that cross spaces (`/api/me`, search, task links) are narrowed to the grant's spaces.
  - Anything not on the list is 403 with a plain reason.
- `GET /api/access`: who the bearer is and what it may do. The MCP server calls it.
- **Rate limits:**
  - 120 calls a minute per grant. Over the limit gives 429 with `Retry-After`.
  - Key creation: 10 an hour per account.
- **The live stream:** a change through a key or app reaches your open Tudus like any other change.

### MCP service (`apps/mcp`)

- **Skybridge 2.1.0** (Express 5 and the MCP SDK). Streamable HTTP at `/mcp`. Telemetry is off
  (`SKYBRIDGE_TELEMETRY_DISABLED=1`), and it runs with `NODE_ENV=production`.
- **Auth:**
  - `requireBearerAuth` with a verifier that calls `/api/access` and caches the answer for 30 s per token.
  - A revoked token is refused within 30 s. Revoking also sends a purge through the live stream, so the cache drops it
    at once.
- **401 answers** carry `WWW-Authenticate` with `resource_metadata` pointing to
  `/.well-known/oauth-protected-resource`, which names the API as the authorization server.
- **Calls:** tools use `@tudu/client`'s request helpers with the caller's bearer. Writes go through `/api/sync`
  mutations, exactly as the app does.
- **Deploy:**
  - A new service in `infra/staging/compose.yaml` and the production compose, built from the monorepo.
  - A health check at `/health`.
  - Dokploy domains for `mcp.` hosts. Rohit adds the domains in Dokploy by hand.
  - Release and CI build it like `server`.

### Web (`apps/web`, `packages/ui`)

- **`packages/ui`:**
  - `AiAccess`, `ApiKeyDialog`, `OAuthConsent`, `CopyBox`, `CopyLink` and `AppMark`, as in the design system.
  - Icons `key`, `copy` and `spark`.
  - `Settings` gets section `ai` (always listed), `aiAccess`, `onAiCreate`, `onAiRevoke` and phone `onBack`.
  - Motion follows `AI-Motion`: rows fold out 200 ms; the key tab content fades in 160 ms; the consent tick draws in.
    With reduced motion, plain fades.
- **`apps/web`:**
  - `ai` in the settings sections.
  - Queries `['keys']` and `['apps']`, with mutations that update them optimistically and put them back on failure.
  - The `/oauth/consent` route, which reads the signed authorize request and shows the states above.
- **Mac app:** nothing new. Settings is the web page, and the consent page opens in your browser, from the app you
  connect.

### Design system and canvas

- **Already done:** the canvas (v171) and the design system (v53) carry every piece above.
- **During the build:** anything that departs from the boards is drawn back onto them, logged in the deviations
  register, and ported to the design system before the build is called done.

## Publishing (after the build, its own PR)

Rohit asked to list Tudu in the Claude and ChatGPT connector directories. Both need:

- **Public pages:** Privacy Policy and Terms at `tudu.ezdev.net/privacy` and `/terms`, and a docs page
  (`/docs/ai`) with setup for Claude, ChatGPT, Claude Code and Cursor. Support goes to the GitHub issues link Tudu
  already uses.
- **A reviewer sign-in that works without email codes** (ChatGPT requires it). The proposal: a `REVIEW_ACCOUNTS`
  setting in production, an email and a fixed code that works only for that email. It is held in Dokploy secrets,
  logged on use, and off by default.
- **Listing assets:** the Tudu icon (from the Logos group), a short and a long description, 5 good and 3 refused test
  prompts, and a short screen recording.
- **ChatGPT:** the domain token at `/.well-known/openai-apps-challenge` on the MCP host.

## Tests

IDs are new (`MCP-`). Test cases also go in `docs/tests/mcp-server.md`. Every test runs on Rohit's Mac, not in the
cloud container.

### Unit (vitest)

| ID      | Where           | Scenario                                                                                                                                          |
| ------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| MCP-U01 | server apiKeys  | New key: `tudu_` + 43 characters; only the hash is stored; `start` is the first 4 after the prefix; 90 days by default; `never` gives no expiry   |
| MCP-U02 | server apiKeys  | Lookup: right key → session + access; unknown, revoked or expired → null; last used written at most once a minute                                 |
| MCP-U03 | server keyGuard | Read key: every listed GET passes; any POST to `/api/sync` → 403 "This key can only read."; unlisted GET (`/api/keys`, members) → 403             |
| MCP-U04 | server keyGuard | Write key without delete: `task.create` passes, `task.delete` → 403 "This key can’t delete."; `me.rename`, `space.update` → 403 at any level      |
| MCP-U05 | server keyGuard | Space-limited: a task in another space → 403; `/api/me`, search and task-link answers drop other spaces; Inbox and requests refused               |
| MCP-U06 | server keyGuard | Notebook off: notebook routes and `note.*` changes → 403; search drops notes                                                                      |
| MCP-U07 | server CIMD     | Fetch refuses http, private and loopback addresses, redirects to them, over 64 KB, slow (5 s); `client_id` ≠ URL refused; cache follows headers   |
| MCP-U08 | mcp tools       | Each tool calls the right API path or mutation with the caller's bearer; a 403 comes back as the API's sentence; annotations match the table      |
| MCP-U09 | mcp verifier    | 30 s cache; a purge drops a token at once; a 401 from `/api/access` → `invalid_token` with `resource_metadata` in `WWW-Authenticate`              |
| MCP-U10 | ui AiAccess     | Sections and lines from data (verified icon vs letter, Unverified tag, expired line); loading skeleton; error banner; Make a key disabled loading |
| MCP-U11 | ui ApiKeyDialog | Name taken → error; Only some with no space → Create disabled; Can delete only with write; reveal: Claude Code tab by default, Cursor JSON valid  |
| MCP-U12 | ui OAuthConsent | Each state; Change unfolds the choices; Allow waits for a space under Only some; Cancel calls `onDeny`                                            |
| MCP-U13 | ui Settings     | AI access listed under You on every layout with "None yet" and counts; phone section shows ‹ Settings with `onBack`; reduced motion has no folds  |

### API (vitest, test database)

| ID      | Scenario                                                                                                                                              |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| MCP-A01 | `POST /api/keys` returns the key once; `GET /api/keys` never returns it; a duplicate name → 409; a space you're not in → 403; with a key bearer → 401 |
| MCP-A02 | `DELETE /api/keys/:id` revokes: the next call with that key → 401; someone else's key id → 404                                                        |
| MCP-A03 | OAuth: authorize with PKCE S256, consent with a narrowed grant, exchange the code → token works for that grant only; `plain` PKCE refused             |
| MCP-A04 | A token with the wrong `resource` → refused; refresh rotates (the old refresh token fails after use); revoke ends both                                |
| MCP-A05 | DCR: registers an unverified client; the 11th in an hour from one IP → 429                                                                            |
| MCP-A06 | CIMD: a fixture metadata URL registers the client with its name and logo; a changed `redirect_uri` is refused                                         |
| MCP-A07 | `DELETE /api/apps/:clientId` → its tokens fail; the consent is gone; Settings' list no longer has it                                                  |
| MCP-A08 | A change through a key reaches another session's live stream; history records `via`; `access_log` gets one row per call and is trimmed at 90 days     |
| MCP-A09 | Rate limit: the 121st call in a minute → 429 with `Retry-After`                                                                                       |

### MCP end to end (vitest, real API + MCP server, the MCP SDK client)

| ID      | Scenario                                                                                                                                         |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| MCP-M01 | No bearer → 401 with `resource_metadata`; the metadata names the API as authorization server                                                     |
| MCP-M02 | Read key: `tools/list` lists all tools with hints; `get_day`, `search_tasks`, `get_task NW-42` answer; `create_task` → "This key can only read." |
| MCP-M03 | Write key: `create_task` then `complete_task` then `get_day` shows it done; `delete_task` refused without delete, works with it (task in Trash)  |
| MCP-M04 | Space-limited OAuth token: `list_spaces` shows only its spaces; `get_task` in another space → "No task with that ID."                            |
| MCP-M05 | Revoke the key in Settings mid-session → the next call fails within 30 s (at once with the purge)                                                |

### Web E2E (Playwright)

| ID      | Scenario                                                                                                                                                         |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| MCP-E01 | Settings › AI access with nothing → "None yet", empty lines; Make a key → name, Read and write, Create → key shown with both tabs; Copy puts it on the clipboard |
| MCP-E02 | Done → the key row is listed; Revoke → confirm → the row folds away; with the API down the dialog shows the failure line and the row stays                       |
| MCP-E03 | Consent page: signed out → email code → consent → Change → Only some, one space → Allow → redirected to the client with a code; the app's row glows in Settings  |
| MCP-E04 | Consent page with a tampered request → "This link didn’t work"; Cancel → back to the client with `access_denied`                                                 |
| MCP-E05 | Phone viewport: More › Settings › AI access with ‹ Settings; the key sheet; gutters match Apps                                                                   |

### Manual on Rohit's Mac (before merge, results in the PR)

| ID      | Scenario                                                                                                                                 |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| MCP-H01 | Claude (claude.ai, custom connector) with staging: add the link, sign in, Allow, ask "what's on my day?" and "add a task for tomorrow"   |
| MCP-H02 | Claude Code with a key, using the copied command: list today's tasks, add one; revoke in Settings → Claude Code reports it can't connect |
| MCP-H03 | Cursor with the copied JSON in `~/.cursor/mcp.json`: Tudu shows under MCP with its tools; a read works                                   |
| MCP-H04 | ChatGPT developer mode connector (staging): connect through DCR, read a day                                                              |
| MCP-H05 | Light and dark, desktop and phone, match the boards                                                                                      |

## Out of scope

- MCP Apps views (Skybridge widgets), prompts and resources: tools only for now.
- An access log in the app. It stays server-side.
- Answering requests and joining spaces as tools.
- Per-tool permissions beyond the levels above.
- Keys for a whole space, owned by the space and not by a person.

## Risks

- **CIMD is our own code** on top of the plugin. SSRF is the main risk; MCP-U07 and MCP-A06 cover the guards. If the
  plugin ships CIMD before the build, we use it.
- **Two auth paths in one middleware.** Every route that is not on the list stays refused for non-cookie callers, so a
  new route is safe by default. MCP-U03 walks the whole route table to prove it.
- **The reviewer sign-in** weakens "codes only" for one address. It is off unless the secret is set, and it is
  logged.
- **Skybridge is young** (2.x). The server uses only its tool registration and auth hooks, so moving to the plain MCP
  SDK later is small.
- **The backend spike** on branch `claude/project-thread-b76te7` (keys table, key guard, 18 tools) is a starting point
  only. It is reworked to this plan, with tests, after approval.
- **The migration number** may clash with parallel work. Take the next free number at build time, and back up the
  production database before releasing it.

## As built (28 Oct 2026)

Where the build differs from the plan above, and why.

- **CIMD** uses the official `@better-auth/cimd` plugin (profile `mcp-2026-07-28`) with its SSRF-safe fetch, not our
  own code. The private-address and redirect checks are the library's; it caps a document at 5 KB, not 64 KB.
- **What an app may do** lives in a new `oauth_grants` row per person and app, not on the plugin's consent row.
- **No purge stream.** Every tool calls the API with the caller's bearer, so a revoked key or app is refused on its
  very next call. The MCP server's 30 s check only guards its own door.
- **A key calling the key routes** (`/api/keys`, `/api/apps`) gets 403, not 401: it is a valid bearer that may not do
  this.
- **The MCP server** has its own small client over `fetch`, not `@tudu/client`, and calls the API by its public
  address. Its default time zone comes from `TUDU_TIME_ZONE` (the composes set `Asia/Kolkata`).
- **Settings gets the MCP address** from `GET /api/apps` (`url`), so the web build needs no new variable.
- **Signing in for an app** sends the signed request with the code itself (read as the page loads), instead of the
  `oauthProviderClient` plugin reading the address at request time.
- **Key dialog:** Create with Only some and no space picked says "Pick at least one space, or choose All my spaces."
  (as the design does) rather than turning Create off. On phones the dialog is a sheet.
- **ConfirmDialog** shows why it failed under the ask, with the icon, as the design system (v53) has it, for every
  ask, not only revoking.
- **A new key's row glows once;** a newly connected app does not (it is connected from another tab). MCP-E03 checks
  the row instead.
- **Icon `spark`** was not needed.
- **Not built here:** the reviewer sign-in (`REVIEW_ACCOUNTS`) and the directory listings. They belong to the
  Publishing PR.
- **Before releasing:** back up the production database, since migration 0020 adds tables and a column. Add the
  Dokploy domains `mcp.staging.tudu.ezdev.net` and `mcp.tudu.ezdev.net` (port 3457) for the new `mcp` service.
