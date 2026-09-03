# Tudu

A macOS desktop app shell built with **Tauri 2**, **React**, **TypeScript**, and **shadcn/ui**, plus a **Hono** TypeScript server.

The app opens to an empty themed window with tray and dock icons. Close the window to hide to tray — the app keeps running in the menu bar.

## Prerequisites

- Node.js 20+
- pnpm 9+
- Rust (stable) via [rustup](https://rustup.rs/)
- Xcode Command Line Tools (macOS)

## Development

```bash
pnpm install
pnpm dev          # server + desktop
pnpm dev:desktop  # desktop only
pnpm dev:server   # server only
```

## Build

```bash
pnpm install
pnpm build
pnpm tauri:build
```

Output: `apps/desktop/src-tauri/target/release/bundle/macos/Tudu.app`

## Usage

| Action | How |
|--------|-----|
| Show window | Tray icon click or tray menu → Show Tudu |
| Hide window | Close window or tray icon click |
| Quit | Tray menu → Quit |
