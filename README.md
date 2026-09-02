# Tudu

A macOS desktop app shell built with **Tauri 2**, **React**, **TypeScript**, and **shadcn/ui**.

The app opens to an empty themed window with tray and dock icons. Close the window to hide to tray — the app keeps running in the menu bar.

## Prerequisites

- Node.js 20+
- Rust (stable) via [rustup](https://rustup.rs/)
- Xcode Command Line Tools (macOS)

## Development

```bash
npm install
npm run tauri:dev
```

## Build

```bash
npm install
npm run tauri:build
```

Output: `src-tauri/target/release/bundle/macos/Tudu.app`

## Usage

| Action | How |
|--------|-----|
| Show window | Tray icon click or tray menu → Show Tudu |
| Hide window | Close window or tray icon click |
| Quit | Tray menu → Quit |
