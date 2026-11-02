# Move GitHub Actions secrets to Infisical (infisical.rraj.dev)

Status: **approved by Rohit 1 Nov 2026** ("start step by step"), canvas not applicable. Being rolled out on PR #69.
Changes while implementing: secrets live in folders (`/dokploy`, `/signing`, `/release`) so each job fetches only
its own; the forget step is an inline `run:` (no composite action); `INFISICAL_PROJECT` holds the project id
(`project-id:`); GitHub's OIDC subject for this repo is the ID-pinned form (§2). Builds on PR #68
(`docs/plans/hosted-deploy-runners.md`: deploys from GitHub-hosted runners, `staging` / `release` environments).

**Changed 1 Nov 2026 (Rohit's pick): Secret Sync instead of pulling at run time.** Custom Infisical roles need
Enterprise, so per-environment OIDC identities were not least privilege anyway. Infisical now pushes each folder into
a GitHub environment through a GitHub App connection (free plan: GitHub sync is a Regular-plan sync with no limit):
`staging` /dokploy and /signing into `staging`; `prod` /dokploy, /signing and /release into `release`, each with
Disable Secret Deletion ticked. Workflows read plain `secrets.X` in step env again. Gone: the OIDC identities, the
`INFISICAL_*` variables, `id-token: write`, the Infisical action and the forget steps; CI no longer stops when
Infisical is down. Kept: the new updater key (§5), verify-updater-sig, the throwaway rehearsal key and the `staging` /
`rehearsal` environments on the Mac jobs. The compose id is `DOKPLOY_COMPOSE_ID` in both environments. Sections 2, 6,
8 and the OIDC rows of §9 below describe the pull design and are superseded; §9 "After Secret Sync" holds the tests.

Design canvas: **not applicable.** This changes CI plumbing only; no screen, state or copy in the app or on the
canvas changes. Rohit to confirm skipping the canvas step.

## The ask

Today the workflows read seven values from GitHub:

| Secret                               | Where now             | Read by                                                                            |
| ------------------------------------ | --------------------- | ---------------------------------------------------------------------------------- |
| `DOKPLOY_URL`                        | repository            | `deploy-staging.yml › deploy`, `release.yml › production`, `rollback.yml › deploy` |
| `DOKPLOY_API_KEY`                    | repository            | same three                                                                         |
| `DOKPLOY_STAGING_COMPOSE_ID`         | repository            | `deploy-staging.yml › deploy`, `rollback.yml › deploy`                             |
| `DOKPLOY_PRODUCTION_COMPOSE_ID`      | repository            | `release.yml › production`, `rollback.yml › deploy`                                |
| `TAURI_SIGNING_PRIVATE_KEY`          | repository            | `desktop-staging.yml › build`, `release.yml › macos` (**also on PR rehearsals**)   |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | repository            | same two                                                                           |
| `RELEASE_DEPLOY_KEY`                 | `release` environment | `release.yml › version` (checkout over SSH, real runs only)                        |

Goal: the values live in Infisical; GitHub keeps no long-lived credential at all.

## Straight verdict first

What this buys:

- **One readable source of truth.** GitHub secrets are write-only. That is exactly how the 26 Oct signing-key mix-up
  happened (CI held key `7120FCBE917C11ED`, the app trusted `219C948D20DD1BF5`, and nobody could look). Infisical
  shows the value, keeps versions, and logs every read.
- **Rotation in one place** instead of hunting through repo and environment secret pages.
- **Per-environment scoping enforced by Infisical**, on top of GitHub's environment branch rules.

What it costs, and these are real:

- **A new hard dependency on every deploy, release and rollback.** If `infisical.rraj.dev` is down, staging deploys,
  releases and `rollback.yml` all fail at the first step. Rollback is the one you need when things are already broken.
  If Infisical runs on the same box as the Tudu Dokploy host, one outage takes out both the app and the way to fix it.
- **Infisical's security becomes the app's update security.** Whoever owns the Infisical host can read
  `TAURI_SIGNING_PRIVATE_KEY` and ship a signed update to every installed Tudu. Today that blast radius is GitHub's.
  Patch, back up and lock down the Infisical instance (admin SSO/2FA, no public signup) before moving the key.
- **A third-party action touches the signing key.** Mitigated by pinning it to a commit SHA (below).

My recommendation: do it, but keep an **offline copy** of the Tauri key + password and the deploy key in a password
manager regardless, and document a break-glass path (§8). For 7 secrets on a solo repo the win is mostly
"readable + auditable + one place", not a big security jump. If that is not worth a runtime dependency to you, the
cheaper alternative is to keep GitHub secrets and only use Infisical as the readable backup.

## 1. Phase 0: can GitHub-hosted runners reach it? (gate, do first)

I could not check this: both the cloud container and the sandbox on your Mac refuse outbound connections to
`infisical.rraj.dev`, so I have no evidence either way. Same approach as PR #68's phase 0, but run on GitHub:

1. A throwaway PR adds `.github/workflows/infisical-probe.yml` (`pull_request` trigger, `ubuntu-latest` and
   `macos-latest`) that runs `curl -fsS https://infisical.rraj.dev/api/status` and prints the version it reports.
2. Same probe, OIDC end to end: you create a temporary machine identity `gha-probe` (OIDC auth, subject
   `repo:shimorojune@44432182/tudu@1426778877:pull_request`, see §2) with read on a throwaway Infisical environment `probe` holding
   `PROBE=ok`. The probe job (`permissions: id-token: write`) logs in with it and asserts `PROBE` is `ok`, and that
   echoing it prints `***`.
3. Delete `gha-probe`, the `probe` environment and the probe workflow afterwards; the PR is closed, not merged.

The plan dies or changes here if:

- The host is behind Cloudflare Access, Tailscale, an IP allowlist or a VPN. Hosted runners have no fixed IPs.
  (Cloudflare Access service tokens work via the action's `extra-headers`, but that is a long-lived secret in GitHub
  again, which defeats the point.)
- The Infisical version predates OIDC machine-identity auth (added mid-2024). `/api/status` shows the version.
- The Infisical server cannot make outbound HTTPS calls to `token.actions.githubusercontent.com` (it fetches GitHub's
  signing keys to verify each token). Self-hosted boxes with locked-down egress fail here with an opaque 401.

## 2. Auth: OIDC machine identities (preferred)

Each job asks GitHub for a short-lived signed token (`id-token: write`), Infisical checks the token's claims and hands
back a short-lived access token. **No credential is stored in GitHub.** What GitHub keeps is configuration, not secrets:

| GitHub **variable** (not secret) | Scope                 | Value                        |
| -------------------------------- | --------------------- | ---------------------------- |
| `INFISICAL_URL`                  | repository            | `https://infisical.rraj.dev` |
| `INFISICAL_PROJECT`              | repository            | `tudu-ci` (project slug)     |
| `INFISICAL_IDENTITY_ID`          | `staging` environment | id of identity `gha-staging` |
| `INFISICAL_IDENTITY_ID`          | `release` environment | id of identity `gha-release` |

An identity id is useless without a GitHub-signed token whose claims match, so it does not need to be secret.

Two identities in Infisical, each OIDC auth with:

- OIDC discovery URL and issuer: `https://token.actions.githubusercontent.com`
- Audience: `https://github.com/shimorojune` (the default `aud` GitHub puts in the token; or set `oidc-audience` and
  match it)
- Bound subject: `repo:shimorojune@44432182/tudu@1426778877:environment:staging` for `gha-staging`,
  `repo:shimorojune@44432182/tudu@1426778877:environment:release` for `gha-release`
  GitHub issues this repo's tokens with the ID-pinned subject format (owner and repo carry their numeric IDs, seen in
  phase 0b on 1 Nov 2026), so a renamed or re-created repo can never match. The plain `repo:shimorojune/tudu:...`
  form is refused with "OIDC subject not allowed".
