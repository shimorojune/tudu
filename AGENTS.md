# Agent instructions (Tudu)

## Testing is mandatory

Every code change must include a **test impact review**:

1. Identify changed files and routes.
2. Update colocated Vitest tests and/or `apps/e2e/tests/**` Playwright specs.
3. Run `pnpm verify` before finishing.
4. Run `pnpm test:e2e` when the change touches UI, API, or database behavior and
   `E2E_DATABASE_URL` is set locally.
5. Report a **Test impact** table in your final message.

CI runs `pnpm lint:copy`, `pnpm typecheck`, `pnpm test:coverage`, `pnpm test:db`, and
`pnpm test:e2e` on every PR and before staging/release deploys.

E2E uses a dedicated Neon database (`E2E_DATABASE_URL`, name must contain `e2e`).
See `apps/e2e/README.md`.

## Repo layout

- UI: `packages/ui`
- Store: `packages/store`
- Server: `apps/server`
- Shared types: `packages/shared`
- DB: `packages/db`

No em-dash in the repo. No `rounded-*` classes.
