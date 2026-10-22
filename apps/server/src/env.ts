import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3456),
  DATABASE_URL: z.string().url(),
  /** The API's public origin. Cookies and Better Auth's callbacks are built from it. */
  BASE_URL: z.string().url().default('http://localhost:3456'),
  AUTH_SECRET: z.string().min(16),
  /** Comma-separated origins allowed to call the API with cookies. */
  CORS_ORIGINS: z.string().default('http://localhost:5173'),
  /** Where the web app lives, for links in emails (a join link). The first CORS origin when left out. */
  WEB_URL: z.string().url().optional(),
  /** `resend` sends real mail; `outbox` keeps it in memory for tests and local work. */
  EMAIL_TRANSPORT: z.enum(['resend', 'outbox']).default('outbox'),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default('Tudu <sign-in@mail.tudu.ezdev.net>'),
  /** `1` exposes /__test/* (the outbox) for end-to-end tests. Never on in production. */
  TEST_ROUTES: z.string().optional(),
  /** `1` serves the fake Jira at /demo-jira, so staging can be reviewed without a real Jira. Fixed data only. */
  DEMO_JIRA: z.string().optional(),
  /** `s3` keeps attachments in the bucket below; `memory` keeps them in the process (tests, local work). */
  STORAGE_DRIVER: z.enum(['s3', 'memory']).default('memory'),
  S3_ENDPOINT: z.string().url().optional(),
  S3_BUCKET: z.string().default('tudu'),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_REGION: z.string().default('us-east-1'),
  /** The macOS app's update feed: which GitHub release it serves (none: the feed answers 404). */
  UPDATES_TRACK: z.enum(['production', 'staging']).optional(),
  /** A token that can read the repository's releases; without one the feed answers 503. */
  UPDATES_GITHUB_TOKEN: z.string().optional(),
  UPDATES_GITHUB_REPO: z.string().default('shimorojune/tudu'),
  /** GitHub's API; tests point it at the fake under /__test/github. */
  UPDATES_GITHUB_API: z.string().url().default('https://api.github.com'),
  /**
   * Close matches (chunk 13): `local` runs the embedding model inside the API; `off` keeps every task's vector
   * empty and the meaning search answers nothing (no model loaded; local work that never searches by meaning).
   */
  EMBEDDINGS: z.enum(['local', 'off']).default('local'),
  /** Where the model's files live. The image bundles them; local work downloads them here once. */
  EMBEDDINGS_MODEL_DIR: z.string().optional(),
  /** `1` never downloads the model: production, where the image already carries it. */
  EMBEDDINGS_OFFLINE: z.string().optional(),
});

export type Env = z.infer<typeof schema>;

export function readEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
    throw new Error(`Bad environment:\n${lines.join('\n')}`);
  }
  const env = parsed.data;
  if (!env.WEB_URL) env.WEB_URL = env.CORS_ORIGINS.split(',')[0]!.trim() || 'http://localhost:5173';
  if (env.NODE_ENV === 'production' && env.TEST_ROUTES === '1')
    throw new Error('TEST_ROUTES must not be on in production');
  if (env.EMAIL_TRANSPORT === 'resend' && !env.RESEND_API_KEY)
    throw new Error('RESEND_API_KEY is needed for the resend transport');
  if (env.STORAGE_DRIVER === 's3' && !(env.S3_ENDPOINT && env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY))
    throw new Error(
      'S3_ENDPOINT, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY are needed for the s3 storage driver',
    );
  if (env.NODE_ENV === 'production' && env.STORAGE_DRIVER !== 's3')
    throw new Error('STORAGE_DRIVER must be s3 in production');
  return env;
}
