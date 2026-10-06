# CLAUDE.md

## Workflow

- For features, breaking changes, or architecture changes: use OpenSpec (/opsx:\*).
- Do not write production code without an approved change in openspec/changes/.
- Small bug fixes / typos / dependency bumps may skip the spec (see "Fast lane").
- All commits must follow conventional format: feat(scope): description AB#ticket.

## Commands (run from repo root)

- Install: `pnpm install --frozen-lockfile`
- Dev: `pnpm run dev` # api :4000, web :5173
- Build: `pnpm build` # 0 errors, 0 warnings
- Lint: `pnpm lint --max-warnings 0` # eslint + prettier --check
- Typecheck: `pnpm run typecheck` # tsc --noEmit across workspaces
- Test: `pnpm test` # vitest (api + web)
- Test Coverage: `pnpm test:coverage`
- E2E: `pnpm run test:e2e` # playwright; needs Postgres up (`docker compose up -d`) and `pnpm --filter @note-taking-app/web exec playwright install chromium` once. Applies migrations first (`pretest:e2e`), starts API :4000 + web :5173, report in `apps/web/playwright-report`, API console output (incl. the reset OTP) in `apps/web/e2e/.api.log`
- DB: `pnpm run db:migrate` # prisma migrate dev (local only)
- Spec: `openspec validate --strict`
- Single workspace: `pnpm --filter api test` or `pnpm --filter web test`

## Backend conventions (apps/api)

- Tech stack: Node.js 22 + Express 5 + TypeScript + Prisma ORM + PostgreSQL 16.
- Layering: routes -> controllers -> services -> repositories (Prisma). No business logic in routes or controllers.
- Validate every request body/params/query using Zod schemas from `packages/shared` via `validate()` middleware.
- Types and contracts: Import all DTOs and validation schemas exclusively from `packages/shared`. Never duplicate types.
- Soft delete: Set `deletedAt` timestamp only. Never physically delete note rows within the 30-day retention window.
- Auth: JWT access token (15m expiry) + refresh token (7-day expiry, persisted in DB).
- Search: Use PostgreSQL Full-Text Search (`tsvector`/`tsquery`) with result keyword highlighting. No external search services.
- Password reset / OTP: Generate secure OTP and log to console only (no actual email delivery).
- Use async handlers + central error middleware; throw `AppError(code, status, message)`. Never swallow errors with empty catch blocks.
- Prisma: All schema changes via `prisma migrate dev` (never edit an applied migration); use `select` to fetch only needed columns; add indexes with `@@index`.
- No raw SQL except parameterized `prisma.$queryRaw` tagged templates; never use `$queryRawUnsafe`.
- Wrap multi-table operations in `prisma.$transaction`.
- Never return raw Prisma models; map to DTO types from `packages/shared`.
- Logging: Use `logger` (pino). Never log passwords, OTPs, auth tokens, or sensitive request bodies.

## Frontend conventions (apps/web)

- Tech stack: React 19 + TypeScript + Vite + TanStack Query + Zustand + TipTap + shadcn/ui.
- Feature folders: `src/features/<feature>/{components,hooks,api}`.
- State management: Server state via TanStack Query hooks (`useXxxQuery` / `useXxxMutation`); client/UI state via Zustand. No direct `fetch` or `axios` calls inside components.
- Editor: Implement note editing via TipTap with debounced autosave.
- Types: Import all models and DTOs from `packages/shared`. No `any`. Components must be function components with explicit prop interfaces.
- Accessibility: Every interactive element must be keyboard-accessible and have proper ARIA attributes/labels.

## Definition of Done

- All tasks in `tasks.md` checked.
- Every spec scenario has at least one test (API supertest and/or Playwright UI).
- `openspec validate` passes cleanly against the implementation.
- `pnpm build` passes with 0 errors and 0 warnings.
- `pnpm lint --max-warnings 0` passes cleanly.
- `pnpm test:coverage` passes with all green (≥80% coverage on new code).
- All HTTP status codes and error payloads strictly match API contracts.
- No new `any`, `// @ts-ignore`, or `eslint-disable` comments.

## Never

- Read or print `.env*`, secrets, or `DATABASE_URL` values.
- Implement out-of-scope features: real-time collaborative editing, file/image attachments, OAuth/social login, folder nesting, or external search engines.
- Physically delete note records during standard operations (always use `deletedAt`).
- Send actual emails (OTPs must only be logged to console).
- Use `@latest` in install commands (pin all package versions).
- Duplicate TypeScript types or Zod schemas between frontend and backend.
- Force-push or push directly to `main`.
