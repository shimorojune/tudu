import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';

/**
 * Jira tokens at rest: AES-256-GCM with a key derived from AUTH_SECRET (HKDF-SHA256), so no new setting is
 * needed. A sealed token reads `v1.<iv>.<tag>.<ciphertext>` in base64url; changing AUTH_SECRET makes every
 * stored token unreadable, which reads as "Your Jira token has expired".
 */
export class TokenSeal {
  private readonly key: Buffer;

  constructor(secret: string) {
    this.key = Buffer.from(hkdfSync('sha256', secret, 'tudu', 'jira token v1', 32));
  }

  seal(token: string): string {
    const iv = randomBytes(12);
    const c = createCipheriv('aes-256-gcm', this.key, iv);
    const body = Buffer.concat([c.update(token, 'utf8'), c.final()]);
    return ['v1', iv, c.getAuthTag(), body]
      .map((p) => (typeof p === 'string' ? p : p.toString('base64url')))
      .join('.');
  }

  /** The token, or null when it was sealed with another secret or has been tampered with. */
  open(sealed: string): string | null {
    const [v, iv, tag, body] = sealed.split('.');
    if (v !== 'v1' || !iv || !tag || body === undefined) return null;
    try {
      const d = createDecipheriv('aes-256-gcm', this.key, Buffer.from(iv, 'base64url'));
      d.setAuthTag(Buffer.from(tag, 'base64url'));
      return Buffer.concat([d.update(Buffer.from(body, 'base64url')), d.final()]).toString('utf8');
    } catch {
      return null;
    }
  }
}
