import { serve } from '@hono/node-server';
import { readEnv } from './env';
import { bootstrap } from './bootstrap';

const env = readEnv();
const server = bootstrap(env);
const listener = serve({ fetch: server.app.fetch, port: env.PORT }, (info) => {
  console.log(`tudu api on http://localhost:${info.port} (${env.NODE_ENV}, mail: ${env.EMAIL_TRANSPORT})`);
});

async function shutdown() {
  listener.close();
  await server.close();
  process.exit(0);
}
process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());
