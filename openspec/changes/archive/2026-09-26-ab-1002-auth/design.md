# Design

## Context

See proposal.md - Why. No `User` or session concept exists yet anywhere in the codebase — `apps/api` is currently an unauthenticated health/docs shell (helmet, cors, rate-limit, error-handler already in place; no `validate()` middleware, no Prisma models beyond the empty `schema.prisma` generator/datasource block yet). This is the first vertical slice through the API, so this design also fixes conventions (validation middleware shape, DTO mapping, protected-route middleware) that later note-CRUD work will reuse. This change is backend/API only — see proposal.md for why the `apps/web` consumption of this API is explicitly out of scope here.

## Goals / Non-Goals

**Goals:**
- Define the `User` / `RefreshToken` data model and the rotate-on-use, reuse-detected session lifecycle described in specs/user-auth.
- Define the concrete request/response contracts (Zod schemas in `packages/shared`) for register/login/refresh/logout.
- Define the `requireAuth` middleware contract that future protected routers (notes, etc.) will import.
- Establish the cookie/CORS configuration (`credentials`, cookie `sameSite`/`secure`) needed for a credentialed cross-origin caller (e.g. the web app at `:5173`) to use the refresh cookie against the API (`:4000`) in local dev and in production, and the CSRF posture that configuration implies.

**Non-Goals:**
- Any `apps/web` code — no forms, no auth Zustand store, no protected-route UI, no `api-client.ts` changes. This ticket delivers the API only; a follow-up ticket wires the frontend to it.
- Notes CRUD or any other protected resource — only the `requireAuth` contract they'll depend on.
- Password reset, OTP, email verification, OAuth/social login (explicitly out of scope per CLAUDE.md and the proposal).
- "Log out of all devices" / session-management UI — the data model supports revoking one session's chain; a bulk-revoke endpoint is not built here.
- A dedicated, stricter brute-force rate-limit policy for login/register — explicitly deferred (see the Decisions section below); the existing global `express-rate-limit` middleware still applies to `/auth` as it does to every route.

## Decisions

### JWT signing library: `jsonwebtoken`
The project has no JWT dependency yet (checked `apps/api/package.json`). `jsonwebtoken` is the de facto standard for Express/Node, has a simple synchronous `sign`/`verify` API, and needs no native compilation (unlike `argon2`, which was already ruled out for the same reason on the password-hashing decision). Alternative considered: `jose` — more modern, ESM-first, better suited to JWK rotation — but that flexibility isn't needed for two static HMAC secrets (`JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` already defined in `env.ts`), and `jsonwebtoken`'s ubiquity means far more prior art to reference. Access tokens are signed HS256 with `JWT_ACCESS_SECRET`; the refresh token stored/verified server-side is an opaque random value (see next decision), not a JWT, so `JWT_REFRESH_SECRET` is repurposed as the secret used only for hashing refresh tokens at rest (see below) rather than for signing a second JWT.

### JWT claims and algorithm
Access tokens carry exactly: `sub` (user id), `iat`, `exp` (issued-at + 15 minutes), and `jti` (a random token id, for log correlation only — access tokens are not individually revocable, see the Logout requirement). No role/permissions claims yet — there's no authorization model beyond "is this a valid user" in this ticket. `jsonwebtoken.verify` is called with `algorithms: ["HS256"]` explicitly set (never left to infer from the token header), which is what makes the "wrong algorithm" scenario in the Access token verification requirement possible: without pinning the allowed algorithm, a token crafted with `alg: "none"` or an attacker-chosen algorithm could bypass signature verification entirely (the classic JWT "alg confusion" vulnerability). This is a one-line defensive config, not a new architectural decision, but it's easy to omit by accident, so it's called out explicitly here and has its own test task.

### Refresh token representation: opaque random value, hashed at rest
The refresh token cookie value is a cryptographically random string (`crypto.randomBytes(32).toString("base64url")`), not a JWT. The `RefreshToken` table stores only `tokenHash` (HMAC-SHA256 of the raw value, keyed by `JWT_REFRESH_SECRET`), so a leaked database dump can't be replayed as a valid cookie. This mirrors why passwords are hashed, not encrypted: the server only ever needs to check equality, never recover the original value. Alternative considered: a signed refresh JWT carrying a session id, verified statelessly — rejected because rotation and reuse-detection need a server-side revocation check per token anyway, so a JWT's main benefit (stateless verification) doesn't apply and it would add a second signing scheme for no benefit.

