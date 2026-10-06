# Design

## Context

See proposal.md for motivation. Current state:

- `@playwright/test@1.49.1` is a devDependency of `apps/web`; `pnpm test:e2e` runs `playwright test`, but no config or specs exist.
- The web app calls the API directly at `VITE_API_BASE_URL` (default `http://localhost:4000`); there is no Vite proxy, so the refresh cookie crosses `:5173` -> `:4000` and CORS is exercised for real.
- The API logs the reset OTP with `console.log` only (`auth-router.ts`); it is stored hashed, so it cannot be read back from the database.
- CI has one job (build, lint, typecheck, unit tests) with a Postgres service; `.gitignore` already ignores `*.log`, `playwright-report/` and `test-results/`.
- API rate limits are env-configurable (`RATE_LIMIT_*`, `SHARE_RATE_LIMIT_*`).

## Goals / Non-Goals

**Goals:**
- One deterministic, serial journey that covers the full path through the real stack, including the OTP leg, with no production code changes beyond a pinned log-format test.
- A runnable local flow (`pnpm test:e2e`) and a CI job that gates PRs.

**Non-Goals:**
- Cross-browser or mobile-viewport coverage (Chromium only).
- Replacing API/unit tests; E2E covers the happy journey plus a few negative checks only.
- Test-data teardown or a dedicated E2E database.
- A test-only OTP endpoint or any other test hook in production code.

## Decisions

1. **OTP via a log-tee launcher.** Playwright's `webServer` does not expose a server's stdout to tests, so `apps/web/e2e/start-api.mjs` spawns the built API (`node apps/api/dist/server.js`), pipes its output to the parent's stdout and to `apps/web/e2e/.api.log` (truncated on start). Node has no stdout "unbuffered" flag (and `PYTHONUNBUFFERED` is Python-only), so the guarantee lives in the launcher: it spawns the API with piped stdio, writes every chunk to an open file descriptor with synchronous `fs.writeSync` (no buffered write stream), sets `FORCE_COLOR=0` so ANSI codes cannot break the pattern, and flushes/closes the fd on exit. The OTP line is therefore on disk as soon as the API emits it. A fixture `getOtp(email)` polls the file every 100ms for `[password-reset] OTP for <email>: (\d{6})`, takes the last match, and times out after an explicit 10s. On timeout it throws an error containing the email, the log path, the timeout, whether the file exists/is empty, and the last 20 log lines.
   - *Alternatives:* a shell redirect in the `webServer` command (not portable across the Windows dev shell and CI bash); a test-only endpoint (violates the "OTP is logged only" rule); skipping the reset leg (not truly end to end).
2. **Launcher as a plain `.mjs`.** No new dependency and no TS build step; it only needs `node:child_process` and `node:fs`.
3. **Run the API with `tsx` (no watch), not `tsx watch` and not `dist/`.** Avoids restart flakiness. The compiled `dist/server.js` cannot run under plain node in this repo because workspace packages (`@note-taking-app/db`, `shared`) are consumed as TypeScript source, so the launcher runs `node --import tsx src/server.ts`. The web side runs the Vite dev server on :5173, reusing an existing one outside CI via `reuseExistingServer`.
4. **Database: existing Postgres, unique users.** Locally the compose Postgres; in CI the job's service. Emails are `e2e-<Date.now()>-<rand>@example.test`, so reruns never collide and no cleanup is needed. Migrations are guaranteed before any server starts: `pretest:e2e` (local) and an explicit CI step run `prisma migrate deploy` ahead of Playwright's `webServer`, so a stale schema can never be the cause of a failure.
5. **Serial, single worker.** `workers: 1`, `fullyParallel: false`, one journey spec using `test.describe.serial`-style steps (`test.step`) so a failure points at the broken stage. The anonymous share check uses `browser.newContext()` with no storage state. The E2E API env raises `RATE_LIMIT_MAX` and `SHARE_RATE_LIMIT_MAX` as a margin.
6. **Waiting strategy.** After every edit that later steps depend on (before search, share and history), wait on the autosave `PATCH /notes/:id` response and then assert the anchored `getByText(/^Saved$/)` (so "Unsaved changes" cannot match) is visible; the response wait prevents a stale "Saved" from an earlier save passing early. Also wait on search results/highlight `<mark>`, and on the history list, never `waitForTimeout`. Selectors prefer roles and labels (the app already requires ARIA labels), then `data-testid` only where no accessible name exists.
7. **Pin the OTP line format.** One API unit test asserts the exact `console.log` line (and no line for unknown emails), so a logging refactor cannot silently break E2E. The spec change in `user-auth` documents the contract.
8. **Separate CI job.** `e2e` runs in parallel with `build-lint-test`: checkout, pnpm, node 22, install, prisma generate, `migrate deploy`, build, `playwright install --with-deps chromium`, `pnpm run test:e2e`, then upload `playwright-report/` and `test-results/` on failure. It reuses the same Postgres service definition and env (secrets are the existing CI placeholders).

9. **Tags are seeded through the API.** The web UI can only toggle existing tags; tag creation exists only as `POST /tags`. The journey creates its tag with an authenticated API request (login, then `POST /tags`) and does the toggling, filtering and persistence checks in the UI. The page is reloaded after seeding because the app has already cached an empty tag list; the reload also proves the refresh cookie restores the session across the web and API origins.

## Risks / Trade-offs

- [The log line becomes a de facto test contract] -> Pinned by an API unit test and the `user-auth` spec requirement.
- [Log-file polling can race or read stale lines] -> Truncate on server start, match the exact unique email, take the last match, synchronous writes in the launcher, 10s bounded timeout with a diagnostic failure (email, path, log tail).
- [Autosave debounce makes assertions flaky] -> Wait on the PATCH response, not timers.
- [Cross-origin cookie behaves differently in CI] -> Same localhost origins as dev; the logout-then-visit and refresh steps in the journey exercise it explicitly.
- [E2E slows PR feedback] -> Separate parallel job; unit job result is unaffected.
- [Chromium install adds CI time] -> Install Chromium only (`playwright install --with-deps chromium`); consider caching later.
- [Leftover users accumulate in the dev DB] -> Accepted; unique emails and `example.test` domain make them easy to purge manually.
