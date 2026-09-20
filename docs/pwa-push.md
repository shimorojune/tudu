# PWA push (Firebase Web / FCM)

## Firebase console

Firebase project: **tudu-ltm** (display name Tudu). Web app: **Tudu Web** (`1:591042767794:web:e378fa7a89e1e0b90152ab`). Repo default project: `.firebaserc`.

1. Web app is already created; use SDK config in `.env` / Dokploy `VITE_FIREBASE_*` vars.
2. **Project settings → Cloud Messaging → Web configuration**: generate a key pair (VAPID). Copy the public key into `VITE_FIREBASE_VAPID_KEY`.
3. **Project settings → Service accounts → Generate new private key**: paste the full JSON into Dokploy as `FCM_SERVICE_ACCOUNT_JSON` (single line on the server service).
4. **Authentication → Settings → Authorized domains**: add production hostnames and `localhost`.

## Dokploy (compose env)

**Server**

- `FCM_SERVICE_ACCOUNT_JSON` = full service account JSON string

**Web build args** (same names as local `.env`)

- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`
- `VITE_FIREBASE_VAPID_KEY`

Redeploy web + server after setting vars. Run DB migration `0016_faulty_runaways.sql` on Neon if not applied via your usual migrate step.

Local helper (writes `.env` and gitignored `.env.dokploy.firebase.snippet` for Dokploy paste):

```bash
node scripts/sync-firebase-env.mjs
```

If **personal Dokploy MCP** returns 403, regenerate the API key in [admin.rraj.dev](https://admin.rraj.dev) (Profile → API/CLI) and update the `personal-dokploy-mcp` entry in Cursor MCP settings, then ask the agent to merge env via `compose.saveEnvironment`.

## Smoke test

1. Open prod web, sign in, **Settings → Enable notifications**.
2. Confirm a row in `push_device_tokens` for your user.
3. Install PWA or background the tab; from another account, trigger an inbox item or comment.
4. Expect a system notification; tap should open the task or inbox.
