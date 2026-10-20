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
  /** `resend` sends real mail; `outbox` keeps it in memory for tests and local work. */
  EMAIL_TRANSPORT: z.enum(['resend', 'outbox']).default('outbox'),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default('Tudu <sign-in@mail.tudu.ezdev.net>'),
  /** `1` exposes /__test/* (the outbox) for end-to-end tests. Never on in production. */
  TEST_ROUTES: z.string().optional(),
});

export type Env = z.infer<typeof schema>;

export function readEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
    throw new Error(`Bad environment:\n${lines.join('\n')}`);
  }
  const env = parsed.data;
  if (env.NODE_ENV === 'production' && env.TEST_ROUTES === '1')
    throw new Error('TEST_ROUTES must not be on in production');
  if (env.EMAIL_TRANSPORT === 'resend' && !env.RESEND_API_KEY)
    throw new Error('RESEND_API_KEY is needed for the resend transport');
  return env;
}
