# Spec Delta

## Purpose

Gives a person in the browser the pages and client-side session handling needed to register, log in, recover a forgotten password, and stay signed in across a reload, against the existing `user-auth` API.

## ADDED Requirements

### Requirement: Registration page
The application SHALL provide a registration page where a person submits name, email, and password. The form SHALL validate input client-side against the shared `registerRequestSchema` before submitting. On success (`201`), the application SHALL start a client session (see Client session state) and navigate to the originally-requested route if one was preserved by the route guard (see Route protection), otherwise to the authenticated area's default route. On failure, the application SHALL display the server's error message inline without navigating away.

#### Scenario: Successful registration
- **WHEN** a person submits a valid name, a unique email, and an 8+ character password
- **THEN** the application starts a session with the returned user and access token and navigates away from the registration page, to the originally-requested route if one was preserved, otherwise to the default authenticated route

#### Scenario: Duplicate email rejected
- **WHEN** a person submits an email that is already registered
- **THEN** the application shows the server's error message on the form and does not start a session or navigate away

#### Scenario: Client-side validation failure
- **WHEN** a person submits a password shorter than 8 characters, or leaves the name or email empty
- **THEN** the application shows a field-level validation message and does not submit the request

### Requirement: Login page
The application SHALL provide a login page where a person submits email and password. On success (`200`), the application SHALL start a client session and navigate to the originally-requested route if one was preserved by the route guard (see Route protection), otherwise to the authenticated area's default route. On a `401` response, the application SHALL display a single generic message that does not distinguish an unknown email from a wrong password.

#### Scenario: Successful login
- **WHEN** a person submits the email and password of a registered account
- **THEN** the application starts a session with the returned user and access token and navigates to the originally-requested route if one was preserved, otherwise to the default authenticated route

#### Scenario: Invalid credentials
- **WHEN** a person submits an unknown email, or a known email with the wrong password
- **THEN** the application shows the same generic "invalid email or password" message in both cases and does not start a session

#### Scenario: Client-side validation failure
- **WHEN** a person submits the login form with an empty email or empty password field
- **THEN** the application shows a field-level validation message and does not submit the request

### Requirement: Forgot-password page
The application SHALL provide a page where a person submits an email to request a password-reset OTP. Regardless of the server's response, the application SHALL display one neutral confirmation message (e.g. "if that email is registered, a code has been sent") and SHALL NOT reveal whether the email is registered. Alongside that confirmation, the application SHALL offer a way to proceed to the reset-password page, carrying the submitted email via router navigation state so it does not need to be re-entered.

#### Scenario: Request submitted for any syntactically valid email
- **WHEN** a person submits a syntactically valid email, whether or not it belongs to a registered account
- **THEN** the application shows the same neutral confirmation message and does not indicate whether the account exists

#### Scenario: Client-side validation failure
- **WHEN** a person submits a value that is not a syntactically valid email
- **THEN** the application shows a field-level validation message and does not submit the request

#### Scenario: Email carried forward to the reset-password page
- **WHEN** a person submits the forgot-password form and sees the confirmation
- **THEN** the application offers a way to proceed to the reset-password page with the submitted email passed via navigation state

### Requirement: Reset-password page
The application SHALL provide a page where a person submits an email, an OTP, and a new password to complete a password reset. On success (`200`), the application SHALL show a confirmation and navigate to the login page without starting a session. On a `401` response, the application SHALL display a single generic error message that does not distinguish an unknown email, a wrong or expired OTP, or an already-consumed OTP. When the page is reached with an email carried via navigation state (e.g. from the forgot-password page), the application SHALL pre-fill the email field with it while leaving it editable; when reached without such state (e.g. a direct URL visit), the email field SHALL start empty.

#### Scenario: Successful reset
- **WHEN** a person submits their email, the current unexpired OTP, and a new 8+ character password
- **THEN** the application shows a success confirmation and navigates to the login page

#### Scenario: Invalid or expired OTP
- **WHEN** a person submits an OTP that is wrong, expired, already consumed, or for an unknown email
- **THEN** the application shows the same generic error message in all cases and does not navigate away

#### Scenario: Client-side validation failure
- **WHEN** a person submits a new password shorter than 8 characters, or an empty OTP field
- **THEN** the application shows a field-level validation message and does not submit the request

#### Scenario: Email pre-filled from the forgot-password page
- **WHEN** a person proceeds to the reset-password page from the forgot-password page's confirmation
- **THEN** the email field is pre-filled with the previously submitted email and remains editable

### Requirement: Client session state
The application SHALL hold the current access token and authenticated user in memory (not persisted storage) for the lifetime of the page. Every outgoing request to the API SHALL include the current access token as an `Authorization: Bearer` header when a session is present, and SHALL be sent with credentials so the httpOnly refresh cookie accompanies it.

