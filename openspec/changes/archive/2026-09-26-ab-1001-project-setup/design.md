# Design

## Context

See [proposal.md](./proposal.md) for motivation. The repository has no `apps/`, `packages/`, Prisma project, Docker setup, git hooks, CI, or `.claude/agents/` yet — only CLAUDE.md and the OpenSpec/opsx tooling exist. This design covers how to lay out the workspace and tooling that every later ticket depends on.

## Goals / Non-Goals

**Goals:**

- A pnpm workspace where `apps/api`, `apps/web`, `packages/shared`, `packages/config`, and `packages/db` resolve, build, lint, and test cleanly with no application code yet.
- A local Postgres 16 instance reachable via Docker Compose, plus dev/CI-oriented container images for `apps/api` and `apps/web`.
- A commit-time quality gate (Husky + commitlint) and a PR-time quality gate (GitHub Actions) that both run the same build/lint/test checkpoints.
- Six read-only `.claude/agents/*.md` reviewers scoped to security, code quality, Prisma safety, and test coverage, split by backend/frontend where the concern differs.
- An `apps/api` request pipeline (Helmet, rate limiting, pino logging, central error handling, 404, health check) that every future route runs through unmodified.
- An `apps/web` application shell (feature-folder structure, routing, error boundary, 404 page, global providers, shadcn/ui baseline) that every future feature is built inside.
- Auto-generated OpenAPI documentation for `apps/api`, sourced from `packages/shared` Zod schemas, browsable via Swagger UI outside production.
- Every task implemented test-first: a failing test exists before the code that makes it pass, for every task where there is behavior to test.

**Non-Goals:**

- No Prisma models, migrations, or seed data (schema stays empty — `prisma init` only, per the proposal).
- No production deployment target, orchestration (k8s/ECS/etc.), or production Dockerfile hardening — the Dockerfiles here are dev/CI-oriented.
- No feature-specific routes, screens, or business logic (auth, notes CRUD, search) — only the shell every feature will be built inside.
- No changes to CLAUDE.md's existing conventions; this change implements them, it doesn't revise them.

## Decisions

**Workspace layout — separate `packages/db` from `packages/shared`.**
`packages/shared` holds only Zod schemas and inferred TS types (no runtime DB dependency), while `packages/db` owns `prisma/schema.prisma` and the generated Prisma client. Alternative considered: put the Prisma schema directly under `apps/api`. Rejected because a dedicated `packages/db` lets the generated client be imported by any future workspace member (e.g. a CLI or worker) without pulling in Express, and keeps `packages/shared` free of a Prisma dependency that `apps/web` would otherwise transitively receive.

