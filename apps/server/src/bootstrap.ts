import { randomUUID } from 'node:crypto';
import { createDb, schema, type Db } from '@tudu/db';
import { createAuth, type Auth } from './auth';
import { EventHub } from './events';
import { OutboxMailer, signInCodeMail, type Mailer } from './email';
import { ResendMailer } from './email/resend';
import type { Env } from './env';
import { createApp, type App } from './app';

export interface Server {
  app: App;
  db: Db;
  auth: Auth;
  hub: EventHub;
  mailer: Mailer;
  close: () => Promise<void>;
}

/** Wire everything from the environment. Tests call this with an outbox mailer and a throwaway database. */
export function bootstrap(
  env: Env,
  options: { mailer?: Mailer; heartbeatMs?: number; quiet?: boolean } = {},
): Server {
  const { db, close } = createDb(env.DATABASE_URL);
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
    heartbeatMs: options.heartbeatMs,
    quiet: options.quiet,
  });
  return { app, db, auth, hub, mailer, close };
}
