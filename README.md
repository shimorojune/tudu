# Tudu

A macOS desktop app and web app built with **React**, **TypeScript**, and **shadcn/ui**, plus a **Hono** TypeScript server. The desktop shell uses **Tauri 2**.

Shared UI lives in `packages/ui` and is used by both `apps/desktop` and `apps/web`.

The desktop app opens to an empty themed window with tray and dock icons. Close the window to hide to tray. The app keeps running in the menu bar.

## Prerequisites

- Node.js 20+
- pnpm 9+
- Rust (stable) via [rustup](https://rustup.rs/) for desktop only
- Xcode Command Line Tools (macOS) for desktop only
- [Neon](https://neon.tech) Postgres database
- [Clerk](https://clerk.com) application for auth

## Environment

Copy `.env.example` to `.env` and fill in the values:

| Variable | Where | Description |
|----------|-------|-------------|
| `PORT` | Server | API port (default `3456`) |
| `DATABASE_URL` | Server | Neon Postgres connection string |
| `CLERK_SECRET_KEY` | Server | Clerk secret key |
| `CLERK_WEBHOOK_SIGNING_SECRET` | Server | Clerk webhook signing secret (production) |
| `ALLOW_JIT_PROVISIONING` | Server | Dev only: sync users on first `/me` (never set in production) |
| `VITE_CLERK_PUBLISHABLE_KEY` | Web + Desktop | Clerk publishable key |
| `VITE_API_URL` | Web + Desktop | API base URL (default `http://localhost:3456`) |

### Clerk dashboard setup

Add these URLs to your Clerk application:

- `http://localhost:5173` (web dev)
- `http://localhost:1420` (desktop dev)
- Production URLs when deployed

### User sync

**Production:** users are written to the database by Clerk webhooks only. Set up a webhook endpoint pointing at your deployed server:

- URL: `https://your-api.example.com/webhooks/clerk`
- Events: `user.created`, `user.updated`, `user.deleted`
- Copy the signing secret to `CLERK_WEBHOOK_SIGNING_SECRET`

Do not set `ALLOW_JIT_PROVISIONING` in production.

**Local dev:** set `ALLOW_JIT_PROVISIONING=true` in `.env`. Sign up or log in locally; the first `/me` request syncs the user row. No webhook tunnel needed.

## Database

Push the schema to Neon:

```bash
pnpm db:push
```

Generate migrations:

```bash
pnpm db:generate
```

## Development

```bash
pnpm install
pnpm dev          # server + desktop
pnpm dev:all      # server + desktop + web
pnpm dev:desktop  # desktop only
pnpm dev:web      # web only (http://localhost:5173)
pnpm dev:server   # server only
```

## Build

```bash
pnpm install
pnpm build
pnpm tauri:build  # desktop .app bundle
```

Output: `apps/desktop/src-tauri/target/release/bundle/macos/Tudu.app`

Web build output: `apps/web/dist`

## Usage (desktop)

| Action | How |
|--------|-----|
| Show window | Tray icon click or tray menu, then Show Tudu |
| Hide window | Close window or tray icon click |
| Quit | Tray menu, then Quit |

## Releases

Releases are triggered manually from GitHub Actions using [semantic-release](https://semantic-release.gitbook.io/).

1. Go to **Actions** → **Release** → **Run workflow**
2. Pick the branch (usually `main`) and run

Use [Conventional Commits](https://www.conventionalcommits.org/) on that branch so semantic-release can pick the right version. Commits are checked locally via Husky and on pull requests via GitHub Actions.

| Commit prefix | Version bump |
|---------------|--------------|
| `fix:` | Patch |
| `feat:` | Minor |
| `feat!:` or `BREAKING CHANGE:` footer | Major |

When a release is created, GitHub Actions builds a macOS `.app` and `.dmg` and uploads them to the GitHub Release.

Versions start at `0.0.1` and stay in the `0.x` line until a breaking change. The repo is tagged at `v0.0.1` as the baseline. Each manual release run bumps from the last tag (`fix:` → patch, `feat:` → minor).

## Stack

- **State:** Redux Toolkit + RTK Query (`packages/store`)
- **Database:** Drizzle ORM + Neon Postgres (`packages/db`)
- **Auth:** Clerk (`@clerk/clerk-react` + `@hono/clerk-auth`)
- **CI/CD:** GitHub Actions + semantic-release
