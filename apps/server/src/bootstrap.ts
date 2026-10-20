import { randomUUID } from 'node:crypto';
import { createDb, schema, type Db } from '@tudu/db';
import { createAuth, type Auth } from './auth';
import { EventHub } from './events';
import { OutboxMailer, signInCodeMail, type Mailer } from './email';
import { ResendMailer } from './email/resend';
import type { Env } from './env';
import { createApp, type App } from './app';
import { sweepAttachments } from './files';
import { MemoryStorage, S3Storage, type Storage } from './storage';

export interface Server {
  app: App;
  db: Db;
  auth: Auth;
  hub: EventHub;
  mailer: Mailer;
  storage: Storage;
  close: () => Promise<void>;
}

/** Files nobody refers to any more are swept this often. */
export const SWEEP_EVERY_MS = 60 * 60 * 1000;

/** Wire everything from the environment. Tests call this with an outbox mailer and a throwaway database. */
export function bootstrap(
  env: Env,
  options: { mailer?: Mailer; storage?: Storage; heartbeatMs?: number; quiet?: boolean } = {},
): Server {
  const { db, close: closeDb } = createDb(env.DATABASE_URL);
  const storage =
    options.storage ??
    (env.STORAGE_DRIVER === 's3'
      ? new S3Storage({
          endpoint: env.S3_ENDPOINT!,
          bucket: env.S3_BUCKET,
          accessKeyId: env.S3_ACCESS_KEY_ID!,
          secretAccessKey: env.S3_SECRET_ACCESS_KEY!,
          region: env.S3_REGION,
        })
      : new MemoryStorage());
  void storage.ready().catch((err) => {
    if (!options.quiet) console.error('storage is not ready', err);
  });
  // Files nobody refers to any more go after a day; not in tests, which sweep by hand.
  const sweeper =
    env.NODE_ENV === 'test'
      ? null
      : setInterval(() => void sweepAttachments(db, storage).catch(() => {}), SWEEP_EVERY_MS);
  const close = async () => {
    if (sweeper) clearInterval(sweeper);
    await closeDb();
  };
  const mailer =
    options.mailer ??
    (env.EMAIL_TRANSPORT === 'resend'
      ? new ResendMailer(env.RESEND_API_KEY!, env.EMAIL_FROM)
      : new OutboxMailer());
  const hub = new EventHub();
  const auth = createAuth({
    db,
    baseUrl: env.BASE_URL,
    secret: env.AUTH_SECRET,
    trustedOrigins: env.CORS_ORIGINS.split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    sendCode: (to, code) => mailer.send(signInCodeMail(to, code)),
    onUserCreated: async (user) => {
      // Everyone starts with a Personal space of their own.
      const spaceId = randomUUID();
      await db
        .insert(schema.spaces)
        .values({ id: spaceId, kind: 'personal', name: 'Personal', ownerId: user.id });
      await db.insert(schema.spaceMembers).values({ spaceId, userId: user.id, role: 'admin' });
    },
  });
  const app = createApp({
    env,
    db,
    auth,
    hub,
    mailer,
    storage,
    heartbeatMs: options.heartbeatMs,
    quiet: options.quiet,
  });
  return { app, db, auth, hub, mailer, storage, close };
}
