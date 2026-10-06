# ci-pipeline Specification

## Purpose

Runs the same build, lint, and test checkpoints as an automated gate on every pull request, so a failing checkpoint cannot be merged even if a contributor bypasses local hooks.

## Requirements

### Requirement: CI runs on every pull request

A GitHub Actions workflow SHALL run on every pull request targeting the default branch, executing install, build, lint, and test in that order.

#### Scenario: PR triggers the workflow

- **WHEN** a pull request is opened or updated against the repository
- **THEN** the workflow runs `pnpm install --frozen-lockfile`, `pnpm build`, `pnpm lint --max-warnings 0`, and `pnpm test` in order

### Requirement: CI fails the check on any checkpoint failure

The workflow run SHALL report a failed status on the pull request if any checkpoint step fails, and SHALL NOT report success.

#### Scenario: Failing lint fails the check

- **WHEN** the lint step fails during a workflow run
- **THEN** the workflow run reports a failed status on the pull request and the remaining steps that depend on it do not run

### Requirement: CI runs the E2E suite on every pull request

The CI workflow SHALL include an E2E job, separate from the build/lint/test job, that runs on every pull request targeting the default branch. The job SHALL provide a Postgres service, apply migrations, build the workspace, install the Playwright Chromium browser, and run `pnpm run test:e2e`.

#### Scenario: PR triggers the E2E job

- **WHEN** a pull request is opened or updated against the default branch
- **THEN** the E2E job runs against a migrated Postgres service and reports its own status on the pull request

#### Scenario: Migrations run before the servers start

- **WHEN** the E2E job reaches the Playwright step
- **THEN** `prisma migrate deploy` has already completed successfully, before the Playwright `webServer` starts the API or web app

#### Scenario: Failing E2E fails the check

- **WHEN** any E2E test fails
- **THEN** the E2E job reports a failed status, and the Playwright report and traces are uploaded as workflow artifacts

#### Scenario: Unit-test feedback is not delayed

- **WHEN** the E2E job is still running
- **THEN** the build/lint/test job reports its result independently of it
