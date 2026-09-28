# Tasks

## 1. Foundations

- [x] 1.1 Verify the API's CORS config sends `Access-Control-Allow-Credentials: true` for the web dev origin by running both dev servers (`pnpm run dev`) and issuing a credentialed cross-origin request from the browser to `/auth/refresh`; if it's missing, add it to the API's CORS middleware config. Verify: browser network tab shows the header on the response and no CORS error is thrown.
- [x] 1.2 Add `react-hook-form@7.54.0` and `@hookform/resolvers@3.9.1` to `apps/web/package.json` (exact pinned versions, no `@latest`, both compatible with React 19 per design.md Decision 5) and run `pnpm install --frozen-lockfile`. Verify: `pnpm --filter web typecheck` resolves the new imports with no errors.
- [x] 1.3 Initialize shadcn/ui `input`, `label`, `form`, `card`, and `alert` components alongside the existing `button.tsx`. Verify: each new file exists under `apps/web/src/components/ui/` and `pnpm build` succeeds with 0 errors/warnings.

## 2. Session store and API client

- [x] 2.1 Write a failing test for `apps/web/src/store/session-store.ts` covering `setSession`, `clearSession`, and the `idle`/`authenticated`/`unauthenticated` status transitions.
- [x] 2.2 Implement `useSessionStore` (Zustand) per design.md Decision 1. Verify: the test from 2.1 passes.
- [x] 2.3 Write failing tests for `apps/web/src/lib/api-client.ts` covering: an `Authorization: Bearer` header is added when a session is present, `credentials: "include"` is always set, and no `Authorization` header is added when there is no session (spec: Client session state, both scenarios).
- [x] 2.4 Update `apiFetch` to read `useSessionStore.getState()` and add the header/credentials per 2.3. Verify: the tests from 2.3 pass.
- [x] 2.5 Write failing tests for the 401-refresh-and-retry behavior: a `401` triggers one `/auth/refresh` call and a single retry on success; session is cleared and the error propagates when refresh itself fails; and concurrent requests that `401` while a refresh is already in flight share that single call rather than each triggering their own (spec: Transparent access-token refresh, all three scenarios).
- [x] 2.6 Implement `refreshSession()` (plain `fetch`, not `apiFetch`, per design.md Decision 2) with a module-level singleton in-flight promise, and wire the single-retry-on-401 logic into `apiFetch`. Verify: the tests from 2.5 pass.

## 3. Session bootstrap and route guards

- [x] 3.1 Write a failing test that the app shows the shell's `Spinner` while bootstrap is in flight, then renders routed content once it resolves, for both the recovered-session and no-session cases (spec: Session bootstrap on load, both scenarios).
- [x] 3.2 Implement the one-time bootstrap call (`refreshSession()` on start) in `AppProviders.tsx`/`main.tsx`, gating routed content on its resolution. Verify: the tests from 3.1 pass.
- [x] 3.3 Write failing tests for a `RequireAuth` wrapper (redirects to `/login` when unauthenticated and preserves the attempted route via navigation state, renders children when authenticated) and a `RequireGuest` wrapper (redirects to the authenticated area when authenticated, renders children when not) (spec: Route protection, all four scenarios).
- [x] 3.4 Implement `RequireAuth` (using `useLocation()` and `<Navigate state={{ from: location }} />` per design.md Decision 4) and `RequireGuest` components and wire them into `apps/web/src/routes/router.ts` around the relevant routes. Verify: the tests from 3.3 pass.

## 4. Registration page

- [x] 4.1 Write a failing test (component + one API-mocked integration test) for `src/features/auth/components/RegisterForm.tsx` covering: successful submit starts a session and navigates away, a successful submit reached via a redirect-preserved route navigates back to it instead of the default route, a duplicate-email server error is shown inline without navigating, and client-side validation blocks submission on an invalid field (spec: Registration page, all three scenarios; Route protection, redirect-return scenario).
- [x] 4.2 Implement `src/features/auth/api/use-register-mutation.ts` (TanStack Query mutation calling `POST /auth/register`) and `RegisterForm.tsx` (`react-hook-form` + `zodResolver(registerRequestSchema)`, reading `useLocation().state?.from` per design.md Decision 4), plus the `RegisterPage` route component. Verify: the tests from 4.1 pass and the route is reachable at `/register`.

