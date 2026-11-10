# A stuck IndexedDB write stops every change from being sent

Status: proposal, revised 10 Nov 2026 after two probes on Rohit's Mac, awaiting Rohit's approval. This replaces the
6 Nov version ("leaving the page at once loses the answer"), which the probes showed was wrong. Canvas: not
applicable, I think (nothing on screen changes). I'm asking before skipping it.

## The report

C11-D09's last step (Mac) waits for the Dock badge to clear after both requests are declined. With the screen unlocked
it stays at `"1"` in about 1 run in 10 on master (6/50 and 4/25 on 10 Nov; it never fails with the screen locked).
#83 didn't cause it.

## What the probes showed (master 946a44b, Rohit's Mac, screen unlocked)

**Probe 1** (50 runs, 6 failed). In every failure the leftover is the **second** space's request (Acme), still
`waiting` on the server with `seenAt` null. The first one (Northwind) is declined. The Acme card is gone from the
page, so the decline was applied on screen and never reached the server. The test clicked the right card each time.

**Probe 2** (25 runs, 4 failed). This one recorded every outbox step in the page:

- In all 4 failures, the first thing that sticks is the outbox removing the **Northwind** decline right after the
  server accepted it (`send` → `sent` → `tx-start readwrite` → `tx-opened`, and then nothing). There is no complete,
  no error and no abort, ever.
- Every later IndexedDB transaction queues behind it and never settles either: the Acme step's `inbox.read` put, the
  `request.decline` put, and a plain read-only control read (timed out at 5 s).
- `Outbox.flush` stays "running" forever, awaiting that remove. So nothing else is sent, and nothing reports an
  error.
- `indexedDB.open` never hangs (once per page, always ok), and `onblocked` never fired.
- In all 21 passes, the same remove completes in about a millisecond and the control read takes 1–4 ms.

The stuck remove happens in the first ~50 ms after the Acme page loads. The new page's `resume()` sends the
Northwind decline that the previous page had stored, and removes it. Why WebKit never finishes that transaction
I can't tell from the page. It may be the old page's IndexedDB connection still being torn down. The page can't fix
WebKit, but it can stop one stuck write from blocking every change after it.

For a person: make a change, reload (or open a window) with something left in the outbox, then keep working. Every
change from then on shows on screen and is never sent, with no error, until the next reload. The Inbox count and the
Dock badge stay wrong, and so does everything else you change.

## Fix (`packages/client/src/outbox.ts`, `tasks.ts`)

1. **Send from memory, keep IndexedDB for surviving a reload.** The `Outbox` keeps its queue in memory
   (`resume()` seeds it from the store). `add` queues the change and starts the put, but doesn't wait for it before
   sending. `flush` sends the batch from memory, takes the accepted ids off the queue, and starts the removes without
   awaiting them in the loop. A stuck write can't hold up sending any more.
2. **A transaction that doesn't settle in 3 s counts as failed.** `IndexedDbOutboxStore.tx` rejects after 3 s,
   closes its connection and opens a fresh one on the next call. If WebKit gets going again, later writes land. If
   it doesn't, the cost is that a change made in that page isn't kept across a reload. That's no worse than today,
   where it's never sent at all.
3. Sending a change twice is already safe: the server applies each mutation id once (`applyMutation` claims it in
   `applied_mutations`). So a change that's both in memory and still on disk after a reload doesn't double.

The order of changes stays as it is (by clock, then seq). No test gets longer waits or retries.

## Test scenarios

- **C11-U47** (client unit, outbox): with a store whose `put` and `remove` never settle, three changes made in a row
  are all sent, in order, and `idle()` turns true once the server has them.
- **C11-U48** (client unit, outbox): a `remove` that never settles after a batch is accepted doesn't stop the next
  batch from being sent.
- **C11-U49** (client unit, IndexedDbOutboxStore with fake-indexeddb): a transaction that doesn't complete rejects
  after 3 s, and the next call opens a new connection and works.
- **C11-U50** (client unit): after a reload, a change still on disk that was already sent is sent again and
  accepted once (the server's answer for an applied id), with no error toast.
- **C11-D22** (Mac, deterministic): the test holds a readwrite transaction on the outbox store open (it keeps
  issuing `get`s in it), then declines a request in the Inbox. The server gets the decline within 2 s, and the
  badge clears. This fails on today's code every time.
- **C11-D09**: unchanged. It should stop failing.

## How I'll verify (on Rohit's Mac, screen unlocked)

1. New cases red on master, green with the fix.
2. C11-D09 ×50 on master and on the branch, same lock state for both. Today it's about 10% on master; the branch
   should be 0/50.
3. The whole Mac group, plus the web and client unit suites.

## Not in this change

- The 6 Nov idea of a keepalive send on `pagehide`. The probes found no change lost on leaving a page.
- `InboxItem` waits for its 240 ms close animation before it calls `onDecline` from a row. It's a real window, but
  nothing has shown it losing a change. I'll note it and leave it.
