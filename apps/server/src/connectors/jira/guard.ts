import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

/** True for loopback, private, link-local, carrier-grade NAT, multicast and other addresses that are not the internet's. */
export function isPrivateAddress(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) {
    const [a, b] = ip.split('.').map(Number) as [number, number];
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }
  if (v === 6) {
    const s = ip.toLowerCase();
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(s);
    if (mapped) return isPrivateAddress(mapped[1]!);
    return (
      s === '::' ||
      s === '::1' ||
      s.startsWith('fc') ||
      s.startsWith('fd') ||
      s.startsWith('fe8') ||
      s.startsWith('fe9') ||
      s.startsWith('fea') ||
      s.startsWith('feb') ||
      s.startsWith('ff')
    );
  }
  return true;
}

export type SiteCheck = { ok: true } | { ok: false; why: 'not-https' | 'private' | 'unknown-host' };

/**
 * Where the server may send a token. In production only https, and never to an address inside the host's own
 * networks (the API must not become a way to reach them). Elsewhere anything goes, so tests can use a local fake.
 */
export async function checkSite(
  site: string,
  production: boolean,
  resolve: (host: string) => Promise<string[]> = async (h) =>
    (await lookup(h, { all: true })).map((a) => a.address),
): Promise<SiteCheck> {
  if (!production) return { ok: true };
  let url: URL;
  try {
    url = new URL(site);
  } catch {
    return { ok: false, why: 'unknown-host' };
  }
  if (url.protocol !== 'https:') return { ok: false, why: 'not-https' };
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal'))
    return { ok: false, why: 'private' };
  let addrs: string[];
  try {
    addrs = isIP(host) ? [host] : await resolve(host);
  } catch {
    return { ok: false, why: 'unknown-host' };
  }
  if (!addrs.length) return { ok: false, why: 'unknown-host' };
  return addrs.some(isPrivateAddress) ? { ok: false, why: 'private' } : { ok: true };
}
