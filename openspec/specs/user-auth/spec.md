# user-auth Specification

## Purpose

Lets a person create an account and prove their identity across requests, and gives every other capability a way to require that identity before acting.

## Requirements

### Requirement: User registration
The system SHALL allow a new user to register with a name, email, and password, and SHALL reject an email that is already registered.

The password SHALL be at least 8 characters. The password SHALL be stored only as a salted hash, never in plaintext or in logs.

The email SHALL be normalized (leading/trailing whitespace trimmed, letters lowercased) before it is compared against existing users or stored, so two submissions that differ only by case or surrounding whitespace are treated as the same address.

On success, the system SHALL create the user, start a new session (see Session issuance on login), and respond `201 Created` with the created user (id, name, normalized email — never the password or its hash) and an access token.

#### Scenario: Successful registration
- **WHEN** a client submits a name, a well-formed email not already registered, and an 8+ character password to `POST /auth/register`
- **THEN** the system creates the user, responds `201 Created` with the user and an access token, and issues a refresh-token session

#### Scenario: Duplicate email rejected
- **WHEN** a client submits a registration with an email that already belongs to an existing user
- **THEN** the system responds `409 Conflict` and does not create a new user or session

#### Scenario: Duplicate email rejected regardless of case or whitespace
- **WHEN** a client submits a registration whose email matches an existing user's email after normalization (e.g. differs only by case or leading/trailing whitespace)
- **THEN** the system responds `409 Conflict` and does not create a new user or session

#### Scenario: Validation failure
- **WHEN** a client submits registration data missing the email, with a malformed email, or with a password shorter than 8 characters
- **THEN** the system responds `422 Unprocessable Entity` with field-level validation errors and creates no user or session

### Requirement: Login
The system SHALL allow a registered user to authenticate with their (normalized) email and password. The system SHALL respond identically — `401 Unauthorized`, `code: "INVALID_CREDENTIALS"`, the same generic message, and comparable response timing — whether the email is unknown or the password is wrong, so a caller cannot use the response's content or timing to discover which emails are registered.

On success, the system SHALL start a new session (see Session issuance on login) and respond `200 OK` with the user and an access token.

#### Scenario: Successful login
- **WHEN** a client submits the correct email and password for an existing user to `POST /auth/login`
- **THEN** the system responds `200 OK` with the user and an access token, and issues a new refresh-token session

#### Scenario: Wrong password rejected
- **WHEN** a client submits a registered email with an incorrect password
- **THEN** the system responds `401 Unauthorized` with `code: "INVALID_CREDENTIALS"` and a generic message, and issues no session

#### Scenario: Unknown email rejected
- **WHEN** a client submits an email that is not registered
- **THEN** the system responds `401 Unauthorized` with the same `code: "INVALID_CREDENTIALS"` and generic message as a wrong password, and issues no session

#### Scenario: Validation failure
- **WHEN** a client submits a login request missing the email or password field
- **THEN** the system responds `422 Unprocessable Entity` with field-level validation errors

### Requirement: Session issuance on login
Whenever the system starts a new session (on register or login), it SHALL issue an access token and a refresh token for that session. The access token SHALL be returned in the JSON response body and SHALL expire 15 minutes after issuance. The refresh token SHALL be delivered only as an httpOnly, secure, same-site cookie — never in the JSON response body — and SHALL expire 7 days after issuance.

A user MAY hold more than one concurrent session (e.g. one per device); starting a new session SHALL NOT invalidate the user's other active sessions.

#### Scenario: Refresh token never exposed in response body
- **WHEN** a session is issued via registration or login
- **THEN** the JSON response body contains the access token and user, and contains no refresh token in any form

### Requirement: Access token verification
The system SHALL treat a request to a protected endpoint as authenticated only when it carries a valid, unexpired access token signed with the expected algorithm, and SHALL identify the acting user from that token's claims.

#### Scenario: Protected request with valid access token
- **WHEN** a request to a protected endpoint carries a valid, unexpired access token
- **THEN** the system processes the request as that token's user

