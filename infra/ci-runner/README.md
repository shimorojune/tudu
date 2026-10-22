# CI runner on Dokploy

One self-hosted GitHub Actions runner, built from the Playwright-ready image in `compose.yaml`, lives in the Dokploy
project Tudu, environment `dev`, service `tudu-ci-runner`:

- `dokploy-2` (service `runner-deploy`) runs only `deploy-staging.yml`, so staging images are built on the host.
- The test jobs of `ci.yml` run on GitHub-hosted runners with their own Postgres and RustFS service containers, so
  test load stays off the host.

- Register: mint a token with `gh api -X POST repos/shimorojune/tudu/actions/runners/registration-token --jq .token`
  and set it as `RUNNER_DEPLOY_TOKEN` in the service's environment before the runner's first deploy. The registration
  is kept on its config volume, so later deploys and restarts do not need a new token.
- Labels: `self-hosted`, `dokploy-deploy`, `arm64` (`runs-on: [self-hosted, dokploy-deploy]`).
- The host is a 2 vCPU, 8 GB ARM machine shared with staging and production.
