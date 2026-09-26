# syntax=docker/dockerfile:1
FROM node:22-alpine AS base
WORKDIR /app
RUN corepack enable

FROM base AS builder
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/config/package.json packages/config/
COPY packages/shared/package.json packages/shared/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile
COPY packages/config packages/config
COPY packages/shared packages/shared
COPY apps/web apps/web
RUN pnpm --filter @note-taking-app/web... build

FROM base AS runner
ENV NODE_ENV=production
RUN npm install --global serve@14.2.6
COPY --from=builder /app/apps/web/dist /app/apps/web/dist

EXPOSE 4173
CMD ["serve", "-s", "apps/web/dist", "-l", "4173"]
