# CI: more shards, so a PR check takes ~7 minutes instead of ~12

Status: declined by Rohit 25 Oct 2026 (gain too small for the change); see ci-path-filters.md. Canvas: not applicable; skipping it
needs Rohit's OK.

## Where the time goes today

`Tests: PR + master` (`.github/workflows/ci.yml`), four recent green runs (25 Oct 2026):

| Run                  | Total  | Mac app (macOS) | Web e2e 1/4 | 2/4   | 3/4   | 4/4   | Unit  | Lint+types | API image |
| -------------------- | ------ | --------------- | ----------- | ----- | ----- | ----- | ----- | ---------- | --------- |
| 40214213111 (master) | 11m27s | **11m26s**      | 9m10s       | 7m15s | 7m05s | 6m42s | 2m34s | 1m22s      | 0m43s     |
| 40213018963 (PR)     | 12m13s | **12m12s**      | 9m19s       | 7m41s | 7m01s | 6m17s | 1m59s | 1m20s      | 0m36s     |
| 40198246620 (master) | 11m33s | **11m33s**      | 9m30s       | 6m16s | 5m29s | 6m08s | 2m25s | 1m20s      | 0m36s     |
| 40194721651 (PR)     | 10m15s | 9m51s           | **10m15s**  | 7m11s | 6m14s | 6m17s | 2m27s | 1m16s      | 0m38s     |

The whole run takes as long as its slowest job. That is the **Mac job** in three of four runs, and web shard 1 in the
fourth.

**Mac app job (~11.5 min)**, run 40214213111:

- Runner setup, Rust cache, Postgres, pgvector, `pnpm install`, model: ~1.5 min.
- Rust unit tests (`cargo test`, compiles the test profile): 1m10s.
- `pnpm e2e:mac` builds Tudu Test twice (this version and one up): ~1m45s.
- The 35 desktop cases, **one at a time** (`workers: 1`, `fullyParallel: false`, one spec file): 7.1 min.

The cases are serial on purpose, since the global summon and the key window belong to one app at a time. But that
is per machine. Two macOS runners each have their own app, so the group can be split across runners.

**Web e2e shards (~9.5 min for the slowest)**:

- Fixed cost per shard before the first test: ~1.5 min (service containers ~15–20s, `pnpm install`, model,
  `playwright install --with-deps chromium webkit` 35–50s), then ~15s to build the web app and start the API.
- Shards are uneven. Playwright splits by test count in project order (desktop, tablet, phone, webkit), and **skipped
  tests count**. Shard 1 is all `[desktop]`: 207 run, 17 skipped, 7.8 min. Shard 4 is all `[phone]`: 106 run,
  118 skipped, 5.4 min. 136 `test.skip(project.name …)` calls skip most cases in the tablet and phone projects.
- About 25 min of test time across the four shards, two workers each.

Unit tests (~2.5 min), lint + typecheck (~1.3 min) and the API image (~40s) run in parallel and never set the pace.

## Would 10 web shards help on their own?

**No, not for the overall time.** The web shards would drop from ~9.5 min to ~5 min. But the Mac job still takes
~11.5 min, so a PR check would still take ~11.5 min. The only exception is runs like 40194721651, where shard 1 was
slowest, and there it saves about 25 seconds. To make CI faster, the Mac job has to be split too.

Limits on how far sharding goes:

- **Fixed cost per shard.** ~1.5 min of setup on web and ~3 min on Mac (setup plus the two app builds) is paid again
  on every runner. A web shard can't finish in less than ~2 min, or a Mac shard in less than ~3.5 min, however many
  shards there are.
- **Uneven shards.** With 10 web shards the desktop-heavy ones still do about twice the real work of the phone-heavy
  ones (skipped tests count). That costs ~1 min, not 4, so it isn't worth fixing now.
- **Postgres and RustFS.** Each shard is its own runner with its own service containers, so more shards add no
  database load. Two workers per runner stays as it is (`workers: process.env.CI ? 2`).
