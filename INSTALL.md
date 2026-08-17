# Daily TODO — Install Guide

Share this file together with **`Daily TODO-1.0.0-arm64-mac.zip`**.

---

## Requirements

- **macOS** 11 or later on **Apple Silicon (M1/M2/M3)** Mac
- Internet access (for Jira sync)
- Your own Jira account credentials

No Node.js or developer tools needed. **No credentials are included** — each person configures their own Jira login on first launch.

---

## Install

### 1. Download
Save **`Daily TODO-1.0.0-arm64-mac.zip`** to your Mac.

### 2. Unzip
Double-click the zip file. You’ll get **`Daily TODO.app`**.

### 3. Move to Applications
Drag **Daily TODO.app** into your **Applications** folder.

### 4. First launch (macOS security)
The app is not Apple-notarized. On first open:

1. Open **Applications**
2. **Right-click** (or Control-click) **Daily TODO**
3. Choose **Open**
4. Click **Open** in the dialog

After the first time, you can open it normally from Applications or Spotlight.

### 5. Set up Jira (first run)
On first launch you’ll see a setup screen:

| If you use… | Fill in… |
|-------------|----------|
| **Jira Cloud** | URL: `https://your-org.atlassian.net` · Type: **Jira Cloud** · Email · [API token](https://id.atlassian.com/manage-profile/security/api-tokens) |
| **Jira Server / Data Center** | URL: `https://your-jira.company.com` · Type: **Jira Server** · Username · Password or PAT · Check **Allow self-signed SSL** if your IT team uses internal certificates |

Click **Test connection**, then **Save**.

Click **Skip for now** to use personal tasks only — configure Jira later via **⚙ Settings**.

---

## Daily use

| What you want | How |
|---------------|-----|
| Add a task | Type in the box → **Add** |
| View yesterday / older tasks | **Yesterday**, **2 days ago**, or the date picker |
| Move unfinished task forward | **→ Today**, **→ Tomorrow**, or pick a future date |
| See old open tasks | **Incomplete from past days** (shown on Today) |
| Refresh Jira | **↻ Jira** (also auto-syncs every hour) |
| Check-in reminder | Every 30 minutes, or menu bar → **Check in now** |
| Change Jira credentials | **⚙ Settings** |
| Hide app (keeps running) | Close the window — icon stays in the menu bar |
| Quit completely | Menu bar icon → **Quit** |

---

## Where data is stored

Everything stays **on your Mac**:

| Data | Location |
|------|----------|
| Jira credentials | `~/Library/Application Support/daily-todo-app/config.json` |
| Personal tasks | Stored locally by the app |

---

## Troubleshooting

**“App can’t be opened because Apple cannot check it for malicious software”**  
→ Right-click the app → **Open** (see step 4 above).

**Jira connection fails**  
→ **⚙ Settings** → **Test connection**  
→ For company Jira: use **username** (not email); enable **Allow self-signed SSL** if needed.

**Jira issues don’t appear**  
→ Click **↻ Jira**  
→ Issues must be assigned to you, open, and created within the last 2 months.

**Reminders stopped**  
→ The app must stay running (menu bar icon visible). Closing the window does not quit the app.

**Intel Mac**  
→ This build is for Apple Silicon. Contact the person who shared the app for an Intel build if needed.

---

## Uninstall

1. Menu bar → **Quit**
2. Delete **Daily TODO** from Applications
3. Optional — remove saved data:
   ```bash
   rm -rf ~/Library/Application\ Support/daily-todo-app
   ```
