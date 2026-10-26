# Opening a task in All spaces can freeze the tab

Status: approved by Rohit 26 Oct 2026 (canvas skipped: no visible change); implemented.

## What happened

Staging, 26 Oct 2026: in All spaces filtered to Personal (`/all?space=me`), Rohit clicked "Test task". The row took
the selection wash, the panel never opened, and the tab stopped responding. He then confirmed it also happens with a
task that already has its ID (`ME-3`, long saved on the server).

## Reproduced

- **Staging, Chrome:** write a task on the writing line in `/all?space=me`, press Enter, click the new row straight
  away. The renderer hung; DevTools calls to the tab timed out after 45 s.
- **Locally, deterministic:** a Playwright case that holds `POST /api/sync` back until the panel is open, then lets it
  through. All spaces Today froze 6 of 6 runs, filtered and unfiltered alike. A space's own Today passed 3 of 3.
- **Without the gate:** the same click froze about 1 run in 3. It depends on whether the server's answer (which brings
  the task's ref, `ME-3`) lands before or after the panel opens.
- **A saved task, opened a second time:** open a task that has had its ref for ages, close it, open it again. All
  spaces froze 4 of 4 runs (filtered and unfiltered); a space's own Today passed 2 of 2. The first open of a page load
  works, which is why my first try on staging did not freeze.

So the space filter is not the cause, and neither is a missing ref. Both triggers are the same loop.

## Cause

A trace of the frozen tab shows React flushing passive effects nonstop. `TaskPanel`'s `onRef` effect calls
`router.navigate` → `buildAndCommitLocation` → `load` over and over, never settling.

1. The panel has the task's detail with its ref while the address does not yet say `?task=<that ref>`. Two ways:
   - a task written a moment ago has no ref yet, so `openTask(id, null)` leaves `?task=` out, and the ref arrives
     when the server answers;
   - a task opened before in this tab has its detail cached, so on reopening the detail (with its ref) is there on the
     very first render, before `openTask`'s own `navigate` to `?task=ME-3` has committed.
2. This effect then tells the page about the ref:

   ```tsx
   useEffect(() => {
     if (open && detail?.ref && detail.id === open.id) onRef?.(detail.ref);
   }, [open, detail?.ref, detail?.id, onRef]);
   ```

   `onRef` is a new function on every render of the page, so the effect runs again on **every render**, not once.
   Each run checks `search.task !== ref` and calls `navigate(...)` while the previous navigation is still pending, so
   the check is still true.

3. In All spaces, every navigation step re-renders the whole page. `AllLayout` subscribes to the full
   `location` (`useRouterState({ select: (s) => s.location })`) and builds a new `scope` object each time, so
   `AllProvider` hands every page a new value. The page re-renders, the panel's effect runs again, and it starts
   another navigation, which cancels the one in flight. The address never commits, and the loop never yields.

On a space's own pages the shell does not re-render on address changes (`SlugFollow` was split out for exactly that),
so step 3 is missing and the same effect settles after one extra render. That is why only All spaces froze. The effect
is still wrong there and would loop with any parent that re-renders on navigation.

## The change

Two small fixes, one per cause. Nothing visible changes.

