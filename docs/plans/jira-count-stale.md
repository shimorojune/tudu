# Jira count stuck at 1 when 2 issues are assigned (#64)

Status: draft, awaiting Rohit's approval. Canvas: not applicable (no visible design change; the badge, its tip and
the panel look exactly as today), pending Rohit's OK to skip it.

## The report

Production 0.40.0, Mac app, Today in a personal space (issue #64): "I have two JIRAs, but the count still shows 1. A
new JIRA was assigned to me."

## What is actually wrong

The top bar's Jira number and the Jira panel's list come from two separate reads that refresh on separate clocks, and
nothing makes them agree.

- **The number** is `jiraCount(conn.assigned, links)` in `useJira` (`apps/web/src/app/jira.ts`). `conn.assigned` comes
  from `GET /api/connectors/jira` (`readConnection` in `apps/server/src/connectors/service.ts`, which asks Jira for
  the first 100 assigned keys). That query has `staleTime` and `refetchInterval` of `JIRA_COUNT_EVERY_MS` = **15
  minutes**.
- **The list** in the panel is `GET /api/spaces/:id/connectors/jira/issues?view=assigned` (`JiraHost.tsx`, `list`),
  with `staleTime`/`refetchInterval` of **5 minutes**. Opening the panel, or its 5 minute tick, fetches the list again
  but never touches the connection read. Only the panel's Refresh button invalidates both.

So when an issue is newly assigned, the panel can show it (2 issues) while the badge keeps the old number (1) for up to
15 minutes after the last connection read. On the Mac it can be longer: React Query refetches on focus only on
`visibilitychange`, and switching back to Tudu from another app does not change the webview's visibility, so coming
back to the app does not refresh a stale count; it waits for the next 15 minute tick (which WebKit may also delay
while the window is in the background).

The server and the count arithmetic are fine: `readConnection` asks Jira on every read (no cache), and `jiraCount`
(assigned minus keys with an open task) is correct and unit tested.

**One honest caveat.** I can't see the screenshot (the cloud session can't reach api.tudu.ezdev.net) or Rohit's Jira,
so this is the cause I can show in the code, not a reproduction of his exact case. If one of the two issues already
has an open Tudu task, 1 is the right number (the badge counts "assigned to you, not in Tudu yet"). The tip on the
badge says so; if that's what happened, the fix below still stands but the report is a copy question, not this bug.

## The change

All in `apps/web` (so web and Mac app alike). No server, schema or kit change.

1. **The list corrects the number.** In `JiraHost`, when the Assigned to me list loads (any fetch: opening the panel,
   its 5 minute tick, Retry), compare its keys with `conn.assigned`:
   - If the list holds every assigned issue (`total <= JIRA_PAGE`), and its key set differs from `conn.assigned`,
     write the list's keys into the connection query data (`queryClient.setQueryData(jiraConnectionKey(), …)`, also
     recomputing `count`). The badge updates at once, with no extra request.
   - If the list is only the first page (`total > JIRA_PAGE`) and `total` differs from `conn.assigned.length` (capped
     at the count page, 100), invalidate the connection query so it reads again.
   - Saved views and custom JQL never touch the count (they're not "assigned to you").
   The badge's number change uses the existing badge transition; nothing new to animate.
2. **The number refreshes on its own every 5 minutes**, not 15: `JIRA_COUNT_EVERY_MS` = `JIRA_STALE_MS` = 5 min. That
   is one extra light Jira search (keys only, 100 max) every 5 minutes per open app.
3. **Coming back to the app refreshes a stale number.** A `window` `focus` listener (works in browsers and in the Mac
   webview) invalidates the connection read when it is older than 1 minute (`dataUpdatedAt`), so a burst of focus
   changes costs at most one read a minute. Same for `visibilitychange` to visible, which React Query already does
   but only past the 5 minute stale time.

## Tests

New, in `apps/web/src/app/jira.test.ts` (unit, with the mocked api as the existing C10-U tests do):

- **C10-U24** The assigned list corrects the count: connection says `assigned: ['A-1']`, the assigned list returns
  `A-1, A-2` (total 2) → the badge count becomes 2 without a second connection request.
- **C10-U25** A first page doesn't overwrite: list total 120 with 50 keys, connection has 100 keys → the connection
  query is invalidated (one GET), not overwritten with 50 keys.
- **C10-U26** Saved views and JQL leave the count alone: a saved view returning 3 issues doesn't change the count.
- **C10-U27** Focus refreshes a stale count: connection read 2 minutes ago, `window` focus → one GET; focus again
  within a minute → no second GET.
- **C10-U28** A count that drops follows too: connection `['A-1','A-2']`, list returns `A-1` only (A-2 reassigned) →
  count 1.

New E2E in `apps/web/e2e` (Jira spec, mocked Jira as in C10-E2x):

- **C10-E27** Badge follows a newly assigned issue: start with 1 assigned (badge 1), the mock Jira gets a second
  assigned issue, open the panel → list shows 2 and the badge reads 2 without pressing Refresh.

Updated: none of the existing C10 tests change; the interval constant is read from `jira.ts`, so tests that use it
keep working. Run on Rohit's Mac: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm e2e jira`.