### Session/rotation schema
```
User
  id            uuid  PK
  name          string
  email         string  unique, citext/lowercased
  passwordHash  string
  createdAt / updatedAt

RefreshToken
  id                 uuid  PK
  userId             uuid  FK -> User
  tokenHash          string  unique, indexed
  familyId           uuid    indexed  -- shared by a session's whole rotation chain
  revokedAt          datetime?
  replacedByTokenId  uuid?   FK -> RefreshToken (self)
  expiresAt          datetime
  createdAt          datetime
```
- **Login/register** creates a `RefreshToken` row with a fresh `familyId` (= its own id).
- **Refresh** looks up the row by `tokenHash`. If `revokedAt` is already set -> reuse detected: revoke every row sharing that `familyId` (`revokedAt = now()` on all of them), respond 401. Otherwise: inside a single `prisma.$transaction`, set `revokedAt = now()` and `replacedByTokenId` on the old row and insert a new row with the same `familyId`; only after both writes commit does the handler return the new raw value in a cookie. Wrapping both writes in one transaction is what satisfies specs/user-auth's atomic-rotation requirement — if the insert fails, the transaction rolls back the old row's revocation too, so a request never leaves the family with zero valid tokens because of a mid-rotation failure.
- **Logout** revokes only the presented row (`revokedAt = now()`); does not touch the rest of the family, so other devices' sessions are unaffected, but that one chain can no longer be refreshed (its tail is now revoked, which is exactly the "logged out" state).
- Indexes: `User.email` unique; `RefreshToken.tokenHash` unique (point lookup on every refresh); `RefreshToken.familyId` (bulk revoke on reuse); `RefreshToken.userId` (future "list my sessions").
- Expired-row cleanup (`expiresAt < now()`) is a periodic cleanup concern, not part of this change's request path — rows are simply excluded from valid-token lookups by the `expiresAt` check regardless of whether they've been swept.

### Cookie & CORS configuration
Refresh-token cookie: `httpOnly: true`, `secure: true` in production / `false` in local dev over http, `sameSite: "lax"`, `path: /auth`, `maxAge` = 7 days. `path: /auth` (rather than `/`) means the browser only attaches it to auth endpoints, narrowing the CSRF surface to `/auth/refresh` and `/auth/logout`. CORS gets `credentials: true` added to the existing `cors()` config in `app.ts`. `CORS_ALLOWED_ORIGINS` already enumerates explicit origins (not `*`), which is required for credentialed CORS to work at all — the browser rejects a credentialed response against a wildcard origin.

