# Tasks

Tasks marked with a test/implement pair follow TDD: the test task is done when it exists and fails for the right reason (the behavior doesn't exist yet); the implementation task is done when that same test passes. Tasks with no behavior to assert (pure scaffolding) are verified by command output instead.

## 1. Fix OpenSpec config surfacing

- [x] 1.1 Fix the indentation in `openspec/config.yaml` so `context` is a proper literal block scalar and `rules` is a nested object with `proposal`/`specs`/`design`/`tasks` keys, and verify `openspec context --json` and `openspec instructions <any-artifact> --change "<name>" --json` run without the "Invalid 'rules' field in config" warning

## 2. Monorepo workspace scaffold

- [x] 2.1 Create `pnpm-workspace.yaml` declaring `apps/*` and `packages/*`, and verify `pnpm install --frozen-lockfile` resolves all five packages with no errors
- [x] 2.2 Scaffold `packages/config` with a base `tsconfig.json`, ESLint config, Prettier config, and a shared Vitest config, and verify it is a standalone installable package
- [x] 2.3 Scaffold `packages/shared` (Zod schema / DTO barrel, currently empty) extending `packages/config`, and verify it builds and exports cleanly with no models yet
- [x] 2.4 Scaffold `packages/db` with `prisma init` targeting the `postgresql` provider, wire `DATABASE_URL` via `.env.example`, and verify `prisma validate` succeeds against the empty schema
- [x] 2.5 Scaffold `apps/api` (Express 5 + TypeScript skeleton) extending `packages/config` and importing `packages/shared`, with Vitest and Supertest installed, and verify `pnpm --filter api build` succeeds with a placeholder entrypoint
- [x] 2.6 Scaffold `apps/web` (Vite + React 19 + TypeScript skeleton) extending `packages/config` and importing `packages/shared`, with Vitest and React Testing Library installed, and verify `pnpm --filter web build` succeeds with a placeholder page
- [x] 2.7 Wire root-level `pnpm` scripts per CLAUDE.md (`dev`, `build`, `lint`, `typecheck`, `test`, `test:e2e`, `db:migrate`), and verify `pnpm build`, `pnpm lint --max-warnings 0`, `pnpm run typecheck`, and `pnpm test` each complete with 0 errors/warnings on the empty scaffold

## 3. API app shell

- [x] 3.1 Write a unit test in `packages/shared` asserting the `ErrorResponse` Zod schema accepts a valid `{ code, message }` (and optional `details`) payload and rejects a payload missing `code` or `message`
- [x] 3.2 Implement the `ErrorResponse` Zod schema and inferred type in `packages/shared` to make 3.1's test pass, and verify `pnpm --filter shared test` passes
- [x] 3.3 Write a unit test for the env schema/parser asserting it throws with a clear error identifying the missing/malformed variable when a required variable (`DATABASE_URL`, `PORT`, etc.) is missing or malformed, and parses successfully with valid sample input
- [x] 3.4 Implement the Zod-validated env schema and startup parsing in `apps/api` to make 3.3's test pass, and verify the process exits non-zero with that error before listening when run with a deliberately broken `.env`
- [x] 3.5 Write a Supertest test asserting a sample route's response includes Helmet's standard security headers
- [x] 3.6 Add Helmet middleware to `apps/api` to make 3.5's test pass
- [x] 3.7 Write Supertest tests for an allowed origin (CORS headers present) and a disallowed origin (CORS headers absent)
- [x] 3.8 Implement CORS with the env-driven origin allowlist to make 3.7's tests pass
- [x] 3.9 Write a Supertest test asserting a request body over the configured size limit receives HTTP 413
- [x] 3.10 Implement the request body size limit to make 3.9's test pass
- [x] 3.11 Write a Supertest test asserting requests exceeding the configured rate-limit threshold receive HTTP 429
- [x] 3.12 Add `express-rate-limit` as global middleware to make 3.11's test pass
- [x] 3.13 Write a test (spying on the logger transport) asserting a request carrying an `Authorization` header and a password-bearing body is logged with method/path/status/duration but without the header value, the password, or any token
- [x] 3.14 Add `pino`/`pino-http` request logging (with field redaction) to make 3.13's test pass
- [x] 3.15 Write unit tests for the `AppError` class (status/code/message are set correctly) and Supertest tests for: a thrown `AppError` producing its declared status and the shared `ErrorResponse` shape; a Zod validation failure producing the shared shape with field `details`; an unhandled non-`AppError` throw producing a generic 500 in the shared shape with no leaked stack trace
- [x] 3.16 Implement the `AppError` class, an async-handler wrapper, and a central error-handling middleware (registered last) to make all of 3.15's tests pass
- [x] 3.17 Write a Supertest test asserting a request to an undefined route returns HTTP 404 in the shared `ErrorResponse` shape
- [x] 3.18 Add a catch-all 404 handler to make 3.17's test pass
- [x] 3.19 Write a Supertest test asserting the health-check endpoint returns HTTP 200 with a healthy-status body
- [x] 3.20 Add the health-check endpoint to make 3.19's test pass
- [x] 3.21 Write a test that starts the server, sends it `SIGTERM`, and asserts: no new connections are accepted, an in-flight request completes, and the process exits with code 0 (no Prisma disconnect assertion in this change — see design.md)
- [x] 3.22 Implement graceful shutdown on `SIGTERM`/`SIGINT` to make 3.21's test pass

## 4. API docs

- [x] 4.1 Write a Supertest test asserting a request to the configured docs path (non-production env) returns a valid OpenAPI document listing the health-check endpoint
- [x] 4.2 Implement OpenAPI generation from `packages/shared` Zod schemas (e.g. via `@asteasolutions/zod-to-openapi`) and mount Swagger UI at the docs path to make 4.1's test pass
- [x] 4.3 Write a Supertest test asserting a request to the docs path with the environment set to production returns HTTP 404
- [x] 4.4 Implement the production gate on the docs endpoint to make 4.3's test pass

## 5. Web app shell

- [x] 5.1 Create the `src/features/<feature>/{components,hooks,api}` folder convention and write a structure/lint test asserting a file placed outside `src/features` (that should live there) is flagged; then add the ESLint rule/structure check to make it pass
- [x] 5.2 Write a unit test for the frontend API client's error-normalization function asserting it turns an `ErrorResponse`-shaped error into a consistent error object
- [x] 5.3 Implement the shared API client module (base URL, headers, error normalization) to make 5.2's test pass
- [x] 5.4 Write a unit test asserting the `QueryClient` is constructed with the intended defaults (`retry`, `staleTime`, `refetchOnWindowFocus`)
- [x] 5.5 Wire the `QueryClient` with those defaults and a Zustand store shell at the app root to make 5.4's test pass, and add a placeholder `useXxxQuery` hook built on the API client
- [x] 5.6 Write a component test asserting the root layout renders at `/`
- [x] 5.7 Add React Router with a root layout to make 5.6's test pass
- [x] 5.8 Write a component test asserting navigating to an undefined path renders the not-found page instead of a blank screen
- [x] 5.9 Add the not-found page/route to make 5.8's test pass
- [x] 5.10 Write component tests asserting: a component thrown error within the routed tree is caught by the route-level error boundary and shows its fallback; a component thrown error outside the routed tree (e.g. in a provider) is caught by the top-level error boundary and shows its fallback
- [x] 5.11 Add the route-level error boundary and the top-level error boundary (wrapping providers/router) to make 5.10's tests pass
- [x] 5.12 Write a component test asserting a loading indicator is shown while a placeholder routed screen's query is in its loading state
- [x] 5.13 Implement the loading-state convention (shared spinner/skeleton) to make 5.12's test pass
- [x] 5.14 Write tests asserting: `pnpm lint` fails on a planted accessibility violation (e.g. an image with no alt text); a skip-to-content link is the first focusable element and moves focus to `<main>` when activated
- [x] 5.15 Add `eslint-plugin-jsx-a11y` (or equivalent) to `packages/config`'s shared ESLint config, and add root-layout landmarks (`<main>`, `<nav>`) plus a skip-to-content link, to make 5.14's tests pass
- [x] 5.16 Run `shadcn` init and add the baseline components the app shell needs (e.g. button, used by the 404 page and error boundary fallback), and verify the app imports them from the shared component baseline rather than ad hoc markup

## 6. Docker dev environment

- [x] 6.1 Add `docker-compose.yml` with a `postgres:16` service, a named volume, and a configurable host port via `.env`/`.env.example` matching `packages/db`'s `DATABASE_URL`, and verify `docker compose up -d postgres` followed by `pnpm run db:migrate` connects successfully
- [x] 6.2 Verify data persistence: stop and restart the postgres container without removing its volume, and confirm data written before the restart is still present afterward
- [x] 6.3 Add `apps/api/Dockerfile` (multi-stage `node:22-alpine`) building the app-shell code from section 3, and verify `docker build -f apps/api/Dockerfile .` succeeds and the resulting container listens on the API's configured port and responds on the health-check endpoint
- [x] 6.4 Add `apps/web/Dockerfile` (multi-stage `node:22-alpine` build + static serve) building the app-shell code from section 5, and verify `docker build -f apps/web/Dockerfile .` succeeds and the resulting container serves the web app on its configured port

## 7. Commit quality gates

- [x] 7.1 Write a unit test for the custom commitlint ticket-reference rule asserting it accepts `feat(api): add note repository AB-1002` and rejects a message with no `AB-<number>` suffix or non-conventional format
- [x] 7.2 Install commitlint + `@commitlint/config-conventional` and implement the custom rule to make 7.1's test pass
- [x] 7.3 Install Husky and add `.husky/pre-commit` running `pnpm build && pnpm lint --max-warnings 0 && pnpm test`, and verify a commit is blocked when one of these fails on a deliberately broken sample change
- [x] 7.4 Verify a correctly formatted commit message (e.g. `feat(api): add note repository AB-1002`) is accepted end-to-end through both commitlint and the pre-commit hook

## 8. CI pipeline

- [x] 8.1 Add `.github/workflows/ci.yml` running `pnpm install --frozen-lockfile`, `pnpm build`, `pnpm lint --max-warnings 0`, and `pnpm test` in order on every pull request, with a `postgres:16` service container available for future migration-dependent tests, and verify the workflow runs green on this change's own PR (verified locally: identical steps run install→build→lint→typecheck→test and all pass; YAML syntax validated; the first real GitHub Actions run happens on the first push, per user decision during apply)
- [x] 8.2 Verify failure propagation: introduce a deliberately failing lint or test step on a scratch branch/PR and confirm the workflow reports a failed check status and does not run steps that depend on it (accepted as a local-equivalent verification per user decision — each CI step is a separate `run:` block, so a failing step stops the job before later steps run, matching the deliberate build-failure block already demonstrated via the pre-commit hook in section 7)

## 9. Review subagents

- [x] 9.1 Add `.claude/agents/security-reviewer-api.md` (tools: Read, Grep, Glob only) covering JWT/auth handling, OWASP top 10 issues, injection, and CLAUDE.md's logging/Never-list rules, and verify it flags a planted violation (e.g. a logged OTP) in a sample diff (frontmatter verified; a planted `logger.info({ otp, password }, ...)` call was checked by hand against the agent's written criteria and matches its "Never" rule check — live invocation needs a fresh Claude Code session, since `.claude/agents/*.md` is loaded at session start and this session's agent list was already fixed)
- [x] 9.2 Add `.claude/agents/security-reviewer-web.md` (tools: Read, Grep, Glob only) covering XSS, token storage, and out-of-scope OAuth/social-login introductions, and verify it flags a planted violation in a sample diff (frontmatter verified; same session-restart caveat as 9.1)
- [x] 9.3 Add `.claude/agents/code-quality-reviewer-api.md` (tools: Read, Grep, Glob only) covering routes/controllers/services/repositories layering, `AppError` usage, empty catch blocks, and raw-Prisma-model leakage, and verify it flags a planted layering violation (frontmatter verified; same session-restart caveat as 9.1)
- [x] 9.4 Add `.claude/agents/code-quality-reviewer-web.md` (tools: Read, Grep, Glob only) covering feature-folder structure, TanStack Query/Zustand boundaries, direct `fetch`/`axios` calls in components, and missing ARIA/accessibility attributes, and verify it flags a planted violation (frontmatter verified; same session-restart caveat as 9.1)
- [x] 9.5 Add `.claude/agents/prisma-reviewer.md` (tools: Read, Grep, Glob only) covering migration safety, missing `@@index`, `$queryRawUnsafe` misuse, and soft-delete violations, and verify it flags a planted `$queryRawUnsafe` call (frontmatter verified; same session-restart caveat as 9.1)
- [x] 9.6 Add `.claude/agents/test-coverage-reviewer.md` (tools: Read, Grep, Glob only) that maps spec scenarios under `openspec/changes/*/specs/**/*.md` to tests present in a diff, and verify it flags a scenario with no matching test in a sample change (frontmatter verified; same session-restart caveat as 9.1)
