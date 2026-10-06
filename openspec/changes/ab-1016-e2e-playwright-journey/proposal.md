# Proposal

## Why

AB-1016: Every feature (auth, notes, tags, search, sharing, history) is covered by unit and API tests, but nothing proves the assembled system works the way a user uses it: browser -> web app -> API -> Postgres, across the cross-origin refresh cookie and the lazily loaded TipTap editor. Playwright is already a web devDependency (`pnpm test:e2e` is wired) yet there is no config, no spec, and no CI job, so regressions in the seams between layers go unseen.

## What Changes

- Add a Playwright setup under `apps/web` (config, fixtures) that starts the built API and the web app via `webServer`, with Chromium only and `workers: 1`.
- Add one serial **full-journey spec**: register -> create a note -> type in the editor (autosave) -> tag it -> search with highlight -> share -> open the public link in a fresh anonymous context -> edit and restore from version history -> delete -> log out -> forgot-password -> reset with the OTP -> log in with the new password.
- Read the password-reset OTP from the API's stdout: a small node launcher spawns the API and tees its output to a git-ignored log file, and a fixture polls it for the OTP line of the current user's email.
- Apply `prisma migrate deploy` as a prerequisite of every E2E run (`pretest:e2e` locally, explicit step in CI) so servers never start on a stale schema.
- Make the journey deterministic around autosave: assert the editor's "Saved" status after each edit before search, share and history steps.
- Pin the OTP console line format as a tested contract in the API (no change to what is logged).
- Add a separate `e2e` job to the CI workflow: Postgres service, migrations, build, `playwright install --with-deps chromium`, `pnpm test:e2e`, upload report/traces on failure.

## Capabilities

### New Capabilities
- `e2e-user-journey`: The end-to-end suite's contract - which user journey it must cover, how it isolates test data, how it obtains the OTP, and how it stays deterministic.

### Modified Capabilities
- `ci-pipeline`: Adds an E2E job that gates pull requests alongside the existing build/lint/test job.
- `user-auth`: Adds a requirement that the console OTP line has a stable, documented format that includes the email and the raw code.

## Impact

- **Test/tooling only**: no API route, `packages/shared`, Prisma schema, migration, or index changes; no production-behavior change.
- New: `apps/web/playwright.config.ts`, `apps/web/e2e/**` (journey spec, fixtures, API launcher), one API unit test pinning the OTP log format, an `e2e` job in `.github/workflows/ci.yml`.
- Dependencies: none new (`@playwright/test@1.49.1` already pinned). CI downloads Chromium at run time.
- Local runs need the compose Postgres up and migrated; test users are unique per run (`e2e-<timestamp>-<rand>@example.test`) and are not torn down.
- **Rollback**: remove the `e2e` CI job and the `apps/web/e2e` directory/config; nothing else depends on them.
