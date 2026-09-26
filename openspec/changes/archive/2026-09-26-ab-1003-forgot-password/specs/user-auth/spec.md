# Spec Delta

## ADDED Requirements

### Requirement: Forgot password request
The system SHALL allow any client to request a password-reset OTP for an email via `POST /auth/forgot-password`. Regardless of whether the submitted (normalized) email belongs to a registered user, the system SHALL respond identically — same status code, same generic body, comparable response timing — so a caller cannot use the response to discover which emails are registered.

When the email belongs to a registered user, the system SHALL generate a 6-digit numeric OTP, store only a salted hash of it (never the raw OTP) together with an expiry a short time in the future, and log the raw OTP to the console. The system SHALL NOT send the OTP by email or any other delivery channel, and SHALL NOT include the OTP in the HTTP response. Requesting a new OTP for a user SHALL invalidate any previously issued, unconsumed OTP for that same user, so at most one OTP is ever valid at a time.

#### Scenario: OTP issued for a registered email
- **WHEN** a client submits a registered (normalized) email to `POST /auth/forgot-password`
- **THEN** the system responds `200 OK` with a generic body containing no OTP, stores a salted hash of a newly generated 6-digit OTP with an expiry, and logs the raw OTP to the console only

#### Scenario: Identical response for an unregistered email
- **WHEN** a client submits an email that is not registered to `POST /auth/forgot-password`
- **THEN** the system responds with the same status code and generic body as for a registered email, generates no OTP, and logs nothing

#### Scenario: Requesting a new OTP invalidates the previous one
- **WHEN** a client submits a second `POST /auth/forgot-password` for the same registered email before the first OTP was consumed or expired
- **THEN** the first OTP becomes permanently invalid and only the newly generated OTP can succeed at `POST /auth/reset-password`

#### Scenario: Validation failure
- **WHEN** a client submits `POST /auth/forgot-password` with a missing or malformed email
- **THEN** the system responds `422 Unprocessable Entity` with field-level validation errors and generates no OTP

### Requirement: Reset password with OTP
The system SHALL allow a client to set a new password via `POST /auth/reset-password` given an email, an OTP, and a new password. The system SHALL accept the request only when the OTP's stored hash matches an unconsumed, unexpired OTP issued for that (normalized) email. On success, the system SHALL update the user's password hash, consume the OTP so it cannot be redeemed again, and respond `200 OK`.

The system SHALL respond identically — `401 Unauthorized`, a single generic code, the same generic message — whether the email is unknown, the OTP does not match, the OTP has expired, or the OTP was already consumed, so a caller cannot use the response to distinguish these cases or discover which emails are registered. On any of these failures, the system SHALL NOT change the user's password.

The new password SHALL be subject to the same minimum-length validation as registration (at least 8 characters) and SHALL be stored only as a salted hash.

#### Scenario: Successful password reset
- **WHEN** a client submits a registered email, the matching unconsumed and unexpired OTP for that email, and a new 8+ character password to `POST /auth/reset-password`
- **THEN** the system updates the user's password hash, consumes the OTP, and responds `200 OK`

#### Scenario: Authorization denied — invalid or expired OTP
- **WHEN** a client submits an OTP that does not match the stored hash for that email, or that has expired
- **THEN** the system responds `401 Unauthorized` with a generic invalid-OTP code and message, and does not change the password

#### Scenario: Authorization denied — unknown email
- **WHEN** a client submits an email that is not registered
- **THEN** the system responds with the same `401 Unauthorized` generic code and message as an invalid OTP, and does not change the password

#### Scenario: OTP cannot be reused after a successful reset
- **WHEN** a client submits `POST /auth/reset-password` again with an OTP that was already consumed by an earlier successful reset
- **THEN** the system responds `401 Unauthorized` as in Authorization denied — invalid or expired OTP, and does not change the password

#### Scenario: Validation failure
- **WHEN** a client submits `POST /auth/reset-password` missing the email, OTP, or new password, or with a new password shorter than 8 characters
- **THEN** the system responds `422 Unprocessable Entity` with field-level validation errors and does not change the password