**`packages/config` for shared tsconfig/ESLint/Prettier base.**
Alternative considered: duplicate config per package (simpler initially, but drifts fast and violates the "no duplicated conventions" spirit of CLAUDE.md). Each package extends the shared base and only overrides what it genuinely needs (e.g. `apps/web`'s JSX/React-specific ESLint rules).

**Docker is dev/CI-oriented, not a production artifact.**
`docker-compose.yml` provides Postgres 16 for local dev. `apps/api/Dockerfile` and `apps/web/Dockerfile` are multi-stage (`node:22-alpine` builder + slim runtime stage) so they're usable in CI or by a future deployment ticket, but hardening (non-root user tuning, distroless, secrets management) is deferred to whichever ticket actually introduces a deployment target.

**Commitlint needs a custom rule for the `AB-<number>` ticket reference.**
`@commitlint/config-conventional` alone doesn't understand ticket references. Decision: extend the conventional config with a custom rule (a `commitlint.config.js` function rule, or a small custom plugin) that requires the header to end with `AB-\d+`. Alternative considered: encode the ticket as a footer/trailer instead of the header — rejected because CLAUDE.md's example format (`feat(scope): description AB#ticket`) puts it inline in the subject line, and this change already fixed that as `AB-1001`-style during exploration.

**CI provisions a Postgres service container now, even though nothing queries it yet.**
The workflow uses a `postgres:16` GitHub Actions service container alongside install/build/lint/test. Nothing exercises it in this change (no migrations exist), but every subsequent ticket will need it, and adding it now avoids a second CI-design pass later. This is infrastructure, not scope creep — it changes no application behavior.

**Sequencing: enable enforcement only after the scripts they gate exist and pass.**
Husky's pre-commit hook and the CI workflow both run `pnpm build && pnpm lint --max-warnings 0 && pnpm test`. Those scripts must exist and pass against the empty scaffold _before_ the hook/workflow is wired to enforce them, or this change would lock out its own remaining commits. Task ordering (see tasks.md) puts workspace scaffolding first, quality gates last.

**Review subagents are restricted to `Read`, `Grep`, `Glob` only.**
No `Edit`, `Write`, or `Bash` access, so invoking any of the six reviewers can never mutate the repo or run arbitrary commands — they can only inspect files and report findings, matching the spec's "read-only" requirement. `test-coverage-reviewer` maps spec scenarios (in `openspec/changes/*/specs/**/*.md`) to test files it can find via `Grep`/`Glob`, without executing the test suite itself.

**API error handling centralizes on `AppError` + one middleware, not per-route try/catch.**
Routes are wrapped in an async-handler helper that forwards rejected promises to `next()`, and a single error-handling middleware (registered last) maps `AppError` instances to their declared status/code and everything else to a generic 500. Alternative considered: per-route try/catch — rejected because CLAUDE.md already mandates "async handlers + central error middleware" and "never swallow errors with empty catch blocks," and a single middleware is the only way to guarantee that consistently as features are added later.

**Rate limiting is global and permissive by default, not per-route from day one.**
A single `express-rate-limit` instance (e.g. 100 requests/15 min per IP) applies to the whole API. Alternative considered: per-route limits now (e.g. stricter on auth). Rejected as premature — there are no auth routes yet; a feature ticket that needs a stricter limit for a sensitive endpoint can layer an additional limiter on top without changing this baseline.

**Frontend routing uses React Router.**
Not specified anywhere in CLAUDE.md. Decision: React Router (v7), the conventional pairing with Vite + React, needed to give the 404 page and route-level error boundary somewhere to attach. Alternative considered: TanStack Router (pairs thematically with TanStack Query) — deferred; React Router is the lower-risk, more broadly documented default and nothing in the spec depends on TanStack Router specifically.

**shadcn/ui is initialized now, but only with its baseline components.**
Running `shadcn init` plus a small set of primitives (button, input, dialog, etc.) now means features don't each re-run the CLI with slightly different config. Only components actually needed by the app shell (e.g. for the 404 page or error boundary fallback) are added in this change; the rest are added on demand by feature tickets.

**The error response shape is a shared type, not per-endpoint ad hoc JSON.**
`{ code, message, details? }` is defined once in `packages/shared` and used by the central error middleware for `AppError`, Zod validation failures, and generic 500s alike, and consumed on the frontend by the API client's error-normalization step. Alternative considered: let each error path shape its own JSON body — rejected because it would force the frontend API client to special-case every error source instead of handling one shape, and violates CLAUDE.md's "never duplicate types" rule the moment a second endpoint needs to describe an error.

**Env validation happens once, at process startup, via a Zod schema — not scattered `process.env` reads.**
A single `env.ts` (or similar) in `apps/api` parses and validates `process.env` against a Zod schema at import time and exports a typed, validated config object; the rest of the app imports from there instead of touching `process.env` directly. This fails fast on a missing/malformed variable instead of surfacing a confusing runtime error deep in a request handler.

**CORS allowlist is explicit and configurable, not a wildcard.**
The allowed origin(s) come from an environment variable (defaulting to the local web app's dev origin), not `*` — matching the fact that this API is intended to be called only by `apps/web`, not by arbitrary third-party origins (CLAUDE.md's out-of-scope list excludes public/partner API access for now).

**The frontend API client is a thin wrapper, not a full SDK.**
A single module wraps `fetch` (or a minimal client) with the API's base URL and response/error normalization (mapping the shared `ErrorResponse` shape into something TanStack Query's `error` state can use directly). It does not attempt request/response caching itself — that's TanStack Query's job — and it does not yet handle auth-token attachment/refresh, since no auth exists yet; that lands with the auth ticket as an addition to this same client module.

**QueryClient defaults are chosen once and documented, not left to library defaults.**
Reasonable, conservative defaults (e.g. `retry: 1`, a non-zero `staleTime` to avoid refetch storms, `refetchOnWindowFocus: true` for a note-taking app where staleness across tabs matters) are set centrally so every feature's queries behave predictably unless a query has a specific reason to override them.

**Accessibility gets a linting baseline and root-layout landmarks now, not a per-feature afterthought.**
`eslint-plugin-jsx-a11y` (or equivalent) is added to the shared ESLint config from `packages/config` so every feature inherits the same accessibility linting automatically, and the root layout gets a skip-to-content link and semantic landmarks (`<main>`, `<nav>`) once, rather than each feature re-solving it.

**API docs are generated from `packages/shared` Zod schemas, not hand-written.**
An OpenAPI generator for Zod (e.g. `@asteasolutions/zod-to-openapi`) builds the spec from the same schemas the API already uses for validation, served via `swagger-ui-express`. Alternative considered: hand-written OpenAPI YAML/JSON — rejected because it duplicates the Zod schemas as a second source of truth that drifts the moment a schema changes, which is exactly the duplication CLAUDE.md's "never duplicate types" rule exists to prevent.

**The docs endpoint is registered only outside production.**
Not stated anywhere in CLAUDE.md, so this is a judgment call: the docs endpoint checks the validated env config's environment and is not registered at all (not just hidden behind auth) when it reads `production`, since this API has no public/partner consumers yet (out of scope per CLAUDE.md) and there's no reason to expose the full endpoint surface and schema shapes publicly. Revisit if a later ticket introduces a legitimate need for a public-facing production API reference.

