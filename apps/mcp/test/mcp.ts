import { createServer } from 'node:net';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { createMcp, type McpConfig } from '../src/server';

/** A free port on this machine, for one MCP server. */
function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = createServer();
    s.once('error', reject);
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address() as { port: number };
      s.close(() => resolve(port));
    });
  });
}

/** Tudu's MCP server listening on a free port, talking to the API through `fetch`. */
export async function startMcp(cfg: Pick<McpConfig, 'fetch'> & Partial<McpConfig>): Promise<{ url: string }> {
  const port = await freePort();
  const url = `http://localhost:${port}/mcp`;
  const app = createMcp({
    apiUrl: 'http://api.test',
    issuer: 'http://localhost:3456/api/auth',
    resource: url,
    timeZone: 'UTC',
    version: '0.0.0-test',
    ...cfg,
  });
  process.env.__PORT = String(port);
  await app.run();
  return { url };
}

/** An MCP client (the SDK's own) connected with a bearer. */
export async function connectClient(url: string, bearer: string): Promise<Client> {
  const client = new Client({ name: 'tudu-test', version: '1.0.0' });
  await client.connect(
    new StreamableHTTPClientTransport(new URL(url), {
      requestInit: { headers: { authorization: `Bearer ${bearer}` } },
    }),
  );
  return client;
}

/** The text of a tool result. */
export const textOf = (r: { content?: unknown }): string =>
  ((r.content as Array<{ type: string; text?: string }>) ?? []).map((c) => c.text ?? '').join('\n');
