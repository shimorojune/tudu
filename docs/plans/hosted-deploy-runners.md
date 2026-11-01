# Deploy from GitHub-hosted runners and drop the self-hosted runner

Status: approved by Rohit 1 Nov 2026 ("go ahead"), with the canvas skipped (CI and infra only). Implemented on branch
`claude/project-thread-c5zjfp`. Changes from the proposal while implementing:

- Phase 0 passed on 1 Nov 2026: `DOKPLOY_URL` is a public HTTPS DNS name and `compose.one` answered 200 from
  `ubuntu-latest`. It also showed staging's compose is sourced from GitHub with **auto-deploy already off**, so the
  overlap in §3 no longer exists.
- Immutable tags use the full commit sha (`sha-<40 hex>`), not 7 characters, so a tag can never collide.
- One PR for phases 1 to 4 (repo side), with a temporary seed job on the branch that creates the three GHCR packages
  first, so they can be made public before the merge switches staging.

## Why

`dokploy-2` is a self-hosted runner in a container on the Dokploy host (eGain Dokploy, Tudu › dev, compose
`tudu-ci-runner`). It runs exactly three jobs: `deploy-staging.yml` (build-and-deploy, smoke) and the `production` job
of `release.yml`. Everything else already runs on GitHub-hosted runners.

What it costs today:

- **It runs pull-request code as root on the production host.** `release.yml` runs on every PR that touches
  `apps/desktop/**`, `infra/production/**` and a few other paths, and its `production` job (the rehearsal image build)
  runs on `dokploy-2`, which has the host's Docker socket mounted. Anyone who can open a same-repo PR (or a fork PR
  that gets approved) can run any command on the box that hosts production's database. This is the strongest reason to
  move, more than convenience.
- Image builds compete with staging and production for a 2 vCPU / 8 GB ARM box.
- One more thing to keep alive: runner registration, its image (pinned to the Playwright tag), its volumes.
- Rollback is weak: `:production` is overwritten on every build, so there is no previous image to go back to; rolling
  back means rebuilding an old commit.

## Rohit's premise, checked

> Tests and builds spawn their own databases; nothing needs the Dokploy-hosted DBs.

**Correct.** Checked on master (64de8f5):

- `ci.yml` and `flake-check.yml`: every job is `ubuntu-latest` or `macos-latest`. Postgres and RustFS are service
  containers (`postgres:5432`, `rustfs:9000`), or Postgres on the Mac runner itself. The API image check uses
  `DATABASE_URL=postgres://nobody@127.0.0.1:1/none` on purpose.
- No workflow, script, test or compose file refers to `tudu-dev-postgres` or `tudu-dev-minio`. The only mentions are in
  `docs/rewrite/` (being removed). Staging and production use their own `tudu-staging-*` / `tudu-production-*`
  services over `dokploy-network`, at runtime, not at build time.
- The three runner jobs need the host only for one reason: the compose files use `image: tudu-api:staging` with
  `pull_policy: never`, i.e. images built straight into the host's Docker store. Nothing in them talks to a database.

So the runner is not needed for data. It is needed for **image delivery**, and that is what this proposal replaces.

The dev Postgres/MinIO look unused, but deleting them is irreversible and out of scope here; see "Not in this change".

## The change

### 1. Build on GitHub's native ARM runner, not QEMU

The host is arm64, so the images must be `linux/arm64`.

| Option                                                    | Speed (estimate)                                                          | Cost                       | Verdict      |
| --------------------------------------------------------- | ------------------------------------------------------------------------- | -------------------------- | ------------ |
| `runs-on: ubuntu-24.04-arm` (native arm64, 4 vCPU, 16 GB) | Similar to or faster than today's shared 2 vCPU host                      | Free (public repo)         | **Proposed** |
| `ubuntu-latest` + QEMU (`buildx --platform linux/arm64`)  | 3–10× slower; `pnpm install` and the ONNX model fetch run under emulation | Free, but 15–30 min builds | Rejected     |
| Multi-arch (amd64 + arm64)                                | Slowest                                                                   | Free                       | Not needed   |

Builds start cold on a hosted runner (today the host keeps a warm layer cache). Mitigation: `docker/build-push-action`
with `cache-from/cache-to: type=gha,mode=max`, one cache scope per image. Expect the first build ~5–8 min, later ones
mostly cached. I have not measured this yet; the rehearsal in phase 1 will give real numbers before anything switches.

Risk: if `ubuntu-24.04-arm` stops being free for public repos or the repo goes private, it becomes a paid larger
runner. Fallback is QEMU on `ubuntu-latest` (slow but works) with no other change.

### 2. Registry: GHCR, public packages

