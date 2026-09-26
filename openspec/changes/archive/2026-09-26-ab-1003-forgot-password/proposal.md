# Proposal

## Why

AB-1003: Users who forget their password have no way to regain access to their account — there is no reset flow today, only register/login/refresh/logout. This blocks account recovery entirely once a password is lost.

## What Changes

- Add `POST /auth/forgot-password`: accepts an email, and — without revealing whether the email is registered — generates a 6-digit OTP for that user if they exist, stores only its hash, and logs the raw OTP to the console (no email is sent; the project has no email delivery capability).
- Add `POST /auth/reset-password`: accepts an email, OTP, and new password; verifies the OTP against the stored hash and its expiry, sets the new password hash, and consumes (invalidates) the OTP so it cannot be reused.
- Requesting a new OTP for a user invalidates any prior unconsumed OTP for that user (only the latest is valid), mirroring the "at most one currently valid token" discipline already used for refresh tokens.
- `forgot-password` always responds identically regardless of whether the email is registered (same status/body, comparable timing), consistent with the existing login enumeration protection.
- Existing sessions (refresh-token families) and access tokens are left untouched by a password reset — no revocation is introduced by this change.
- No new brute-force-specific rate limiting is introduced beyond the general limiter already applied to all `/auth` endpoints.

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
- `user-auth`: adds password-reset requirements (forgot-password request, OTP issuance and storage, reset-password verification and consumption) to the existing authentication capability.

## Impact

- **API**: two new endpoints, `POST /auth/forgot-password` and `POST /auth/reset-password`, added to `apps/api/src/routes/auth-router.ts`.
- **Shared contracts**: new Zod request/response schemas in `packages/shared` for both endpoints (no duplication of types between API and web).
- **Database**: new Prisma model for storing hashed OTPs (userId, otpHash, expiresAt, consumedAt), plus a migration via `prisma migrate dev` and an index on `userId`. No changes to `User` or `RefreshToken` models.
- **Backend**: new service logic (likely alongside `AuthService`) for OTP generation, hashing, verification, and password update; no changes to session/refresh-token rotation logic.
- **Out of scope**: no frontend UI is added by this change (backend/API only); a future change will build the forgot-password/reset-password screens against these endpoints.
- **Rollback**: the new endpoints and Prisma model are additive; rollback is reverting the migration and the added routes with no impact on existing register/login/refresh/logout behavior.
