import { createHmac, timingSafeEqual } from 'node:crypto';
import { feedbackRef } from '@tudu/core';

/** Where a public screenshot is served from: the API's public origin and the secret its links are signed with. */
export interface ShotLinks {
  base: string;
  secret: string;
}

/** The part of the link nobody can guess: an HMAC of the report's id, cut to 32 base64url characters. */
export function shotSig(secret: string, id: string): string {
  return createHmac('sha256', secret).update(`feedback-shot:${id}`).digest('base64url').slice(0, 32);
}

/** Whether `sig` is this report's, compared in constant time. */
export function shotSigMatches(secret: string, id: string, sig: string): boolean {
  const want = Buffer.from(shotSig(secret, id));
  const got = Buffer.from(sig);
  return got.length === want.length && timingSafeEqual(got, want);
}

/**
 * The link the issue embeds: the report's short reference (already on the issue) and the signature. Never the row's
 * whole id, nor the file's name, which can be personal.
 */
export function shotUrl(links: ShotLinks, id: string): string {
  return `${links.base.replace(/\/+$/, '')}/api/feedback/shots/${feedbackRef(id)}/${shotSig(links.secret, id)}`;
}
