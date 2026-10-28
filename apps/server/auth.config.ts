// Used only by `pnpm --filter @tudu/server auth:generate` (the Better Auth CLI) to produce packages/db/src/auth-schema.ts.
import { createDb } from '@tudu/db';
import { createAuth } from './src/auth';

// A client that is never connected: the CLI only reads the configuration.
export const auth = createAuth({
  db: createDb('postgres://unused@127.0.0.1:1/unused').db,
  baseUrl: 'http://localhost:3456',
  secret: 'generate-only',
  trustedOrigins: [],
  sendCode: () => {},
  webUrl: 'http://localhost:5173',
  mcpUrl: 'http://localhost:3457/mcp',
});