- Bound claims: `repository: shimorojune/tudu` (belt and braces)
- Access token TTL: 15 min, max TTL 30 min
- Project role: built-in **Viewer** for both (custom per-environment roles need Infisical Enterprise, found 1 Nov
  2026). So either identity could read both environments; the boundary that matters is the subject, which only
  master-only GitHub environments match. Strict separation would mean one Infisical project per environment.

### Fallback: Universal Auth (client id + secret)

Only if OIDC fails phase 0 and cannot be fixed. Store `INFISICAL_CLIENT_ID` / `INFISICAL_CLIENT_SECRET` as
**environment** secrets on `staging` and `release` (never repository), with a client secret TTL (e.g. 90 days) and
the same read-only role. Honest take: this keeps one long-lived secret per environment in GitHub, so the security gain
over today is small; you mainly get the readable source of truth. Hosted runners have no fixed IPs, so Infisical's
trusted-IP restriction cannot help.

## 3. Keeping PR and fork jobs away from production secrets

Three layers, each enough on its own for its case:

1. **GitHub environments limited to `master`.** `staging` and `release` must have "Deployment branches: master only"
   (PR #68 assumed this; please confirm both). A PR job cannot enter them, so it can never get a token whose subject
   ends in `environment:staging` / `environment:release`.
2. **Infisical subject binding.** A PR job's token says `repo:shimorojune@44432182/tudu@1426778877:pull_request`, which matches neither
   identity, so Infisical refuses it even if a workflow is edited to call it.
3. **Fork PRs get no OIDC token at all** (GitHub does not grant `id-token: write` to fork PR runs), and fork workflows
   already need your approval.

`id-token: write` is granted per job, only on jobs that load secrets, never at workflow level.

### The gap this closes: the signing key on PR rehearsals

Today `release.yml › macos` has no environment and runs on every PR touching `apps/desktop/**`, so **any same-repo PR
gets the real `TAURI_SIGNING_PRIVATE_KEY`** and runs its own code next to it. After this change:

- `release.yml › macos` declares `environment: release` on real runs and `rehearsal` on PRs (like `version` already
  does).
- A rehearsal signs with a **throwaway key generated in the job** (`tauri signer generate --ci`, empty password), so
  the "bundle is signed" check still proves the signing path works, but no real key is near PR code.
- `desktop-staging.yml › build` gains `environment: staging` (master only), so its key comes from `gha-staging`.

Trade-off: a rehearsal no longer proves the _real_ key works. That is covered every master push by the staging Mac
build, which signs with the same key, plus the new pubkey check (§6).

## 4. What moves, what stays

Infisical project `tudu-ci`, two environments:

| Infisical env | Secret                                      | Note                                |
| ------------- | ------------------------------------------- | ----------------------------------- |
| `staging`     | `DOKPLOY_URL`, `DOKPLOY_API_KEY`            |                                     |
| `staging`     | `DOKPLOY_COMPOSE_ID`                        | the staging id (renamed, see below) |
| `staging`     | `TAURI_SIGNING_PRIVATE_KEY`, `..._PASSWORD` | for the staging Mac build           |
| `prod`        | `DOKPLOY_URL`, `DOKPLOY_API_KEY`            |                                     |
| `prod`        | `DOKPLOY_COMPOSE_ID`                        | `pbD6OfL7S3AX6H3IWHcQm`             |
| `prod`        | `TAURI_SIGNING_PRIVATE_KEY`, `..._PASSWORD` | same key as staging                 |
| `prod`        | `RELEASE_DEPLOY_KEY`                        | multi-line OpenSSH private key      |

- **One name per env for the compose id** (`DOKPLOY_COMPOSE_ID`): the Infisical environment already says which one,
  and `rollback.yml` loses its `production && A || B` ternary.
- The Tauri key is stored twice (staging and prod). Rotating it means updating both; a mismatch would show up as the
  pubkey check failing (§6), not as broken updates in the field.
- **Stays in GitHub:** `GITHUB_TOKEN` (ephemeral, minted per run) and the four variables in §2. Nothing else.
- `DOKPLOY_URL` and the compose ids are not really secret, but moving them keeps all deploy config in one place.

### Where the values come from (GitHub will not show them)

- `DOKPLOY_API_KEY`: from where you saved it, or mint a new one in Dokploy (Settings › Profile › API) and revoke the
  old one after cutover. That is a free rotation.
- Compose ids: Dokploy UI (prod one above).
- `RELEASE_DEPLOY_KEY`: from where you generated it, or generate a new pair, add the public half as a deploy key with
  write access (and keep it as the master ruleset's bypass actor, docs/release.md), delete the old deploy key after
  cutover.
- **Tauri key: see §5.**

## 5. Tauri signing key: handle with care

- **Changed on 1 Nov 2026:** the old key's (`7120FCBE917C11ED`) password was lost, so GitHub's copy could not be moved.
  Rohit chose a new key over copying GitHub's secrets across with a temporary workflow: `~/.tauri/tudu-2026-11.key`,
  key id **`2886268A7936D55E`**, password in his password manager. PR #69 switches `plugins.updater.pubkey` to it, in
  the same merge that moves signing to Infisical, so one revert undoes both.
- Cost: apps built before the switch trust the old key, so each installed Tudu (staging now, production at the next
  release) is reinstalled by hand once from the dmg. Updates are automatic again after that.
- Infisical `staging` and `prod` › `/signing` hold the new key file's content exactly as is, and its password.
- **Never run `tauri signer generate --force` over an existing key file.** A new key always costs a reinstall
  everywhere. Rotating without one would need an app that trusts both keys first (its own plan).

## 6. Workflow changes (phase 2)

Action: `Infisical/secrets-action`, **pinned to the commit SHA** of the latest tag (v1.0.18 =
`d2e351f16c6ca20d17c85e6c992e04bdeb64e87d` today), never a moving tag. It masks each value (`core.setSecret`) and
exports it with `core.exportVariable`.

That export has a catch: an exported value stays in the environment of **every later step of the job**, while today
each secret is scoped to the one step that uses it. In `release.yml › production` and `rollback.yml › deploy`, the
deploy is followed by `pnpm install` and the smoke test, i.e. third-party install scripts would see
`DOKPLOY_API_KEY`. So each job does:

1. Infisical step, immediately before the consuming step, `secret-path` / env limited to what the job needs.
2. The consuming step, reading plain `env`.
3. A scrub step right after when more steps follow: writes `DOKPLOY_API_KEY=` etc. to `$GITHUB_ENV`
   (a local composite action `.github/actions/infisical-scrub`, so it is one line per job).

Per job:

| Job                           | environment                   | Infisical env      | Loads                                                                                                            |
| ----------------------------- | ----------------------------- | ------------------ | ---------------------------------------------------------------------------------------------------------------- |
| `deploy-staging.yml › deploy` | `staging`                     | `staging`          | `DOKPLOY_*`                                                                                                      |
| `desktop-staging.yml › build` | `staging` (new)               | `staging`          | `TAURI_*`                                                                                                        |
| `release.yml › version`       | `release` / `rehearsal`       | `prod`             | `RELEASE_DEPLOY_KEY`, real runs only, before checkout (`ssh-key: ${{ env.RELEASE_DEPLOY_KEY }}`), scrubbed after |
| `release.yml › macos`         | `release` / `rehearsal` (new) | `prod`             | `TAURI_*`, real runs; rehearsal uses a throwaway key                                                             |
| `release.yml › production`    | `release`                     | `prod`             | `DOKPLOY_*`, scrubbed after deploy                                                                               |
| `rollback.yml › deploy`       | `release` / `staging`         | `prod` / `staging` | `DOKPLOY_*`, scrubbed after deploy                                                                               |

New guard, in both Mac build jobs (not rehearsals): **"The update signature matches the app's pubkey"**,
`scripts/verify-updater-sig.mjs dist/Tudu.app.tar.gz dist/Tudu.app.tar.gz.sig apps/desktop/src-tauri/tauri.conf.json`.
It verifies the minisign signature against `plugins.updater.pubkey` with Node's own crypto (Ed25519 over the BLAKE2b
prehash), and fails naming both key ids on a mismatch. This is the check that would have caught 26 Oct before any
build shipped, and it catches a wrong value pasted into Infisical on the first master push.

`RELEASE_DEPLOY_KEY` is multi-line. GitHub's log masking is weakest on multi-line values; nothing prints it today, and
the scrub step removes it from the environment right after checkout.

`docs/release.md` is updated: §4 "GitHub: the Dokploy secrets" becomes "Infisical: CI secrets" (identities, envs,
variables), plus the break-glass section (§8).

## 7. Rollout order

Each step is undoable until step 6.

1. **Phase 0** (§1). Stop here if it fails and we decide between Universal Auth or not doing this.
2. **You, in Infisical:** project `tudu-ci`, envs `staging` / `prod`, the secrets (§4, §5), identities `gha-staging`
   / `gha-release` (§2). **You, in GitHub:** the four variables; confirm `staging` and `release` are master-only.
   Old GitHub secrets stay untouched.
3. **PR** with the workflow changes (§6), the scrub action, `verify-updater-sig.mjs`, rule updates in
   `scripts/deploy-runners.mjs`, docs. CI on the PR runs the release rehearsal with the throwaway key, which also
   proves PR jobs no longer touch Infisical.
4. **Merge.** That push runs `deploy-staging` and `desktop-staging` against Infisical. Then run `rollback.yml`
   targeting staging (to the current sha, so it is a no-op redeploy). Check the staging Mac app updates on your Mac.
5. **First real release** after the merge runs the prod path (`version` with the deploy key, `macos`, `production`).
6. **After one green real release:** delete the seven GitHub secrets (repository and `release` environment). If you
   minted a new Dokploy key or deploy key, revoke the old ones now.

### Rollback

- Steps 3 to 5: revert the workflow PR. The GitHub secrets are still there, so the old workflows work immediately.
- After step 6: the values are readable in Infisical; re-add them as environment secrets by hand and revert. That is
  why step 6 waits for a green real release.

## 8. Break-glass when Infisical is down

- **Production rollback without CI:** Dokploy UI › tudu-production-app › edit the image tags to the previous
  `sha-<sha>` (they are immutable in GHCR since PR #68) › Deploy. Documented in docs/release.md.
- **Releases** wait until Infisical is back. There is no reason to ship a release while it is down.
- **The signing key** is never only in Infisical: offline copy in your password manager (and `~/.tauri/tudu.key`).

## 9. Test scenarios

Unit tests run on Rohit's Mac (project rule), not in the cloud. Repo rules extend `scripts/deploy-runners.mjs` and its
test file; IDs continue chunk 01 (`docs/tests/chunk-01.md`).

### New

| ID      | What it checks                                                                                                                                                                             |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| C01-U25 | No workflow reads `secrets.<X>` except `GITHUB_TOKEN` (turned on in the step 6 PR; until then it allow-lists the seven names)                                                              |
| C01-U26 | Every `Infisical/secrets-action` step is pinned to a 40-hex SHA, uses `method: oidc`, takes `domain`/`project-slug` from `vars`; a tag pin or `universal` is named                         |
| C01-U27 | A job with an Infisical step declares an `environment` and job-level `permissions: id-token: write`; workflow-level `id-token: write` is refused                                           |
| C01-U28 | Infisical env matches the job's environment (`staging` → `staging`, `release` → `prod`); an Infisical step on a PR/rehearsal path (no `if:` excluding `pull_request` / rehearsal) is named |
| C01-U29 | In a job where steps follow the consuming step, the step after it is the scrub action; a job that leaves `DOKPLOY_API_KEY` exported into `pnpm install` is named                           |
| C01-U30 | `verify-updater-sig.mjs`: a signature from the configured key passes; one from another key fails naming both key ids; a tampered file fails; a malformed `.sig` fails clearly              |
| C01-U31 | Rehearsal signing: in `release.yml › macos` the throwaway-key step runs only when `REHEARSAL` is true and the Infisical step only when it is not                                           |

### Updated

| ID      | Change                                                                                                                                                                           |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C01-U20 | "The repo as it is" also passes C01-U25..U29 and U31                                                                                                                             |
| C01-U23 | "Dokploy secrets only in a job with an environment" now covers both `secrets.DOKPLOY_` and an Infisical step loading `DOKPLOY_*`; the `secrets.` arm is removed in the step 6 PR |

### CI / manual (checked once, recorded in the PR)

| ID     | Scenario                                                                                    | Expected                                                                    |
| ------ | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| INF-01 | Probe: `curl /api/status` from `ubuntu-latest` and `macos-latest`                           | 200, version supports OIDC                                                  |
| INF-02 | Probe: PR job logs in with `gha-probe`, reads `PROBE`, echoes it                            | `ok`, printed as `***`                                                      |
| INF-03 | Probe: PR job tries `gha-staging`'s id                                                      | refused by Infisical (subject mismatch), job fails before any secret use    |
| INF-04 | Workflow PR's release rehearsal                                                             | green, signed with throwaway key; Infisical audit log shows no read for it  |
| INF-05 | Merge → `deploy-staging` and `desktop-staging`                                              | green; pubkey check passes; secrets show as `***` / absent in logs          |
| INF-06 | Staging Mac app on Rohit's Mac                                                              | offers and installs the new staging build (proves the right key end to end) |
| INF-07 | `rollback.yml` target staging, current sha                                                  | green, smoke 3/3                                                            |
| INF-08 | `INFISICAL_URL` pointed at a wrong host on a test branch run (or Infisical briefly stopped) | fails at the Infisical step with a clear error; no deploy started           |
| INF-09 | First real release after merge                                                              | green; prod app offers the update; audit log shows `gha-release` reads only |
| INF-10 | After step 6: repo and environment secret lists                                             | empty; only the four variables remain; next master push still green         |

### After Secret Sync (replaces C01-U25..U29 and U31 above)

| ID      | What it checks                                                                                                     |
| ------- | ------------------------------------------------------------------------------------------------------------------ |
| C01-U25 | A workflow reads only the six synced secrets and `GITHUB_TOKEN`; the old `DOKPLOY_*_COMPOSE_ID` names are refused  |
| C01-U26 | A secret is read only by a job whose environment is `staging` or `release`                                         |
| C01-U27 | A secret is read only in a step's own `env` / `with`, never in workflow- or job-level `env`                        |
| C01-U28 | In a job that can run as a rehearsal, every secret expression is guarded by `pull_request` or `REHEARSAL`          |
| C01-U29 | Retired: nothing is exported to `GITHUB_ENV`, so nothing to forget                                                 |
| C01-U31 | Throwaway updater key only on rehearsals; the real key's expression is guarded by `env.REHEARSAL` (dispatch too)   |
| INF-S1  | After the syncs: GitHub › Environments lists the five secrets in `staging` and six in `release`                    |
| INF-S2  | Edit a value in Infisical: it appears in GitHub within a minute, and the other syncs' secrets are still there      |
| INF-S3  | Merge → `deploy-staging` and `desktop-staging` green; staging app installs once by hand, then updates on its own   |
| INF-S4  | Roll back staging to the current sha: green                                                                        |
| INF-S5  | First real release green; then the old repo-level secrets and `INFISICAL_*` variables are deleted, next push green |

## 10. Open questions for Rohit

1. Is `infisical.rraj.dev` on the same machine as the Tudu Dokploy host? (Decides how much the break-glass path
   matters.)
2. Is it behind Cloudflare Access, Tailscale or an IP allowlist? (Phase 0 answers it, but you may already know.)
3. Are `staging` and `release` both limited to `master` today?
4. Do you still have the Dokploy API key and the deploy private key outside GitHub, or rotate both during the move
   (my recommendation: rotate, it costs nothing extra here)?
5. OK to sign rehearsals with a throwaway key (§3)?

## Later: the app's runtime secrets (2 Nov 2026)

This proposal covered only the CI secrets. The app's runtime secrets (`DATABASE_URL`, `AUTH_SECRET`, `RESEND_API_KEY`,
the S3 keys and the GitHub tokens) also live in Infisical now, outside this plan: Dokploy's Environment tab for each
compose references them through Dokploy's vault provider (`${{vault.tudu-app-prod.<KEY>}}` in production). Dokploy
resolves them on each deploy, so a changed secret needs a Deploy of the compose. docs/release.md step 3 has the details.
