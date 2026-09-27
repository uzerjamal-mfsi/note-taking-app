# notes Specification

## Purpose

Lets an authenticated user create, read, update, and soft-delete their own notes, giving every note a durable, privately-owned record with a server-derived title.

## Requirements

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
The system SHALL allow an authenticated user to list their own non-deleted notes via `GET /notes`, responding `200 OK` with a page of matching notes and no notes owned by any other user. The response body SHALL be a JSON object `{ data: Note[], meta: { page, pageSize, total, totalPages, hasNextPage, hasPreviousPage } }`, where:
- `data` is the notes on the requested page
- `page` and `pageSize` echo the effective (post-default) values
- `total` is the count of all notes matching the request (before pagination is applied)
- `totalPages` is the number of pages of size `pageSize` needed to hold `total` notes (`0` when `total` is `0`)
- `hasNextPage` is `true` when a page after `page` exists, else `false`
- `hasPreviousPage` is `true` when a page before `page` exists, else `false`

The system SHALL accept the following optional query parameters on `GET /notes`:
- `page`: a positive integer, default `1`.
- `pageSize`: a positive integer, default `20`, maximum `100`.
- `sortBy`: one of `createdAt` or `updatedAt`, default `updatedAt`.
- `sortDir`: one of `asc` or `desc`, default `desc`.
- `tags`: a comma-separated list of tag names. Each name SHALL be trimmed of surrounding whitespace, and any resulting empty name SHALL be dropped, before matching; at most 10 tag names may be supplied after this normalization. When present, the system SHALL return only notes that have at least one of the listed tags (OR matching), matched case-insensitively. When absent (or reduced to zero names after normalization), the system SHALL NOT filter by tag.

Within a requested sort order, the system SHALL break ties deterministically (by `id`, in the same direction as `sortDir`) so that two notes sharing the same `sortBy` value always appear in the same relative order and neither page repeats nor skips a note across requests.

A `page` beyond the last available page SHALL return `200 OK` with an empty `data` array and the correct `total`/`totalPages`/`hasNextPage`/`hasPreviousPage`, not an error. A `page`, `pageSize`, `sortBy`, `sortDir`, or `tags` value that does not conform to the above (including non-integer `page`/`pageSize`, `pageSize` above `100`, a `sortBy`/`sortDir` outside the listed values, or more than 10 tag names after normalization) SHALL be rejected with `422 Unprocessable Entity` without querying the database.

#### Scenario: Lists only the caller's non-deleted notes
- **WHEN** an authenticated user requests `GET /notes` and owns two non-deleted notes, one soft-deleted note, and another user owns a separate note
- **THEN** the system responds `200 OK` with `data` containing exactly the caller's two non-deleted notes and `meta.total` equal to `2`

#### Scenario: Default pagination
- **WHEN** an authenticated user with 25 non-deleted notes requests `GET /notes` with no query parameters
- **THEN** the system responds `200 OK` with `meta.page` equal to `1`, `meta.pageSize` equal to `20`, `meta.total` equal to `25`, `meta.totalPages` equal to `2`, `meta.hasNextPage` equal to `true`, `meta.hasPreviousPage` equal to `false`, and `data` containing the 20 notes sorted by `updatedAt` descending

#### Scenario: Requesting a later page
- **WHEN** an authenticated user with 25 non-deleted notes requests `GET /notes?page=2&pageSize=20`
- **THEN** the system responds `200 OK` with `data` containing the remaining 5 notes, `meta.total` equal to `25`, `meta.totalPages` equal to `2`, `meta.hasNextPage` equal to `false`, and `meta.hasPreviousPage` equal to `true`

#### Scenario: Page beyond the last page
- **WHEN** an authenticated user with 5 non-deleted notes requests `GET /notes?page=3&pageSize=20`
- **THEN** the system responds `200 OK` with an empty `data` array, `meta.total` equal to `5`, `meta.totalPages` equal to `1`, and `meta.hasNextPage` equal to `false`

#### Scenario: Sorting by createdAt ascending
- **WHEN** an authenticated user requests `GET /notes?sortBy=createdAt&sortDir=asc`
- **THEN** the system responds `200 OK` with `data` ordered from the earliest-created note to the most recently created

#### Scenario: Stable ordering when sort values tie
- **WHEN** an authenticated user owns several notes with an identical `updatedAt` timestamp and requests `GET /notes` across multiple pages with the default sort
- **THEN** each note appears on exactly one page, in the same relative order, on every request, ordered by `id` descending among the tied notes

#### Scenario: Filtering by a single tag
- **WHEN** an authenticated user requests `GET /notes?tags=work` and owns three non-deleted notes, of which two have a tag named `work`
- **THEN** the system responds `200 OK` with `data` containing exactly those two notes

#### Scenario: Filtering by multiple tags is OR, not AND
- **WHEN** an authenticated user requests `GET /notes?tags=work,personal` and owns one note tagged only `work`, one note tagged only `personal`, and one note tagged neither
- **THEN** the system responds `200 OK` with `data` containing exactly the two tagged notes

#### Scenario: Tag filtering is case-insensitive
- **WHEN** an authenticated user requests `GET /notes?tags=Work` and owns a note tagged with a tag whose stored name is `work`
- **THEN** the system responds `200 OK` with `data` containing that note

#### Scenario: Tag names are trimmed and blank entries are dropped
- **WHEN** an authenticated user requests `GET /notes?tags=%20work%20,,personal` (i.e. `tags` containing `" work "`, an empty entry, and `"personal"`)
- **THEN** the system treats the filter as `["work", "personal"]` and responds `200 OK` with notes matching either tag

#### Scenario: Tag filter matching no notes
- **WHEN** an authenticated user requests `GET /notes?tags=nonexistent` and owns non-deleted notes but none carry that tag
- **THEN** the system responds `200 OK` with an empty `data` array and `meta.total` equal to `0`

#### Scenario: Validation failure - pageSize exceeds maximum
- **WHEN** an authenticated user requests `GET /notes?pageSize=101`
- **THEN** the system responds `422 Unprocessable Entity` and does not query notes

#### Scenario: Validation failure - invalid sortBy
- **WHEN** an authenticated user requests `GET /notes?sortBy=title`
- **THEN** the system responds `422 Unprocessable Entity` and does not query notes

#### Scenario: Validation failure - too many tags
- **WHEN** an authenticated user requests `GET /notes?tags=` followed by 11 distinct, non-blank tag names
- **THEN** the system responds `422 Unprocessable Entity` and does not query notes

#### Scenario: Authorization denied - unauthenticated
- **WHEN** a request to `GET /notes` carries no valid access token
- **THEN** the system responds `401 Unauthorized`

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
