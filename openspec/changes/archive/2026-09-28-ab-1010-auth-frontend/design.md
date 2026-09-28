# Design

## Context

See [proposal.md](./proposal.md) - Why. Relevant current state:

- `apps/api/src/auth/*` and `apps/api/src/routes/auth-router.ts` already implement register/login/refresh/logout/forgot-password/reset-password per the `user-auth` spec. Access token: JSON body, 15 min expiry. Refresh token: httpOnly/secure/same-site cookie, 7 day expiry, single-use with rotation-family revocation-on-reuse.
- `packages/shared/src/auth/auth-contracts.ts` already has every request/response Zod schema this change needs (`registerRequestSchema`, `loginRequestSchema`, `forgotPasswordRequestSchema`, `resetPasswordRequestSchema`, `authResponseDtoSchema`, `authAckResponseSchema`). No new shared schemas are needed.
- `apps/web/src/lib/api-client.ts` (`apiFetch`) has no auth awareness today: no `Authorization` header, no `credentials`, no retry-on-401.
- `apps/web/src/routes/router.ts` is a flat two-route tree (`index` + `*`) with no guard concept yet.
- `apps/web/src/store/ui-store.ts` is the only Zustand store so far, holding pure UI state (sidebar). No session/auth state exists.
- `apps/web/src/components/ui/` has only `button.tsx` from shadcn/ui; `input`, `label`, `form`, `card`, `alert` are not yet initialized.
- The API (`:4000`) and web app (`:5173`) run on different ports, so cookies are cross-origin from the browser's perspective — the refresh cookie only reaches the API if requests are made with `credentials: "include"` and the API's CORS config allows credentialed requests from the web origin (this already needs to be true for the cookie-based flows in the `user-auth` spec to work at all; this change is the first frontend code to exercise it).

## Goals / Non-Goals

**Goals:**
- Give the frontend a single, small session-state surface that every page and the API client agree on.
- Make token attachment, silent bootstrap, and 401-refresh-and-retry a property of the shared API client, not something each page re-implements.
- Keep the four auth pages thin: form + shared-schema validation + one mutation call.

**Non-Goals:**
- No "remember me" / persistent (localStorage) token storage — access token is memory-only per the spec's session-bootstrap requirement; only the httpOnly refresh cookie survives a reload.
- No UI for managing or listing other concurrent sessions (the API allows multiple sessions per user, but no page here surfaces that).
- No changes to `user-auth` or `web-app-shell` requirements or to `packages/shared` — this change only consumes them.
- No CORS/server-side config changes are in scope for *this* change's tasks beyond verifying the existing API CORS setup already permits credentialed requests from the web origin; if it doesn't, that's a small, separate API-side fix, not part of this frontend change (see Open Questions).

## Decisions