#### Scenario: Authenticated request carries the access token
- **WHEN** the application has an active session and makes a request to a protected endpoint
- **THEN** the request includes an `Authorization: Bearer <accessToken>` header and browser credentials

#### Scenario: Unauthenticated request omits the header
- **WHEN** the application has no active session and makes a request
- **THEN** the request is sent without an `Authorization` header

### Requirement: Session bootstrap on load
On application start, the application SHALL attempt to recover a session by calling the refresh endpoint once, before rendering any routed page content, and SHALL show a visible loading indicator while this is in progress. If the call succeeds, the application SHALL start a session with the returned access token. If it fails, the application SHALL proceed with no session.

#### Scenario: Session recovered after reload
- **WHEN** a person with a valid, unexpired refresh-token cookie reloads the page
- **THEN** the application shows a loading indicator, then recovers the session and renders the authenticated area without requiring re-entry of credentials

#### Scenario: No session to recover
- **WHEN** a person with no refresh-token cookie (or an expired/invalid one) loads the page
- **THEN** the application shows a loading indicator, then renders as unauthenticated without an error being surfaced to the person

### Requirement: Route protection
The application SHALL treat `/login`, `/register`, `/forgot-password`, and `/reset-password` as public routes, and every other route as requiring an active session. A person without an active session who navigates to a protected route SHALL be redirected to `/login` instead of seeing the route's content. A person with an active session who navigates to a public auth route SHALL be redirected to the authenticated area instead of seeing the auth page. When redirecting an unauthenticated person to `/login`, the application SHALL preserve the originally-requested route (e.g. via router navigation state) so that a subsequent successful login or registration can return the person to it; if no such route was preserved, successful authentication SHALL navigate to the authenticated area's default route instead.

#### Scenario: Unauthenticated access to a protected route is denied
- **WHEN** a person with no active session navigates directly to a protected route's URL
- **THEN** the application redirects to `/login` and does not render the protected route's content

#### Scenario: Authenticated access to a protected route is allowed
- **WHEN** a person with an active session navigates to a protected route
- **THEN** the application renders that route's content

#### Scenario: Already-authenticated visit to an auth page redirects away
- **WHEN** a person with an active session navigates to `/login` or `/register`
- **THEN** the application redirects to the authenticated area instead of showing the auth page

#### Scenario: Successful authentication returns to the originally-requested route
- **WHEN** a person is redirected to `/login` after attempting to visit a protected route, and then successfully logs in or registers
- **THEN** the application navigates to the originally-requested route rather than the authenticated area's default route

### Requirement: Transparent access-token refresh
When a request to the API fails with `401`, the application SHALL attempt exactly one silent call to the refresh endpoint. If that call succeeds, the application SHALL retry the original request once with the new access token. If the refresh call itself fails, the application SHALL clear the client session and redirect to `/login`. Concurrent requests that fail with `401` while a refresh is already in flight SHALL share that single in-flight refresh call rather than each starting a new one; each SHALL retry once with the resulting access token, or, if that shared refresh fails, follow the same clear-session-and-redirect behavior.

#### Scenario: Expired access token is refreshed transparently
- **WHEN** a request fails with `401` because the access token has expired, and the refresh-token cookie is still valid
- **THEN** the application obtains a new access token, retries the original request once, and the person sees no interruption

#### Scenario: Refresh itself fails
- **WHEN** a request fails with `401` and the subsequent refresh call also fails (e.g. the refresh token was revoked or reused)
- **THEN** the application clears the client session and redirects the person to `/login`

#### Scenario: Concurrent 401s share one refresh call
- **WHEN** multiple requests fail with `401` at roughly the same time because the access token has expired
- **THEN** the application makes exactly one refresh call, and every affected request retries once using its result

#### Scenario: Auth endpoints are excluded from the refresh-and-retry path
- **WHEN** a request to an auth endpoint itself (login, register, refresh, logout, forgot-password, or reset-password) fails with `401`
- **THEN** the application does not attempt a refresh call and surfaces that endpoint's own error as normal, since the `401` reflects invalid credentials or an invalid OTP rather than an expired access token

### Requirement: Logout
The application SHALL provide a logout action, available whenever a session is active, that calls the logout endpoint, clears the client session regardless of that call's outcome, and navigates to `/login`.

#### Scenario: Successful logout
- **WHEN** an authenticated person triggers logout
- **THEN** the application calls the logout endpoint, clears the session, and navigates to `/login`

#### Scenario: Logout proceeds even if the network call fails
- **WHEN** an authenticated person triggers logout and the logout request fails (e.g. network error)
- **THEN** the application still clears the client session and navigates to `/login`
