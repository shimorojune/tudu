#!/usr/bin/env node
// The updater signature on a Mac build must come from the key the app trusts (docs/plans/infisical-secrets.md §6).
// On 26 Oct 2026 CI signed with one key while the app trusted another, and every installed Tudu refused every update.
// This checks a `.sig` against `plugins.updater.pubkey` before anything ships.
//
//   node scripts/verify-updater-sig.mjs <file> <file.sig> [tauri.conf.json | --pubkey <base64>]
//
// Formats (minisign, as Tauri writes them): the pubkey is base64 of a two-line text whose second line is base64 of
// "Ed" + key id (8 bytes) + Ed25519 public key (32). The .sig is base64 of four lines: an untrusted comment, base64 of
// algorithm ("ED" = prehashed with BLAKE2b-512, "Ed" = raw) + key id + signature (64), a trusted comment, and base64 of
// the global signature over signature + trusted comment.
import { createHash, createPublicKey, verify } from 'node:crypto';
import { readFileSync } from 'node:fs';

const b64 = (s) => Buffer.from(s.trim(), 'base64');

/** minisign shows a key id as the 8 bytes read little-endian, in upper-case hex. */
export const keyId = (bytes) => Buffer.from(bytes).reverse().toString('hex').toUpperCase();

/** The second non-empty line of a base64-wrapped minisign text. */
function payload(wrapped, what) {
  const lines = b64(wrapped)
    .toString('utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) throw new Error(`${what} is not a minisign ${what}`);
  return lines;
}

export function parsePubkey(wrapped) {
  const raw = b64(payload(wrapped, 'public key')[1]);
  if (raw.length !== 42 || raw.subarray(0, 2).toString() !== 'Ed')
    throw new Error('public key is not an Ed25519 minisign key');
  return { id: keyId(raw.subarray(2, 10)), key: raw.subarray(10) };
}

export function parseSignature(wrapped) {
  const lines = payload(wrapped, 'signature');
  const raw = b64(lines[1]);
  const alg = raw.subarray(0, 2).toString();
  if (raw.length !== 74 || (alg !== 'ED' && alg !== 'Ed'))
    throw new Error('signature is not an Ed25519 minisign signature');
  const trusted = lines.find((l) => l.startsWith('trusted comment: '));
  const global = trusted ? lines[lines.indexOf(trusted) + 1] : undefined;
  return {
    alg,
    id: keyId(raw.subarray(2, 10)),
    sig: raw.subarray(10),
    trusted: trusted?.slice('trusted comment: '.length),
    global: global ? b64(global) : undefined,
  };
}

const ed25519 = (key) =>
  createPublicKey({ key: { kty: 'OKP', crv: 'Ed25519', x: key.toString('base64url') }, format: 'jwk' });

/** Problems with `signature` over `file` for `pubkey`, as lines; empty when it verifies. */
export function check(file, signature, pubkey) {
  let pk, s;
  try {
    pk = parsePubkey(pubkey);
    s = parseSignature(signature);
  } catch (e) {
    return [e.message];
  }
  if (s.id !== pk.id) return [`signed with key ${s.id}, but the app trusts key ${pk.id}`];
  const key = ed25519(pk.key);
  const message = s.alg === 'ED' ? createHash('blake2b512').update(file).digest() : file;
  if (!verify(null, message, key, s.sig)) return [`signature does not match the file (key ${pk.id})`];
  if (
    s.global &&
    s.trusted !== undefined &&
    !verify(null, Buffer.concat([s.sig, Buffer.from(s.trusted)]), key, s.global)
  )
    return ['trusted comment signature does not verify'];
  return [];
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  const [file, sig, third, fourth] = process.argv.slice(2);
  if (!file || !sig) {
    console.error('usage: verify-updater-sig.mjs <file> <file.sig> [tauri.conf.json | --pubkey <base64>]');
    process.exit(2);
  }
  const pubkey =
    third === '--pubkey'
      ? fourth
      : JSON.parse(readFileSync(third ?? 'apps/desktop/src-tauri/tauri.conf.json', 'utf8')).plugins.updater
          .pubkey;
  const problems = check(readFileSync(file), readFileSync(sig, 'utf8'), pubkey);
  for (const p of problems) console.error(p);
  if (!problems.length) console.log(`${sig}: signed by key ${parsePubkey(pubkey).id}, which the app trusts`);
  process.exit(problems.length ? 1 : 0);
}
