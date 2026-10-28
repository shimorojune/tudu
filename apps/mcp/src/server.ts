import { requireBearerAuth, Skybridge } from 'skybridge/server';
import { registerTools } from './tools';
import { apiVerifier } from './verifier';

export interface McpConfig {
  /** Where this server reaches the Tudu API. */
  apiUrl: string;
  /** The API's OAuth issuer, as apps see it: `https://api…/api/auth`. */
  issuer: string;
  /** This server's own public address, `https://mcp…/mcp`: what tokens are issued for. */
  resource: string;
  /** The day it is for the person when they don't say. */
  timeZone: string;
  version: string;
  fetch?: typeof fetch;
}

const INSTRUCTIONS = [
  'Tudu is a calm day planner. Tasks live in spaces: your Personal space and team spaces you share with people.',
  'A task is planned for a day, or kept in the Backlog (no day yet). A due day is a deadline, separate from the day.',
  'Tasks have IDs people use, like "NW-42" (the space prefix and a number): use them to refer to tasks.',
  'The Notebook is your own notes, never shared. The Inbox holds requests waiting for your answer and updates.',
  'Call list_spaces first for space ids. Ask before deleting anything. Errors are plain sentences: pass them on.',
].join(' ');

/**
 * Tudu's MCP server: tools only (no views yet). It keeps no data: each request's bearer, a key or an app's token,
 * is checked with the API and every tool calls the API with it, so the person's own access applies.
 */
export function createMcp(cfg: McpConfig): Skybridge {
  const resource = new URL(cfg.resource);
  const app = new Skybridge({
    name: 'tudu',
    title: 'Tudu',
    version: cfg.version,
    description: 'Your Tudu days, Backlog, Inbox and Notebook.',
    instructions: INSTRUCTIONS,
    handler: (server) =>
      registerTools(server, { apiUrl: cfg.apiUrl, timeZone: cfg.timeZone, fetch: cfg.fetch }),
  });

  // RFC 9728: where apps learn which authorization server issues tokens for this address.
  const metadataPath = `/.well-known/oauth-protected-resource${resource.pathname === '/' ? '' : resource.pathname}`;
  const metadataUrl = new URL(metadataPath, resource.origin).href;
  const metadata = {
    resource: resource.href,
    authorization_servers: [cfg.issuer],
    bearer_methods_supported: ['header'],
    scopes_supported: ['offline_access'],
    resource_name: 'Tudu',
    resource_documentation: 'https://github.com/shimorojune/tudu',
  };
  for (const path of new Set([metadataPath, '/.well-known/oauth-protected-resource']))
    app.express.get(path, (_req, res) => {
      res.set('Access-Control-Allow-Origin', '*').json(metadata);
    });
  app.express.get('/health', (_req, res) => {
    res.json({ ok: true, version: cfg.version });
  });
  app.use(
    '/mcp',
    requireBearerAuth({
      verifier: apiVerifier({ apiUrl: cfg.apiUrl, resource, fetch: cfg.fetch }),
      resourceMetadataUrl: metadataUrl,
      expectedResource: resource,
    }),
  );
  return app;
}
