# Daily TODO

A lightweight macOS desktop task manager with JIRA integration, manual tasks with subtasks, and a cute on-demand avatar assistant (Mochi).

Built with **Tauri 2**, **React**, **TypeScript**, and **shadcn/ui**.

## Features

- Personal daily tasks with subtasks (saved to disk)
- JIRA issues assigned to you (all open issues)
- Background JIRA polling with change detection
- On-demand bottom-right Mochi avatar for JIRA updates and task reminders
- System tray app with native notifications
- Settings for JIRA credentials, poll interval, and reminder interval

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

Output: `src-tauri/target/release/bundle/macos/Daily TODO.app`

## JIRA setup

### Jira Cloud

| Field | Value |
|-------|-------|
| Jira URL | `https://your-org.atlassian.net` |
| Type | Jira Cloud |
| Email | Your Atlassian account email |
| API token | [Create at Atlassian](https://id.atlassian.com/manage-profile/security/api-tokens) |

### Jira Server / Data Center

| Field | Value |
|-------|-------|
| Jira URL | `https://your-jira-server.company.com` |
| Type | Jira Server / Data Center |
| Username | Your Jira username |
| Password / PAT | Jira password or Personal Access Token |
| Self-signed SSL | Enable if your server uses an internal certificate |

## Config storage

Desktop app data: `~/Library/Application Support/com.tudu.dailytodo/`

- `config.json` — JIRA credentials and preferences (chmod 600)
- `tasks.json` — manual tasks
- `jira-state.json` — JIRA sync state for change detection

Legacy Electron config at `~/Library/Application Support/daily-todo-app/config.json` is migrated automatically on first launch.

## Usage

| Action | How |
|--------|-----|
| Configure JIRA | Settings (gear icon) or first-run wizard |
| Add task | Type in My Tasks and press Add |
| Add subtask | Expand a task, type in subtask field |
| Refresh JIRA | Refresh button in JIRA panel |
| Check in | Tray menu → Check in now |
| Quit | Tray menu → Quit |

Close the main window to hide to tray (app keeps running).