Images go to `ghcr.io/shimorojune/tudu-api`, `tudu-web`, `tudu-mcp`, pushed with the workflow's `GITHUB_TOKEN`
(`permissions: packages: write`).

Tags per build:

- `sha-<7>` immutable, for every build (staging and production).
- `staging` or `production`: the moving tag the compose files point at.
- `v<version>` on production builds (e.g. `v0.39.0`), to make "what is live" readable.

**Public vs private:** I recommend public.

- The repo is already public, so the images reveal nothing the source doesn't. No secret is baked into any image:
  the API/MCP read everything from Dokploy's env at runtime; the web image contains only the public API URL, track
  and version. The close-matches model is a public model.
- Private GHCR packages count against the account's Packages quota (free plan: 500 MB storage, 1 GB transfer a month)
  for every pull from outside Actions. Three images on every master push to staging would blow through 1 GB within a
  few deploys and start billing or failing.
- Private would also need a PAT with `read:packages` stored as a registry in Dokploy, one more secret to rotate.

One-time by hand: after the first push, set each of the three packages to Public (github.com › Packages › package ›
Settings), and link it to the repo (the `org.opencontainers.image.source` label does this automatically).

Retention: GHCR keeps everything. A small scheduled cleanup (`actions/delete-package-versions`, keep the newest 30
untagged/sha versions, never delete `production`, `staging` or `v*`) can come later; public storage is free, so it is
tidiness, not cost.

### 3. How Dokploy gets the image

Compose files change from local images to the registry:

```yaml
api:
  image: ghcr.io/shimorojune/tudu-api:staging # was tudu-api:staging
  pull_policy: always # was never
```

Same for web and mcp, staging and production. Deploy = the workflow pushes the images, then calls Dokploy's API
(`scripts/dokploy-deploy.mjs`, unchanged) to redeploy the compose; Docker pulls the new `:staging`/`:production`.

The host now pulls instead of building: the API image is the big one (Debian + ONNX Runtime + model, a few hundred
MB). Only changed layers are pulled, so routine deploys should be fast; I'll record real pull times in phase 1.

**Staging compose source.** Per project memory, the staging compose in Dokploy is sourced from GitHub
(`./infra/staging/compose.yaml`) with auto-deploy on, while `dokploy-deploy.mjs` also pushes the file through the API.
With registry images this works either way, because the tag in the file doesn't change per deploy. But:

- **Auto-deploy overlap.** Today every master push triggers two deploys: Dokploy's own (GitHub webhook) and the
  workflow's. Dokploy's fires immediately, before CI has built anything, so it restarts staging on the previous image
  for nothing. After this change it would pull `:staging` before the new one is pushed, same no-op restart. Not
  harmful, but it is a pointless restart on every push and makes deploy logs confusing. **Recommend turning
  auto-deploy off for staging** (Dokploy › staging compose › General › Autodeploy). By hand, since threads can't call
  the eGain Dokploy.
- If you also switch staging's source to Raw (like production, if production is raw), the repo stays the single
  source of truth through `dokploy-deploy.mjs`. Optional; not required for this change.

### 4. Triggering the deploy without the runner

`dokploy-deploy.mjs` already calls Dokploy's HTTP API with `DOKPLOY_URL` + `DOKPLOY_API_KEY`. From a hosted runner,
that call comes from the internet instead of from inside the host.

**This is the one thing that can sink the plan, and I can't see it from here:** `DOKPLOY_URL` is a secret. If it is an
internal address (e.g. `http://dokploy:3000` on `dokploy-network`), or the eGain Dokploy panel is behind a VPN or an IP
allow-list, hosted runners can't reach it. Phase 0 checks this before any other change.

If it isn't reachable, options in order of preference:

1. Expose the Dokploy API on a public HTTPS domain (it already has API-key auth). Rohit's/eGain's call.
2. Use Dokploy's per-compose **deploy webhook** URL if that one is public (it can only redeploy, no compose update),
   and keep compose files in sync through the GitHub source instead.
3. Keep a tiny runner just for the API call. That defeats most of the point; I'd rather stop and rethink.

Secrets: move `DOKPLOY_URL`, `DOKPLOY_API_KEY`, `DOKPLOY_STAGING_COMPOSE_ID` and `DOKPLOY_PRODUCTION_COMPOSE_ID` from
repository secrets into environments: a new `staging` environment (deployment branch: `master` only) and the existing
`release` environment (already master-only). Then a PR job can't read the Dokploy key at all. Today it can (the
`production` job has no environment and the key is a repo secret; the deploy step is only skipped by an `if`).

### 5. Workflows after the change

`deploy-staging.yml`:

