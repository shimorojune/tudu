#!/usr/bin/env node
// Ask Dokploy to redeploy a compose service and wait until it reports done. Usage: dokploy-deploy.mjs <composeId> [title]
const base = process.env.DOKPLOY_URL;
const key = process.env.DOKPLOY_API_KEY;
const [composeId, title = 'deploy'] = process.argv.slice(2);
if (!base || !key || !composeId) {
  console.error('DOKPLOY_URL, DOKPLOY_API_KEY and a compose id are needed');
  process.exit(1);
}
const headers = { 'x-api-key': key, 'content-type': 'application/json', accept: 'application/json' };
const call = async (path, body) => {
  const res = await fetch(`${base}${path}`, {
    method: body ? 'POST' : 'GET',
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${path}: ${res.status} ${await res.text()}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
};
await call('/api/compose.deploy', { composeId, title });
const deadline = Date.now() + 15 * 60_000;
while (Date.now() < deadline) {
  const { composeStatus } = await call(`/api/compose.one?composeId=${composeId}`);
  if (composeStatus === 'done') {
    console.log('deployed');
    process.exit(0);
  }
  if (composeStatus === 'error') {
    console.error('deploy failed; see the deployment log in Dokploy');
    process.exit(1);
  }
  await new Promise((r) => setTimeout(r, 10_000));
}
console.error('deploy timed out');
process.exit(1);
