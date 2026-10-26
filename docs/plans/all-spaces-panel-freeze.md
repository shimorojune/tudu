# Opening a just-written task in All spaces freezes the tab

Status: proposal, awaiting Rohit's approval (canvas: not applicable, no visible change; asked 26 Oct 2026).

## What happened

Staging, 26 Oct 2026: in All spaces filtered to Personal (`/all?space=me`), Rohit wrote "Test task" and clicked it.
The row took the selection wash, the panel never opened, and the tab stopped responding.

## Reproduced

- **Staging, Chrome:** write a task on the writing line in `/all?space=me`, press Enter, click the new row straight
  away. The renderer hung; DevTools calls to the tab timed out after 45 s.
- **Locally, deterministic:** a Playwright case that holds `POST /api/sync` back until the panel is open, then lets it
  through. All spaces Today froze 6 of 6 runs, filtered and unfiltered alike. A space's own Today passed 3 of 3.
- **Without the gate:** the same click froze about 1 run in 3. It depends on whether the server's answer (which brings
  the task's ref, `ME-3`) lands before or after the panel opens. Tasks that already had a ref never froze.

So the space filter is not the cause. Rohit most likely hit it filtered because that is where he had just written the
task: the row in his screenshot wears the new-task wash.

## Cause

A trace of the frozen tab shows React flushing passive effects nonstop. `TaskPanel`'s `onRef` effect calls
`router.navigate` → `buildAndCommitLocation` → `load` over and over, never settling.

1. A task written a moment ago has no ref yet, so `openTask(id, null)` leaves `?task=` out of the address.
2. When the server answers, the panel's detail gains `ref`, and this effect tells the page:

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
   getting a different ref, still reports. This alone fixes the freeze: with it, the deterministic case passed 9 of 9
   (All spaces filtered, unfiltered, and a space's Today, 3 runs each). I tried it on a scratch copy and reverted it;
   nothing is committed yet.

   ```tsx
   const told = useRef<string | null>(null);
   useEffect(() => {
     if (!open || !detail?.ref || detail.id !== open.id) return;
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
  mismatched id (an older detail still showing): not called. Without the guard this fails at the second render.
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
- **C21-E24 A space's own Today, Week and Backlog** behave the same (regression guard for the shared panel).

Existing, must stay green unchanged: C21-E03 (filter kept through a reload), C21-E13 (panel and Space fact), C21-E06
(writing line), C21-U15 (`?space=` handling), and every e2e group that opens the panel from an address
(`?task=` reload and link cases in chunks 03 and 05).

Proof before calling it fixed:

- C21-E22 to C21-E24 fail on master first (the freeze, caught by the 5 s liveness check), then pass with the change.
- The un-gated race (click within one frame of Enter) 20 times in a row with two workers, which froze about 1 in 3
  before.
- `pnpm verify` and `pnpm e2e all-spaces` (desktop, tablet, phone) on Rohit's Mac.

## Cleanup on staging

While reproducing I wrote two throwaway tasks in Rohit's Personal on staging ("Freeze repro (delete me)" and
"Freeze repro 2 (delete me)", today). I did not delete them; Rohit can remove them, or ask me to.
