# syntax=docker/dockerfile:1
# Workspace packages (@note-taking-app/db, /shared) export raw .ts sources, so the API is run
# with tsx rather than a compiled dist/. The Prisma CLI is kept for `migrate deploy` on start.
FROM node:22-alpine
WORKDIR /app
RUN apk add --no-cache openssl && corepack enable

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/config/package.json packages/config/
COPY packages/shared/package.json packages/shared/
COPY packages/db/package.json packages/db/
COPY apps/api/package.json apps/api/
RUN HUSKY=0 pnpm install --frozen-lockfile

COPY packages/config packages/config
COPY packages/shared packages/shared
COPY packages/db packages/db
COPY apps/api apps/api
RUN pnpm --filter @note-taking-app/db run prisma:generate

ENV NODE_ENV=production
EXPOSE 4000
CMD ["sh", "-c", "pnpm --filter @note-taking-app/db exec prisma migrate deploy && pnpm --filter @note-taking-app/api exec tsx src/server.ts"]
