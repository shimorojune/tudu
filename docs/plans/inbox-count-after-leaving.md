# Answering a request and leaving the page at once can lose the answer

Status: proposal, 6 Nov 2026, awaiting Rohit's approval. Canvas: not applicable, I think (no screen changes; the
answer just stops getting lost). I'm asking before skipping it.

## The report

C11-D09's last step (Mac) waits for the Dock badge to clear after both requests are declined. On Rohit's Mac with
the screen unlocked it stays at `"1"` about 1 run in 25, **on master too** (master 1/25, after #83 2/25; it never
fails with the screen locked). While it waits, `/inbox?space=acme` lists nothing and the top bar says "Inbox, 1 new".
This is not something #83 caused: my earlier "the first badge fix regressed it" compared an unlocked branch run with a
locked master run.

## What I think happens (from the code; step 1 below confirms it)

The test declines the first request (in the first space), then at once loads `/inbox?space=acme` with
`location.assign`. The decline only reaches the server through the outbox:

1. `declineRequest` → `TaskStore.mutate` applies it on screen and calls `IndexedDbOutboxStore.put` (async).
2. Only after that write commits does `Outbox.flush` read the store and `fetch('/api/sync')`.

If the page unloads before the IndexedDB write commits, the decline is gone: it isn't on disk for the next page's
`resume()`, and it was never sent. If the write committed but the `fetch` was cut off, `resume()` sends it again,
which is fine (decline is idempotent). So the loss window is the IndexedDB write, tens of ms, and a fast navigation
right after Send can land in it. The leftover `1` is the first space's request, still waiting; Acme's list is
empty because Acme's was declined, and the test never looks at the first space again.

A person hits this by answering a request (or making any change) and closing or reloading the window right away:
the change shows as done and then comes back. Rare, but it's silent data loss, not just a stale count.

The row in the list (not the open item) has a second, larger window: `InboxItem`'s `leave()` waits for the 240 ms
close animation before calling `onDecline`/`onAccept`, so leaving during the animation never makes the change at all.

## Fix

- `TaskStore`: on `pagehide`, send whatever is still pending (in memory, stored or not) to `/api/sync` with
  `fetch(..., { keepalive: true })`. The Notebook already flushes on `pagehide` (`notebook.ts`); this does the same
  for tasks. The server already handles a mutation arriving twice (the outbox resends after a crash), so a keepalive
  send plus a later `resume()` of the same id is safe.
- `InboxItem`: make the change first, then play the close animation (the row is already optimistic).

No retries or longer waits in the test.

## Test scenarios

- **C11-U47** (client unit): a mutation whose store write never settles is sent with `keepalive` on `pagehide`;
  one already sent isn't sent twice in the same page.
- **C11-U48** (ui unit): declining from a row calls `onDecline` before the close animation ends.
- **C11-D22** (Mac): decline a request and reload in the same tick, 3 times; after each, `/api/inbox` (all spaces)
  shows it declined and the badge is right.
- **C11-D09**: unchanged; it should stop failing.

## How I'll verify (on Rohit's Mac, screen unlocked)

1. Before any code: run C11-D09 ×25 on master with a probe that, on failure, reads `/api/inbox` across all spaces.
   If the leftover isn't the first space's waiting request, I come back with what it is.
2. New cases red on master, green with the fix.
3. C11-D09 ×50 unlocked on master and the branch, same lock state for both, then the whole Mac group.

## Files

- `packages/client/src/tasks.ts`, `packages/client/src/outbox.ts`, `apps/web/src/app/tasks.ts`
- `packages/ui/src/components/InboxItem.tsx`
- tests: `packages/client/src/outbox.test.ts`, `packages/ui/src/components/InboxItem.test.tsx`,
  `packages/e2e/mac/tests/desktop.spec.ts`
