# Tasks

## 1. Shared contracts (packages/shared)

- [x] 1.1 Write failing tests in `packages/shared/src/auth/auth-contracts.test.ts` for a new `forgotPasswordRequestSchema` (valid email; rejects missing/malformed email) and verify they fail with "not defined"
- [x] 1.2 Add `forgotPasswordRequestSchema` (`{ email }`) and its inferred `ForgotPasswordRequest` type to `packages/shared/src/auth/auth-contracts.ts`, and verify the new tests from 1.1 pass
- [x] 1.3 Write failing tests for a new `resetPasswordRequestSchema` (valid email/otp/newPassword; rejects missing email, missing otp, missing password, and password under 8 chars) and verify they fail
- [x] 1.4 Add `resetPasswordRequestSchema` (`{ email, otp, newPassword }`) and its inferred `ResetPasswordRequest` type, plus a generic `authAckResponseSchema` (`{ message: string }`) / `AuthAckResponse` type for both endpoints' success bodies, and verify the tests from 1.3 pass
- [x] 1.5 Export the new schemas/types from `packages/shared`'s public entry point (matching how `registerRequestSchema` etc. are already exported) and verify `pnpm --filter shared build` and `pnpm --filter shared test` pass

## 2. Database (packages/db)

- [x] 2.1 Add a `PasswordResetOtp` model to `packages/db/prisma/schema.prisma` per design.md (userId, otpHash, expiresAt, consumedAt, createdAt, `@@index([userId])`, relation to `User`) and verify `prisma validate` (or `prisma migrate dev --create-only`) succeeds
- [x] 2.2 Run `pnpm run db:migrate` to generate and apply the migration locally, and verify the generated Prisma client exposes `prisma.passwordResetOtp`

## 3. API: forgot-password (apps/api)

- [x] 3.1 Write a failing Supertest test in `apps/api/src/routes/auth.test.ts` (or a new `forgot-password.test.ts`) asserting: a registered email returns `200` with a generic body and no OTP in the body; an unregistered email returns an identical status/body; a missing/malformed email returns `422`
- [x] 3.2 Implement OTP generation (`crypto.randomInt`, zero-padded 6 digits) and hashing (reusing `hashPassword`/`verifyPassword` from `apps/api/src/auth/password.ts`) in `AuthService` (or a new sibling service per design.md), including invalidating any prior unconsumed `PasswordResetOtp` row for the user before creating the new one, and verify 3.1 passes
- [x] 3.3 Wire `POST /auth/forgot-password` in `apps/api/src/routes/auth-router.ts` using `validate(forgotPasswordRequestSchema, "body")` + `asyncHandler`, logging the raw OTP to console via the existing `logger` only when a user is found, and verify 3.1's Supertest cases all pass end-to-end through the router
- [x] 3.4 Write and pass a unit test asserting the unregistered-email path takes comparable time to the registered-email path (mirroring the existing `DUMMY_PASSWORD_HASH` approach in `auth-service.ts`), and verify it passes

## 4. API: reset-password (apps/api)

- [x] 4.1 Write failing Supertest tests asserting: correct email+OTP+new password returns `200` and the user can subsequently log in with the new password; wrong OTP returns `401` with a generic invalid-OTP code; expired OTP returns the same `401`; already-consumed OTP returns the same `401`; unregistered email returns the same `401`; missing/short fields return `422`
- [x] 4.2 Implement OTP verification (hash compare + expiry + not-already-consumed check) and password update in the service layer, consuming the OTP (setting `consumedAt`) atomically with the password-hash update via `prisma.$transaction`, and verify the 4.1 tests pass
- [x] 4.3 Wire `POST /auth/reset-password` in `apps/api/src/routes/auth-router.ts` using `validate(resetPasswordRequestSchema, "body")` + `asyncHandler`, and verify all 4.1 Supertest cases pass end-to-end through the router
- [x] 4.4 Verify (via a Supertest case) that a password reset does not revoke or otherwise touch the user's existing refresh-token sessions, per design.md's non-goals

## 5. Integration verification

- [x] 5.1 Run `pnpm build`, `pnpm lint --max-warnings 0`, `pnpm run typecheck`, and `pnpm test --coverage`, and verify all pass with 0 errors/warnings and ≥80% coverage on the new code
- [x] 5.2 Run `openspec validate --strict` for this change and verify it passes cleanly
