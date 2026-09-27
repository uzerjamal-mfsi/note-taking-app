# Spec Delta

## MODIFIED Requirements

### Requirement: Create a note
The system SHALL allow an authenticated user to create a note via `POST /notes` given a `content` document (a TipTap/ProseMirror JSON document). `content` SHALL be required, SHALL NOT be empty, and SHALL NOT exceed the system's maximum nesting depth (see Bounded content validation). The system SHALL derive the note's `title` from `content` (see Title derivation) and SHALL associate the note with the authenticated caller as its owner. The system SHALL accept an optional `tagIds` array of the caller's own tag ids and SHALL associate the created note with exactly those tags; any `tagId` that does not identify a tag owned by the caller SHALL cause the system to respond `422 Unprocessable Entity` and create no note. On success, the system SHALL respond `201 Created` with the created note, including its `tags` (the tags associated per the resolved `tagIds`, or empty if none were given).

#### Scenario: Successful creation
- **WHEN** an authenticated user submits `POST /notes` with a non-empty `content` document
- **THEN** the system creates a note owned by that user and responds `201 Created` with the note, including its server-derived `title`

#### Scenario: Successful creation with tags
- **WHEN** an authenticated user submits `POST /notes` with a non-empty `content` document and `tagIds` naming two tags they own
- **THEN** the system creates the note associated with both tags and responds `201 Created` with the note's `tags` containing both

#### Scenario: Validation failure - missing content
- **WHEN** an authenticated user submits `POST /notes` with `content` missing or empty
- **THEN** the system responds `422 Unprocessable Entity` and does not create a note

#### Scenario: Validation failure - content exceeds maximum nesting depth
- **WHEN** an authenticated user submits `POST /notes` with a `content` document nested deeper than the system's maximum allowed depth
- **THEN** the system responds `422 Unprocessable Entity` and does not create a note

#### Scenario: Validation failure - tagId not owned by caller
- **WHEN** an authenticated user submits `POST /notes` with a `tagIds` entry that does not identify a tag they own (nonexistent, or owned by another user)
- **THEN** the system responds `422 Unprocessable Entity` and does not create a note

#### Scenario: Authorization denied - unauthenticated
- **WHEN** a request to `POST /notes` carries no valid access token
- **THEN** the system responds `401 Unauthorized` and does not create a note

### Requirement: Update a note
The system SHALL allow an authenticated user to update one of their own, non-deleted notes via `PATCH /notes/:id`, given a full replacement `content` document. `content` SHALL be required, SHALL NOT be empty, and SHALL NOT exceed the system's maximum nesting depth (see Bounded content validation). The system SHALL accept an optional `tagIds` array of the caller's own tag ids; when supplied, the system SHALL replace the note's entire set of tag associations with exactly those tags, and when omitted, the system SHALL leave the note's existing tag associations unchanged. Any `tagId` that does not identify a tag owned by the caller SHALL cause the system to respond `422 Unprocessable Entity` and modify neither the note's content nor its tags. On success, the system SHALL replace the note's `content`, re-derive its `title`, apply any requested tag replacement, and respond `200 OK` with the updated note, including its current `tags`. A note that does not exist, belongs to a different user, or has been soft-deleted SHALL respond `404 Not Found`, identically to retrieval.

#### Scenario: Successful update
- **WHEN** an authenticated user submits `PATCH /notes/:id` with a new non-empty `content` document for a non-deleted note they own
- **THEN** the system replaces the note's `content`, re-derives `title` from the new content, and responds `200 OK` with the updated note

#### Scenario: Successful update replacing tags
- **WHEN** an authenticated user submits `PATCH /notes/:id` with `tagIds` naming a different set of their own tags than the note currently carries
- **THEN** the system replaces the note's tag associations with exactly that set and responds `200 OK` with the updated note's `tags` reflecting it

#### Scenario: Omitting tagIds leaves tags unchanged
- **WHEN** an authenticated user submits `PATCH /notes/:id` with a new `content` document and no `tagIds` field, for a note that currently carries tags
- **THEN** the system updates `content` and `title` but leaves the note's tag associations unchanged

#### Scenario: Validation failure - missing content
- **WHEN** an authenticated user submits `PATCH /notes/:id` with `content` missing or empty
- **THEN** the system responds `422 Unprocessable Entity` and does not modify the note

#### Scenario: Validation failure - content exceeds maximum nesting depth
- **WHEN** an authenticated user submits `PATCH /notes/:id` with a `content` document nested deeper than the system's maximum allowed depth
- **THEN** the system responds `422 Unprocessable Entity` and does not modify the note

#### Scenario: Validation failure - tagId not owned by caller
- **WHEN** an authenticated user submits `PATCH /notes/:id` with a `tagIds` entry that does not identify a tag they own (nonexistent, or owned by another user)
- **THEN** the system responds `422 Unprocessable Entity` and modifies neither the note's content nor its tags

#### Scenario: Authorization denied - another user's or deleted note
- **WHEN** an authenticated user submits `PATCH /notes/:id` for a note owned by a different user, or for a note they own that has been soft-deleted
- **THEN** the system responds `404 Not Found` and does not modify the note

#### Scenario: Authorization denied - unauthenticated
- **WHEN** a request to `PATCH /notes/:id` carries no valid access token
- **THEN** the system responds `401 Unauthorized`
