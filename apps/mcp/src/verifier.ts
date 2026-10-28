import { OAuthError, OAuthErrorCode, type AuthInfo, type TokenVerifier } from 'skybridge/server';
import type { Access } from './tudu';

/** A checked bearer is trusted this long before the API is asked again. */
export const CHECK_MS = 30_000;

export type Claims = { userId: string; access: Access['access'] };

/**
 * Checks a bearer (a key or an app's token) by asking the API who it is (`/api/access`), and remembers the answer
 * for 30 seconds. That is only the door: every tool then calls the API with the same bearer, which checks it again,
 * so a revoked key or app gets nothing from Tudu from the moment it is revoked.
 */
export function apiVerifier(opts: {
  apiUrl: string;
  /** The MCP address, which the bearer was checked for (RFC 8707). */
  resource: URL;
  fetch?: typeof fetch;
  now?: () => number;
}): TokenVerifier<Claims> {
  const doFetch = opts.fetch ?? fetch;
  const now = opts.now ?? Date.now;
  const checked = new Map<string, { at: number; info: AuthInfo<Claims> }>();
  return {
    async verifyAccessToken(token) {
      const hit = checked.get(token);
      if (hit && now() - hit.at < CHECK_MS) return hit.info;
      checked.delete(token);
      let res: Response;
      try {
        res = await doFetch(new URL('/api/access', opts.apiUrl), {
          headers: { authorization: `Bearer ${token}` },
        });
      } catch {
        throw new OAuthError(
          OAuthErrorCode.ServerError,
          'Tudu can’t be reached right now. Try again shortly.',
        );
      }
      if (res.status === 401 || res.status === 403)
        throw new OAuthError(
          OAuthErrorCode.InvalidToken,
          'This connection to Tudu has ended. Connect again, or make a new key in Settings › AI access.',
        );
      if (!res.ok) throw new OAuthError(OAuthErrorCode.ServerError, `Tudu answered ${res.status}.`);
      const who = (await res.json()) as Access;
      const at = now();
      const info: AuthInfo<Claims> = {
        token,
        clientId: who.access.kind === 'session' ? 'session' : `${who.access.kind}:${who.access.id}`,
        scopes: [],
        // The SDK refuses a bearer without an end; ours is the end of this check, not of the key.
        expiresAt: Math.floor((at + CHECK_MS) / 1000) + 1,
        resource: opts.resource,
        extra: { userId: who.user.id, access: who.access },
      };
      checked.set(token, { at, info });
      if (checked.size > 5_000) for (const [k, v] of checked) if (at - v.at >= CHECK_MS) checked.delete(k);
      return info;
    },
  };
}
