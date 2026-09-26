# notes Specification

## Purpose

Lets an authenticated user create, read, update, and soft-delete their own notes, giving every note a durable, privately-owned record with a server-derived title.

## Requirements

### Requirement: Create a note
The system SHALL allow an authenticated user to create a note via `POST /notes` given a `content` document (a TipTap/ProseMirror JSON document). `content` SHALL be required, SHALL NOT be empty, and SHALL NOT exceed the system's maximum nesting depth (see Bounded content validation). The system SHALL derive the note's `title` from `content` (see Title derivation) and SHALL associate the note with the authenticated caller as its owner. On success, the system SHALL respond `201 Created` with the created note.

#### Scenario: Successful creation
- **WHEN** an authenticated user submits `POST /notes` with a non-empty `content` document
- **THEN** the system creates a note owned by that user and responds `201 Created` with the note, including its server-derived `title`

#### Scenario: Validation failure - missing content
- **WHEN** an authenticated user submits `POST /notes` with `content` missing or empty
- **THEN** the system responds `422 Unprocessable Entity` and does not create a note

#### Scenario: Validation failure - content exceeds maximum nesting depth
- **WHEN** an authenticated user submits `POST /notes` with a `content` document nested deeper than the system's maximum allowed depth
- **THEN** the system responds `422 Unprocessable Entity` and does not create a note

#### Scenario: Authorization denied - unauthenticated
- **WHEN** a request to `POST /notes` carries no valid access token
- **THEN** the system responds `401 Unauthorized` and does not create a note

### Requirement: Title derivation
The system SHALL derive a note's `title` from its `content` rather than accept `title` as client input, and SHALL re-derive `title` every time `content` changes (on create and on update). The derivation rule SHALL be: the plain-text content of `content`'s first node, truncated to 120 characters; if the first node has no text (or `content` yields no extractable text), `title` SHALL be `"Untitled"`.

#### Scenario: Title derived from first node text
- **WHEN** a note is created or updated with a `content` document whose first node contains the text "Grocery list"
- **THEN** the system stores and returns `title` as `"Grocery list"`

#### Scenario: Title falls back to Untitled
- **WHEN** a note is created or updated with a `content` document whose first node contains no text
- **THEN** the system stores and returns `title` as `"Untitled"`

### Requirement: Bounded content validation
The system SHALL reject a `content` document whose nodes nest deeper than a fixed maximum depth, on both create and update, so that an arbitrarily deep document cannot be stored or force expensive processing (e.g. title extraction) on the server.

#### Scenario: Content within the depth limit is accepted
- **WHEN** an authenticated user submits `content` whose deepest nesting is within the system's maximum allowed depth
- **THEN** the system accepts the request and proceeds with create/update as normal

#### Scenario: Content exceeding the depth limit is rejected
- **WHEN** an authenticated user submits `content` whose nesting exceeds the system's maximum allowed depth
- **THEN** the system responds `422 Unprocessable Entity` and does not create or modify a note

### Requirement: Retrieve a single note
The system SHALL allow an authenticated user to retrieve one of their own, non-deleted notes via `GET /notes/:id`, responding `200 OK` with the note. A note that does not exist, belongs to a different user, or has been soft-deleted SHALL be treated identically: the system SHALL respond `404 Not Found` in all three cases, so a caller cannot distinguish "does not exist" from "not yours" or "deleted".

#### Scenario: Owner retrieves their note
- **WHEN** an authenticated user requests `GET /notes/:id` for a non-deleted note they own
- **THEN** the system responds `200 OK` with that note

#### Scenario: Authorization denied - another user's note
- **WHEN** an authenticated user requests `GET /notes/:id` for a note owned by a different user
- **THEN** the system responds `404 Not Found`

#### Scenario: Validation failure - soft-deleted note
- **WHEN** an authenticated user requests `GET /notes/:id` for a note they own that has been soft-deleted
- **THEN** the system responds `404 Not Found`

