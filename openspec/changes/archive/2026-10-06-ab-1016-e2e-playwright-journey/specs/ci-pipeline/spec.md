# Spec Delta

## ADDED Requirements

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
