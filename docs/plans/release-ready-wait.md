# Release and staging: wait for the whole app before the smoke test

Status: proposal, waiting for Rohit's approval. Canvas: not applicable (release tooling only, no visible change);
skipping it approved by Rohit 24 Oct 2026.

## The bug

Release run 40099947265 (0.38.0, 24 Oct 2026) failed in "Smoke test production":

- Dokploy reported the compose `done` at 13:54:12.
- "Wait for the API" polls only `https://api.tudu.ezdev.net/health`. Its first try got a 404 (Traefik had no route
  yet); the second, 5s later, passed.
- The smoke test started a second later. Desktop and tablet opened `/sign-in` within ~6s and never saw "Sign in to
  Tudu"; phone ran ~2s later on the same build and passed.

Nothing waits for the **web** container, and a single passing API probe during a rollover says little: the route can
come and go while Dokploy swaps containers. The build was fine (re-running the failed jobs is the recovery).

Staging has the same gap but hides it: its smoke test is a separate job, so job start-up and `pnpm install` give the
rollover ~30s of slack. It still hit this once (the transient smoke failure on 48a2e02).

## The change

1. New `scripts/wait-ready.mjs <webUrl> <apiUrl>` (Node 22, `fetch`, no dependencies):
   - Each round probes `<web>/health` (nginx returns `ok`), `<web>/sign-in` (200 and the HTML holds `id="root"`) and
     `<api>/health` (200 and JSON `{ ok: true }`).
   - Ready means **3 passing rounds in a row**, 2s apart. Any failure resets the count.
   - Gives up after 3 minutes with exit 1 and prints the last failure of each probe (status code or error), so the
     log says which half was down.
   - Interval, rounds and timeout overridable by env (`READY_INTERVAL_MS`, `READY_ROUNDS`, `READY_TIMEOUT_MS`) so
     the test can run fast.
2. `.github/workflows/release.yml`: "Wait for the API" becomes "Wait until production is ready" running
   `node scripts/wait-ready.mjs https://tudu.ezdev.net https://api.tudu.ezdev.net`.
3. `.github/workflows/deploy-staging.yml`: the same for `https://staging.tudu.ezdev.net` /
   `https://api.staging.tudu.ezdev.net`, so staging exercises exactly the path production uses.
4. `vitest.config.ts`: add a `scripts` project (node environment) so root scripts can have unit tests.
5. `docs/release.md`: one line in the troubleshooting part: a smoke failure right after deploy with the wait step
   green means the wait is wrong, not the build; re-run failed jobs.

Not changing: Playwright `retries: 0` stays (a retry would hide real regressions), and the smoke test itself.

## Tests

Unit (vitest, `scripts/wait-ready.test.mjs`, a local `node:http` server whose answers each case scripts):

| Id      | Scenario                                                                                                           |
| ------- | ------------------------------------------------------------------------------------------------------------------ |
| R01-U01 | All three probes pass from the start: exits 0 after exactly 3 rounds.                                              |
| R01-U02 | The web `/health` 404s for the first 2 rounds, then passes: exits 0, and only after 3 passes counted from round 3. |
| R01-U03 | Flapping: pass, pass, 404, pass, pass, pass: the 404 resets the count, exits 0 at round 6, not round 3.            |
| R01-U04 | `/sign-in` returns 200 without `id="root"` (an error page): counts as a failure.                                   |
| R01-U05 | The API answers 200 with `{ ok: false }`: counts as a failure.                                                     |
| R01-U06 | The API never comes up: exits 1 at the timeout, and the output names `api /health` and its last status.            |
| R01-U07 | Connection refused on the web: counted as a failure (no crash), and reported as such on timeout.                   |

Workflow checks:

- The release rehearsal (runs on this PR, since it touches `release.yml`) must still pass; the wait step is skipped in
  rehearsals as before.
- After merge, "Deploy staging" on master runs the new wait against staging and its smoke job passes.

Existing cases to re-run, unchanged: C01-S01 (the smoke test) on staging after merge.

## Out of scope

Moving staging's smoke test into the deploy job, and checking that the served web is the new version (the web image
has no version endpoint); both can follow if the wait alone isn't enough.
