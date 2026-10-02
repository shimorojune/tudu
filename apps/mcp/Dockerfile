FROM node:24-alpine AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/mcp/package.json apps/mcp/
COPY packages/shared/package.json packages/shared/
COPY packages/ui/package.json packages/ui/
RUN pnpm install --frozen-lockfile --filter @tudu/mcp...
COPY . .
RUN pnpm --filter @tudu/mcp build

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/apps/mcp/dist ./dist
COPY --from=build /app/apps/mcp/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
EXPOSE 3100
CMD ["node", "dist/index.js"]
