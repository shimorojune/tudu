# Tudu Playwright E2E

End-to-end tests run against **dedicated Neon Postgres** databases. The app never uses your dev `DATABASE_URL` during E2E.

## One-time setup

1. Create a Neon project or branch whose **database name contains `e2e`** (for example `tudu_e2e` or `tudu_e2e_0` .. `tudu_e2e_4` for CI shards).
2. Copy pooled connection strings into repo root `.env`:

```bash
E2E_DATABASE_URL=postgresql://...@.../tudu_e2e_0?sslmode=require
E2E_DATABASE_URL_0=.../tudu_e2e_0?...
E2E_DATABASE_URL_1=.../tudu_e2e_1?...
# ... through E2E_DATABASE_URL_4 for full CI parity
E2E_BETTER_AUTH_SECRET=<32+ random bytes>
```

To create five shard databases on the same Neon branch and sync `.env` keys from an existing `E2E_DATABASE_URL` template:

```bash
pnpm test:e2e:ensure-shards
pnpm test:e2e:sync-shard-env
pnpm test:e2e:check-db:shards
```

3. Install browsers once: `pnpm exec playwright install chromium`

## Commands

| Command | Purpose |
|---------|---------|
| `pnpm test:e2e` | Reset DB, migrate, seed, run Playwright (single DB) |
| `pnpm test:e2e:shard -- <n>` | Run shard `n` of 5 (uses `E2E_DATABASE_URL_<n-1>`) |
| `pnpm test:e2e:shards` | Run shards 1..5 sequentially (local CI parity) |
| `pnpm test:e2e:shard:flake` | All shards with `--repeat-each=2` |
| `pnpm test:e2e:check-db` | Verify `E2E_DATABASE_URL` |
| `pnpm test:e2e:check-db:shards` | Verify all five shard URLs |
| `pnpm test:e2e:ui` | Playwright UI mode |

E2E uses server port **3457** and web port **5174** (see `constants.ts`). Playwright uses **`workers: 1`**; CI runs five parallel jobs (matrix shards), each with its own `E2E_DATABASE_URL`.

## Before you push

When changing E2E or CI sharding:

1. `pnpm verify`
2. `pnpm test:db` with `E2E_DATABASE_URL` pointing at shard 0 (matches the unit job in CI)
3. `pnpm test:e2e:check-db:shards`
4. For each shard `n` in 1..5: `pnpm test:e2e:shard -- <n>` (or `pnpm test:e2e:shards` once)
5. Optional flake check: `pnpm test:e2e:shard:flake` or re-run the slowest shard with `--repeat-each=2`

Local shards run **sequentially** on one machine; CI runs five matrix jobs **in parallel** on separate runners.

## CI secrets

Add to GitHub Actions:

- `E2E_DATABASE_URL_0` .. `E2E_DATABASE_URL_4` (pooled URLs for `tudu_e2e_0` .. `tudu_e2e_4`)
- `E2E_BETTER_AUTH_SECRET`
- Optional legacy `E2E_DATABASE_URL` (fallback if a shard secret is missing; align with shard 0 for local `test:db`)

The **unit** job runs `pnpm test:db` against shard 0 (`E2E_DATABASE_URL_0` or legacy `E2E_DATABASE_URL`). The **E2E** matrix runs `pnpm test:e2e -- --shard=n/5` with one database per shard (no `test:db` on E2E jobs).

CI also sets `NOTIFICATION_JOBS_ENABLED=false` and a fixed `JIRA_TOKEN_ENCRYPTION_KEY` for tests.

If CI Playwright fails with `password authentication failed for user 'neondb_owner'`, a shard URL secret is stale. In Neon, reset the role password or copy new **pooled** URLs, then update `.env` and GitHub secrets (plain URL, no quotes). Confirm locally:

```bash
pnpm test:e2e:check-db:shards
pnpm test:e2e:shard -- 1
```

Then re-run the failed shard job on the PR or push to trigger CI.
