# Tudu Playwright E2E

End-to-end tests run against a **dedicated Neon Postgres** database. The app never uses your dev `DATABASE_URL` during E2E.

## One-time setup

1. Create a Neon project or branch whose **database name contains `e2e`** (for example `tudu_e2e`).
2. Copy the pooled connection string into repo root `.env`:

```bash
E2E_DATABASE_URL=postgresql://...@.../tudu_e2e?sslmode=require
E2E_BETTER_AUTH_SECRET=<32+ random bytes>
```

3. Install browsers once: `pnpm exec playwright install chromium`

## Commands

| Command | Purpose |
|---------|---------|
| `pnpm test:e2e` | Reset DB, migrate, seed, run Playwright |
| `pnpm test:e2e:ui` | Playwright UI mode |

E2E uses server port **3457** and web port **5174** (see `constants.ts`).

## CI secrets

Add to GitHub Actions:

- `E2E_DATABASE_URL` (same Neon DB; serialized job concurrency)
- `E2E_BETTER_AUTH_SECRET`

CI also sets `NOTIFICATION_JOBS_ENABLED=false` and a fixed `JIRA_TOKEN_ENCRYPTION_KEY` for tests.

If CI Playwright fails with `password authentication failed for user 'neondb_owner'`, the `E2E_DATABASE_URL` secret is stale. In Neon, reset the role password or copy a new **pooled** URL for `tudu_e2e`, then update **both** repo root `.env` and the GitHub secret (plain URL, no quotes). Confirm locally:

```bash
pnpm test:e2e:check-db
pnpm test:e2e
```

Then re-run the failed Playwright job on the PR or push to trigger CI.
