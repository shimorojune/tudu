import { createHash, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import { EMAIL_PATTERN, PHOTO_MAX_BYTES } from '@tudu/core';
import { and, count, eq, gt, inArray, ne, schema, type Db } from '@tudu/db';
import { CODE_ATTEMPTS, CODE_TTL_SECONDS } from './auth';
import { emailChangeCodeMail, emailChangedMail, type Mailer } from './email';
import { SpaceError } from './spaces';
import type { Storage } from './storage';

/** At most this many change codes to one address in ten minutes, like sign-in codes. */
const SEND_LIMIT = 5;
const SEND_WINDOW_MS = 10 * 60 * 1000;

/** What a photo's first bytes say it is; anything else is not taken. */
export function photoType(b: Uint8Array): 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' | null {
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b.length > 6 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) return 'image/gif';
  const ascii = (from: number, to: number) => String.fromCharCode(...b.subarray(from, to));
  if (b.length > 12 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp';
  return null;
}

/** Where a person's photo lives in the bucket, by its version. */
const photoKey = (userId: string, v: string) => `photos/${userId}/${v}`;
/** The address the app shows a photo from; the version makes a new photo a new address. */
export const photoPath = (userId: string, v: string) => `/api/people/${userId}/photo/${v}`;

/** Store a new photo and point the person at it; the old one goes from the bucket. */
export async function setPhoto(db: Db, storage: Storage, userId: string, body: Uint8Array): Promise<string> {
  if (body.length > PHOTO_MAX_BYTES)
    throw new SpaceError(413, 'That photo is too big. Photos can be up to 5 MB.');
  const type = photoType(body);
  if (!type) throw new SpaceError(400, 'That isn’t a photo. Use a JPEG, PNG, GIF or WebP.');
  const v = randomUUID().slice(0, 12);
  await storage.put(photoKey(userId, v), body, type);
  const [before] = await db
    .select({ image: schema.user.image })
    .from(schema.user)
    .where(eq(schema.user.id, userId));
  const image = photoPath(userId, v);
  await db.update(schema.user).set({ image, updatedAt: new Date() }).where(eq(schema.user.id, userId));
  await dropPhoto(storage, userId, before?.image ?? null);
  return image;
}

/** Back to initials. */
export async function clearPhoto(db: Db, storage: Storage, userId: string): Promise<void> {
  const [before] = await db
    .select({ image: schema.user.image })
    .from(schema.user)
    .where(eq(schema.user.id, userId));
  await db.update(schema.user).set({ image: null, updatedAt: new Date() }).where(eq(schema.user.id, userId));
  await dropPhoto(storage, userId, before?.image ?? null);
}

async function dropPhoto(storage: Storage, userId: string, image: string | null): Promise<void> {
  const v = image?.match(/\/photo\/([^/?]+)$/)?.[1];
  if (v) await storage.delete(photoKey(userId, v)).catch(() => undefined);
}

/** A photo, for anyone who shares a space with its person (or the person themself). */
export async function readPhoto(db: Db, storage: Storage, viewer: string, userId: string, v: string) {
  const [u] = await db
    .select({ image: schema.user.image })
    .from(schema.user)
    .where(eq(schema.user.id, userId));
  if (!u || u.image !== photoPath(userId, v)) return null;
  if (viewer !== userId) {
    const mine = db
      .select({ spaceId: schema.spaceMembers.spaceId })
      .from(schema.spaceMembers)
      .where(eq(schema.spaceMembers.userId, viewer));
    const [shared] = await db
      .select({ n: count() })
      .from(schema.spaceMembers)
      .where(and(eq(schema.spaceMembers.userId, userId), inArray(schema.spaceMembers.spaceId, mine)));
    if (!shared?.n) return null;
  }
  return storage.get(photoKey(userId, v));
}

function hash(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

/**
 * Start changing your email: a 6-digit code goes to the new address. An address someone else uses is refused;
 * one already yours is nothing to change.
 */
export async function startEmailChange(
  db: Db,
  mailer: Mailer,
  user: { id: string; email: string },
  raw: string,
): Promise<string> {
  const email = raw.trim().toLowerCase();
  if (!EMAIL_PATTERN.test(email)) throw new SpaceError(400, 'That doesn’t look like an email address.');
  if (email === user.email.toLowerCase()) throw new SpaceError(400, 'That’s already your email.');
  const [taken] = await db
    .select({ id: schema.user.id })
    .from(schema.user)
    .where(and(eq(schema.user.email, email), ne(schema.user.id, user.id)));
  if (taken) throw new SpaceError(409, 'Someone already uses that address in Tudu.');
  const since = new Date(Date.now() - SEND_WINDOW_MS);
  const [sent] = await db
    .select({ n: count() })
    .from(schema.otpSends)
    .where(and(eq(schema.otpSends.email, email), gt(schema.otpSends.sentAt, since)));
  if ((sent?.n ?? 0) >= SEND_LIMIT)
    throw new SpaceError(429, 'Too many codes sent to this address. Wait a few minutes, then try again.');
  await db.insert(schema.otpSends).values({ id: randomUUID(), email });
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  const row = {
    email,
    codeHash: hash(code),
    attempts: 0,
    expiresAt: new Date(Date.now() + CODE_TTL_SECONDS * 1000),
    createdAt: new Date(),
  };
  await db
    .insert(schema.emailChanges)
    .values({ userId: user.id, ...row })
    .onConflictDoUpdate({ target: schema.emailChanges.userId, set: row });
  await mailer.send(emailChangeCodeMail(email, code));
  return email;
}

/** The code from the new address: it becomes your email, and the old one hears it changed. */
export async function confirmEmailChange(
  db: Db,
  mailer: Mailer,
  user: { id: string; email: string },
  code: string,
): Promise<string> {
  const [row] = await db.select().from(schema.emailChanges).where(eq(schema.emailChanges.userId, user.id));
  if (!row) throw new SpaceError(404, 'Send a code to the new address first.');
  if (row.expiresAt.getTime() < Date.now())
    throw new SpaceError(410, 'That code has expired. Send a new one.');
  if (row.attempts >= CODE_ATTEMPTS) throw new SpaceError(429, 'Too many tries. Send a new code.');
  const a = Buffer.from(hash(code.trim()));
  const b = Buffer.from(row.codeHash);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    await db
      .update(schema.emailChanges)
      .set({ attempts: row.attempts + 1 })
      .where(eq(schema.emailChanges.userId, user.id));
    throw new SpaceError(400, 'That code didn’t work. Check it and try again.');
  }
  try {
    await db
      .update(schema.user)
      .set({ email: row.email, emailVerified: true, updatedAt: new Date() })
      .where(eq(schema.user.id, user.id));
  } catch {
    throw new SpaceError(409, 'Someone already uses that address in Tudu.');
  }
  await db.delete(schema.emailChanges).where(eq(schema.emailChanges.userId, user.id));
  await mailer.send(emailChangedMail(user.email, row.email));
  return row.email;
}