### 1. Session state: a dedicated Zustand store, not TanStack Query cache
The access token + user are client/UI-owned session state (per CLAUDE.md's state-management convention: "client/UI state via Zustand"), not server data to be cached/revalidated — so a `useSessionStore` (new file, sibling to `ui-store.ts`) holds `{ user, accessToken, status: "idle" | "authenticated" | "unauthenticated" }` and plain setters (`setSession`, `clearSession`). Mutations (login/register/refresh/logout) stay as TanStack Query `useMutation` hooks in each feature's `api/`, and on success call the store's setter — this matches the existing split (TanStack Query for server calls, Zustand for the resulting client state) rather than introducing a second pattern.

**Alternative considered**: keep the token only in a React context. Rejected — Zustand is already the project's client-state primitive and the API client (a plain module, not a component) needs to read the current token outside of React's render tree; a plain Zustand store (`useSessionStore.getState()`) is directly readable from `api-client.ts` without prop-drilling or a context provider indirection.

### 2. Token attachment and refresh live in `apiFetch`, not in each page
`apiFetch` reads `useSessionStore.getState().accessToken` and adds the `Authorization` header when present, and always passes `credentials: "include"`. On a `401`, it calls a new internal `refreshSession()` once (which itself calls `POST /auth/refresh` via a *plain* `fetch`, not `apiFetch`, to avoid recursive 401-handling), and on success retries the original request once with the new token; on failure it clears the session store and lets the 401 propagate so the route guard's redirect takes over.

`refreshSession()` is wrapped in a module-level singleton in-flight promise: the first `401` to arrive starts the refresh call and stores its promise; any other request that hits `401` while that promise is still pending awaits the *same* promise instead of calling `POST /auth/refresh` again, and the slot is cleared once it settles (success or failure) so the next `401` after that starts a fresh call. This is not just an efficiency nicety — the refresh token is single-use with revoke-on-reuse (per the `user-auth` spec), so two independent concurrent refresh calls would have the second one present an already-redeemed token and trigger theft-detection revocation of the whole session, logging the person out for no reason.

The refresh-and-retry path is skipped entirely for any `/auth/*` path (login, register, refresh itself, logout, forgot-password, reset-password): a `401` from those endpoints means invalid credentials or an invalid/expired OTP, never an expired access token, so attempting a refresh there would be a pointless extra round-trip and would turn a should-stay-`idle` login-form error into a spurious `clearSession()` call.

**Alternative considered**: a TanStack Query global `onError` handler for 401s. Rejected — Query's global error hooks fire per-query/mutation after the fact and don't have a clean way to pause and retry the in-flight request; handling it inside the fetch layer itself (matching the existing centralize-outbound-requests convention) keeps the retry synchronous and keeps every consumer (queries, mutations, and any plain call) covered uniformly.

### 3. Session bootstrap as a top-level gate above the router, not a route loader
`main.tsx`/`AppProviders.tsx` runs a one-time `refreshSession()` call before the router is allowed to render routed content, showing the shell's existing `Spinner` in the interim, then flips `useSessionStore`'s status to `authenticated` or `unauthenticated`. The route guard component reads that status (never `undefined`/`idle` once bootstrap resolves) to decide redirects.

**Alternative considered**: a React Router root loader that calls refresh before any route renders. Rejected — the existing shell's `RootLayout`/`ErrorBoundary`/`Spinner` wiring is component-based, not loader-based (no `loader` functions exist yet in `router.ts`), and a single top-level bootstrap effect is less disruptive to the existing router structure than introducing data-router loaders for this one case.

### 4. Route guard as a wrapper component, not per-route `loader`s
A `RequireAuth` component wraps protected routes' `element`/`Component` in `router.ts` (redirects to `/login` when `status === "unauthenticated"`); a `RequireGuest` component wraps the four public auth pages (redirects to the authenticated area when `status === "authenticated"`). Both simply read `useSessionStore`.

`RequireAuth` reads the current route with `useLocation()` and redirects with `<Navigate to="/login" state={{ from: location }} replace />`, so the attempted route travels with the redirect rather than needing a separate store or query param. `LoginForm` and `RegisterForm` read `useLocation().state?.from` on submit success and navigate there (`navigate(from, { replace: true })`) when present, falling back to the authenticated area's default route (`/`) otherwise. Navigation state is the natural fit here — react-router already threads it through `Navigate`/`useLocation`/`navigate()`, so no new state needs to be introduced to carry it.

**Alternative considered**: `router.ts` `loader` functions per route. Rejected for the same reason as #3 — no loaders exist in this router yet, and a component-level guard composes directly with the existing `RootLayout`/`ErrorBoundary` tree without introducing a second data-loading mechanism alongside TanStack Query.

### 5. Forms: `react-hook-form` + `@hookform/resolvers/zod`, new dependency
No form library exists in the repo yet (only `components/ui/button.tsx` from shadcn/ui, no `input`/`label`/`form`). `react-hook-form` + `@hookform/resolvers/zod` is the pattern shadcn/ui's own `form` component is built around, letting the four forms validate directly against the existing `packages/shared` Zod schemas (register/login/forgot-password/reset-password) with no duplicated validation logic. This is a new dependency, but is the smallest addition that reuses the shared schemas as-is and matches the shadcn/ui `form` primitive's expected shape rather than hand-rolling controlled-input validation wiring per page.

Pin exact versions per CLAUDE.md's "no `@latest`, pin all package versions" rule: `react-hook-form@7.54.0` and `@hookform/resolvers@3.9.1`. `react-hook-form` 7.54.0 is the first release with `react` declared as a `^19.0.0`-compatible peer dependency (matching this repo's `react@19.0.0`/`react-dom@19.0.0`), and `@hookform/resolvers@3.9.1` is the corresponding compatible resolver release at that vintage — both line up with the other dependencies' pinned versions already in `apps/web/package.json` (e.g. `vite@6.0.3`, `vitest@3.0.0`, dated December 2024).

