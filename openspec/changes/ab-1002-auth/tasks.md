# Tasks

## 1. Shared contracts (packages/shared)

- [x] 1.1 Write unit tests for `RegisterRequestSchema`, `LoginRequestSchema`, and `AuthUserDto`/`AuthResponseDto` (valid input parses; missing email, malformed email, and short password fail) in `packages/shared/src/auth/auth-contracts.test.ts`, and verify they fail against the not-yet-created schemas
- [x] 1.2 Implement `RegisterRequestSchema` (name, email, password min 8), `LoginRequestSchema` (email, password), and `AuthUserDto`/`AuthResponseDto` (id, name, email, accessToken — no password/hash field) in `packages/shared/src/auth/auth-contracts.ts`, export from `packages/shared/src/index.ts`, and verify the tests from 1.1 pass

## 2. Database schema

- [x] 2.1 Add `User` and `RefreshToken` models to `packages/db/prisma/schema.prisma` per design.md's Session/rotation schema (fields, `@@index`/`@unique` on `User.email`, `RefreshToken.tokenHash`, `RefreshToken.familyId`, `RefreshToken.userId`)
- [x] 2.2 Run `prisma migrate dev --name add-user-auth` and verify the migration applies cleanly against a local database and `prisma generate` produces the updated client with no type errors

## 3. API: validation middleware and auth errors (shared foundation)

- [x] 3.1 Write a unit test for a generic `validate(schema, target)` Express middleware (valid body calls `next()` with parsed data attached; invalid body calls `next(AppError)` with status 422) in `apps/api/src/middleware/validate.test.ts`
- [x] 3.2 Implement `apps/api/src/middleware/validate.ts` and verify the test from 3.1 passes
- [x] 3.3 Add `cookie-parser` and its types to `apps/api/package.json`, mount it in `app.ts`, and verify `pnpm --filter api typecheck` passes

## 4. API: password hashing and token services

- [x] 4.1 Write unit tests for a password service (`hashPassword`/`verifyPassword`) covering a correct-password match and an incorrect-password mismatch, in `apps/api/src/auth/password.test.ts`
- [x] 4.2 Add `bcrypt` (+ `@types/bcrypt`) to `apps/api/package.json` and implement `apps/api/src/auth/password.ts`, and verify the tests from 4.1 pass
- [x] 4.3 Write unit tests for an access-token service (`signAccessToken`/`verifyAccessToken`) covering: a valid round-trip exposes exactly the `sub`/`iat`/`exp`/`jti` claims from design.md; an expired token is rejected; a token signed with a different algorithm (e.g. HS384) or `alg: "none"` is rejected even if `verify` is passed the correct secret, in `apps/api/src/auth/access-token.test.ts`
- [x] 4.4 Add `jsonwebtoken` (+ `@types/jsonwebtoken`) to `apps/api/package.json` and implement `apps/api/src/auth/access-token.ts` (`sign` with `algorithm: "HS256"`, `JWT_ACCESS_SECRET`, 15m expiry, `sub`/`jti` claims; `verify` with `algorithms: ["HS256"]` pinned explicitly), and verify the tests from 4.3 pass
- [x] 4.5 Write unit tests for a refresh-token service (`generateRefreshToken`, `hashRefreshToken`) covering that hashing the same raw value twice yields the same hash and hashing two different values yields different hashes, in `apps/api/src/auth/refresh-token.test.ts`
- [x] 4.6 Implement `apps/api/src/auth/refresh-token.ts` (random value via `crypto.randomBytes`, HMAC-SHA256 hash keyed by `JWT_REFRESH_SECRET`) and verify the tests from 4.5 pass
- [x] 4.7 Write unit tests for an email-normalization helper (`normalizeEmail`) covering trimming surrounding whitespace and lowercasing, in `apps/api/src/auth/normalize-email.test.ts`, and implement `apps/api/src/auth/normalize-email.ts`, and verify the tests pass

## 5. API: auth repository and session service

