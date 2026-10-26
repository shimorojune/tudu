# CI: stop installing Playwright browsers and their apt packages on every web E2E job

Status: approved by Rohit 26 Oct 2026 (container + shared model folder; O1 left out); implementing. Canvas: not
applicable (CI and local tooling only), skipping it approved by Rohit 26 Oct 2026.

## The problem

Each of the 4 `Web end-to-end` shards (and the web `Flake check` job) runs
`playwright install --with-deps chromium webkit`. Two halves:

1. Browser downloads (~250 MB from Playwright's CDN). Usually quick.
2. `--with-deps` runs `apt-get update` + `apt-get install` of ~80 system packages from the Azure Ubuntu mirror. This is
   what hung: 45 minutes on PR #35, and it stalled twice more on 26 Oct 2026 (PRs #35, #40). PR #37 only caps the
   damage at 10 minutes; the job still fails and needs a re-run.

So "cache the browsers" alone does not fix the hang. The apt half is the problem.

## Options

| Option | Fixes the apt hang? | Cost / risk |
| --- | --- | --- |
| A. `actions/cache` on `~/.cache/ms-playwright` keyed on the Playwright version, then `playwright install-deps` | **No.** `install-deps` is the same apt step. | Saves ~20s of download only. |
| B. A plus caching `.deb` files (e.g. `awalsh128/cache-apt-pkgs-action`) | Mostly. Still runs `apt-get update` on a cache miss, and restoring debs over a runner image that changes weekly is fragile. | Third-party action, hard to debug when the runner image moves. |
| **C. Run the web E2E jobs inside `mcr.microsoft.com/playwright:v1.64.1-noble`** | **Yes.** Browsers and every system dependency are baked into the image; no apt, no browser download. | ~1 GB image pull per job (~30-45s, from Microsoft's registry, same Azure network as the runner). Service containers are reached by name instead of `127.0.0.1`. The image tag must track `@playwright/test`. |

**Recommendation: C.** It is the official way Playwright documents for CI, it removes the failing step outright rather
than making it rarer, and a failed image pull fails fast (it does not hang for 45 minutes). The image tag drift risk is
handled by a test (below). Net time per shard should be about the same as today on a good day (pull ≈ install), and
no more 10-minute stalls on a bad one.

## The change (option C)

1. `.github/workflows/ci.yml`, `e2e` job:
   - Add `container: { image: mcr.microsoft.com/playwright:v1.64.1-noble, options: --ipc=host }`
     (`--ipc=host` is Playwright's own advice: Chromium runs out of shared memory in Docker without it).
   - Service URLs switch to the service names: `TUDU_CI_DATABASE_URL: postgres://tudu:tudu@postgres:5432/postgres`,
     `TUDU_CI_S3_ENDPOINT: http://rustfs:9000`. The `ports:` mappings stay (harmless, and other jobs share the
     `*postgres` anchor). The API and the web preview still run inside the job container, so `localhost` in
     `playwright.config.ts` is unchanged.
   - Delete the `playwright install --with-deps` step.
   - "Create the storage bucket" uses the `aws` CLI, which the image does not have. Replace it with
     `apps/server/src/ensure-bucket.ts` (run like `fetch-model`), which retries the server's own `S3Storage.ready()`
     (head, else create) for up to 60s. Same behaviour as the current loop.
   - Keep `actions/setup-node` (Node 22) and the pnpm cache: both work inside a container job, and pinning Node 22
     keeps us independent of whichever Node the image ships.
2. `.github/workflows/flake-check.yml`, `web` job: the same container, the postgres URL by name, the install step
   removed.
3. Version guard: a unit test `scripts/playwright-image.test.mjs` (C01-U16..U19) (in the existing `scripts` vitest project) that reads
   `pnpm-lock.yaml` for the resolved `@playwright/test` version and asserts every
   `mcr.microsoft.com/playwright:vX.Y.Z-noble` tag in `.github/workflows/*.yml` matches it. A Playwright bump that
   forgets the image fails `Unit tests` with a message naming both versions, instead of failing E2E with
   "Executable doesn't exist". (Workflow `env` can't be used in `container.image`, so the tag has to be literal.)
4. The Mac job is untouched: it drives the real Tauri app on `macos-latest`, never ran `install --with-deps`, and a
   Linux container cannot run it.

## Optional extra (accept or drop)

**O1. `pnpm e2e` on the Mac skips the web build when nothing changed.** Today the `webServer` command always runs
`pnpm --filter web build` (~20-40s per run). New `scripts/build-web-if-stale.mjs` hashes the contents of
`apps/web` and the workspace packages it imports (excluding `dist`, `node_modules`) plus `VITE_API_URL`, compares it
with `apps/web/dist/.e2e-build-hash`, and builds only on a mismatch. CI always builds (`CI` set). `E2E_REBUILD=1`
forces a build.

## Worktrees share one embeddings model folder (in scope, asked for by Rohit 26 Oct 2026)

**O2.** A fresh git worktree has no `.local/models`, so the API logs
"Unable to get model file path" and close-match tests fail until `fetch-model` is run again in it. Change the default
model folder (server `bootstrap.ts`, `test/harness.ts`, the `fetch-model` default) to the **main checkout's**
`.local/models`: when the repo's `.git` is a file (`gitdir: <main>/.git/worktrees/<name>`), resolve the main checkout
from it; otherwise use the repo's own folder as today. One small helper, pure `fs`, no `git` subprocess. Production
is unaffected (the image sets `EMBEDDINGS_MODEL_DIR`); CI is unaffected (a plain clone).

## Test scenarios

New / updated automated tests:

- **U1** `scripts/playwright-image.test.ts`: passes on the repo as it is (lockfile 1.64.1, both workflows on
  `v1.64.1-noble`).
- **U2** same file: given a workflow string with `v1.63.0-noble` and a lockfile with `1.64.1`, the check reports a
  mismatch naming the file and both versions (the parser is a pure function, tested on fixture strings).
- **U3** same file: fails if no workflow references the image at all (so deleting the container line by accident is
  caught).
- **U4** (only with O1) `scripts/build-web-if-stale.test.ts`: same tree → no build; one changed source byte → build;
  changed `VITE_API_URL` → build; `CI=true` or `E2E_REBUILD=1` → build.
- **U5** model-dir helper test: plain checkout → `<repo>/.local/models`; worktree (`.git` file with a
  `gitdir:` line, in a temp dir) → `<main>/.local/models`; `EMBEDDINGS_MODEL_DIR` set → that wins.

CI verification (on the PR):

- **C1** All 4 web shards green inside the container; logs show no `apt-get` and no browser download.
- **C2** Setup time per shard (job start to the `pnpm e2e` step) compared with the last master run, reported in the
  PR. Expectation: about the same, ±30s.
- **C3** The storage bucket step creates `tudu-ci` against `rustfs` by name; attachment tests (rich text files) pass.
- **C4** One manual `Flake check` run, suite `web`, a short grep (e.g. `C11-E15`), repeat 5: green in the container.
- **C5** `CI passed` stays the single required check; nothing about job names changes, so the ruleset needs no edit.

Local verification on Rohit's Mac (per the project rule):

- **M1** `pnpm vitest run --project scripts` green.
- **M2** `pnpm e2e kit` still green (the local path never used the container; this checks the bucket script and,
  with O1, the build skip: the second run must not rebuild).
- **M3** in a fresh `git worktree add`, `pnpm e2e -g <a close-matches case>` passes without running
  `fetch-model` there.

## Rollback

Revert the PR: the install step comes back unchanged. No secrets, no ruleset or Dokploy changes.
