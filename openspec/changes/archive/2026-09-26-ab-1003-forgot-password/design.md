# Design

## Context

See `proposal.md` - Why. Existing auth (`apps/api/src/auth/`) already establishes the patterns this design reuses:
- `AuthService` (`auth-service.ts`) hashes/verifies passwords via `bcrypt` (`password.ts`, `SALT_ROUNDS = 12`) and normalizes email via `normalize-email.ts`.
- `AppError(code, status, message)` + central error middleware is the only error path; no empty catches.
- Login already defeats email enumeration by hashing against a `DUMMY_PASSWORD_HASH` on an unknown email so the response and its timing don't differ (see `auth-service.ts`) - `forgot-password` and `reset-password` need the same discipline.
- Request contracts live in `packages/shared/src/auth/auth-contracts.ts` as Zod schemas + inferred types (`registerRequestSchema`, `loginRequestSchema`, etc.), consumed by both `apps/api` routes and (eventually) `apps/web`.
- `RefreshToken` (`packages/db/prisma/schema.prisma`) is the existing precedent for a hash-only, single-use, expiring token row tied to a `userId` with a `@@index([userId])`.

## Goals / Non-Goals

**Goals:**
- Let a user regain access after a forgotten password using only in-repo capabilities (no outbound email).
- Reuse existing password-hashing, error-handling, validation, and enumeration-resistance patterns rather than inventing new ones.

**Non-Goals:**
- Revoking the user's other sessions/refresh-token families on reset (explicitly deferred per proposal).
- Any dedicated brute-force guard beyond the existing general rate limiter on `/auth` (explicitly deferred per proposal).
- Any real email/SMS delivery integration.

## Decisions

**OTP storage: new `PasswordResetOtp` Prisma model, not reuse of `RefreshToken`.**
A refresh token is a long random string; an OTP is a short 6-digit code the user types by hand, with different lifetime (short, ~10 min) and different consumption semantics (single verify against email, not a bearer cookie). Reusing `RefreshToken` would overload one model with two unrelated lifecycles. New model:
```prisma
model PasswordResetOtp {
  id          String    @id @default(uuid())
  userId      String
  otpHash     String
  expiresAt   DateTime
  consumedAt  DateTime?
  createdAt   DateTime  @default(now())

  user User @relation(fields: [userId], references: [id])

  @@index([userId])
}
```
Only the bcrypt hash of the OTP is stored (same `hashPassword`/`verifyPassword` helpers in `password.ts`, reused as-is since bcrypt hash/compare works for any string, not just passwords) - never the raw code, mirroring how `passwordHash` and `tokenHash` are handled elsewhere.

**"At most one valid OTP per user": invalidate on issuance, not on a background job.**
When `forgot-password` issues a new OTP, the service deletes (or marks consumed) any existing unconsumed `PasswordResetOtp` rows for that `userId` in the same transaction that creates the new row. This avoids needing a cleanup job and keeps the invariant enforced at write time, the same way refresh-token rotation enforces "family never has more than one currently-valid token" atomically.

**Enumeration resistance: mirror the existing dummy-hash technique.**
`forgot-password` always does a `bcrypt`-cost-equivalent amount of work and returns the same response whether or not the email exists - e.g. computing a hash against a fixed dummy value when the user is not found, exactly as `verifyCredentials` does with `DUMMY_PASSWORD_HASH`. `reset-password` returns the same generic `401` (`code: "INVALID_OTP"` or similar) for unknown email, wrong OTP, and expired/consumed OTP alike, so no branch of the response reveals which case occurred.

**OTP generation: 6-digit numeric via `crypto.randomInt`, not a library.** No new npm dependency - Node's built-in `crypto.randomInt(0, 1_000_000)` zero-padded to 6 digits is sufficient and keeps this consistent with the "reference existing patterns before introducing new packages" rule. Rejected: pulling in an OTP-specific package, which would add a dependency for something `crypto` already covers.

**Contracts:** add `forgotPasswordRequestSchema`, `resetPasswordRequestSchema` (and a generic ack response, e.g. `{ message: string }`) to `packages/shared/src/auth/auth-contracts.ts` alongside the existing schemas, following the same `z.object` + `z.infer` shape used by `registerRequestSchema`/`loginRequestSchema`.

**Routing:** two new handlers in `apps/api/src/routes/auth-router.ts` (`POST /auth/forgot-password`, `POST /auth/reset-password`), following the existing `validate(schema, "body")` + `asyncHandler` pattern; service logic added to `AuthService` (or a sibling `PasswordResetService` if `AuthService` would otherwise grow two unrelated responsibilities - final split is an implementation-time call, not a spec-level concern).

**OTP delivery: plain `console.log`, not the app's `logger` (pino).** Sending a real email is out of scope for this change (and for the project - see proposal.md); the console is the OTP's only delivery channel, standing in for the email that will never be sent. The structured `logger` is configured with a level (e.g. silent in tests, info/warn in some deployments) and exists to record app events, not to deliver user-facing codes - routing the OTP through it risks the code being silently dropped whenever the log level is turned down. A direct `console.log` guarantees the OTP is always visible regardless of logger configuration.

## Risks / Trade-offs

- **6-digit OTP is brute-forceable in principle** (1e6 space) -> accepted per proposal (no dedicated guard); the general `/auth` rate limiter still applies to `reset-password` like every other auth endpoint.
- **No session revocation on reset** means a leaked old access token (up to 15 min) or an already-issued refresh token remains valid after a password reset -> accepted per proposal as explicitly deferred; can be layered on later without changing this design's data model.
- **Console-logged OTP is only reachable by whoever can read server logs** (e.g. developer/operator in this project's current deployment model) -> acceptable given the project's explicit "no real email delivery" constraint; this is a deliberate stand-in, not a production delivery mechanism.

## Migration Plan

- Add `PasswordResetOtp` model to `packages/db/prisma/schema.prisma`, run `prisma migrate dev` to generate and apply the migration (adds one table + index, no changes to existing tables).
- Purely additive: no existing endpoint, model, or column changes. Rollback = revert the migration and remove the two new routes/schemas; no impact on register/login/refresh/logout.
