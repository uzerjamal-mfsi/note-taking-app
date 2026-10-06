# e2e-user-journey Specification

## Purpose

Defines the end-to-end browser suite that exercises the full user journey against the real web app, API and database, so cross-layer regressions fail a pull request before merge.

## Requirements

### Requirement: Full user journey is covered end to end

The E2E suite SHALL drive a real browser through the complete journey on the running web app and API: register, create a note, edit its content with autosave, tag it, search for it with the match highlighted, share it, view the public link anonymously, restore a previous version from history, delete it, log out, reset the password via the forgot-password flow, and log in with the new password.

#### Scenario: Journey completes successfully

- **WHEN** the suite runs against a freshly migrated database
- **THEN** every step of the journey passes in order and the final login with the reset password lands on the authenticated notes list

#### Scenario: Unauthorized access is denied

- **WHEN** the suite visits an authenticated route after logging out, or logs in with the pre-reset password after the reset
- **THEN** the user is redirected to the login page, or the login is rejected with an error message, and no notes are shown

#### Scenario: Validation failure is surfaced

- **WHEN** the suite submits the registration form with an invalid email or a too-short password
- **THEN** field-level validation messages are shown and no account is created

#### Scenario: Shared note is visible without authentication

- **WHEN** the suite opens the note's share link in a browser context that has no session
- **THEN** the note's title and content are shown read-only, and after the share is revoked the same link shows the "expired or revoked" unavailable message

### Requirement: Password-reset OTP is obtained from the API console output

The E2E suite SHALL obtain the password-reset OTP only from the API process's console output, matching the line for the exact email under test and using the most recent match. The suite SHALL NOT require any test-only endpoint, response field, or database access to read the OTP.

#### Scenario: OTP is read for the current user

- **WHEN** the forgot-password form is submitted for the test user's email
- **THEN** the suite reads the 6-digit OTP from the API console output for that email within a 10 second timeout and uses it in the reset form

#### Scenario: OTP never appears

- **WHEN** no OTP line for the email appears within the 10 second timeout
- **THEN** the test fails with a message containing the email, the log file path, the timeout, whether the file exists or is empty, and the last lines of the log

### Requirement: Database migrations are applied before the servers start

The E2E run SHALL apply all pending database migrations before the API and web servers are started, both locally and in CI, so a stale schema cannot cause or mask a failure.

#### Scenario: Pending migration exists

- **WHEN** `pnpm run test:e2e` is run against a database with unapplied migrations
- **THEN** the migrations are applied first and the servers start against the up-to-date schema

#### Scenario: Migration fails

- **WHEN** applying migrations fails (for example the database is unreachable)
- **THEN** the run aborts before any server starts and the migration error is shown

### Requirement: Test runs are isolated and deterministic

Each run SHALL use users with unique emails so repeated runs against the same database do not collide, SHALL run serially with a single worker, and SHALL wait on observable UI or network conditions (such as the autosave response) rather than fixed sleeps.

#### Scenario: Autosave is confirmed before dependent steps

- **WHEN** the suite edits a note's content and the next step is search, sharing or history
- **THEN** the suite first observes the autosave request complete and the editor's "Saved" status visible before continuing

#### Scenario: Re-running against a used database

- **WHEN** the suite is run twice in a row against the same database without cleanup
- **THEN** both runs pass

#### Scenario: Failure leaves diagnostics

- **WHEN** a step fails
- **THEN** a trace, screenshot and HTML report are produced for that run