### CSRF strategy for the refresh cookie
No CSRF token is introduced. Three things already in this design combine to close the standard CSRF vector (a malicious page making the victim's browser send an authenticated request it didn't intend):
1. **`SameSite=Lax`**: a cross-site *navigation* (clicking a link) can carry a Lax cookie on a top-level GET, but a cross-site page's own `fetch`/form **POST** to `/auth/refresh` or `/auth/logout` does not carry it. Both of this capability's cookie-reading endpoints are POST-only, so this alone blocks the classic cross-site form/script attack.
2. **Credentialed CORS requires an explicit allow-listed origin**: even if a browser did attach the cookie, a cross-origin `fetch(..., {credentials: "include"})` from a page whose origin is not in `CORS_ALLOWED_ORIGINS` is blocked by the browser before the request's response is exposed to the attacker's script (and for a mutating request, the CORS preflight blocks it before it's even sent).
3. There is no state-changing `GET` endpoint that reads the cookie (the one case `SameSite=Lax` doesn't cover), so mitigation 1 has no gap to close here.
This is intentionally the minimal mitigation that already falls out of the rest of the design, not new infrastructure — a double-submit CSRF token would be redundant given 1-3 and is not built.

### Login timing and response uniformity
Beyond returning the same status/code/message for "unknown email" and "wrong password" (see specs/user-auth - Login), the login handler also performs a bcrypt comparison against a fixed dummy hash when the email lookup finds no user, so the two failure paths take comparably long. Without this, an attacker could distinguish "unknown email" from "wrong password" by response latency alone (bcrypt is deliberately slow; skipping it on the unknown-email path would make that branch consistently faster) even though the response bodies are identical.

### Validation middleware
No `validate()` middleware exists yet; this change introduces it (per CLAUDE.md: "Validate every request body/params/query using Zod schemas from `packages/shared` via `validate()` middleware"), as a small generic Express middleware factory `validate(schema: ZodSchema, target: "body" | "params" | "query")` that parses and replaces the target, or calls `next(new AppError("VALIDATION_FAILED", 422, ...))` on failure. This is a shared foundation, not auth-specific, but auth is the first consumer.

### `requireAuth` middleware contract
`requireAuth: RequestHandler` reads `Authorization: Bearer <token>`, verifies it with `JWT_ACCESS_SECRET` (algorithm pinned to HS256, see JWT claims and algorithm), and on success sets `req.user = { id: string }` (extended `Request` type in `apps/api/src/types/express.d.ts`) — an object rather than a bare `req.userId`, so a later ticket can add fields (e.g. roles) to `req.user` without another type-widening change. On missing/malformed header, invalid signature, wrong algorithm, or expired token, it calls `next(new AppError("UNAUTHENTICATED", 401, "Authentication required"))`, matching the `{code, message, details?}` shape already defined in `packages/shared/src/errors/error-response.ts`. Exported from `apps/api/src/middleware/require-auth.ts` for reuse by any future router.

### Email normalization
Email normalization (trim + lowercase) happens once, in the auth service layer (`AuthService`, `apps/api/src/auth/auth-service.ts`), before both the registration duplicate-check and the `User` row's stored value, so the same `normalizeEmail` function is reused for the login lookup without re-deriving it from a schema. `User.email`'s `@unique` constraint is therefore a unique constraint on an already-normalized value, so the database is the final backstop against a race between two concurrent registrations for the same address (the service-level check alone can't fully prevent that race; the unique index turns it into a `409` instead of silently allowing both, and the row insert's `P2002` unique-violation error is mapped to the same `409 Conflict` as the pre-check).

The Zod schemas (`registerRequestSchema`/`loginRequestSchema` in `packages/shared`) additionally call `.trim()` on the email field before `.email()`. This is a narrower, format-only concern than the service-layer normalization above: Zod's `.email()` rejects a value with leading/trailing whitespace outright, and `validate()` middleware runs before the handler ever calls `normalizeEmail`, so without the schema-level trim a whitespace-padded but otherwise valid email would fail validation with a `422` instead of reaching the service layer at all. The schema's `.trim()` never lowercases and is not a second copy of the normalization *decision* (case-insensitive dedup, canonical stored form) — that logic still lives solely in `normalizeEmail` — it only ensures a merely-whitespace-padded email is treated as syntactically valid input in the first place.

### Rate limiting: deferred stricter policy
The existing global `express-rate-limit` (configured in `app.ts`, IP-based, applied ahead of all routers) already applies to `/auth/*` exactly as it does to every other route — no new code is needed for that baseline coverage, and specs/user-auth's "Rate limiting applies to auth endpoints" requirement is satisfied by the status quo. A dedicated, stricter brute-force policy scoped to login/register specifically (e.g. a lower per-IP-and-email threshold) is a real hardening improvement but is explicitly deferred to a follow-up ticket rather than designed here, to keep this change's scope to what specs/user-auth actually requires.

## Risks / Trade-offs

- **[Risk]** `path: /auth` on the refresh cookie means the browser won't attach it to other API paths — fine today since only `/auth/refresh` and `/auth/logout` need it, but a future endpoint that also wants to read the raw refresh cookie would need to widen the path. → Mitigation: none needed until such an endpoint exists; note the constraint in code comments near the cookie config.
- **[Risk]** HMAC-hashing the refresh token with a static `JWT_REFRESH_SECRET` means secret rotation invalidates all outstanding refresh tokens at once (every session logged out). → Mitigation: acceptable — this is the same blast radius as rotating a JWT signing secret, and forcing re-login on secret rotation is standard practice, not a regression.
- **[Risk]** Reuse-detection revokes an entire session family, which could false-positive if a caller retries a refresh call after a network timeout (the first attempt actually succeeded server-side, the caller never saw the response, and it retries with the now-revoked old token). → Mitigation: accepted trade-off — the security benefit (catching real token theft) outweighs the cost of an occasional forced re-login on flaky networks; any future client is going to need a "refresh failed -> re-authenticate" path anyway for the legitimate-expiry case, so this adds no new failure mode for it to handle, just one more cause of the same outcome.
- **[Trade-off]** Storing sessions server-side (vs. fully stateless JWT refresh) adds a DB round-trip to every refresh call. → Accepted: rotation + reuse-detection fundamentally require server-side state; this is inherent to the chosen session model (see proposal/exploration), not an incidental cost.

## Migration Plan

1. Add `User` and `RefreshToken` models to `packages/db/prisma/schema.prisma`; run `prisma migrate dev --name add-user-auth` to generate and apply the migration locally.
2. Add `packages/shared` Zod schemas/DTOs first (per project rule: "Define request/response Zod schemas in packages/shared first"), then the `validate()` middleware, then the `/auth` router, then `requireAuth`.
3. Purely additive: no existing table, endpoint, or response shape changes, so no phased rollout or feature flag is needed.
4. **Rollback**: Prisma has no automatic "down" migration, and CLAUDE.md prohibits editing an already-applied migration. Since nothing else depends on `User`/`RefreshToken` yet, reverting the PR is sufficient — the two unused tables sitting in the database are harmless. If they genuinely need to be dropped (e.g. a compliance requirement), that's a **new** forward migration (`prisma migrate dev --name drop-user-auth`) authored after the revert, never a deletion or edit of the `add-user-auth` migration file.
