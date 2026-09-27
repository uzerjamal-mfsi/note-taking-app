# Spec Delta

## ADDED Requirements

### Requirement: Create a tag
The system SHALL allow an authenticated user to create a tag via `POST /tags` given a `name` (required, non-empty after trimming, at most 100 characters) and a `color` (required, a `#RRGGBB` hex string, stored normalized to uppercase regardless of the case submitted). The system SHALL associate the tag with the authenticated caller as its owner. `name` SHALL be unique per user, compared case-insensitively (see the `notes-tags` capability's per-user tag identity requirement). On success, the system SHALL respond `201 Created` with the created tag, including `noteCount` equal to `0`.

#### Scenario: Successful creation
- **WHEN** an authenticated user submits `POST /tags` with `name` `"Work"` and `color` `"#ff8800"`, and has no existing tag named `work`
- **THEN** the system creates a tag owned by that user and responds `201 Created` with the tag, `color` stored and returned as `"#FF8800"`, and `noteCount` equal to `0`

#### Scenario: Validation failure - missing or invalid fields
- **WHEN** an authenticated user submits `POST /tags` with `name` missing, blank after trimming, or longer than 100 characters, or with `color` missing or not a `#RRGGBB` hex string
- **THEN** the system responds `422 Unprocessable Entity` and does not create a tag

#### Scenario: Duplicate tag name
- **WHEN** an authenticated user submits `POST /tags` with a `name` that differs only in case from a tag that user already has
- **THEN** the system responds `409 Conflict` and does not create a tag

#### Scenario: Authorization denied - unauthenticated
- **WHEN** a request to `POST /tags` carries no valid access token
- **THEN** the system responds `401 Unauthorized` and does not create a tag

### Requirement: List own tags with note counts
The system SHALL allow an authenticated user to list their own tags via `GET /tags`, responding `200 OK` with a JSON array of the caller's tags and no tags owned by any other user. Each tag in the response SHALL include `noteCount`: the number of the caller's notes that carry that tag and have not been soft-deleted. A note that has been soft-deleted SHALL NOT count toward any tag's `noteCount`, consistent with how soft-deleted notes are excluded elsewhere (see the `notes` capability).

#### Scenario: Lists only the caller's tags with counts
- **WHEN** an authenticated user requests `GET /tags` and owns two tags, one attached to three of their non-deleted notes and one attached to none, while another user owns a separate tag
- **THEN** the system responds `200 OK` with an array containing exactly the caller's two tags, `noteCount` equal to `3` for the first and `0` for the second, and no tag owned by the other user

#### Scenario: Soft-deleted notes are excluded from the count
- **WHEN** an authenticated user has a tag attached to two non-deleted notes and one soft-deleted note
- **THEN** the system responds `200 OK` with that tag's `noteCount` equal to `2`

#### Scenario: Authorization denied - unauthenticated
- **WHEN** a request to `GET /tags` carries no valid access token
- **THEN** the system responds `401 Unauthorized`

### Requirement: Update a tag
The system SHALL allow an authenticated user to update one of their own tags via `PATCH /tags/:id`, changing `name`, `color`, or both; at least one of `name` or `color` SHALL be present in the request body. `name`, when supplied, SHALL follow the same validation and per-user case-insensitive uniqueness rule as tag creation; `color`, when supplied, SHALL be a `#RRGGBB` hex string, stored normalized to uppercase regardless of the case submitted. On success, the system SHALL respond `200 OK` with the updated tag, including its current `noteCount`. A tag that does not exist or belongs to a different user SHALL respond `404 Not Found`.

#### Scenario: Successful rename and recolor
- **WHEN** an authenticated user submits `PATCH /tags/:id` with a new `name` and `color` for a tag they own
- **THEN** the system updates the tag and responds `200 OK` with the updated tag

#### Scenario: Validation failure - invalid fields
- **WHEN** an authenticated user submits `PATCH /tags/:id` with a blank or over-length `name`, or a `color` that is not a `#RRGGBB` hex string
- **THEN** the system responds `422 Unprocessable Entity` and does not modify the tag

#### Scenario: Validation failure - empty update body
- **WHEN** an authenticated user submits `PATCH /tags/:id` with an empty JSON body (`{}`), supplying neither `name` nor `color`
- **THEN** the system responds `422 Unprocessable Entity` and does not modify the tag

#### Scenario: Duplicate tag name
- **WHEN** an authenticated user submits `PATCH /tags/:id` with a `name` that differs only in case from another tag that user already has
- **THEN** the system responds `409 Conflict` and does not modify the tag

#### Scenario: Authorization denied - another user's tag
- **WHEN** an authenticated user submits `PATCH /tags/:id` for a tag owned by a different user
- **THEN** the system responds `404 Not Found` and does not modify the tag

#### Scenario: Authorization denied - unauthenticated
- **WHEN** a request to `PATCH /tags/:id` carries no valid access token
- **THEN** the system responds `401 Unauthorized`

### Requirement: Delete a tag
The system SHALL allow an authenticated user to delete one of their own tags via `DELETE /tags/:id`, removing the tag and its note associations, provided the tag is not currently carried by any non-deleted note. On success, the system SHALL respond `204 No Content` with an empty body. If the tag is still carried by at least one non-deleted note, the system SHALL respond `409 Conflict` and SHALL NOT delete the tag or untag any note. A tag that does not exist or belongs to a different user SHALL respond `404 Not Found`.

#### Scenario: Successful deletion of an unused tag
- **WHEN** an authenticated user submits `DELETE /tags/:id` for a tag they own that carries no non-deleted note
- **THEN** the system deletes the tag and responds `204 No Content` with an empty body

#### Scenario: Deletion blocked while tag is in use
- **WHEN** an authenticated user submits `DELETE /tags/:id` for a tag they own that still carries at least one non-deleted note
- **THEN** the system responds `409 Conflict`, does not delete the tag, and the note remains tagged

#### Scenario: A tag carried only by soft-deleted notes may be deleted
- **WHEN** an authenticated user submits `DELETE /tags/:id` for a tag they own that carries only soft-deleted notes
- **THEN** the system deletes the tag and responds `204 No Content`

#### Scenario: Authorization denied - another user's tag
- **WHEN** an authenticated user submits `DELETE /tags/:id` for a tag owned by a different user
- **THEN** the system responds `404 Not Found` and does not delete the tag

#### Scenario: Authorization denied - unauthenticated
- **WHEN** a request to `DELETE /tags/:id` carries no valid access token
- **THEN** the system responds `401 Unauthorized`

## MODIFIED Requirements

### Requirement: Note-tag association
The system SHALL allow a note to be associated with zero or more of its owner's tags. A note SHALL only ever be associated with tags owned by the same user who owns the note. This association exists so a note can be matched by the notes list's tag filter (see the `notes` capability); it is set via the `tagIds` field on `POST /notes` and `PATCH /notes/:id` (see the `notes` capability) - there is no separate endpoint to view or change a note's tag associations directly.

#### Scenario: A note may have multiple tags
- **WHEN** a note is associated with more than one tag
- **THEN** the note matches a tag filter request naming any one of those tags

#### Scenario: A note may have no tags
- **WHEN** a note has no tag associations
- **THEN** the note is excluded from any request that filters by tag, and included in a request that does not filter by tag
