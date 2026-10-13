# apps/api — scoped rules (root CLAUDE.md still applies)

## Layout (feature folders in `src/<feature>/`)

- `<feature>-router.ts` -> `-controller.ts` -> `-service.ts` -> `-repository.ts`. Tests sit beside each file (`*.test.ts`).
- Routers only wire `validate({ body|params|query: <schema from @note-taking-app/shared> })`, `requireAuth`, and controllers wrapped in `asyncHandler` (`src/middleware`).
- Controllers: read already-validated input, call a service, set the status. No business rules, no Prisma.
- Services own business rules, ownership checks, and `prisma.$transaction` for multi-table writes.
- Repositories are the only layer importing Prisma; always `select` explicit columns. Services map to shared DTOs; never return raw Prisma models.

## Errors and logging

- Throw `AppError(code, status, message)` (`src/errors`); `middleware/error-handler.ts` formats the payload. Error codes live in `packages/shared/src/errors`.
- Use `logger` (pino), not `console.*` (the OTP console log is the only exception). Never log passwords, OTPs, tokens, or request bodies.

## Data rules

- Soft delete only (`deletedAt`); reads filter `deletedAt: null` unless explicitly reading trash.
- FTS via `prisma.$queryRaw` tagged templates only (see `notes-search/notes-search-repository.ts`); never `$queryRawUnsafe`.
- Schema changes: see `packages/db/CLAUDE.md`.

## Tests (vitest + supertest)

- Router tests: build the app with `makeTestEnv()` from `src/test-helpers/test-env.ts`; mock the service layer; assert status code and error payload shape exactly.
- Service tests mock the repository; repository tests mock the Prisma client. Cover every spec scenario and each error code.
- Run: `pnpm --filter @note-taking-app/api test` and `pnpm run typecheck`.
