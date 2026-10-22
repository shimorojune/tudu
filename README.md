# Tudu

A calm day planner: one sheet of paper per day, with the tasks as the hero. A web app, a macOS app and an API,
rebuilt from the "Tudu, Redesign" canvas and the Tudu Paper design system.

- [The plan](docs/rewrite/plan.md): stack, architecture, environments, testing, the chunks.
- [Tests](docs/tests/README.md): what is covered, and the generated [status](docs/tests/STATUS.md).
- Old code: the `legacy` branch.

## Quick start

```bash
pnpm install
pnpm dev            # the web app on http://localhost:5173 (the kit page is at /kit)
pnpm test           # unit and API tests
pnpm e2e kit        # one end-to-end group; `pnpm e2e` runs them all
pnpm verify         # lint, typecheck, tests
pnpm desktop:dev    # the macOS app against your local API and web app
pnpm e2e:mac        # the desktop group: the real macOS app (Tudu Test), built and driven
```

Node 22 and pnpm 9. Chromium for end-to-end: `pnpm --filter e2e exec playwright install chromium`. The macOS app needs
Rust (stable) and the Xcode command line tools.

## Layout

| Path            | Holds                                                                   |
| --------------- | ----------------------------------------------------------------------- |
| `apps/web`      | The web app and PWA shell                                               |
| `apps/desktop`  | The macOS app (Tauri): Tudu, Tudu Staging and Tudu Test                 |
| `packages/ui`   | Tudu Paper components in React, with the design system's own stylesheet |
| `packages/core` | Domain types, date and week logic                                       |
| `packages/e2e`  | Playwright tests, one folder per group; `mac/` drives the real app      |
| `infra/`        | The CI runner and deploy files                                          |
| `docs/`         | The plan, one file per chunk, the test tables                           |