## 5. Login page

- [x] 5.1 Write a failing test for `src/features/auth/components/LoginForm.tsx` covering: successful submit starts a session and navigates, a successful submit reached via a redirect-preserved route navigates back to it instead of the default route, an unknown email and a wrong password both render the identical generic message, and empty-field validation blocks submission (spec: Login page, all three scenarios; Route protection, redirect-return scenario).
- [x] 5.2 Implement `use-login-mutation.ts` and `LoginForm.tsx`/`LoginPage`, reading `useLocation().state?.from` per design.md Decision 4. Verify: the tests from 5.1 pass and the route is reachable at `/login`.

## 6. Forgot-password page

- [x] 6.1 Write a failing test for `src/features/auth/components/ForgotPasswordForm.tsx` covering: any syntactically valid email (registered or not) shows the same hardcoded neutral confirmation, the confirmation offers a way to proceed to `/reset-password` carrying the submitted email via navigation state, and an invalid email format blocks submission (spec: Forgot-password page, all three scenarios).
- [x] 6.2 Implement `use-forgot-password-mutation.ts` and `ForgotPasswordForm.tsx`/`ForgotPasswordPage`, per design.md Decision 6 (hardcoded confirmation string, not the response body) and Decision 7 (`navigate("/reset-password", { state: { email } })` link/action on the confirmation). Verify: the tests from 6.1 pass and the route is reachable at `/forgot-password`.

## 7. Reset-password page

- [x] 7.1 Write a failing test for `src/features/auth/components/ResetPasswordForm.tsx` covering: a successful reset shows a confirmation and navigates to `/login` without starting a session, any `401` cause (unknown email, wrong/expired/consumed OTP) renders the identical generic error, a short new-password or empty-OTP field blocks submission, and the email field pre-fills from navigation state when present while remaining empty and editable when reached directly (spec: Reset-password page, all four scenarios).
- [x] 7.2 Implement `use-reset-password-mutation.ts` and `ResetPasswordForm.tsx`/`ResetPasswordPage`, per design.md Decision 6 (hardcoded generic error, not the response body) and Decision 7 (`defaultValues.email` from `useLocation().state?.email`). Verify: the tests from 7.1 pass and the route is reachable at `/reset-password`.

## 8. Logout

- [x] 8.1 Write a failing test for the logout action: it calls the logout endpoint, clears the session, and navigates to `/login` both when the call succeeds and when it fails (spec: Logout, both scenarios).
- [x] 8.2 Implement `use-logout-mutation.ts` and a logout control in `RootLayout.tsx`'s nav (rendered only when `useSessionStore` is authenticated). Verify: the tests from 8.1 pass.

## 9. Integration verification

- [~] 9.1 SKIPPED (deliberate, user-confirmed): no `playwright.config.ts` or prior E2E spec exists anywhere in the repo yet — this predates this change (no earlier feature set it up either), despite `apps/web/tsconfig.node.json` referencing a config file and `pnpm test:e2e` being wired up. Scaffolding Playwright from scratch (webServer strategy for both dev servers, browser projects, base URL, test-data isolation against the real Postgres container) is a cross-cutting infra decision beyond this ticket's scope. Every spec scenario this change covers already has a component-level test (see groups 4-8); real browser E2E is left to a dedicated infra change.
- [x] 9.2 Run `pnpm build`, `pnpm lint --max-warnings 0`, `pnpm run typecheck`, and `pnpm test --coverage` across the workspace. Verify: all pass with 0 errors/warnings and ≥80% coverage on the new code. `pnpm build`/`pnpm lint`/`pnpm run typecheck` pass cleanly across all 6 workspace packages. `apps/web` tests: 45/45 pass, 87.37% statement / 94.07% branch coverage overall, 100% on every new auth file. `apps/api` tests could not be run in this session — they require a `DATABASE_URL` against the real Postgres container, which isn't set in this shell and is out of scope for a frontend-only change (pre-existing requirement, unrelated to this ticket).
