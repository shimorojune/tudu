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
| `pnpm test:e2e:check-db` | Verify `E2E_DATABASE_URL` |
| `pnpm test:e2e:ui` | Playwright UI mode |

E2E uses server port **3457** and web port **5174** (see `constants.ts`). Playwright uses **`workers: 1`**.

## CI

- **Pull requests** run static checks, unit tests (including `pnpm test:db`), and desktop Rust check. Playwright does **not** run on every PR.
- **Scheduled E2E** runs on GitHub Actions twice daily (9:00 and 18:00 IST) and via **workflow dispatch** on the `E2E scheduled` workflow. See [`.github/workflows/e2e-scheduled.yml`](../../.github/workflows/e2e-scheduled.yml).

Secrets: `E2E_DATABASE_URL`, `E2E_BETTER_AUTH_SECRET`. Scheduled jobs also set `NOTIFICATION_JOBS_ENABLED=false` and a fixed `JIRA_TOKEN_ENCRYPTION_KEY`.

When you change user-visible UI or API behavior, update `apps/e2e/tests/**` and run `pnpm test:e2e` locally when `E2E_DATABASE_URL` is configured.

Quick Add (desktop quick-add window) is covered by `packages/ui/src/components/chrome/QuickAddTaskPane.test.tsx`. Web Playwright runs against the Vite shell only, which does not mount that pane.

If Playwright fails with `password authentication failed`, refresh the pooled URL in Neon, update `.env` and the GitHub secret, then re-run:

```bash
pnpm test:e2e:check-db
pnpm test:e2e
```