#### Scenario: Authorization denied — missing or invalid access token
- **WHEN** a request to a protected endpoint carries no access token, an expired access token, a token that fails signature verification, or a token signed with an algorithm other than the one the system issues
- **THEN** the system responds `401 Unauthorized` with `code: "UNAUTHENTICATED"` and does not process the request

### Requirement: Refresh token family and atomic rotation
Every session's refresh tokens SHALL belong to a single rotation family established at login or registration. The system SHALL allow a client holding a valid, unexpired, unrevoked refresh token to obtain a new access token without re-authenticating, via `POST /auth/refresh`. Each successful refresh SHALL, as a single atomic operation, revoke the presented refresh token and issue a new refresh token in the same family, so a given refresh token can be redeemed at most once and the family never has more than one currently-valid token. A failure partway through rotation SHALL leave the presented token's validity unchanged (either the rotation fully completes, or it has no effect) — it SHALL NOT leave the old token revoked without a corresponding new token having been issued.

#### Scenario: Successful refresh
- **WHEN** a client calls `POST /auth/refresh` with a valid, unrevoked, unexpired refresh-token cookie
- **THEN** the system responds `200 OK` with a new access token, revokes the presented refresh token, and sets a new refresh-token cookie in the same family

#### Scenario: Authorization denied — missing or expired refresh token
- **WHEN** a client calls `POST /auth/refresh` with no refresh-token cookie or an expired one
- **THEN** the system responds `401 Unauthorized` with `code: "UNAUTHENTICATED"` and issues no new tokens

#### Scenario: Rotation failure leaves no partial state
- **WHEN** the system fails to complete a rotation after revoking the presented token (e.g. the new-token insert fails)
- **THEN** the presented token is not left revoked with no replacement — the rotation is rolled back as a whole and the client can retry

### Requirement: Refresh token reuse detection
If a refresh token that has already been revoked (redeemed by an earlier refresh, or explicitly revoked by logout) is presented again to `POST /auth/refresh`, the system SHALL treat this as a signal of possible token theft: it SHALL revoke every refresh token in that session's rotation family and SHALL respond `401 Unauthorized`.

#### Scenario: Reused refresh token revokes the session family
- **WHEN** a client presents a refresh token that was already redeemed or revoked by an earlier request
- **THEN** the system responds `401 Unauthorized` with `code: "UNAUTHENTICATED"`, and every refresh token in the same rotation family becomes unusable for future refresh calls

### Requirement: Logout
The system SHALL allow an authenticated client to end its current session via `POST /auth/logout`, revoking the session's refresh token and clearing the refresh-token cookie. Logout SHALL NOT affect the user's other active sessions. Logout revokes only the refresh token; it SHALL NOT and — being a stateless JWT — cannot revoke an access token already issued for that session, which SHALL remain valid until its own expiry (up to 15 minutes later).

#### Scenario: Successful logout
- **WHEN** an authenticated client with a valid refresh-token cookie calls `POST /auth/logout`
- **THEN** the system revokes that session's refresh token, clears the refresh-token cookie, and responds `204 No Content`

#### Scenario: Access token still valid immediately after logout
- **WHEN** a client calls `POST /auth/logout` and then makes a request to a protected endpoint using the access token issued before logout, before that token's expiry
- **THEN** the system processes the request as that token's user, since logout does not revoke access tokens

#### Scenario: Refresh token unusable after logout
- **WHEN** a client presents a refresh token that was revoked by a prior logout
- **THEN** `POST /auth/refresh` responds `401 Unauthorized` as in Refresh token reuse detection

#### Scenario: Authorization denied — logout without a session
- **WHEN** a client calls `POST /auth/logout` with no refresh-token cookie
- **THEN** the system responds `401 Unauthorized` with `code: "UNAUTHENTICATED"` and revokes nothing

### Requirement: Rate limiting applies to auth endpoints
The system's existing general-purpose rate limiter SHALL apply to all `/auth` endpoints in the same way it applies to every other endpoint. A dedicated, stricter brute-force policy specific to login/register is deferred and is not a requirement of this capability.

#### Scenario: Auth endpoint subject to the general rate limit
- **WHEN** a client exceeds the system's configured request-rate limit while calling any `/auth` endpoint
- **THEN** the system responds `429 Too Many Requests`, the same as it would for any other rate-limited endpoint

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