- [x] 5.1 Write unit tests (against a test database, following the project's existing Prisma test-setup pattern) for a `RefreshTokenRepository` covering: create a session row; look up an active row by token hash; rotate a row (revoke old, insert new, same `familyId`); revoke a whole family; a revoked row is excluded from "active" lookups, in `apps/api/src/auth/refresh-token-repository.test.ts`
- [x] 5.2 Implement `apps/api/src/auth/refresh-token-repository.ts` using a single `prisma.$transaction` for the rotate operation (revoke-old + insert-new as one commit), and verify the tests from 5.1 pass
- [x] 5.3 Write a unit test asserting rotation atomicity: when the transaction's insert step is made to fail (mock/injected failure), the presented token's row is NOT left revoked — the whole rotation rolls back — in `apps/api/src/auth/refresh-token-repository.test.ts` (same file as 5.1)
- [x] 5.4 Write unit tests for a `SessionService` covering: `startSession` issues an access token and a new refresh-token family; `refreshSession` rotates and returns a new access token on a valid token; `refreshSession` revokes the whole family and rejects on a reused/revoked token; `endSession` revokes only the presented token (and does not touch/invalidate any previously issued access token), in `apps/api/src/auth/session-service.test.ts`
- [x] 5.5 Implement `apps/api/src/auth/session-service.ts` composing the repository, password, access-token, and refresh-token services per design.md's rotation/reuse-detection decisions, and verify the tests from 5.4 pass

## 6. API: `/auth` routes

- [x] 6.1 Write supertest tests for `POST /auth/register` covering: successful registration returns 201 with user + access token and sets a refresh cookie (assert `HttpOnly`, `SameSite=Lax`, `Path=/auth` attributes on the `Set-Cookie` header) with no refresh token in the body; duplicate email returns 409, including a duplicate that differs only by case/whitespace from an existing user; invalid body returns 422, in `apps/api/src/routes/auth.test.ts`
- [x] 6.2 Write supertest tests for `POST /auth/login` covering: valid credentials return 200 with user + access token and a refresh cookie; wrong password and unknown email both return 401 with the same `code: "INVALID_CREDENTIALS"` body; invalid body returns 422 (same file as 6.1)
- [x] 6.3 Write supertest tests for `POST /auth/refresh` covering: valid refresh cookie returns 200 with a new access token and a new refresh cookie, and the old cookie's token becomes unusable; reused/revoked/missing/expired cookie returns 401 with `code: "UNAUTHENTICATED"` (same file as 6.1)
- [x] 6.4 Write supertest tests for `POST /auth/logout` covering: valid session returns 204, clears the cookie, and the presented refresh token subsequently fails reuse-detection as in 6.3; missing refresh cookie returns 401; an access token issued before logout still passes `requireAuth` after logout (until it expires) (same file as 6.1)
- [x] 6.5 Implement `apps/api/src/routes/auth-router.ts` (mounted at `/auth` in `app.ts`) wiring `validate()`, the shared Zod schemas, `SessionService`, and the refresh-cookie config (httpOnly, secure in prod, sameSite=lax, path=/auth, maxAge=7d) from design.md, and verify all tests from 6.1-6.4 pass
- [x] 6.6 Register the four `/auth` paths (request/response schemas, status codes) with the `OpenAPIRegistry` in `apps/api/src/docs/openapi.ts` and verify `GET /api-docs` renders them

## 7. API: `requireAuth` middleware

- [x] 7.1 Write unit tests for `requireAuth` covering: valid `Authorization: Bearer` access token calls `next()` with `req.user.id` set; missing header, malformed header, wrong-algorithm token, and expired/invalid token all call `next(AppError)` with status 401 and `code: "UNAUTHENTICATED"`, in `apps/api/src/middleware/require-auth.test.ts`
- [x] 7.2 Implement `apps/api/src/middleware/require-auth.ts` (extending the `Request` type with `user: { id: string }` in `apps/api/src/types/express.d.ts`) and verify the tests from 7.1 pass

## 8. API: CORS credentials and rate limiting

- [x] 8.1 Add `credentials: true` to the existing `cors()` config in `apps/api/src/app.ts` and add a supertest test asserting `Access-Control-Allow-Credentials: true` is present on a preflight response, and that a credentialed response is not issued for an origin outside `CORS_ALLOWED_ORIGINS`, in `apps/api/src/app.test.ts`
- [x] 8.2 Add a supertest test confirming a request to a `/auth` endpoint is subject to the existing global rate limiter (e.g. exceeding the configured limit against `/auth/login` returns 429), in `apps/api/src/routes/auth.test.ts` (same file as 6.1) — no new rate-limiting code, this only verifies the existing global middleware already covers `/auth`

## 9. End-to-end API verification

- [x] 9.1 Write a supertest integration spec covering the full backend flow end-to-end: register -> login -> refresh (new access token, old refresh token now unusable) -> reuse the old refresh token (family revoked, 401) -> a fresh login -> logout (refresh token revoked, prior access token still accepted by `requireAuth` until it expires), in `apps/api/src/auth/auth-flow.test.ts`, and verify it passes
- [x] 9.2 Verify `pnpm build`, `pnpm lint --max-warnings 0`, `pnpm run typecheck`, and `pnpm test --coverage` all pass with 0 errors/warnings and at least 80% coverage on the new `packages/shared` and `apps/api/src/auth` code
