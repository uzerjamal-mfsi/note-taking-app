# Spec Delta

## ADDED Requirements

### Requirement: Password-reset OTP console line has a stable format

When the system logs a password-reset OTP to the console, it SHALL emit one line of the exact form `[password-reset] OTP for <normalized-email>: <6-digit-otp>`, so tooling that reads console output can locate the code. This line SHALL be the only place the raw OTP is emitted, and it SHALL NOT be written through the structured request logger.

#### Scenario: Registered email produces the documented line
- **WHEN** a client submits `POST /auth/forgot-password` for a registered email
- **THEN** exactly one console line of the form `[password-reset] OTP for <email>: <6 digits>` is written for that request

#### Scenario: Unknown email produces no line
- **WHEN** a client submits `POST /auth/forgot-password` for an unregistered email
- **THEN** no `[password-reset]` line is written

#### Scenario: Invalid request is rejected without logging
- **WHEN** a client submits `POST /auth/forgot-password` with a malformed email
- **THEN** the system responds `422 Unprocessable Entity` and writes no `[password-reset]` line
