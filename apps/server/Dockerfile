# The API, run from its TypeScript sources with tsx (no bundling, so the workspace packages resolve as in development).
# Built for the host's own architecture (arm64 on the Dokploy box). Debian rather than Alpine since chunk 13: the
# embedding model runs on ONNX Runtime, whose Linux builds need glibc.
FROM node:22-bookworm-slim
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
# The close-matches model, fetched once here so the API starts with no network to its host (EMBEDDINGS_OFFLINE).
ENV EMBEDDINGS_MODEL_DIR=/app/models EMBEDDINGS_OFFLINE=1
RUN node --import tsx apps/server/src/embeddings/fetch-model.ts
WORKDIR /app/apps/server
EXPOSE 3456
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s CMD node -e "fetch('http://127.0.0.1:3456/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"
CMD ["sh", "-c", "pnpm migrate && pnpm start"]
