import { createHash, generateKeyPairSync, randomBytes, sign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { check, keyId, parsePubkey } from './verify-updater-sig.mjs';

const wrap = (text) => Buffer.from(text).toString('base64');

/** A minisign key pair as Tauri writes it: the wrapped public key, and a signer producing wrapped .sig files. */
function minisignKey() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const id = randomBytes(8);
  const pk = Buffer.from(publicKey.export({ format: 'jwk' }).x, 'base64url');
  const pubkey = wrap(
    `untrusted comment: minisign public key: ${keyId(id)}\n${Buffer.concat([Buffer.from('Ed'), id, pk]).toString('base64')}\n`,
  );
  const signFile = (file, { prehash = true } = {}) => {
    const message = prehash ? createHash('blake2b512').update(file).digest() : file;
    const sig = sign(null, message, privateKey);
    const trusted = 'timestamp:1762000000\tfile:Tudu.app.tar.gz';
    const global = sign(null, Buffer.concat([sig, Buffer.from(trusted)]), privateKey);
    const head = Buffer.concat([Buffer.from(prehash ? 'ED' : 'Ed'), id, sig]).toString('base64');
    return wrap(
      `untrusted comment: signature from tauri secret key\n${head}\ntrusted comment: ${trusted}\n${global.toString('base64')}\n`,
    );
  };
  return { id: keyId(id), pubkey, signFile };
}

describe('scripts/verify-updater-sig', () => {
  const file = Buffer.from('the update bundle');

  it('C01-U30 a signature from the configured key passes, prehashed or raw', () => {
    const k = minisignKey();
    expect(check(file, k.signFile(file), k.pubkey)).toEqual([]);
    expect(check(file, k.signFile(file, { prehash: false }), k.pubkey)).toEqual([]);
  });

  it('C01-U30 a signature from another key fails naming both key ids', () => {
    const trusted = minisignKey();
    const other = minisignKey();
    expect(check(file, other.signFile(file), trusted.pubkey)).toEqual([
      `signed with key ${other.id}, but the app trusts key ${trusted.id}`,
    ]);
  });

  it('C01-U30 a tampered file fails', () => {
    const k = minisignKey();
    expect(check(Buffer.from('another bundle'), k.signFile(file), k.pubkey)).toEqual([
      `signature does not match the file (key ${k.id})`,
    ]);
  });

  it('C01-U30 a malformed signature or key fails clearly', () => {
    const k = minisignKey();
    expect(check(file, wrap('nothing here'), k.pubkey)).toEqual(['signature is not a minisign signature']);
    expect(check(file, k.signFile(file), wrap('untrusted comment: x\nAAAA\n'))).toEqual([
      'public key is not an Ed25519 minisign key',
    ]);
  });

  it("C01-U30 the app's own pubkey parses to the key CI signs with", () => {
    const conf = JSON.parse(
      readFileSync(new URL('../apps/desktop/src-tauri/tauri.conf.json', import.meta.url), 'utf8'),
    );
    expect(parsePubkey(conf.plugins.updater.pubkey).id).toBe('2886268A7936D55E');
  });
});
