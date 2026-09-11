# Step 13: Live sync engine

Status: Done
Depends on: step 9
Blocks: step 10 (JIRA writes emit the same events)

## Goal

After this step:

- The web and desktop clients keep an in-memory replica of tasks, comments, timeline, Inbox, and Team.
- Writes go through `POST /sync`. UI hooks keep the same names; they enqueue an op, apply it locally, then wait for the server.
- Another person's write (Marcus commenting while you look) appears without reload, under about a second.
- Reload bootstraps the active views and then streams from `currentSeq`. A killed app can lose an in-flight click. No IndexedDB this pass.
- Last-write-wins via confirmed snapshot plus replay of pending ops. Not CRDTs. Not per-field merge.
- Private tasks never fan out to the manager (`task.hide` if they already had the row).

## Non goals

- Durable outbox / IndexedDB.
- CRDT typing in one comment.
- Multi-tab lock (two tabs are two replicas).
- Pruning the event log.
- Switching Neon off HTTP (no Postgres `LISTEN/NOTIFY`).
- JIRA writes (step 10). This engine lands first so JIRA can emit the same events.

## Key files

| Path | Role |
|------|------|
| `packages/db/src/sync-schema.ts` | `sync_events`, `sync_mutations` |
| `packages/db/src/sync.ts` | `emitSync`, claim/idempotency, list after seq |
| `packages/shared/src/sync.ts` | Ops, events, view keys, `recipientsForTask` |
| `apps/server/src/applySyncOp.ts` | Dispatcher over existing db functions, then emit |
| `apps/server/src/routes/sync.ts` | `POST /sync`, `GET /sync/bootstrap`, `GET /sync/stream` |
| `apps/server/src/syncHub.ts` | In-process wake for SSE waiters |
| `packages/store/src/sync/` | Replica, slice, enqueue, fetch SSE, hook facade |

## Decisions (settled)

1. **Full engine, not comments-only.** Task, comment, timeline, Inbox, and Team all go through sync.
2. **Live while the app is open.** In-memory replica. Reconnect catch-up from `currentSeq`.
3. **Client-generated entity ids** on create, so there is no temp-id swap.
4. **Auth, `/me`, link preview, OTA** stay on today's HTTP.
5. **Existing REST GET/POST stays** for curl and as the db-function callers. The client stops calling write REST.
6. **SSE is fetch + ReadableStream.** Native `EventSource` cannot set `Authorization`.
7. **Wake in-process after a local write; poll `sync_events` about every 300ms** so a second Node still catches up. Heartbeat every 15s. Header `X-Accel-Buffering: no`.

## Protocol

Ops: `task.create|update|delete|reorder|rollover`, `subtask.create|update|delete|reorder`, `comment.create|update|delete`, `inbox.accept|decline`, `team.invite.create|accept|decline`, `team.task.send|reorder|delete`.

Events (one row per recipient): `task.upsert|delete|hide`, `comment.upsert|delete`, `timeline.append`, `inbox.upsert|delete`, `invite.upsert`, `roster.upsert`, plus `reportDay.upsert` so a manager's report-day tasks do not leak into their own Today list.

Recipients: task owner always. Linked manager too unless `isPrivate`. Inbox cards go to the `toUserId`. Same rules as `resolveTaskAccess`.

Idempotency: `sync_mutations (userId, clientMutationId)` unique. Retry of the same id is a no-op ack.

Bootstrap views: `day:{date}`, `unscheduled`, `inbox`, `team:{date}`, `reportDay:{userId}:{date}`, `taskDetail:{taskId}`. Week keeps seven day views.

## Client

`syncSlice` holds `confirmed` entities, `pending[]`, `seq`, and view refs. `enqueue` applies on top of confirmed+pending, then `POST /sync`. Your own stream echo updates `confirmed` but pending stays until the POST ack, so a multi-snapshot write (reorder) does not snap back after the first event. Someone else's event: apply to confirmed, replay pending.

`AppProviders` wires the auth token. `AppShell` starts the stream after login (`getMe` succeeds) and stops it on logout.

Remote order changes skip FLIP (`remoteMovedTaskIds`) so a complete-to-bottom from Marcus does not leave a stuck transform.

## Verification

```bash
pnpm db:migrate
pnpm test
pnpm lint:copy
pnpm --filter @tudu/ui exec tsc --noEmit
```

Browser (two accounts, both signed in):

1. testuser: open a shared task, stay on Comments.
2. Marcus: add a comment on that task.
3. testuser: comment appears without reload or tab switch, under 1s.
4. Reverse: testuser comments, Marcus sees it on the report day inspector.
5. testuser checks a box; Marcus's report day moves the row; no stuck overlap.
6. Disconnect (stop stream / offline) then reconnect: missed comments catch up.
7. Private task: Marcus does not get the comment or the task.

Also: Inbox badge live, accept/decline, title debounce still does not jump the caret.

Prod migrate adds `sync_events` + `sync_mutations`.
