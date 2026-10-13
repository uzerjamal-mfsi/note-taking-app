# 0002. JWT access tokens with DB-persisted, rotating refresh tokens

Status: Accepted.

## Context

The SPA needs stateless API authentication, but sessions must be revocable (logout, theft) and long-lived (7 days).

## Decision

- Access token: JWT HS256, 15 minutes, sent as `Authorization: Bearer`, kept only in web memory (`auth/access-token.ts`, `store/session-store.ts`).
- Refresh token: random 32 bytes, 7-day TTL, delivered as an `httpOnly`, `sameSite=lax`, `path=/auth` cookie (`secure` in production). Only its HMAC-SHA256 is stored in `RefreshToken` (`auth/refresh-token.ts`).
- Every refresh rotates the token within a `familyId`; reuse of a revoked token revokes the whole family (`auth/session-service.ts`, `refresh-token-repository.ts`).
- The web client restores the session on boot via `/auth/refresh` and retries once on 401 with a single-flight refresh (`apps/web/src/lib/api-client.ts`).

## Consequences

- Access tokens cannot be revoked before expiry (max 15 minutes of exposure); refresh tokens can.
- No XSS-readable long-lived credential in the browser; the refresh endpoint relies on `sameSite=lax` and cookie path rather than CSRF tokens.
- Revoked/expired refresh rows and used password-reset OTP rows are never garbage-collected.
- Two secrets (`JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`) must be provisioned per environment; compose supplies insecure local defaults.
