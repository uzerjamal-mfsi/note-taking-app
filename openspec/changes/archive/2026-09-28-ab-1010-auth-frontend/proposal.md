# Proposal

## Why

AB-1010: the backend auth API (`user-auth`) and its shared Zod contracts are fully implemented, and the frontend shell (`web-app-shell`) is in place, but there are no auth pages yet — a user cannot register, log in, recover a forgotten password, or have their session persist across a page reload. Every other frontend feature needs an authenticated session to build on, so this unblocks the rest of the frontend roadmap.

## What Changes

- Add four public pages under `src/features/auth/`: Register, Login, Forgot Password (request OTP), Reset Password (submit OTP + new password), built with `react-hook-form` + `@hookform/resolvers/zod` against the existing shared schemas (`registerRequestSchema`, `loginRequestSchema`, `forgotPasswordRequestSchema`, `resetPasswordRequestSchema`).
- Add an in-memory session store (Zustand) holding the current access token and user, separate from `ui-store.ts`.
- Upgrade `apiFetch` (`src/lib/api-client.ts`) to attach `Authorization: Bearer <accessToken>` to outgoing requests and send `credentials: "include"` so the httpOnly refresh cookie is sent cross-port to the API. **BREAKING** (internal): changes `apiFetch`'s request behavior; no external API.
- Add a silent session-bootstrap step that calls `POST /auth/refresh` once on app start (before the router renders routed content) to recover a session after a hard reload, showing the shell's existing `Spinner` while it resolves.
- Add a route guard: `/login`, `/register`, `/forgot-password`, `/reset-password` are public; every other route requires a session and redirects to `/login` when absent. The redirect preserves the originally-requested route via router navigation state, so a successful login or registration returns the person to it instead of always landing on the default authenticated area.
- Add a logout action (calls `POST /auth/logout`, clears the session store, redirects to `/login`) surfaced from `RootLayout`'s nav.
- Add 401-triggered refresh-and-retry in the API client: a request that fails with `401` attempts one `/auth/refresh`, and either retries the original request once with the new access token or, if refresh itself fails, clears the session and routes to `/login`. Concurrent requests that 401 at the same time share a single in-flight refresh call (a singleton refresh promise) instead of each starting their own — refresh tokens are single-use with revoke-on-reuse, so two independent concurrent refresh calls would otherwise have the second one revoke the first's already-rotated token.
- The forgot-password page's confirmation offers a way to proceed to the reset-password page, carrying the submitted email via navigation state so it doesn't need to be re-entered alongside the OTP.

No backend or shared-contract changes: `user-auth` requirements and `packages/shared` schemas are consumed as-is.

## Capabilities

### New Capabilities
- `web-auth`: frontend auth pages, session state, token attachment/refresh, and route protection.

### Modified Capabilities
(none — `user-auth` and `web-app-shell` requirements are unchanged; `web-auth` composes them.)

## Impact

- **New files**: `src/features/auth/{components,hooks,api}/*` (Register/Login/ForgotPassword/ResetPassword pages + forms), `src/store/session-store.ts`, a route-guard component, a session-bootstrap hook.
- **Modified files**: `src/lib/api-client.ts` (bearer header, `credentials: include`, 401 refresh-and-retry with singleton dedup), `src/routes/router.ts` (new routes + guard), `src/routes/RootLayout.tsx` (logout action, bootstrap gating), `apps/web/package.json` (add `react-hook-form@7.54.0`, `@hookform/resolvers@3.9.1` — exact pinned versions, both compatible with React 19), shadcn/ui init for `input`, `label`, `form`, `card`, `alert` (currently only `button` exists).
- **No schema, migration, or index changes** — this is frontend-only against the existing `user-auth` API and `packages/shared` contracts.
- **Rollback**: revert the change's commits; `apiFetch`'s new behavior is additive/backward-compatible (unauthenticated requests are unaffected by the bearer header when no session exists) so no data migration or cleanup is needed.
