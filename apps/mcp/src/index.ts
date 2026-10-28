import { OAuthError, requireBearerAuth, Skybridge, type AuthInfo } from 'skybridge/server';
import { registerTools } from './tools';
import type { Access } from './tudu';

/**
 * Tudu's MCP server (PROTOTYPE, MCP try-out branch). Tools only, no views yet. It has no database: each request's
 * bearer (a Tudu API key for now; OAuth comes with the real build) is checked with the API, and every tool calls
 * the API with it, so the person's own access applies.
 *
 * Run with SKYBRIDGE_TELEMETRY_DISABLED=1 (the scripts do): Skybridge otherwise sends a UDP metric per tool call.
 */
const API_URL = process.env.TUDU_API_URL ?? 'http://localhost:3456';
const TIME_ZONE = process.env.TUDU_TIME_ZONE ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
/** A checked key is trusted this long before the API is asked again; revoking takes at most this to bite here. */
const CHECK_MS = 30_000;

const checked = new Map<string, { at: number; info: AuthInfo }>();
const verifier = {
  async verifyAccessToken(token: string): Promise<AuthInfo> {
    const hit = checked.get(token);
    if (hit && Date.now() - hit.at < CHECK_MS) return hit.info;
    const res = await fetch(new URL('/api/access', API_URL), { headers: { authorization: `Bearer ${token}` } });
    if (!res.ok) {
      checked.delete(token);
      throw new OAuthError('invalid_token', 'That Tudu key isn’t valid. Make a new one in Settings › AI access.');
    }
    const who = (await res.json()) as Access;
    const info: AuthInfo = {
      token,
      clientId: who.access.kind === 'key' ? `key:${who.access.keyId}` : 'session',
      scopes: [],
      extra: { userId: who.user.id },
    };
    checked.set(token, { at: Date.now(), info });
    return info;
  },
};

export const app = new Skybridge({
  name: 'tudu',
  title: 'Tudu',
  version: '0.0.1',
  description: 'Your Tudu days, Backlog, Inbox and Notebook.',
  instructions:
    'Tudu is a calm day planner. Tasks live in spaces (Personal and team spaces), planned for a day or kept in the Backlog. ' +
    'Call list_spaces first for space ids. Refer to tasks by their task ID ("ME-52"). Ask before deleting anything.',
  handler: (server) => registerTools(server, { apiUrl: API_URL, timeZone: TIME_ZONE }),
});

app.express.get('/health', (_req, res) => {
  res.json({ ok: true });
});
app.use('/mcp', requireBearerAuth({ verifier }));

await app.run();
console.log(`Tudu MCP on http://localhost:${process.env.__PORT ?? 3000}/mcp, talking to ${API_URL}`);
