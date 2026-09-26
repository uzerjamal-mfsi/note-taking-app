# api-app-shell Specification

## Purpose

Provides the baseline request-handling pipeline that every API endpoint runs through, before any feature-specific route exists: security headers, rate limiting, structured logging, centralized error handling, and a health check.

## Requirements

### Requirement: Environment variables are validated at startup

The API SHALL validate its required environment variables (e.g. `DATABASE_URL`, `PORT`, JWT secrets) against a Zod schema at startup, and SHALL fail fast if any are missing or malformed.

#### Scenario: Missing required env var prevents startup

- **WHEN** a required environment variable is missing or fails validation
- **THEN** the process logs a clear error identifying the invalid variable and exits with a non-zero code before the HTTP server starts listening

### Requirement: The server shuts down gracefully

The API SHALL stop accepting new connections on `SIGTERM`/`SIGINT`, allowing in-flight requests to complete within a bounded timeout before exiting. Once `packages/db` exports a generated Prisma client (first model/migration), the same shutdown handler SHALL also disconnect it before exit; this change has no Prisma models yet, so there is no generated client to disconnect.

#### Scenario: SIGTERM triggers graceful shutdown

- **WHEN** the process receives `SIGTERM` or `SIGINT`
- **THEN** the HTTP server stops accepting new connections, in-flight requests are allowed to complete up to a bounded timeout, and the process then exits with code 0

### Requirement: Request bodies are size-limited

The API SHALL reject request bodies exceeding a configured size limit with HTTP 413, without processing the body.

#### Scenario: Oversized body is rejected

- **WHEN** a request body exceeds the configured size limit
- **THEN** the API responds with HTTP 413 and does not process the body

### Requirement: CORS is restricted to an explicit allowlist

The API SHALL apply CORS restricting cross-origin requests to an explicit, configurable allowlist of origins (e.g. the web app's origin).

#### Scenario: Allowed origin succeeds

- **WHEN** a cross-origin request arrives from an origin on the configured allowlist
- **THEN** the response includes CORS headers permitting that origin

#### Scenario: Disallowed origin is rejected

- **WHEN** a cross-origin request arrives from an origin not on the configured allowlist
- **THEN** the response does not include CORS headers permitting that origin

### Requirement: Security headers are applied to every response

The API SHALL apply Helmet's default security headers to every HTTP response.

#### Scenario: Response includes security headers

- **WHEN** any request is made to the API
- **THEN** the response includes Helmet's standard security headers (e.g. `X-Content-Type-Options`, `X-Frame-Options`, a `Content-Security-Policy`)

### Requirement: Requests are rate-limited

The API SHALL apply a global rate limit to incoming requests and reject requests over the limit with HTTP 429.

#### Scenario: Requests over the limit are rejected

- **WHEN** a single client exceeds the configured request-rate threshold within the configured window
- **THEN** further requests from that client receive an HTTP 429 response until the window resets

### Requirement: Every request is logged with structured, non-sensitive fields

The API SHALL log every request (method, path, status code, duration) via the shared `pino` logger, and SHALL NOT log request bodies, passwords, OTPs, or auth tokens.

#### Scenario: A request is logged without sensitive data

- **WHEN** a request carrying an `Authorization` header or a body containing a password field is handled
- **THEN** the emitted log entry includes method/path/status/duration and does not include the `Authorization` header value, the password, or any token

### Requirement: Unhandled errors are caught by a central error-handling middleware

Every route SHALL be wrapped so that thrown or rejected errors reach a single central error-handling middleware, which SHALL translate an `AppError` into its declared HTTP status and a JSON error payload matching the shared error response shape, and SHALL translate any other unhandled error into a generic 500 response without leaking internal details.

#### Scenario: A thrown AppError produces its declared status

- **WHEN** a route handler throws `AppError(code, status, message)`
- **THEN** the response has that `status` and a JSON body containing `code` and `message`

#### Scenario: An unexpected error does not leak internals

- **WHEN** a route handler throws an error that is not an `AppError`
- **THEN** the response is HTTP 500 with a generic JSON error body, and the error's stack trace is logged, not returned in the response

### Requirement: All error responses share one documented shape

Every error response the API returns (thrown `AppError`, Zod validation failure, generic 500) SHALL use one JSON shape — `{ code, message, details? }` — defined once as a shared type in `packages/shared` and imported by every place that constructs an error response.

#### Scenario: Validation failure uses the shared error shape

- **WHEN** a request fails Zod validation
- **THEN** the response body matches the shared error-response shape, with `code` identifying a validation failure and `details` describing the failing field(s)

#### Scenario: Every error path produces the same shape

- **WHEN** an `AppError`, a validation failure, and an unhandled error are each triggered
- **THEN** all three responses conform to the same `{ code, message, details? }` shape rather than three different ad hoc payloads

### Requirement: Unmatched routes return a 404

A request to any path not matched by a defined route SHALL receive an HTTP 404 JSON response.

#### Scenario: Unknown route returns 404

- **WHEN** a request is made to a path with no matching route
- **THEN** the response is HTTP 404 with a JSON error body

### Requirement: A health-check endpoint reports service status

The API SHALL expose a health-check endpoint that returns HTTP 200 when the service is up.

#### Scenario: Health check succeeds

- **WHEN** a request is made to the health-check endpoint
- **THEN** the response is HTTP 200 with a JSON body indicating the service is healthy
