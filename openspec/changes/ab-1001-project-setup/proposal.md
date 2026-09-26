# Proposal

**Ticket:** AB-1001

## Why

The repository currently has only CLAUDE.md, the OpenSpec workflow tooling, and the opsx commands/skills — there is no monorepo, no Prisma project, no containerized dev environment, no commit/CI quality gates, and no review subagents. Every subsequent ticket (auth, notes CRUD, search, sharing, version history) depends on this scaffolding existing first, so it must land before any feature work begins.

## What Changes

- Scaffold a pnpm workspace with `apps/api`, `apps/web`, `packages/shared`, `packages/config`, and `packages/db`.
- Initialize Prisma in `packages/db` against PostgreSQL 16 (`prisma init` only — connection wiring and empty schema, no models yet).
- Add `docker-compose.yml` with a `postgres:16` service for local development, plus a `Dockerfile` for `apps/api` and one for `apps/web`.
- Add Husky pre-commit hooks and commitlint, enforcing conventional commit format with an `AB-1001`-style ticket reference (e.g. `feat(scope): description AB-1234`) and blocking commits on failing build/lint/test.
- Add a GitHub Actions CI workflow that runs install → build → lint → test on every pull request.
- Add six `.claude/agents/*.md` review subagents: `security-reviewer-api`, `security-reviewer-web`, `code-quality-reviewer-api`, `code-quality-reviewer-web`, `prisma-reviewer`, `test-coverage-reviewer`.
- Scaffold the `apps/api` application shell: env validation at startup, graceful shutdown, request body size limits, CORS allowlist, Helmet, rate limiting, pino request logging, a central error-handling middleware built on `AppError`, a shared `{ code, message, details? }` error response shape, a 404 handler, and a health-check endpoint.
- Scaffold the `apps/web` application shell: the `src/features/<feature>/{components,hooks,api}` folder structure, React Router with a root layout, a route-level error boundary plus a top-level error boundary, a 404 page, loading states, a shared API client with error normalization, `QueryClient` defaults, an accessibility linting baseline with root-layout landmarks, and provider setup (TanStack Query client, Zustand store shell, shadcn/ui `init` baseline components).
- Add auto-generated OpenAPI documentation for `apps/api`, built from the same `packages/shared` Zod schemas used for request/response validation, served via Swagger UI outside production.
- Every task in this change is implemented test-first (TDD): a failing unit or integration test is written before the corresponding implementation, per CLAUDE.md's and the project's task-authoring rule.

## Capabilities

### New Capabilities

- `monorepo-workspace`: pnpm workspace layout (`apps/api`, `apps/web`, `packages/shared`, `packages/config`, `packages/db`) and Prisma initialization in `packages/db`.
- `dev-environment-docker`: `docker-compose.yml` Postgres 16 service and Dockerfiles for `apps/api` / `apps/web`.
- `commit-quality-gates`: Husky pre-commit hook and commitlint enforcing conventional commit format and ticket reference.
- `ci-pipeline`: GitHub Actions workflow running install/build/lint/test on pull requests.
- `review-subagents`: the six `.claude/agents/*.md` reviewer definitions and their scopes/tool restrictions.
- `api-app-shell`: the `apps/api` request pipeline boilerplate — security headers, rate limiting, logging, central error handling, 404 handling, health check.
- `web-app-shell`: the `apps/web` application shell boilerplate — feature-folder structure, routing, error boundary, 404 page, and global providers.
- `api-docs`: auto-generated, browsable OpenAPI documentation for `apps/api`, sourced from `packages/shared` Zod schemas.

### Modified Capabilities

None — this is the first change in the project; no existing specs exist yet.

## Impact

- **Affected code:** entire repo root (new `apps/`, `packages/`, `docker-compose.yml`, `Dockerfile`s, `.husky/`, `commitlint.config.*`, `.github/workflows/*.yml`, `.claude/agents/*.md`), plus the initial application-shell code inside `apps/api/src` and `apps/web/src`. No pre-existing application code is touched — there isn't any yet.
- **Dependencies added:** pnpm workspace tooling, Prisma CLI/client, Husky, commitlint (+ conventional-commit config), Docker base images (`node:22`, `postgres:16`), GitHub Actions runner images, `helmet`, `express-rate-limit`, `cors`, `pino` + `pino-http`, `react-router`, `@tanstack/react-query`, `zustand`, `shadcn/ui` CLI + its baseline component deps, `eslint-plugin-jsx-a11y` (or equivalent), an OpenAPI generator for Zod (e.g. `@asteasolutions/zod-to-openapi`) + `swagger-ui-express`, Vitest + Testing Library for frontend unit/component tests.
- **Systems:** local developer workflow (git hooks, `pnpm` scripts), CI (GitHub Actions), local Postgres via Docker. No production deployment or infrastructure is affected — Dockerfiles are dev/CI-only at this stage.
- **Rollback plan:** every artifact here is additive (new files/directories, no edits to existing tracked files other than none). Rollback is `git revert` of this change's commit(s); no data migrations are involved since Prisma is initialized with an empty schema and no database tables exist yet.
- **Schema/migrations:** none. Prisma is initialized (connection + config) but no models or migrations are created in this change.
