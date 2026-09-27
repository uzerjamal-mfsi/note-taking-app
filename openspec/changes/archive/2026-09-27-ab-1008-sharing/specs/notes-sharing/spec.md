# Spec Delta

## Purpose

Lets a note's owner generate a revocable public link so anyone holding it can read the note's content without an account, while tracking how many times it has been viewed.

## ADDED Requirements

### Requirement: Generate a share link
The system SHALL allow an authenticated user to generate a public share link for one of their own, non-deleted notes via `POST /notes/:id/share`. A share link is **active** if it exists and its `expiresAt` is either absent or strictly in the future; a link that exists but has expired is treated as if no share link exists. If the note has no active share link (none exists, or the existing one has expired), the system SHALL create one - replacing any expired link record for that note - with a newly generated, unguessable opaque `token` (not derived from or equal to the note's `id`) and a `viewCount` of `0`, and SHALL respond `201 Created` with the share link (`token`, `viewCount`, `expiresAt`, `createdAt`). The request body MAY include an optional `expiresAt` timestamp; when present, it SHALL identify a point in time strictly after the request is made, and the created link SHALL expire at that time (see Public read of a shared note). When `expiresAt` is absent, the created link SHALL NOT expire. A supplied `expiresAt` that is not a valid timestamp, or that is not strictly in the future, SHALL cause the system to respond `422 Unprocessable Entity` and create no share link. If the note already has an active share link, the system SHALL NOT create a new one, change its `token`, or change its `expiresAt` (even if a different `expiresAt` is supplied on this request), and SHALL respond `200 OK` with the existing share link unchanged (idempotent).

#### Scenario: First generation creates a new link
- **WHEN** an authenticated user submits `POST /notes/:id/share` for their own note that has no share link, with no `expiresAt`
- **THEN** the system creates a share link with `viewCount` `0`, `expiresAt` `null`, and responds `201 Created` with the link

#### Scenario: First generation with an expiry
- **WHEN** an authenticated user submits `POST /notes/:id/share` for their own note that has no share link, with a future-dated `expiresAt`
- **THEN** the system creates a share link whose `expiresAt` equals the supplied value and responds `201 Created` with the link

#### Scenario: Generating replaces an expired link
- **WHEN** an authenticated user submits `POST /notes/:id/share` for their own note whose only share link has an `expiresAt` in the past
- **THEN** the system creates a new share link with a new `token` and `viewCount` `0`, responds `201 Created`, and the expired link's former `token` continues to respond `404 Not Found` from the public read endpoint

#### Scenario: Validation failure - expiresAt not in the future
- **WHEN** an authenticated user submits `POST /notes/:id/share` with an `expiresAt` that is not a valid timestamp, or is not strictly after the current time
- **THEN** the system responds `422 Unprocessable Entity` and creates no share link

#### Scenario: Generating again returns the existing link
- **WHEN** an authenticated user submits `POST /notes/:id/share` for their own note that already has an active share link, whether or not this request supplies an `expiresAt`
- **THEN** the system makes no change and responds `200 OK` with the same `token`, `expiresAt`, and current `viewCount` as before

#### Scenario: Validation failure - note does not exist
- **WHEN** an authenticated user submits `POST /notes/:id/share` for a note id that does not identify any of their own, non-deleted notes
- **THEN** the system responds `404 Not Found` and creates no share link

#### Scenario: Authorization denied - another user's note
- **WHEN** an authenticated user submits `POST /notes/:id/share` for a note owned by a different user
- **THEN** the system responds `404 Not Found` and creates no share link

#### Scenario: Authorization denied - unauthenticated
- **WHEN** a request to `POST /notes/:id/share` carries no valid access token
- **THEN** the system responds `401 Unauthorized` and creates no share link

### Requirement: Fetch current share link state
The system SHALL allow an authenticated user to fetch the current share link for one of their own, non-deleted notes via `GET /notes/:id/share`, responding `200 OK` with the share link (`token`, `viewCount`, `expiresAt`, `createdAt`) if one is active, or `404 Not Found` if the note has no active share link. A link whose `expiresAt` has passed SHALL be treated as not active for this endpoint.

#### Scenario: Owner fetches an active share link
- **WHEN** an authenticated user requests `GET /notes/:id/share` for their own note that has an active, unexpired share link
- **THEN** the system responds `200 OK` with that link's `token`, `viewCount`, `expiresAt`, and `createdAt`

#### Scenario: Validation failure - no active share link
- **WHEN** an authenticated user requests `GET /notes/:id/share` for their own note that has no active share link
- **THEN** the system responds `404 Not Found`

#### Scenario: Validation failure - share link has expired
- **WHEN** an authenticated user requests `GET /notes/:id/share` for their own note whose only share link has an `expiresAt` in the past
- **THEN** the system responds `404 Not Found`

#### Scenario: Authorization denied - another user's note
- **WHEN** an authenticated user requests `GET /notes/:id/share` for a note owned by a different user
- **THEN** the system responds `404 Not Found`

#### Scenario: Authorization denied - unauthenticated
- **WHEN** a request to `GET /notes/:id/share` carries no valid access token
- **THEN** the system responds `401 Unauthorized`

### Requirement: Revoke a share link
The system SHALL allow an authenticated user to revoke the active share link for one of their own notes via `DELETE /notes/:id/share`, deleting it outright so its `token` immediately stops resolving via the public read endpoint. On success the system SHALL respond `204 No Content`. If the note has no active share link (none exists, or the existing one has already expired), the system SHALL respond `404 Not Found` and change nothing.

#### Scenario: Owner revokes an active share link
- **WHEN** an authenticated user submits `DELETE /notes/:id/share` for their own note that has an active share link
- **THEN** the system deletes the share link, responds `204 No Content`, and the link's former `token` responds `404 Not Found` from the public read endpoint from that point on

#### Scenario: Validation failure - no active share link
- **WHEN** an authenticated user submits `DELETE /notes/:id/share` for their own note that has no active share link
- **THEN** the system responds `404 Not Found` and changes nothing

#### Scenario: Validation failure - share link has expired
- **WHEN** an authenticated user submits `DELETE /notes/:id/share` for their own note whose only share link has an `expiresAt` in the past
- **THEN** the system responds `404 Not Found` and changes nothing

#### Scenario: Authorization denied - another user's note
- **WHEN** an authenticated user submits `DELETE /notes/:id/share` for a note owned by a different user
- **THEN** the system responds `404 Not Found` and changes nothing

#### Scenario: Authorization denied - unauthenticated
- **WHEN** a request to `DELETE /notes/:id/share` carries no valid access token
- **THEN** the system responds `401 Unauthorized`

### Requirement: Public read of a shared note
The system SHALL allow anyone, without authentication, to read a note via `GET /shared/:token` when `:token` identifies an active share link (see Generate a share link for what "active" means, including expiry) whose note is not soft-deleted. This check SHALL be evaluated directly against the current state of the share link and its note at read time - not solely by relying on the share link having been deleted when the note was soft-deleted - so that a token can never serve a soft-deleted note's content regardless of how that state was reached. On a match, the system SHALL respond `200 OK` with only the note's `title` and `content` (no owner, tags, ids, or timestamps), and SHALL atomically increment that share link's `viewCount` by exactly `1` as part of serving the request. When `:token` does not identify an active share link for a non-deleted note (never issued, already revoked, expired, or belonging to a since-deleted note), the system SHALL respond `404 Not Found` and SHALL NOT change any `viewCount`.

#### Scenario: Public visitor reads a shared note
- **WHEN** anyone requests `GET /shared/:token` for a token identifying an active share link
- **THEN** the system responds `200 OK` with that note's `title` and `content`, and the link's `viewCount` is one greater than before the request

#### Scenario: Concurrent reads increment the count atomically
- **WHEN** multiple concurrent requests are made to `GET /shared/:token` for the same active share link
- **THEN** the resulting `viewCount` reflects every successful request with no lost updates, regardless of request ordering or overlap

#### Scenario: Validation failure - unknown or revoked token
- **WHEN** anyone requests `GET /shared/:token` for a token that does not identify any active share link (never issued, or already revoked)
- **THEN** the system responds `404 Not Found` and changes no `viewCount`

#### Scenario: Validation failure - expired token
- **WHEN** anyone requests `GET /shared/:token` for a token whose share link has an `expiresAt` in the past
- **THEN** the system responds `404 Not Found` and changes no `viewCount`

### Requirement: Public route is independently rate-limited
The system SHALL apply a rate limit to `GET /shared/:token` that is tracked separately from, and at least as strict as, the application's global rate limit, so that repeated requests against a single token cannot amplify database writes (via the atomic view-count increment) beyond what the global limit alone would allow. A request rejected for exceeding this limit SHALL respond `429 Too Many Requests` and SHALL NOT change any `viewCount`.

#### Scenario: Requests over the per-route limit are rejected
- **WHEN** requests to `GET /shared/:token` from the same caller exceed this route's own rate limit within its window, even while under the application's global rate limit
- **THEN** the system responds `429 Too Many Requests` to the excess requests and does not change `viewCount` for any of them

### Requirement: Soft-deleting a note revokes its share link
The system SHALL delete a note's active share link, if any, whenever that note is soft-deleted via `DELETE /notes/:id`, as part of the same operation, so a deleted note's former public link responds `404 Not Found` immediately.

#### Scenario: Deleting a shared note revokes its link
- **WHEN** an authenticated user soft-deletes their own note via `DELETE /notes/:id` and that note has an active share link
- **THEN** the system deletes the share link along with soft-deleting the note, and the link's former `token` responds `404 Not Found` from the public read endpoint from that point on
