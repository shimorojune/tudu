# Tudu's MCP server, run from its TypeScript sources with tsx like the API. It keeps no data: every tool calls the
# API with the caller's own bearer, so it only needs to reach the API over the Dokploy network.
FROM node:22-bookworm-slim
ENV NODE_ENV=production SKYBRIDGE_TELEMETRY_DISABLED=1 __PORT=3457
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc tsconfig.base.json ./
COPY apps/mcp/package.json apps/mcp/
RUN pnpm install --frozen-lockfile --prod --filter @tudu/mcp... && pnpm store prune
COPY apps/mcp apps/mcp
WORKDIR /app/apps/mcp
EXPOSE 3457
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD node -e "fetch('http://127.0.0.1:3457/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"
CMD ["node", "--import", "tsx", "src/index.ts"]
