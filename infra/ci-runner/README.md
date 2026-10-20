# CI runner on Dokploy

One self-hosted GitHub Actions runner, built from the Playwright-ready image in `compose.yaml`, runs every test
job for this repository. It lives in the Dokploy project Tudu, environment `dev`, service `tudu-ci-runner`.

- Register: mint a token with `gh api -X POST repos/eGainDev/tudu/actions/runners/registration-token --jq .token`
  and set it as `RUNNER_TOKEN` in the service's environment before the first deploy. The registration is kept on
  the `runner-config` volume, so later deploys and restarts do not need a new token.
- Labels: `self-hosted`, `dokploy`, `arm64`. Workflows pick it with `runs-on: [self-hosted, dokploy]`.
- Databases and storage for tests come from the `TUDU_CI_*` variables, which point at the dev Postgres and the dev
  storage over Dokploy's internal network. Each run creates its own throwaway database.
- The host is a 2 vCPU, 8 GB ARM machine shared with staging and production, so test jobs run at two workers.