**Alternative considered**: plain controlled inputs + manual `schema.safeParse` per submit. Rejected — four forms would each hand-roll field-error state and re-derive per-field messages from Zod's issues array; `react-hook-form`'s resolver does this once, and it's the path the shadcn/ui components this project already uses were designed for.

### 6. Enumeration-safe pages show one static message, not the server's message
Per the `web-auth` spec, forgot-password success and reset-password failure must not vary by cause. The forgot-password page shows a hardcoded neutral string on any non-error (`2xx`) response rather than rendering the server's response body, and the reset-password page shows one hardcoded generic string for any `401`, ignoring the response body's `message`/`code` — the API already collapses these server-side, but the frontend does not pass the body through for these two cases specifically, so a future server-side change to the message text can't accidentally leak distinguishing detail through the UI.

### 7. Forgot-password -> reset-password email handoff via navigation state
`ForgotPasswordForm`'s success confirmation renders a link/button to `/reset-password` built with `navigate("/reset-password", { state: { email } })` (or a react-router `<Link to="/reset-password" state={{ email }}>`), carrying the just-submitted email. `ResetPasswordForm` initializes `react-hook-form`'s `defaultValues.email` from `useLocation().state?.email` when present, otherwise leaves it empty — the field stays a normal, editable part of the form either way, since a person can also reach `/reset-password` directly (bookmarked, or a link from elsewhere) with no state at all.

**Alternative considered**: pass the email as a query param (`/reset-password?email=...`). Rejected — an OTP-adjacent identifier in the URL is more likely to be copy-pasted, shared, or logged (browser history, server access logs) than the same value carried in-memory via router state, and navigation state is already the mechanism Decision 4 introduces for the redirect-preservation flow, so this reuses the same pattern rather than adding a second one.

## Risks / Trade-offs

- **[Risk]** Cross-origin cookie flow (`:5173` -> `:4000`) depends on the API's CORS config already allowing `credentials: true` for the web origin; if it doesn't, refresh/logout will silently fail cookie delivery. **Mitigation**: verify this manually against the running dev servers as the first task (see Open Questions) before building the rest on top of it.
- **[Risk]** A stale access token held in memory across multiple browser tabs isn't synchronized (each tab bootstraps its own session independently). **Mitigation**: accepted for this change — no cross-tab sync requirement exists in the spec; each tab's own 401-refresh-and-retry keeps that tab working independently.
- **[Risk]** Multiple requests hitting `401` at once could each call `/auth/refresh` independently; since refresh tokens are single-use with revoke-on-reuse, the second call would present an already-redeemed token and trigger theft-detection revocation of the whole session. **Mitigation**: the singleton in-flight refresh promise (Decision 2) ensures only one refresh call is ever in flight; concurrent `401`s await its result instead of issuing their own.
- **[Trade-off]** The 401-refresh-and-retry logic in `apiFetch` adds a small amount of complexity (single-flight refresh, one retry) to a previously simple function. Kept centralized rather than duplicated per feature, per Decision 2.

## Migration Plan

Purely additive frontend feature; no data migration. Deploy as a normal PR/merge. Rollback is reverting the commit(s) — `apiFetch`'s new behavior is backward-compatible for any caller with no session (no header added, `credentials: "include"` is a no-op without a cookie).

## Open Questions

- Does the API's current CORS configuration already send `Access-Control-Allow-Credentials: true` for the web dev origin? This needs a quick manual check against the running dev servers before implementation starts; if it's missing, that's a one-line API config fix to land alongside (or just ahead of) this change rather than a design change here.
