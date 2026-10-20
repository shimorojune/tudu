# The API, run from its TypeScript sources with tsx (no bundling, so the workspace packages resolve as in development).
# Built for the host's own architecture (arm64 on the Dokploy box).
FROM node:22-alpine
ENV NODE_ENV=production
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc tsconfig.base.json ./
COPY apps/server/package.json apps/server/
COPY packages/db/package.json packages/db/
COPY packages/core/package.json packages/core/
RUN pnpm install --frozen-lockfile --prod --filter @tudu/server... && pnpm store prune
COPY apps/server apps/server
COPY packages/db packages/db
COPY packages/core packages/core
WORKDIR /app/apps/server
EXPOSE 3456
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD wget -qO- http://127.0.0.1:3456/health || exit 1
CMD ["sh", "-c", "pnpm migrate && pnpm start"]
