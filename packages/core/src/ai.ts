import type { Ask } from './spaces';

/** AI access: what an app or key may do. `spaces` null is all your spaces, now and later. */
export interface AiReachFields {
  level: 'read' | 'write';
  canDelete: boolean;
  spaces: string[] | null;
  notebook: boolean;
}

/** One of your API keys, as GET /api/keys lists it. The key itself is shown once, when it's made. */
export interface AiKeyRow extends AiReachFields {
  id: string;
  name: string;
  /** The 4 characters after `tudu_`. */
  start: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
  state: 'active' | 'expired';
}

/** One app you allowed, as GET /api/apps lists it. */
export interface AiAppRow extends AiReachFields {
  clientId: string;
  name: string;
  verified: boolean;
  icon: string | null;
  host: string | null;
  lastUsedAt: string | null;
  createdAt: string;
}

export interface AiKeysResponse {
  keys: AiKeyRow[];
}

export interface AiAppsResponse {
  apps: AiAppRow[];
  /** The MCP server's address: what you add to Claude, ChatGPT or Cursor. */
  url: string;
}

export interface AiNewKeyResponse {
  key: string;
  row: AiKeyRow;
}

/** The consent page's question: who's asking, who you are, your spaces. */
export interface AiConsentRequest {
  app: { name: string; verified: boolean; icon: string | null; host: string | null };
  me: { name: string; email: string; image: string | null };
  spaces: Array<{ id: string; kind: 'personal' | 'team'; name: string; color: string | null }>;
}

/** "just now", "12 minutes ago", "3 hours ago", "yesterday", "5 days ago", "on 3 Oct". */
export function usedWords(at: string, now: Date): string {
  const ms = Math.max(0, now.getTime() - new Date(at).getTime());
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  return dayWords(at);
}

/** "on 3 Oct": when a key ran out. */
export function dayWords(at: string): string {
  const d = new Date(at);
  const mo = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][
    d.getMonth()
  ];
  return `on ${d.getDate()} ${mo}`;
}

/** Revoking a key: what happens, before it does. */
export function revokeKeyAsk(name: string, start: string): Ask {
  return {
    title: `Revoke ${name}?`,
    body: `Anything using this key stops working right away: tudu_${start}… gets “not allowed” on its next call. Nothing it already did is undone.`,
    confirm: 'Revoke key',
    busy: 'Revoking…',
    done: 'Revoked',
  };
}

/** Disconnecting an app. */
export function disconnectAppAsk(name: string): Ask {
  return {
    title: `Disconnect ${name}?`,
    body: `${name} can’t reach your Tudu from its next call. Nothing it already did is undone. You can connect it again from ${name}.`,
    confirm: 'Disconnect',
    busy: 'Disconnecting…',
    done: 'Disconnected',
  };
}