- `build` on `ubuntu-24.04-arm`: version step as today, `docker/login-action` to GHCR, three `build-push-action`
  steps (`linux/arm64`, gha cache, tags `staging` + `sha-<7>`, same build args as today).
- `deploy` on `ubuntu-latest`, `environment: staging`: `dokploy-deploy.mjs`, then `wait-ready.mjs`.
- `smoke` on `ubuntu-latest` in `mcr.microsoft.com/playwright:v1.64.1-noble` (same image as the web E2E jobs, so
  C01-U16 already guards its tag): `pnpm install`, `pnpm e2e smoke` against staging.

`release.yml` `production` job split in two:

- `images` on `ubuntu-24.04-arm`: builds all three. On a rehearsal (PR or `rehearsal: true`): **build only, no push,
  no login, no secrets**. On a real release: push `production`, `sha-<7>`, `v<version>`.
- `deploy` (`environment: release`, `ubuntu-latest`, skipped on rehearsal): `dokploy-deploy.mjs`, `wait-ready.mjs`,
  smoke test in the Playwright container. `publish` keeps needing it, so the release stays a draft if deploy or smoke
  fails, exactly as now.

Ordering within a real release is unchanged: tag → Mac app + images in parallel → deploy → smoke → publish.

### 6. Rollback

New, and better than today. Every build has an immutable `sha-<7>` tag, so rolling back is a retag plus redeploy, no
rebuild:

- A `rollback.yml` workflow (`workflow_dispatch`, inputs: `target` = staging|production, `tag` = e.g. `sha-3f9c2ab`
  or `v0.38.0`), environment `release`/`staging`:
  `docker buildx imagetools create -t ghcr.io/…/tudu-api:production ghcr.io/…/tudu-api:<tag>` for each image, then
  `dokploy-deploy.mjs`, `wait-ready.mjs`, smoke. Takes ~2 min.
- Manual fallback (if Actions is down): in Dokploy, edit the compose's three `image:` lines to `:sha-<7>`, Deploy.
- Database migrations are not rolled back by this, same as today. The "migration drops something" backup rule in
  `docs/release.md` stays.

### 7. `docs/release.md` updates

- Overview: "images built on the Dokploy host" → "built on GitHub's arm64 runner and pushed to GHCR".
- Setup: the `staging` environment and moving the Dokploy secrets into environments; making the three GHCR packages
  public; turning staging auto-deploy off.
- New "Rolling back" section (the workflow above and the manual fallback).
- Failure section: "image pull failed in Dokploy" (package not public, or GHCR down: re-run the deploy job).

### 8. What to remove afterwards (only after phase 3 is green)

In the repo:

- `infra/ci-runner/` (compose + README).
- Comments that say images are built on the host: `apps/server/Dockerfile` ("Built for the host's own architecture"),
  `ci.yml` api-image comment ("staging builds it on the Dokploy host"), headers of `infra/staging/compose.yaml` and
  `infra/production/compose.yaml`, `release.yml` header comment.
- `docs/plans/actions-names.md` mentions `dokploy-deploy`; it is a historical plan, left as is.

