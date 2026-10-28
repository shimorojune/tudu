# MCP server and AI access · test cases

The plan is [docs/plans/mcp-server.md](../plans/mcp-server.md). These ids (`MCP-…`) come from that plan, not a chunk,
so `pnpm test:status` does not list them in STATUS.md; the test names carry them for `-g`. Every suite runs on Rohit's
Mac, not in the cloud container.

## Unit (vitest)

| ID      | Where                                          | Case                                                                                                                       |
| ------- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| MCP-U01 | `apps/server/src/ai.test.ts`                   | A new key is `tudu_` + 43 characters; only its hash is kept; `start` is 4 characters; 90 days unless told; `null` never    |
| MCP-U02 | `apps/server/src/ai.test.ts`                   | A key stands for its person; unknown, revoked or expired is refused; last used written at most once a minute               |
| MCP-U03 | `apps/server/src/ai.test.ts`                   | A read key reads the listed routes; changes and account routes are refused with the reason                                 |
| MCP-U04 | `apps/server/src/ai.test.ts`                   | A write key without delete adds but can't delete; account and space settings never                                         |
| MCP-U05 | `apps/server/src/ai.test.ts`                   | A key for some spaces: other spaces refused; `/api/me`, search and task links narrowed                                     |
| MCP-U06 | `apps/server/src/ai.test.ts`                   | Notebook off: notes neither read nor changed; search leaves them out                                                       |
| MCP-U07 | `apps/server/src/ai.test.ts`                   | Client metadata documents: http, a mismatched `client_id` and an oversized document are refused                            |
| MCP-U08 | `apps/mcp/test/tools.test.ts`                  | Every tool has a title and hints; reads go to the right path with the caller's bearer; writes are sync mutations           |
| MCP-U09 | `apps/mcp/src/verifier.test.ts`                | One `/api/access` check per 30 s per bearer; a refused bearer is `invalid_token`; an unreachable API is a server error     |
| MCP-U10 | `packages/ui/src/components/AiAccess.test.tsx` | Rows and lines from data; verified icon, letter and Unverified; expired and Remove; loading skeletons; error banner        |
| MCP-U11 | `packages/ui/src/components/AiAccess.test.tsx` | Key dialog: a taken name; Only some needs a space; Can delete only with write; the key once; Claude Code, then Cursor JSON |
| MCP-U12 | `packages/ui/src/components/AiAccess.test.tsx` | Consent: each state; Change unfolds; Allow waits for a space; Allowing… then Allowed; Unverified line; Cancel              |
| MCP-U13 | `packages/ui/src/components/AiAccess.test.tsx` | Settings lists AI access under You with "None yet" and counts; the phone section has ‹ Settings                            |

## API (vitest, test database: `apps/server/src/ai.test.ts`)

| ID      | Case                                                                                                                     |
| ------- | ------------------------------------------------------------------------------------------------------------------------ |
| MCP-A01 | The key is shown once and never listed; names are unique (409); spaces must be yours; a key can't make keys              |
| MCP-A02 | Revoking a key stops it on the next call; someone else's key is 404                                                      |
| MCP-A03 | Authorize with PKCE S256, allow a narrowed grant, swap the code: the token reaches that grant only                       |
| MCP-A04 | A token for another resource is refused; refresh rotates (the old one fails once its grace has passed); revoke ends both |
| MCP-A05 | Open registration makes an unverified app; the 11th in an hour from one address is 429                                   |
| MCP-A06 | A client metadata URL registers the app from its document; a changed redirect is refused                                 |
| MCP-A07 | Disconnecting an app ends its tokens, removes its consent and drops it from the list                                     |
| MCP-A08 | A change through a key reaches your other Tudus; history says `via`; each call is logged and trimmed at 90 days          |
| MCP-A09 | The 121st call in a minute is 429 with `Retry-After`                                                                     |

## MCP end to end (vitest, the API in process + the MCP server: `apps/mcp/test/e2e.test.ts`)

| ID      | Case                                                                                                  |
| ------- | ----------------------------------------------------------------------------------------------------- |
| MCP-M01 | No bearer is 401 with `resource_metadata`, which names the API as the authorization server            |
| MCP-M02 | A read key lists the tools, reads a day, searches and opens a task; adding is refused with the reason |
| MCP-M03 | A write key adds, ticks and reads back; delete needs the switch, then the task goes to Trash          |
| MCP-M04 | A key for one space lists only it; a task elsewhere is not found                                      |
| MCP-M05 | Revoking the key stops the next call at once                                                          |

## Web end to end (Playwright: `packages/e2e/tests/settings/ai-access.spec.ts`)

| ID      | Case                                                                                                                           |
| ------- | ------------------------------------------------------------------------------------------------------------------------------ |
| MCP-E01 | Nothing yet; New key, Read and write, Create; the key once with Claude Code and Cursor; Copy; the key works on the API         |
| MCP-E02 | Done lists the key; Revoke asks; with the API down the ask says why and the row stays; then it goes, also after a reload       |
| MCP-E03 | An app connecting while signed out: code, consent, Only some (Personal), Allow, back to the app with a code; Settings lists it |
| MCP-E04 | A changed link says it didn't work; Cancel goes back to the app with `access_denied` and nothing is listed                     |
| MCP-E05 | Phone: AI access pushes in with ‹ Settings; New key is a sheet; the rows line up with Apps                                     |

## Manual on Rohit's Mac (before merge)

MCP-H01 to MCP-H05 as in the plan: Claude (custom connector) on staging, Claude Code with a key, Cursor with the
copied JSON, ChatGPT developer mode, and light, dark, desktop and phone against the boards.