**Testing strategy: unit tests for pure logic, Supertest/component tests for behavior, TDD throughout.**
Every task in groups 3 (API app shell), 4 (API docs), and the web app shell group is implemented test-first: the failing test is written before the implementation that makes it pass, per the project's task-authoring rule. The split:

- **Unit tests (Vitest, no framework wiring)** for isolated logic: the `AppError` class, the env Zod schema, the shared `ErrorResponse` schema, the frontend API client's error-normalization function, and the commitlint custom ticket-reference rule.
- **Integration tests (Supertest against the Express app)** for anything that depends on the request pipeline: security headers, CORS, body limits, rate limiting, logging, the central error middleware's behavior end-to-end, 404s, the health check, and the docs endpoint's production gate.
- **Component tests (Vitest + Testing Library)** for frontend behavior that needs the DOM: the 404 page, both error boundaries, the loading state, and the skip-to-content link. Full Playwright e2e is deferred — there's no user-facing flow yet to click through end-to-end, only a shell.
- Scaffolding-only tasks with no behavior to assert (e.g. creating `pnpm-workspace.yaml`, running `shadcn init`) are verified by their command output, not by a test-first pair, matching the tasks-authoring guidance that a task without behavior "carries neither" a test nor documentation burden.

**`db:migrate` runs with `--skip-generate` for the same reason.**
`prisma migrate dev` auto-runs `prisma generate` afterward by default, which still hard-errors on a zero-model schema even when the migration/connection step itself succeeds. `--skip-generate` lets the script actually succeed end-to-end against the empty schema; it's a no-op once the first model lands (there's nothing to skip once `generate` can succeed).

**Graceful shutdown does not disconnect a Prisma client in this change.**
`prisma generate` hard-errors when the schema has zero models ("You don't have any models defined... nothing will be generated"), which is unavoidable given this change's own non-goal of shipping an empty schema. `packages/db` therefore cannot export a working `PrismaClient` yet. Alternative considered: add a throwaway placeholder model just to unblock `generate` — rejected (per user decision) because a workaround model tends to outlive the tooling limitation it was added for and would need a real migration to remove later. Graceful shutdown in this change drains the HTTP server and exits cleanly; the Prisma disconnect step is added when the first model/migration lands.

## Risks / Trade-offs

- [`openspec/config.yaml`'s `rules:` block is malformed (flat-indented, so the OpenSpec CLI reports "Invalid 'rules' field in config" and never surfaces `proposal`/`specs`/`design`/`tasks` rules to `openspec instructions`)] → Fix the YAML indentation as part of this change's tasks (a config/doc fix, not application code) so future changes get the intended per-artifact rules surfaced automatically instead of relying on a human re-reading the raw file.
- [Enabling Husky/CI enforcement before workspace scripts exist would block all commits, including this change's own remaining work] → Sequence tasks so `pnpm build`/`lint`/`test` pass against the empty scaffold before wiring Husky or CI to call them (see Decisions above).
- [Docker Compose's default Postgres port (5432) may collide with a developer's existing local Postgres install] → Make the host port configurable via `.env`/`.env.example`, defaulting to 5432, and document the override.
- [A custom commitlint rule for `AB-<number>` can be too strict (blocking legitimate messages) or too loose (accepting malformed ones)] → Add a couple of positive/negative example commit messages as part of verifying the commitlint config during implementation.
- [A global rate limit tuned for general traffic may be too strict once auth endpoints (login, OTP) land, or too loose to prevent credential-stuffing there] → Ship a conservative global default now and let the auth ticket layer a stricter per-route limiter on top; this change does not attempt to guess auth-specific thresholds.
- [The API app-shell decisions (error middleware shape, logging fields) are easy to violate accidentally once feature routes are added] → `code-quality-reviewer-api` and `security-reviewer-api` (capability `review-subagents`) check for empty catch blocks, bypassed error middleware, and logged secrets on every subsequent change.
- [A Zod-to-OpenAPI generator could fail to represent a schema shape (e.g. a `.refine()`/`.transform()`) accurately, silently producing an incomplete or misleading doc entry] → Keep schemas simple and refinement-light where documentation matters, and verify the generated spec by rendering it in Swagger UI rather than trusting the generator output unchecked.

## Migration Plan

Purely additive — no existing tracked files are modified, and no database migrations exist yet (Prisma is initialized with an empty schema). Rollback is a straightforward `git revert` of this change's commits, in reverse order of the sequencing above (review subagents → CI → Husky/commitlint → Docker → workspace scaffold), since later steps depend on earlier ones but not vice versa.

## Open Questions

- Exact host port and `.env` variable names for the Docker Compose Postgres service — doesn't affect the spec or approach, can be settled during implementation as long as it's documented in `.env.example`.