By hand (Rohit; threads can't call the eGain Dokploy):

- Dokploy › Tudu › dev › `tudu-ci-runner`: stop, then delete, including its volumes (`runner-deploy-config`,
  `-work`, `-pnpm-store`). Its `RUNNER_DEPLOY_TOKEN` env goes with it.
- GitHub › Settings › Actions › Runners: remove `dokploy-2` if it doesn't drop off on its own.
- On the host: `docker image rm tudu-api:staging tudu-web:staging …` and the old `:production`/`:rehearsal`/`<sha>`
  local images, or let Dokploy's cleanup prune them. Frees several GB on an 8 GB-RAM box with limited disk.
- The fork-PR "require approval" setting can stay; it matters much less once no job runs on your hardware.

Secrets: `DOKPLOY_URL` and `DOKPLOY_API_KEY` stay (moved into environments). No secret is removed from GitHub.

## Rollout, in phases

- **Phase 0, reachability (no behaviour change).** A throwaway `workflow_dispatch` job on `ubuntu-latest` that calls
  `GET /api/compose.one?composeId=<staging>` and prints only the status code and `composeStatus`. If it fails,
  stop here and come back with the options in §4.
- **Phase 1, build alongside.** PR adds the GHCR build to `deploy-staging.yml` as an extra job (push `sha-<7>` only,
  not `:staging`) while the self-hosted job keeps deploying. Gives real build/cache timings, and the packages exist
  so Rohit can make them public.
- **Phase 2, switch staging.** Compose → GHCR, deploy from hosted runners, auto-deploy off. Watch a few master pushes.
- **Phase 3, switch production.** `release.yml` changes; one rehearsal on the PR, then the next real release.
- **Phase 4, remove.** §8.

Phases 1–3 can be one PR if you prefer fewer PRs, but then phase 0 must still pass first, and the switch has no
side-by-side period. I recommend 0 → one PR for 1+2 → one PR for 3+4.

## Test scenarios

Unit (existing `scripts` vitest project, alongside `scripts/playwright-image.test.mjs`; new file
`scripts/deploy-runners.test.mjs`, added to `docs/tests/chunk-01.md`):

| ID      | What it checks         | Scenario                                                                                                                                                                                  |
| ------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C01-U20 | No self-hosted jobs    | No job in any `.github/workflows/*.yml` has `self-hosted` in `runs-on`                                                                                                                    |
| C01-U21 | Registry images        | Every service in `infra/staging/compose.yaml` and `infra/production/compose.yaml` uses `ghcr.io/shimorojune/tudu-*` with `pull_policy: always`, tag `staging` / `production` respectively |
| C01-U22 | Image builds are arm64 | Every image build step in `deploy-staging.yml` and `release.yml` targets `linux/arm64` and runs on an `-arm` runner                                                                       |
| C01-U23 | Secrets behind an env  | Every job that references `DOKPLOY_` secrets declares `environment: staging` or `environment: release`                                                                                    |
| C01-U24 | Rehearsal never pushes | In `release.yml`, image steps push only when not a rehearsal, and the GHCR login is skipped on rehearsal                                                                                  |

Existing C01-U16 already covers the Playwright image used by the new smoke jobs.

Pipeline checks (run once each, results recorded in the PR):

| ID     | Scenario                                                                        | Pass                                                                                      |
| ------ | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| DEP-01 | Phase 0 job reaches Dokploy from `ubuntu-latest`                                | HTTP 200 and a `composeStatus`                                                            |
| DEP-02 | `deploy-staging.yml` on master: build on arm runner, push, deploy, ready, smoke | All green; `docker inspect` on host (or Dokploy logs) shows the image digest = pushed one |
| DEP-03 | Second master push with a one-line change                                       | Builds mostly from the GHA cache; build and total time recorded                           |
| DEP-04 | Settings › version line on staging shows the new `-staging+<sha>`               | Matches the commit                                                                        |
| DEP-05 | Release rehearsal on the PR                                                     | Images build on arm, nothing pushed, no Dokploy secret available to the job               |
| DEP-06 | Real release                                                                    | Deploy, ready, smoke green; release published; feed offers the version                    |
| DEP-07 | Rollback drill on staging: `rollback.yml target=staging tag=<previous sha>`     | Staging shows the previous version line, smoke green; then roll forward                   |
| DEP-08 | Bad `DOKPLOY_API_KEY` in the `staging` env (temporarily)                        | Deploy job fails with the 401 from `dokploy-deploy.mjs`, nothing deployed                 |
| DEP-09 | After phase 4: a master push and a release with `tudu-ci-runner` deleted        | Same as DEP-02/DEP-06; no job is queued waiting for a self-hosted runner                  |
| DEP-10 | Staging auto-deploy off                                                         | A master push shows exactly one Dokploy deployment, from the workflow                     |

Per the project rule, the unit tests run on Rohit's Mac (`pnpm test -- --project scripts`), not in the cloud.

## Risks and tradeoffs, bluntly

- **Dokploy API reachability is unknown** and decides whether this works as designed (phase 0).
- **Slower first builds.** Hosted runners start cold; GHA cache helps but is capped at 10 GB per repo and evicts after
  7 days unused. A deploy after a quiet week rebuilds from scratch.
- **New dependency on GHCR** for every deploy and every container restart that pulls. If GHCR is down, a deploy fails
  (running containers keep running). Today's design has no registry to fail, but has a single box that does
  everything.
- **Public images.** Anyone can pull staging and production builds. Given the public repo and no baked secrets, I
  think that's fine, but it's your call.
- **The host still pulls a few hundred MB on API changes.** Less CPU than building, more network.
- **eGain-owned Dokploy.** The API key is already in GitHub secrets, so moving the caller to GitHub's network doesn't
  widen who holds it, but it does mean eGain's Dokploy gets API calls from GitHub IPs. If eGain has rules about that,
  they apply here.

## Not in this change

- Deleting `tudu-dev-postgres` / `tudu-dev-minio`: unused as far as the repo shows, but deletion is irreversible.
  Separate decision.
- Promoting the exact staging API/MCP image to production instead of rebuilding (the web image can't be promoted: it
  bakes the API URL at build time). Worth doing later; it would make production run byte-for-byte what staging tested.
