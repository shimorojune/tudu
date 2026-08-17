# Daily TODO

A native desktop task manager with Jira integration, hourly auto-sync, and 30-minute check-in reminders.

No credentials are bundled with the app. Each user configures their own Jira connection on first launch.

## Features

- Personal daily tasks (stored locally)
- Jira issues assigned to you (open, created in last 2 months)
- First-run setup wizard + Settings screen
- Credentials saved per-user on the local machine
- Menu bar app with native notifications
- Jira auto-sync every hour

## For end users

**Share:** run `npm run share` and send `dist/Daily-TODO-macOS-v1.0.0.zip` (contains the app + `INSTALL.md`).

See **[INSTALL.md](INSTALL.md)** for step-by-step install instructions to include with the download.

### Quick install

1. Unzip **`Daily TODO-1.0.0-arm64-mac.zip`**
2. Drag **Daily TODO.app** to Applications
3. Right-click → **Open** on first launch (macOS security)
4. Complete **Jira setup** (or Skip for now)

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

## For developers

### Run locally

```bash
git clone <repo-url>
cd daily-todo-app
npm install
npm start
```

Optional: copy `.env.example` to `.env` for local dev overrides. The desktop app prefers Settings → saved config in the user data folder.

### Build & package for sharing

```bash
npm install
npm run share
```

Output: **`dist/Daily-TODO-macOS-v1.0.0.zip`** containing:
- `Daily TODO-1.0.0-arm64-mac.zip` — the app (Apple Silicon Macs)
- `INSTALL.md` — instructions for recipients

Share that zip by email, Slack, or file share. No secrets included.

### Config storage

| Mode | Location |
|------|----------|
| Desktop app | `~/Library/Application Support/daily-todo-app/config.json` |
| Web / CLI dev | `~/.daily-todo-app/config.json` or `.env` fallback |

The config file is chmod `600` (owner read/write only).

## Usage

| Action | How |
|--------|-----|
| Configure Jira | **⚙ Settings** (or first-run wizard) |
| Add task | Type and press **Add** |
| Refresh Jira | **↻ Jira** |
| Check-in | Every 30 min, or tray → **Check in now** |
| Quit | Tray menu → **Quit** |

## Security notes

- Do **not** commit `.env` or `config.json`
- Do **not** put real credentials in `.env.example`
- Ship only the built `.dmg` / `.zip`, not developer config files
