# Tudu MCP (Skybridge)

OAuth-protected MCP server for Tudu tasks, projects, comments, co-workers, and requests.

## Local development

1. Run Postgres migrations (`pnpm db:migrate`).
2. Start the API: `pnpm dev:server`.
3. Start the web app (consent UI): `pnpm dev:web`.
4. Start MCP: `pnpm dev:mcp` (default `http://localhost:3100/mcp`).

Environment:

| Variable | Purpose |
| --- | --- |
| `TUDU_API_URL` | Tudu API base URL (default `http://localhost:3456`) |
| `BETTER_AUTH_URL` | OAuth issuer (default same as API) |
| `MCP_PUBLIC_URL` | Public MCP URL for resource metadata |
| `TUDU_API_RESOURCE_URL` | RFC 8707 resource identifier for tokens |

## Connect clients

### Cursor / Claude Desktop

Add an MCP server with URL `http://localhost:3100/mcp`. Complete OAuth when prompted.

Discovery:

- Authorization server: `{BETTER_AUTH_URL}/.well-known/oauth-authorization-server`
- Protected resource: `{MCP_PUBLIC_URL}/.well-known/oauth-protected-resource`

### ChatGPT

Register the app URL from your deployed MCP host and complete dynamic client registration against Tudu OAuth.

## Deploy (Dokploy)

Build with `apps/mcp/Dockerfile`. Set `TUDU_API_URL`, `BETTER_AUTH_URL`, `MCP_PUBLIC_URL`, and `TUDU_API_RESOURCE_URL` to your production URLs.