#### Scenario: Authorization denied - unauthenticated
- **WHEN** a request to `GET /notes/:id` carries no valid access token
- **THEN** the system responds `401 Unauthorized`

### Requirement: List own notes
The system SHALL allow an authenticated user to list their own non-deleted notes via `GET /notes`, responding `200 OK` with an array containing every non-deleted note owned by the caller and no notes owned by any other user. The system SHALL NOT apply pagination, sorting, or filtering to this list.

#### Scenario: Lists only the caller's non-deleted notes
- **WHEN** an authenticated user requests `GET /notes` and owns two non-deleted notes, one soft-deleted note, and another user owns a separate note
- **THEN** the system responds `200 OK` with exactly the caller's two non-deleted notes

#### Scenario: Authorization denied - unauthenticated
- **WHEN** a request to `GET /notes` carries no valid access token
- **THEN** the system responds `401 Unauthorized`

### Requirement: Update a note
The system SHALL allow an authenticated user to update one of their own, non-deleted notes via `PATCH /notes/:id`, given a full replacement `content` document. `content` SHALL be required, SHALL NOT be empty, and SHALL NOT exceed the system's maximum nesting depth (see Bounded content validation). On success, the system SHALL replace the note's `content`, re-derive its `title`, and respond `200 OK` with the updated note. A note that does not exist, belongs to a different user, or has been soft-deleted SHALL respond `404 Not Found`, identically to retrieval.

#### Scenario: Successful update
- **WHEN** an authenticated user submits `PATCH /notes/:id` with a new non-empty `content` document for a non-deleted note they own
- **THEN** the system replaces the note's `content`, re-derives `title` from the new content, and responds `200 OK` with the updated note

#### Scenario: Validation failure - missing content
- **WHEN** an authenticated user submits `PATCH /notes/:id` with `content` missing or empty
- **THEN** the system responds `422 Unprocessable Entity` and does not modify the note

#### Scenario: Validation failure - content exceeds maximum nesting depth
- **WHEN** an authenticated user submits `PATCH /notes/:id` with a `content` document nested deeper than the system's maximum allowed depth
- **THEN** the system responds `422 Unprocessable Entity` and does not modify the note

#### Scenario: Authorization denied - another user's or deleted note
- **WHEN** an authenticated user submits `PATCH /notes/:id` for a note owned by a different user, or for a note they own that has been soft-deleted
- **THEN** the system responds `404 Not Found` and does not modify the note

#### Scenario: Authorization denied - unauthenticated
- **WHEN** a request to `PATCH /notes/:id` carries no valid access token
- **THEN** the system responds `401 Unauthorized`

### Requirement: Soft-delete a note
The system SHALL allow an authenticated user to soft-delete one of their own, non-deleted notes via `DELETE /notes/:id`, setting the note's `deletedAt` timestamp rather than removing the row. On success, the system SHALL respond `204 No Content` with an empty body, and the note SHALL no longer be returned by `GET /notes` or `GET /notes/:id`. A note that does not exist, belongs to a different user, or is already soft-deleted SHALL respond `404 Not Found`. This change does not provide a way to restore a soft-deleted note.

#### Scenario: Successful soft delete
- **WHEN** an authenticated user submits `DELETE /notes/:id` for a non-deleted note they own
- **THEN** the system sets the note's `deletedAt` timestamp, responds `204 No Content` with an empty body, and the note no longer appears in `GET /notes` or `GET /notes/:id`

#### Scenario: Authorization denied - another user's or already-deleted note
- **WHEN** an authenticated user submits `DELETE /notes/:id` for a note owned by a different user, or for a note they own that is already soft-deleted
- **THEN** the system responds `404 Not Found`

#### Scenario: Authorization denied - unauthenticated
- **WHEN** a request to `DELETE /notes/:id` carries no valid access token
- **THEN** the system responds `401 Unauthorized`
