# Agent instructions (Tudu)

## Testing is mandatory

Every code change must include a **test impact review**:

1. Identify changed files and routes.
2. Update colocated Vitest tests and/or `apps/e2e/tests/**` Playwright specs.
3. Run `pnpm verify` before finishing.
4. Run `pnpm test:e2e` locally when the change touches UI, API, or database behavior and
   `E2E_DATABASE_URL` is set.
5. Report a **Test impact** table in your final message.

**PR CI** runs `pnpm lint:copy`, `pnpm typecheck`, `pnpm test:coverage`, and `pnpm test:db`
(static, unit, and desktop Rust check). Playwright E2E does **not** run on every PR.

**Scheduled E2E** runs twice daily (9:00 and 18:00 IST) via
[`.github/workflows/e2e-scheduled.yml`](.github/workflows/e2e-scheduled.yml), plus manual
workflow dispatch.

E2E uses a dedicated Neon database (`E2E_DATABASE_URL`, name must contain `e2e`).
See `apps/e2e/README.md`.

## Repo layout

- UI: `packages/ui`
- Store: `packages/store`
- Server: `apps/server`
- Shared types: `packages/shared`
- DB: `packages/db`

No em-dash in the repo. No `rounded-*` classes.
