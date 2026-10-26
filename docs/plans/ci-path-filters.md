# CI: run only the jobs a PR's changes can affect

Status: approved by Rohit 26 Oct 2026; implemented. Canvas: not applicable (CI config only, no visible change); skipping
it approved by Rohit 26 Oct 2026. Replaces the sharding proposal (ci-shards.md), which Rohit declined on 25 Oct 2026.

## Why

A full `Tests: PR + master` run takes ~11.5 min, and the Mac job sets the pace (measured in ci-shards.md). Many PRs
here change only docs (plans, write-ups, the register) or infra files, and they still wait the full 11.5 min.
Auto-merge is now on, so the wait matters less, but those PRs still sit in the queue for nothing.

**One gap to close first: master has no branch protection.** Auto-merge is enabled on the repo, but no check is
required, so an approved PR with auto-merge on can merge **before CI has finished, or even when it fails**. This
proposal adds one required check, and that check is what makes auto-merge wait for CI.

## What runs when (PRs only)

Pushes to master and manual runs (`workflow_dispatch`) **always run everything**, as today. Filters apply only to
`pull_request`.

| Job                    | Runs on a PR when these change                                                                                                                                           |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Lint and typecheck     | always (it's ~1.3 min, and Prettier covers the docs too)                                                                                                                 |
| Unit tests             | `code` (below)                                                                                                                                                           |
| Web end-to-end (1–4/4) | `apps/web/**`, `apps/server/**`, `packages/{core,ui,client,db}/**`, `packages/e2e/**`, `scripts/e2e.mjs`, `shared`                                                       |
| API Docker image       | `apps/server/**`, `packages/{core,db}/**`, `shared`                                                                                                                      |
| Mac app (macOS)        | `apps/desktop/**`, `apps/web/**`, `apps/server/**`, `packages/{core,ui,client,db}/**`, `packages/e2e/mac/**`, `packages/e2e/scripts/**`, `scripts/e2e-mac.mjs`, `shared` |

- `shared` = `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `.npmrc`,
  `.github/workflows/ci.yml`. A change to any of these runs every job.
- `code` = anything that isn't `docs/**`, `**/*.md`, `infra/**` or one of the other four workflow files.
- A Mac-only test change also runs web e2e (`packages/e2e/**`). That costs no wait, since the Mac job is slower, and
  keeps the filter simple.
- The Mac job also runs for web, server and package changes, because the Mac app loads the web app and talks to the
  API. Skipping it there would be exactly the "break without noticing" risk.

What this saves, honestly:

- **Docs, plans, infra-only PRs**: ~11.5 min → ~1.5 min (lint only). Most of the gain is here.
- **Desktop-only PRs** (`apps/desktop/**`): web e2e, API image and unit tests are skipped, but the Mac job still
  runs, so ~11.5 min stays ~11.5 min. Fewer runners, same wait.
- **Web, server or package PRs**: everything runs. No change.

## The change

1. New first job **`changes`** in `ci.yml` using `dorny/paths-filter@v3`, with one output per filter (`unit`,
   `web`, `api`, `mac`). On `push` and `workflow_dispatch` it sets every output to `true`.
2. `unit`, `e2e`, `api-image` and `desktop` get `needs: changes` and `if: needs.changes.outputs.<x> == 'true'`.
   `static` (lint) keeps running every time.
3. New last job **`CI passed`** with `needs: [static, unit, e2e, api-image, desktop]`, `if: always()`. It fails if any
   needed job **failed or was cancelled**, and passes if each one succeeded or was skipped. This is the one required
   check: it doesn't change when the matrix or job names change, and a skipped job doesn't leave the PR waiting forever.
4. **Rohit, by hand** (repo Settings › Branches, or Rules › Rulesets), once the PR's first run has reported `CI passed`:
   protect `master`, require the status check `CI passed`, and require branches to be up to date only if you want that
   (it re-runs CI after each merge to master). I can't change repo settings from here.

No test is edited, skipped or retried. When jobs do run, they're the same as today.

## Risks

- **A filter that's too narrow** skips a job that should have run. Every path not listed in a filter still runs the
  unit and lint jobs. The broad `shared` list and the Mac job covering web, server and packages keep the risky cases
  running. Master pushes always run everything, so a miss shows up on master straight after merge.
- **Third-party action.** `dorny/paths-filter` is widely used, but it's a dependency. The alternative is a 15-line
  `git diff --name-only` step. I'd use the action unless you'd rather not.

## Test scenarios (verification)

CI config only, so the PR's own runs are the test. I'll push a throwaway commit for each scenario on the PR branch,
then drop them before merge:

- **V1 docs only** (edit a file under `docs/plans`): only `changes`, `Lint and typecheck` and `CI passed` run; the
  rest show as skipped; `CI passed` is green.
- **V2 desktop only** (comment in `apps/desktop/src-tauri/src`): Mac and unit run; web e2e and API image skipped.
- **V3 web only** (comment in `apps/web/src`): web e2e, Mac and unit run; API image skipped.
- **V4 lockfile or ci.yml change**: every job runs.
- **V5 failure propagates**: a deliberately failing commit in a job that runs makes `CI passed` red, so auto-merge
  waits. (I'll make a unit test fail in a throwaway commit, then revert it. Nothing reaches master.)
- **V6 master push** after merge: every job runs, and `CI passed` is green.
- **V7 auto-merge waits**: on the next real PR after protection is on, auto-merge only merges after `CI passed` is
  green.
