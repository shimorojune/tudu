# E2E suite: pin the timezone so ticks don't lose to their own seeds

Status: proposal, awaiting Rohit's approval (26 Oct 2026). No app code changes; no visible design change (canvas step
not applicable, needs Rohit's OK to skip).

## What fails

On Rohit's Mac (Asia/Kolkata), on master, while CI (UTC) passes:

- C21-E01 / E05 / E08 (All spaces, every project): ticking a task never saves, so the ring never reads
  "2 of 5 crossed off"; E08's backlog still lists "Mend the gate", which the test crossed off through the API.
- C20-E01 (menu bar): a tick never gets the done style. C20-E03, E06, E09 tick seeded tasks the same way.

Not related to PR #35 or to the All spaces freeze (that thread is about the task panel's navigate loop).

## Cause

Test bug, not an app bug. Two clocks in the fixtures disagree outside UTC:

- The page clock is local time: `SUNDAY = new Date(2026, 9, 18, 10, 0)` (`packages/e2e/fixtures/today.ts`), and
  `fixClock` hands it to `page.clock.setFixedTime`. Every mutation the page makes is stamped with that clock.
- Seeds are fixed UTC: `seedTasks` stamps `task.create` from `'2026-10-18T09:00:00.000Z'` (`fixtures/spaces.ts`),
  commented "before the page's clock, or its own changes lose to them".
- The server is last-write-wins per field: `newer(at, clock)` in `apps/server/src/tasks.ts` drops a change older than
  the field's clock.

| TZ            | Page "Sunday 10:00" | Seed  | Tick saved? |
| ------------- | ------------------- | ----- | ----------- |
| UTC (CI)      | 10:00Z              | 09:00Z | yes        |
| Asia/Kolkata  | 04:30Z              | 09:00Z | no, dropped as older |

So in India every tick on a seeded task is older than the task itself and the server ignores it. E08's API cross
uses `SUNDAY + 5s` = 04:30:05Z, older than its seed, same result. The browser shows the tick optimistically, then the
server's answer puts it back, which is the "never gets the done style" seen in C20.

Other specs hard-code UTC seed times too (search, motion, jira, `EARLIER` in all-spaces), so patching one fixture
would leave the same trap elsewhere.

## The change

`packages/e2e/playwright.config.ts` only:

1. `process.env.TZ = 'UTC'` at the top of the config, before anything builds a date. Playwright loads the config in
   the runner and in every worker before the test files, so `new Date(2026, 9, 18, 10, 0)` is 10:00Z everywhere. The
   API server it starts inherits it too (it already stores UTC).
2. `use: { timezoneId: 'UTC' }`, so the browser's local time matches Node's whatever the machine is set to.

Result: the Mac runs exactly what CI runs. The Mac app suite (`packages/e2e/mac`) uses none of these fixtures and is
not touched.

Trade-off, said plainly: the e2e suite then never runs outside UTC, so it won't catch a day-boundary bug that only
shows in India. It doesn't catch one today either (CI is UTC, and the Mac run just fails). If we want that coverage, it
should be a deliberate test with its own timezone (a follow-up, not this fix).

Alternative considered and not recommended: make every seed time relative to the page clock. It touches about ten
places in six specs and still leaves the suite's results depending on the machine.

## Test scenarios

New (docs/tests/chunk-00.md, `packages/e2e/tests/kit/kit.spec.ts`):

| Id      | What                         | Scenario |
| ------- | ---------------------------- | -------- |
| C00-E06 | The suite runs in UTC        | In the test process `new Date(2026, 9, 18, 10, 0).toISOString()` is `2026-10-18T10:00:00.000Z`, and in the page `new Date().getTimezoneOffset()` is 0 and `Intl.DateTimeFormat().resolvedOptions().timeZone` is `UTC`. Fails loudly if someone drops the pin, instead of leaving tick tests to fail mysteriously. |

Unchanged cases that must go green on Rohit's Mac with its default timezone (no `TZ=` prefix):
C21-E01, C21-E05, C21-E08, C20-E01, C20-E03, C20-E06, C20-E09, on desktop, tablet and phone.

Verification plan (on Rohit's Mac, not the cloud):

1. Before the change, on master: run those seven with the Mac's default timezone (expect the failures), then again with
   `TZ=UTC` (expect green). This confirms the cause.
2. After the change: the seven plus C00-E06 green with no `TZ=` prefix, 5 runs in a row.
3. Full `pnpm e2e` on the Mac once, to catch any test that silently depended on India time (none expected; CI is UTC).
4. CI green on the PR.
