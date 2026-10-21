# CI runner on Dokploy

Two self-hosted GitHub Actions runners, built from the Playwright-ready image in `compose.yaml`, live in the Dokploy
project Tudu, environment `dev`, service `tudu-ci-runner`:

- `dokploy-1` (service `runner`) runs the test jobs of `ci.yml`, one at a time.
- `dokploy-2` (service `runner-deploy`) runs only `deploy-staging.yml`, so a deploy never queues behind tests. It is
  kept off the test jobs on purpose: the host's CPU is already saturated by one test job.

- Register: mint a token with `gh api -X POST repos/eGainDev/tudu/actions/runners/registration-token --jq .token`
  and set it as `RUNNER_TOKEN` (dokploy-1) or `RUNNER_DEPLOY_TOKEN` (dokploy-2) in the service's environment before
  that runner's first deploy. Each registration is kept on its own config volume, so later deploys and restarts do
  not need a new token.
- Labels: dokploy-1 has `self-hosted`, `dokploy`, `arm64` (`runs-on: [self-hosted, dokploy]`); dokploy-2 has
  `self-hosted`, `dokploy-deploy`, `arm64` (`runs-on: [self-hosted, dokploy-deploy]`).
- Databases and storage for tests come from the `TUDU_CI_*` variables, which point at the dev Postgres and the dev
  storage over Dokploy's internal network. Each run creates its own throwaway database.
- The host is a 2 vCPU, 8 GB ARM machine shared with staging and production, so test jobs run at two workers.
