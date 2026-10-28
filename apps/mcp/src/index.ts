import { readFileSync } from 'node:fs';
import { createMcp } from './server';

/**
 * Runs Tudu's MCP server. Run with SKYBRIDGE_TELEMETRY_DISABLED=1 and NODE_ENV=production (the scripts and the
 * image do): Skybridge otherwise sends a UDP metric per tool call, and loads its dev tools.
 */
const apiUrl = process.env.TUDU_API_URL ?? 'http://localhost:3456';
const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
  version: string;
};
const app = createMcp({
  apiUrl,
  issuer: process.env.TUDU_ISSUER ?? `${process.env.TUDU_PUBLIC_API_URL ?? apiUrl}/api/auth`,
  resource: process.env.MCP_URL ?? `http://localhost:${process.env.__PORT ?? 3457}/mcp`,
  timeZone: process.env.TUDU_TIME_ZONE ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
  version,
});
await app.run();
console.log(`Tudu MCP on port ${process.env.__PORT ?? 3457}, talking to ${apiUrl}`);