1. **`TaskPanel` tells the page a ref once per task** (`apps/web/src/routes/today/TaskPanel.tsx`). Keep the last
   `taskId:ref` it reported in a ref and skip the call when it is unchanged. Opening another task, or the same task
   getting a different ref, still reports. Closing the panel clears it, so reopening a task whose ref arrived while
   it was closed still puts the ref in the address. This alone fixes both triggers: with it, the new-task case passed
   9 of 9 and the reopen case 6 of 6 (All spaces filtered, unfiltered, and a space's Today). I tried it on a scratch
   copy and reverted it; nothing is committed yet.

   ```tsx
   const told = useRef<string | null>(null);
   useEffect(() => {
     if (!open) {
       told.current = null;
       return;
     }
     if (!detail?.ref || detail.id !== open.id) return;
     const k = `${open.id}:${detail.ref}`;
     if (told.current === k) return;
     told.current = k;
     onRef?.(detail.ref);
   }, [open, detail?.ref, detail?.id, onRef]);
   ```

   The logic moves into a small hook (`useRefOnce(open, detail, onRef)`) in the same file so it can be unit-tested
   without the whole panel.

2. **All spaces' shell stops re-rendering on every address change** (`apps/web/src/router.tsx`, `AllLayout`). It
   subscribes to `?space=` only (`select: (s) => new URLSearchParams(s.location.searchStr).get('space')`). The scope
   is memoised on `spaces`, the filter and `gone`. `setFilter` and the stale-slug cleanup read the current location
   from `router.state.location` when they run, instead of capturing it at render. This matches how the space layout
   already behaves. It also means opening and closing tasks, turning days and other address changes stop re-rendering
   the whole All spaces shell.

Not changed: the pages' `onRef` callbacks (Today, Week, Backlog) stay as they are. The once-per-task guard makes their
identity irrelevant, and the existing `search.task !== ref` check stays as a second guard.

## Test scenarios

New, unit (`apps/web`):

- **C21-U18 The panel reports a task's ref once.** `renderHook` over `useRefOnce`: open a task with no ref, then
  give it ref `ME-3` and re-render 20 times with a new `onRef` function each time. `onRef` is called once, with
  `ME-3`. Then open another task with ref `ME-4`: called once more, with `ME-4`. Then the first task's detail with a
  mismatched id (an older detail still showing): not called. Close (open null) and reopen the first task: called once
  again. Without the guard this fails at the second render.
- **C21-U19 All spaces' scope holds still while the address changes.** Render `AllLayout`'s scope hook under a
  memory router at `/all?space=me`, navigate to `/all?space=me&task=ME-3` and then to `/all`. The scope object keeps
  its identity across the `?task=` change and changes once when `?space=` goes. `setFilter` after both navigations
  keeps whatever `?task=` the address has at that moment.

New, end-to-end (`packages/e2e/tests/all-spaces/all-spaces.spec.ts`, added to `docs/tests/chunk-21.md`). Each holds
`/api/sync` back with `page.route` until the panel is open, then releases it. Each asserts the page still answers
`page.evaluate` within 5 s, the panel shows the task's title, and the address reaches `?task=ME-n`:

- **C21-E22 A task written in All spaces opens straight away**, before the server has confirmed it. Run in three
  places: All spaces Today unfiltered, Today filtered to Personal, and Today filtered to Northwind (task lands in
  Northwind, its ref is Northwind's).
- **C21-E23 The same on All spaces' Week and Backlog** (writing on a day tile and in the Backlog, opening at once).
- **C21-E24 A saved task opened, closed and opened again** in All spaces Today (unfiltered and filtered), Week and
  Backlog. No gate needed: the second open freezes on master every time.
- **C21-E25 A space's own Today, Week and Backlog** behave the same for both triggers (regression guard for the
  shared panel).

Existing, must stay green unchanged: C21-E03 (filter kept through a reload), C21-E13 (panel and Space fact), C21-E06
(writing line), C21-U15 (`?space=` handling), and every e2e group that opens the panel from an address
(`?task=` reload and link cases in chunks 03 and 05).

Proof before calling it fixed:

- C21-E22 to C21-E24 fail on master first (the freeze, caught by the 5 s liveness check), then pass with the change.
- The un-gated race (click within one frame of Enter) 20 times in a row with two workers, which froze about 1 in 3
  before.
- `pnpm verify` and `pnpm e2e all-spaces` (desktop, tablet, phone) on Rohit's Mac.

## As built (26 Oct 2026)

Differences from the approved text, none of them in behaviour:

- `useRefOnce` lives in its own module (`apps/web/src/app/refOnce.ts`) rather than in `TaskPanel.tsx`, so its unit
  test does not load the whole panel.
- C21-U19 tests the new `useAllScopeValue` hook (`apps/web/src/app/allSpaces.tsx`) with `renderHook` and a stand-in
  for the address, rather than under a memory router. It checks the same things: identity across a `?task=` change, a
  new scope when `?space=` goes, and `setFilter` editing the address as it is when called.
- The end-to-end cases are grouped into three IDs instead of four. **C21-E22** is a just-written task on All spaces
  Today (every space, Personal, Northwind). **C21-E23** is a saved task opened twice on All spaces Today (unfiltered
  and filtered), Week and Backlog. **C21-E24** covers both triggers on a space's own Today, Week and Backlog. A
  just-written task on Week and Backlog is not a case of its own. Those pages share the panel and the guard, and the
  reopen case already freezes them on master.

- One more race fixed, found by C21-E23 on phone on Rohit's Mac (1 run in 3): tapping a space pill and then a task
  within a few milliseconds dropped the filter. The pill had already put `?space=me` in the address, but the page had
  not re-rendered yet, so opening the task built `?task=ME-1` from the old, unfiltered filter. The same was true on
  master. Today, Week and Backlog now build task addresses with `useTaskHref`, which reads `?space=` from the address
  when it is called. All spaces' `setSearch` reads the browser history's location for the same reason.

Results here (the container, desktop, tablet and phone), before the full run on Rohit's Mac:

- On master, C21-E22 (all three) and C21-E23 froze. C21-E24 passed, as expected: space pages do not loop.
- With the change, 15 of 15 passed. The un-gated race (click within a frame of Enter, two workers) passed 20 of 20.

## Cleanup on staging

While reproducing I wrote two throwaway tasks in Rohit's Personal on staging ("Freeze repro (delete me)" and
"Freeze repro 2 (delete me)", today). I did not delete them; Rohit can remove them, or ask me to.