- **Flakes.** Each test runs the same way. More runners means more chances that one runner has a slow start or a
  network problem. A known flaky case still fails the same share of runs, because it runs once either way.
- **Runner concurrency.** GitHub's free plan allows 20 Linux jobs at once and 5 macOS jobs per account. This run would
  use 13 Linux and 3 macOS. Two pushes at once (a PR and master) could queue some jobs. Runner minutes don't matter
  (Rohit, 23 Oct).

## The change

1. **Web e2e: 4 → 10 shards** (`ci.yml`, job `e2e`): `shard: [1..10]`, `--shard=${{ matrix.shard }}/10`, name
   `Web end-to-end (N/10)`, artifacts `playwright-report-N` (unchanged pattern). Nothing limits how many run at once
   (no `max-parallel`).
2. **Mac desktop group: 1 → 3 shards** (`ci.yml`, job `desktop`):
   - `strategy: { fail-fast: false, matrix: { shard: [1, 2, 3] } }`, name `Mac app (N/3)`.
   - `packages/e2e/mac/playwright.config.ts`: `fullyParallel: true` and `workers: 1` stay, so cases on one machine
     still run one at a time. Without it, Playwright can't split one spec file across shards. The config comment
     changes to say "one at a time per machine; CI splits the cases across macOS runners".
   - `pnpm e2e:mac --shard=${{ matrix.shard }}/3` (`scripts/e2e-mac.mjs` already passes extra args to Playwright).
     Each shard builds its own two bundles.
   - Rust unit tests run on shard 1 only (`if: matrix.shard == 1`).
   - Artifacts `desktop-report-N`.
3. Nothing else changes: the test code, worker counts, retries (still 0), unit, lint and image jobs all stay as they are.

Expected: web shards ~4–5 min, Mac shards ~6–7 min (shard 1 about a minute longer for the Rust tests). The whole run
would take **about 7 min instead of ~11.5**. These are estimates from the numbers above. The real figures come from
the PR's own runs.

Other ways to save time, not in this change: cache Playwright browsers (~40s per web shard), and move the Rust unit
tests to their own macOS job (~1 min off Mac shard 1).

## Risks

- **Mac cases with hidden order dependence.** With `fullyParallel: true` a case can land on a different shard from the
  case before it. Each case already launches the app on a fresh data folder, and there are no `beforeAll`/`serial`
  blocks in `desktop.spec.ts`. Any shared `let` at file or describe level still needs checking before the switch.
  The verification below runs every case on its own shard to catch this.
- **Branch protection.** If master requires checks by name, `Web end-to-end (1/4)`… and `Mac app (macOS)` stop being
  reported and merges would block. Rohit updates the required checks in GitHub settings (a manual step) once the
  first run shows the new names.

## Test scenarios (verification)

This changes CI only: no new test cases, and no test is skipped, disabled or retried.

- **V1 same tests, nothing lost.** On Rohit's Mac: `pnpm --filter e2e exec playwright test --list --shard=N/10` for
  N = 1..10. The counts add up to the same total as `--list` with no shard (896 today), and no shard is empty.
- **V2 Mac split is clean.** On Rohit's Mac: `pnpm e2e:mac --list --shard=N/3` for N = 1..3. The counts add up to 35,
  with no case in two shards.
- **V3 Mac cases stand alone.** On Rohit's Mac: run `pnpm e2e:mac --shard=3/3` and `--shard=2/3` on their own (each
  starts mid-file). All cases pass, which shows none depends on an earlier case.
- **V4 the PR's own CI.** All 10 web and 3 Mac jobs start at the same time and pass. Per-job times go in the PR
  description next to the table above.
- **V5 five green runs in a row.** After merge, five master runs in a row all pass, with the total time noted for
  each (the same bar as the flake work in ci-flakes.md).
- **V6 reports.** Each job uploads its own report artifact. No name clashes (the upload-artifact v4 error).
