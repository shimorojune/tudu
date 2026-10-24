# Releasing Tudu to production

The Release workflow (`.github/workflows/release.yml`) does the release itself: the version and changelog from the
conventional commits (semantic-release, tag `tudu-X.Y.Z`), Tudu for macOS built against production and signed for
the updater, the production images built on the Dokploy host, the deploy of `infra/production/compose.yaml`, a smoke
test against production, then the GitHub release published (only then does the update feed offer it).

This page is what has to be true before the first real run, and how to run one.

## Once, before the first release

### 1. The last release's tag is on GitHub

semantic-release counts from the last `tudu-*` tag (`tudu-0.36.0` today, so the next release is 0.37.0). If no
`tudu-*` tag reaches the runner (a repository move that drops tags), it would start again at 1.0.0 with every commit
in the notes; the workflow stops instead. Check with `git ls-remote --tags origin 'tudu-*'`.

### 2. Dokploy: production's database and storage

In Dokploy (project Tudu, environment production), the compose expects two internal services:

- **Postgres** `tudu-production-postgres` (Postgres 17: the 18 image refuses Dokploy's data path, as on staging). Create › Database › PostgreSQL, App name
  `tudu-production-postgres`, a database `tudu`, a generated password. No external port. Deploy.
- **Object storage** `tudu-production-minio` (RustFS/MinIO, S3 API on 9000), as staging's `tudu-staging-minio`
  is set up: same image, App name `tudu-production-minio`, on `dokploy-network`, no public domain. Create the bucket
  `tudu` and an access key pair.

Migrations need nothing by hand: the API runs `pnpm migrate` before it starts, on every deploy.

### 3. Dokploy: the production compose

Project Tudu › environment production › Create Service › Compose.

1. Name `tudu-production-app`. Source: **Raw** (the Release workflow writes `infra/production/compose.yaml` into it
   on each release; staging's Git source is not needed here). Paste the file once so the services exist.
2. Turn **Autodeploy off** (the workflow deploys; a second build would race it).
3. **Environment** tab, the secret values (the rest is in the compose file):

   ```
   DATABASE_URL=postgresql://<user>:<password>@tudu-production-postgres:5432/tudu
   AUTH_SECRET=<openssl rand -base64 48, not staging's>
   RESEND_API_KEY=<the Resend key; mail.tudu.ezdev.net is already verified>
   FEEDBACK_TO=<where feedback reports go, or leave empty>
   S3_ACCESS_KEY_ID=<from step 2>
   S3_SECRET_ACCESS_KEY=<from step 2>
   UPDATES_GITHUB_TOKEN=<fine-grained, Contents: read on shimorojune/tudu; staging's works>
   ```

4. **Domains** tab:
   - `tudu.ezdev.net` → service `web`, port 80, HTTPS on, Let's Encrypt.
   - `api.tudu.ezdev.net` → service `api`, port 3456, HTTPS on, Let's Encrypt.

   If the old Tudu still holds either domain on another Dokploy service, remove the domain there first. The first
   release starts from an empty database (decided 20 Oct).

5. Copy the compose id from the URL (`.../compose/<id>`).

### 4. GitHub: the last secret

Settings › Secrets and variables › Actions › New repository secret: `DOKPLOY_PRODUCTION_COMPOSE_ID` = the id from
step 3.5. The other release secrets (`DOKPLOY_URL`, `DOKPLOY_API_KEY`, `TAURI_SIGNING_PRIVATE_KEY`,
`TAURI_SIGNING_PRIVATE_KEY_PASSWORD`) are already set.

### 5. DNS

`tudu.ezdev.net` and `api.tudu.ezdev.net` resolve to the Dokploy host (as `staging.` and `api.staging.` do).

## Each release

1. Actions › Release › Run workflow, branch `master`, **Rehearse only** ticked. Green means the version, the signed
   app and the images all build. The version is in the run's summary.
2. Run it again with **Rehearse only** unticked. It tags, deploys, smoke-tests production and publishes.
3. Download the dmg from the GitHub release. The app is signed ad hoc (no Apple Developer ID): the first open needs
   right-click › Open (macOS 15: System Settings › Privacy & Security › Open Anyway). Later versions install
   themselves through the updater.

If the deploy or the smoke test fails, the GitHub release stays a draft and the feed keeps offering the previous
version. Fix, then run again: semantic-release has already tagged, so delete the draft release and its tag first
(`git push --delete origin tudu-X.Y.Z`) and revert the `chore(release)` commit, or let the next run release the
version after.

A smoke test that fails right after a green "Wait until production is ready" is not explained by a slow rollout: the
wait already needs the web and the API to pass three rounds in a row. If the build is good and only the timing is in
doubt, re-run the failed jobs: the tag and the draft release are reused.
