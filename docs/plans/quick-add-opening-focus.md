# Quick Add's opening focus never takes the caret back

Status: approved by Rohit 25 Oct 2026 (canvas skipped: no visible change); implemented.

## What failed

`Tests: PR + master` run 76 on master (40189395537, the merge of PR #20) failed in Unit tests:

```
FAIL ui src/components/QuickAdd.test.tsx > C18-U17 a name that is already a project offers it ...
Expected element to have text content: Platform is already here.
Received: New projectIts colour, here or later in Settings.Add
```

699 of 700 passed. PR #20 only touched the task panel, so it did not cause this. The same test passes locally 15/15.

## Cause (reproduced)

`QuickAdd.tsx` focuses the title line shortly after the bar opens:

```tsx
const t = setTimeout(() => input.current?.focus({ preventScroll: true }), overlay ? 30 : 0);
```

It focuses unconditionally. If anything inside the bar already has the caret when the timer fires, the title line takes
it back. In C18-U17 the test opens the project picker, picks "New project…" and types " platform" into the name card.
When the 30 ms timer fires late (a busy CI worker), it lands mid-typing: the rest of the letters go into the task title,
the name card stays empty, and "Platform is already here." never shows.

Proof: with the delay raised to simulate a late timer, the file fails every time, and the victim moves with the timing:

| Delay    | Failing tests             |
| -------- | ------------------------- |
| 10, 50   | none                      |
| 80 ms    | C18-U16, C18-U17, C04-U28 |
| 120 ms   | C04-U04, C04-U28          |
| 160, 200 | C04-U04                   |

So this is a race in the component, not a broken assertion, and three more Quick Add tests are exposed to it.

Real-world impact is small (a person would have to click into the bar within 30 ms of it opening, or the machine has
to stall), but the behaviour is wrong: the opening focus is meant to make the line ready, not to pull the caret out of
a field the person already chose.

## The change

One guard in the opening-focus timer: focus the title line only if the caret is not already inside the bar.

```tsx
const t = setTimeout(
  () => {
    const now = document.activeElement;
    if (now && now !== document.body && panel.current?.contains(now)) return; // the person got there first
    input.current?.focus({ preventScroll: true });
  },
  overlay ? 30 : 0,
);
```

`panel` is the ref on the bar's `<section>` (named `sheet` in the code), which holds the chips and their pickers in place. Nothing else changes:
opening still lands the caret on the title line when nothing else has it (C04-U01). No retries, no waits added to tests,
no test loosened.

## Test scenarios

New (unit, `packages/ui/src/components/QuickAdd.test.tsx`, added to `docs/tests/chunk-04.md`):

- **C04-U29 The opening focus waits its turn.** With fake timers: render the bar, focus the project chip (and, in a
  second case, the New project name field) before the opening timer runs, advance 50 ms; the caret is still where it
  was and the title line is not focused. Without the guard this fails deterministically.

Existing, must stay green unchanged:

- C04-U01 (just opened: the title line is focused).
- C04-U04, C04-U28, C18-U16, C18-U17 (the tests the race can hit).

Proof before calling it fixed (per the flaky-test rule, no "green twice"):

- Re-run the delay sweep above (10 to 200 ms) with the guard in place: all 21 Quick Add tests pass at every delay.
- `QuickAdd.test.tsx` 30 times in a row locally, and the full Unit tests job green on the PR.

## Out of scope

Other components with the same "focus after a timer" pattern. If any show up in CI, they get the same guard in their
own change.
