import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { personColor } from '@tudu/core';
import { createDb, eq, schema, type Db } from '@tudu/db';
import { markNewAccount, takeFirstSession } from './firstRun';
import { createAuth, type Auth } from './auth';
import { EventHub } from './events';
import { OutboxMailer, signInCodeMail, type Mailer } from './email';
import { ResendMailer } from './email/resend';
import type { Env } from './env';
import { createApp, type App } from './app';
import { sweepAttachments } from './files';
import { sweepNotebook } from './notebook';
import { EMBED_EVERY_MS, Embeddings } from './closeMatches';
import { LocalEmbedder, type Embedder } from './embeddings';
import { MemoryStorage, S3Storage, type Storage } from './storage';
import { sweepCleared } from './inbox';
import { ISSUE_SWEEP_EVERY_MS, sweepIssues } from './feedback/filing';
import { GithubIssues } from './feedback/github';

export interface Server {
  app: App;
  db: Db;
  auth: Auth;
  hub: EventHub;
  mailer: Mailer;
  storage: Storage;
  embeddings: Embeddings;
  close: () => Promise<void>;
}

/** Files nobody refers to any more are swept this often. */
export const SWEEP_EVERY_MS = 60 * 60 * 1000;

/** Wire everything from the environment. Tests call this with an outbox mailer and a throwaway database. */
export function bootstrap(
  env: Env,
  options: {
    mailer?: Mailer;
    storage?: Storage;
    heartbeatMs?: number;
    quiet?: boolean;
    jiraFetch?: typeof fetch;
    githubFetch?: typeof fetch;
    /** Tests pass a fake; `null` is the model off. Left out, the model inside the API (EMBEDDINGS). */
    embedder?: Embedder | null;
  } = {},
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
      : setInterval(() => {
          void sweepAttachments(db, storage).catch(() => {});
          // The Notebook's Trash keeps things 30 days, then they go for good with their files.
          void sweepNotebook(db, storage).catch(() => {});
          // Inbox items cleared over 30 days ago: Undo is long past.
          void sweepCleared(db).catch(() => {});
        }, SWEEP_EVERY_MS);
  // Close matches: the model inside the API, unless told off; the tick picks up what a batch missed.
  const embedder =
    options.embedder !== undefined
      ? options.embedder
      : env.EMBEDDINGS === 'off'
        ? null
        : new LocalEmbedder({
            // Local work and tests keep the model in the repo's own cache; the image sets its own folder.
            modelDir:
              env.EMBEDDINGS_MODEL_DIR ??
              resolve(fileURLToPath(import.meta.url), '../../../../.local/models'),
            offline: env.EMBEDDINGS_OFFLINE === '1',
            quiet: options.quiet,
          });
  const embeddings = new Embeddings(db, embedder, { quiet: options.quiet });
  const embedTick =
    env.NODE_ENV === 'test' || !embedder ? null : setInterval(() => embeddings.kick(), EMBED_EVERY_MS);
  if (embedder instanceof LocalEmbedder && env.NODE_ENV !== 'test')
    void embedder
      .warm()
      .then(() => embeddings.kick())
      .catch((err) => {
        if (!options.quiet) console.error('embeddings: the model did not load', err);
      });
  // Send feedback's public issues: filed as reports come in; what waits for GitHub goes every five minutes.
  const issues = env.FEEDBACK_GITHUB_TOKEN
    ? new GithubIssues({
        token: env.FEEDBACK_GITHUB_TOKEN,
        repo: env.FEEDBACK_GITHUB_REPO,
        api: env.FEEDBACK_GITHUB_API,
        perHour: env.FEEDBACK_GITHUB_PER_HOUR,
        fetch: options.githubFetch,
      })
    : null;
  const issueTick =
    env.NODE_ENV === 'test' || !issues
      ? null
      : setInterval(() => {
          void sweepIssues(db, issues, { quiet: options.quiet }).catch((err) => {
            if (!options.quiet) console.error('feedback: the issue sweep failed', err);
          });
        }, ISSUE_SWEEP_EVERY_MS);
  const close = async () => {
    if (sweeper) clearInterval(sweeper);
    if (issueTick) clearInterval(issueTick);
    if (embedTick) clearInterval(embedTick);
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
      // And a colour for their mark, the same on every device.
      await db
        .update(schema.user)
        .set({ color: personColor(user.id) })
        .where(eq(schema.user.id, user.id));
      await markNewAccount(db, user.id);
    },
    onSessionCreated: (session) => takeFirstSession(db, session.userId, session.id),
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
    jiraFetch: options.jiraFetch,
    githubFetch: options.githubFetch,
    embeddings,
    issues,
  });
  return { app, db, auth, hub, mailer, storage, embeddings, close };
}
