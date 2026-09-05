# Tudu

A macOS desktop app and web app built with **React**, **TypeScript**, and **shadcn/ui**, plus a **Hono** TypeScript server. The desktop shell uses **Tauri 2**.

Shared UI lives in `packages/ui` and is used by both `apps/desktop` and `apps/web`.

## Documentation

Full setup, development, auth, and deployment docs live in the **[wiki](https://github.com/eGainDev/tudu/wiki)**.

## Quick start

```bash
pnpm install
pnpm dev          # server + desktop
pnpm dev:all      # server + desktop + web
```

## Install (macOS)

To install a released build, see [INSTALL.md](./INSTALL.md).
