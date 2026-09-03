# Tudu

A macOS desktop app and web app built with **React**, **TypeScript**, and **shadcn/ui**, plus a **Hono** TypeScript server. The desktop shell uses **Tauri 2**.

Shared UI lives in `packages/ui` and is used by both `apps/desktop` and `apps/web`.

The desktop app opens to an empty themed window with tray and dock icons. Close the window to hide to tray — the app keeps running in the menu bar.

## Prerequisites

- Node.js 20+
- pnpm 9+
- Rust (stable) via [rustup](https://rustup.rs/) — desktop only
- Xcode Command Line Tools (macOS) — desktop only

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
| Show window | Tray icon click or tray menu → Show Tudu |
| Hide window | Close window or tray icon click |
| Quit | Tray menu → Quit |
