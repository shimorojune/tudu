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

## Installing Tudu on your Mac

Tudu for macOS is signed ad hoc, not with an Apple Developer ID, so macOS blocks it the first time you open it. You
allow it once; after that it opens normally and updates itself.

1. Download the `.dmg` from the [latest release](https://github.com/eGainDev/tudu/releases/latest). Tudu Staging is
   on the [`staging` pre-release](https://github.com/eGainDev/tudu/releases/tag/staging). The repository is internal,
   so sign in to GitHub first.
2. Open the `.dmg` and drag Tudu into Applications.
3. Open Tudu from Applications. macOS says it can't check the app for malicious software. Click **Done** (on macOS
   14, **Cancel**).
4. Allow it:
   - **macOS 15 and later:** open System Settings › Privacy & Security, scroll to Security, click **Open Anyway** next
     to "Tudu was blocked", enter your password, then click **Open Anyway** again.
   - **macOS 14:** in Applications, Control-click Tudu, choose **Open**, then click **Open** in the dialog.

Tudu and Tudu Staging need macOS 14 or later on Apple silicon.

If macOS says the app "is damaged and can't be opened", the download kept its quarantine mark. Clear it and open Tudu
again:

```bash
xattr -dr com.apple.quarantine /Applications/Tudu.app
```

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
