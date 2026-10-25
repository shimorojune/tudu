# GitHub Actions: names that say what each workflow does

Status: approved by Rohit 25 Oct 2026; implemented. Canvas: not applicable (CI names only, nothing in the app
changes); skipping it approved by Rohit 25 Oct 2026.

## The problem

The Actions sidebar lists `CI`, `Deploy staging`, `Flake check`, `Release`, `Tudu Staging`. Three of them run on
every push to master, and nothing in the names says which environment or which half of the product each one touches.
`Tudu Staging` next to `Deploy staging` reads like a duplicate.

## What each workflow does today

| File                  | Name today     | Runs on                                             | What it does                                                                                                                   |
| --------------------- | -------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `ci.yml`              | CI             | every PR, every push to master, by hand             | Lint and typecheck, unit tests, web end-to-end (4 shards), the API Docker image builds and answers, the Mac app suite on macOS |
| `deploy-staging.yml`  | Deploy staging | every push to master, by hand                       | Builds the web and API images on the Dokploy host, deploys `infra/staging`, waits until ready, smoke-tests staging             |
| `desktop-staging.yml` | Tudu Staging   | every push to master, by hand                       | Builds and signs the **Tudu Staging Mac app** and replaces the rolling `staging` pre-release (the staging updater feed)        |
| `release.yml`         | Release        | by hand; rehearsal on PRs touching the release path | semantic-release version and notes, the production Mac app, production images, deploy, smoke test, publish                     |
| `flake-check.yml`     | Flake check    | by hand only                                        | Repeats one test N times on the CI runner type to prove a flake fix                                                            |

So `Tudu Staging` is not a leftover: it is the staging **Mac app**, while `Deploy staging` is the staging **web and
API**. Both are needed. They stay separate (different runners: macOS on GitHub vs the self-hosted Dokploy runner;
merging them would make a web deploy wait on a ~15 min Mac build or vice versa).

## The new names

One pattern, `<Where>: <what>`. The sidebar sorts alphabetically, so the prefix groups them.

| File (unchanged)      | Old name       | New name                    |
| --------------------- | -------------- | --------------------------- |
| `release.yml`         | Release        | `Production: release`       |
| `deploy-staging.yml`  | Deploy staging | `Staging: deploy web + API` |
| `desktop-staging.yml` | Tudu Staging   | `Staging: build Mac app`    |
| `ci.yml`              | CI             | `Tests: PR + master`        |
| `flake-check.yml`     | Flake check    | `Tests: flake check`        |

Sidebar order after the change: Production: release · Staging: build Mac app · Staging: deploy web + API ·
Tests: flake check · Tests: PR + master.

### Job names (only where unclear)

| Workflow    | Old job name                          | New job name                  | Why                                                                  |
| ----------- | ------------------------------------- | ----------------------------- | -------------------------------------------------------------------- |
| Tests       | `End-to-end (n/4)`                    | `Web end-to-end (n/4)`        | Says it is the web app, not the Mac app                              |
| Tests       | `Desktop (macOS)`                     | `Mac app (macOS)`             | "desktop" is also the Playwright project name for the 1440px browser |
| Tests       | `API image`                           | `API Docker image`            | Clearer                                                              |
| Staging web | `Build images on the host and deploy` | `Build and deploy`            | Shorter; the workflow name already says where                        |
| Staging web | `Smoke test staging`                  | `Smoke test`                  | Same                                                                 |
| Staging Mac | `Build Tudu Staging`                  | `Build, sign and publish`     | Says it also replaces the `staging` pre-release                      |
| Production  | `Tudu for macOS`                      | `Mac app`                     | Same words as everywhere else                                        |
| Production  | `Production images and deploy`        | `Web + API: build and deploy` | Same words as staging                                                |

Unchanged: `Lint and typecheck`, `Unit tests`, `Version and notes`, `Publish the release`, the flake check jobs.

### Not changing

- **File names.** Renaming a workflow file makes GitHub treat it as a new workflow: the old entry and its run history
  stay in the sidebar under the old name. Keeping the files keeps the history and every path reference.
- **The `staging` pre-release title** `Tudu Staging <version>`. The server's update feed parses the version out of it
  (`versionIn` in `packages/core/src/versions.ts`); it is not the workflow name.
- Concurrency groups, artifact names (`vitest-report`, `playwright-report-n`, `desktop-report`, `flake-check-*`),
  secrets, runner labels.

## Things a rename can break, and what was found

- **Required status checks / branch protection**: `master` is not protected (GitHub API, 25 Oct). Rohit: if a
  repository ruleset requires checks, its check names must be updated to the new job names at merge time.
- **Badges**: none in the repo (README has no Actions badge).
- **`workflow_run` triggers**: none; no workflow depends on another by name.
- **Scripts reading runs by name**: none (`scripts/test-status.mjs` reads local reports, not the Actions API).
- **Docs that tell you where to click** (updated in this change):
  - `docs/release.md` step 1: "Actions › Release › Run workflow" → "Actions › Production: release › Run workflow".
  - `flake-check.yml` header comment: "Actions › Flake check" → "Actions › Tests: flake check".
  - `desktop-staging.yml` header comment: name the workflow as the staging Mac app.
  - `docs/release.md` "the Release workflow" (lines 3, 34) and `infra/production/compose.yaml` line 2 → "the
    Production: release workflow".
- **Left as is**: past plans in `docs/plans/` (`ci-flakes.md`, `menubar-sheet-outside-click.md`,
  `release-ready-wait.md`, `version-link.md`) mention old job names as a record of what happened then.
- Path comments (`vite.config.ts`, `playwright.config.ts`, `infra/staging/compose.yaml`) reference file names, which
  do not change.

## Test scenarios

No app code changes, so no unit or end-to-end tests are added or updated. Checks:

1. The PR's own run shows `Tests: PR + master` with jobs `Lint and typecheck`, `Unit tests`, `Web end-to-end (1/4)`
   to `(4/4)`, `API Docker image`, `Mac app (macOS)`, all green.
2. The PR touches `release.yml`, so the release rehearsal runs as `Production: release` with jobs `Version and notes`,
   `Mac app`, `Web + API: build and deploy`; green, publish skipped.
3. After merge, master shows `Staging: deploy web + API` (jobs `Build and deploy`, `Smoke test`) and
   `Staging: build Mac app` (job `Build, sign and publish`) green, and the `staging` pre-release is still titled
   `Tudu Staging 0.x.y-staging.n` (Tudu Staging's updater still finds it).
4. `Tests: flake check` appears in the Run workflow menu with the same inputs.
5. The sidebar lists exactly five workflows under the new names, and each keeps its run history (same file, same
   workflow id; GitHub shows the new name once the renamed file is on master).
