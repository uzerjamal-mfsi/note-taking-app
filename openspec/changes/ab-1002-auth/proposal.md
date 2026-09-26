# Proposal

**Ticket:** AB-1002

## Why

The API and web app currently have no way to identify a user or protect an endpoint — every future feature (notes CRUD, sharing, search) needs an authenticated user to attach data to. AB-1002 delivers the foundational auth flow (register, login, logout, JWT + refresh) so downstream note features have a `User` to own their data and a `requireAuth` middleware to gate their routes.

## What Changes

- Add a `User` model (id, name, email (normalized: trimmed + lowercased, unique), passwordHash, timestamps) and a `RefreshToken` model (one row per active session, grouped into rotation "families", rotated atomically on each refresh, revocable) to the Prisma schema, with a migration.
- Add `packages/shared` Zod schemas + inferred types for register/login requests and the auth response DTO (user + access token), imported by both apps — no duplicated types.
- Add API endpoints under `/auth`:
  - `POST /auth/register` — name, email, password (min 8 chars) -> creates user (bcrypt-hashed password, normalized email, case-insensitive duplicate check), returns access token, sets refresh-token httpOnly cookie.
  - `POST /auth/login` — email, password -> verifies bcrypt hash, creates a new session (RefreshToken row), returns access token, sets refresh-token cookie. Unknown-email and wrong-password both return the same generic `401 INVALID_CREDENTIALS` response, including comparable response timing (dummy hash comparison on unknown email) to avoid user enumeration.
  - `POST /auth/refresh` — reads refresh cookie, atomically rotates it (revokes old row, inserts new row in the same transaction), returns a new access token and cookie. Reuse of an already-revoked refresh token revokes the entire session family (reuse detection).
  - `POST /auth/logout` — reads refresh cookie, revokes that session's RefreshToken row, clears the cookie. Does not and cannot revoke access tokens already issued for that session (stateless JWTs remain valid until natural 15-minute expiry).
- Add a `requireAuth` Express middleware that verifies the access token (JWT, HS256 only) and attaches the authenticated user (`req.user = { id }`) to the request, for reuse by future protected routes. Responds `401 UNAUTHENTICATED` on any missing/invalid/expired/wrong-algorithm token.
- Add a `bcrypt` dependency (hashing), a JWT signing/verification dependency, and `cookie-parser` (reading the httpOnly refresh cookie) to `apps/api`.
- Enable `credentials: true` on the existing CORS middleware, scoped to the explicit origins already in `CORS_ALLOWED_ORIGINS` (never a wildcard), so the browser can send/receive the refresh cookie. Combined with the refresh/logout cookie's `SameSite=Lax` attribute and those endpoints being POST-only, this is the CSRF mitigation — no separate CSRF token is introduced.
- Apply the existing global `express-rate-limit` middleware to `/auth` as it already does to every route; a dedicated, stricter per-endpoint brute-force policy for login/register is explicitly **deferred** to a follow-up ticket, not silently dropped.

Out of scope for this ticket (per CLAUDE.md and confirmed in exploration): OAuth/social login, email verification, password reset/OTP, "log out all devices" UI, a dedicated login/register rate-limit policy (deferred, see above). **Also explicitly out of scope, per review**: any `apps/web` work — register/login forms, the auth Zustand store, protected-route UI, `api-client.ts` credentialed-request/refresh-retry wiring. This ticket is backend/API auth infrastructure only; the frontend consumption of it is a separate, follow-up ticket.

## Capabilities

### New Capabilities

- `user-auth`: Registration, login, logout, JWT access tokens, and rotating/revocable refresh tokens (httpOnly cookie), including the reuse-detection and session-revocation behavior, and the `requireAuth` middleware contract used by future protected endpoints.

### Modified Capabilities

_None._ No existing spec's requirements change; `api-app-shell`'s CORS middleware gains a `credentials: true` config value but its documented requirements are unaffected.

## Impact

- **Schema/migrations:** New `User` and `RefreshToken` tables via `prisma migrate dev`; new indexes on `User.email` (unique) and `RefreshToken.userId` / `RefreshToken.tokenHash`.
- **New dependencies:** `bcrypt` (+ `@types/bcrypt`), a JWT library, `cookie-parser` (+ `@types/cookie-parser`) in `apps/api`.
- **API surface:** New `/auth/*` routes; new `requireAuth` middleware available to all future routers.
- **Config:** `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` env vars already exist in `env.ts`; adds refresh-token cookie name/TTL and bcrypt cost-factor config.
- **Frontend:** None in this ticket — no `apps/web` files are added or modified.
- **Rollback plan:** The change is additive (new tables, new routes, no modification of existing endpoints' behavior). Prisma does not support an automatic "down" migration, and CLAUDE.md prohibits editing an applied migration, so rollback is: revert the PR (the unused `User`/`RefreshToken` tables are harmless left in place — no existing code reads them); if the tables must actually be removed, author a **new** forward migration (`prisma migrate dev --name drop-user-auth`) that drops them, rather than touching the applied migration file. No existing data or endpoint is touched either way.
