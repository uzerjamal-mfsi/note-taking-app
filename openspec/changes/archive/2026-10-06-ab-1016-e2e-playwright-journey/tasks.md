# Tasks

## 1. API: pin the OTP console line (API)

- [x] 1.1 Write a failing API test (supertest + `console.log` spy) asserting `POST /auth/forgot-password` logs exactly `[password-reset] OTP for <email>: <6 digits>` for a registered email, nothing for an unknown email, and nothing with a 422 for a malformed email; verify it fails/passes appropriately with `pnpm --filter @note-taking-app/api test`
- [x] 1.2 Adjust the logging statement only if needed to satisfy the test (no format change expected) and verify the test is green and `pnpm run typecheck` passes

## 2. Playwright scaffolding (web)

- [x] 2.1 Add `apps/web/e2e/start-api.mjs` that spawns the built API, tees stdout/stderr to the console and a truncated `apps/web/e2e/.api.log` using synchronous `fs.writeSync` on an open fd (no buffered stream) with `FORCE_COLOR=0`, forwards exit signals and closes the fd on exit, and verify by running it manually: each API log line (including a forgot-password OTP line) is in the file immediately, and the API answers on :4000
- [x] 2.2 Add `apps/web/playwright.config.ts`: Chromium only, `workers: 1`, `fullyParallel: false`, trace/screenshot on failure, HTML reporter, a `pretest:e2e` script in `apps/web/package.json` (or `globalSetup`) running `prisma migrate deploy` before any server starts, `webServer` entries for the launcher (port 4000, E2E env with raised rate limits and `CORS_ALLOWED_ORIGINS`) and the web app (port 5173, `reuseExistingServer` outside CI), and verify `pnpm run test:e2e` applies migrations first, then starts both servers and exits cleanly with a trivial smoke test (and aborts before starting servers if the database is unreachable)
- [x] 2.3 Add fixtures in `apps/web/e2e/fixtures.ts`: `uniqueUser()` (unique email + password) and `getOtp(email)` (poll every 100ms, last match, explicit 10s timeout; on timeout throw an error with the email, log path, timeout, file exists/empty status and last 20 log lines); add a Vitest test for the OTP parser and the timeout diagnostics (missing file, empty file, no matching line) and verify it passes
- [x] 2.4 Make sure `playwright-report/`, `test-results/` and `apps/web/e2e/.api.log` are git-ignored and excluded from eslint/prettier as needed; verify `git status` is clean after a run and `pnpm lint --max-warnings 0` passes

## 3. Journey spec (web)

- [x] 3.1 Implement auth steps in `apps/web/e2e/journey.spec.ts`: registration validation failure, successful register, and logged-in landing on the notes list; verify they pass in a headed or traced run
- [x] 3.2 Implement note steps: create a note, type content in TipTap, wait on the autosave response and assert the anchored `getByText(/^Saved$/)` status is visible before continuing, add a tag, search for a keyword and assert the `<mark>` highlight; verify they pass
- [x] 3.3 Implement sharing steps: confirm the note is saved (the anchored `getByText(/^Saved$/)` status), create the share link, open it in a new anonymous context and assert read-only title/content, revoke the share and assert the not-found state; verify they pass
- [x] 3.4 Implement history steps: edit the note to create a version (waiting on the autosave response and the anchored `getByText(/^Saved$/)` status before opening history), open the History drawer, preview the earlier version, restore it, and assert the editor re-seeds; then soft-delete the note and assert it leaves the list; verify they pass
- [x] 3.5 Implement session and reset steps: log out and assert protected routes redirect to login, run forgot-password, read the OTP via `getOtp`, reset the password, assert the old password is rejected and the new one logs in; verify they pass
- [x] 3.6 Run the full spec twice in a row against the same database and verify both runs pass with no flakiness (repeat 3 times locally with `--repeat-each=1` per run)

## 4. CI and documentation

- [x] 4.1 Add the `e2e` job to `.github/workflows/ci.yml` (Postgres service, env, install, prisma generate, an explicit `prisma migrate deploy` step that precedes the Playwright run and its `webServer`, build, `playwright install --with-deps chromium`, `pnpm run test:e2e`, upload report/traces with `if: failure()`), and verify the workflow YAML is valid and the job passes on the pull request
- [x] 4.2 Document local E2E usage (compose Postgres, migrate, build, `pnpm test:e2e`, where the report and OTP log live) in the repo README or `CLAUDE.md` Commands section, and verify the documented commands run as written from a clean checkout

## 5. Integration checks

- [x] 5.1 Run `openspec validate --strict`, `pnpm build` (0 errors, 0 warnings), `pnpm lint --max-warnings 0`, `pnpm run typecheck`, `pnpm test:coverage`, and `pnpm run test:e2e`; verify all pass and every spec scenario maps to at least one API test or Playwright step
