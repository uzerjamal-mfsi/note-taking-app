# notes-history Specification

## Purpose

Gives every note an automatic, recoverable history of its past states, so an
owner can see how a note changed over time and undo an unwanted edit, without
any collaborative editing or manual save/versioning action.

## Requirements

### Requirement: Automatic version snapshot on update
Every successful `PATCH /notes/:id` that actually changes the note's content
SHALL atomically commit both a `NoteVersion` capturing the note's `content`
and `title` as they were immediately before the update, and the update
itself, as a single unit: no caller-visible state SHALL ever reflect the new
content without that snapshot also existing, and no snapshot SHALL exist for
an update that did not, in the end, apply (e.g. a request that loses a race
with a concurrent change to the same note). Version rows SHALL therefore
always represent a past state of the note; the `Note` row itself SHALL
remain the sole representation of its current state. A request that fails
validation or authorization (per the existing `PATCH /notes/:id` contract)
SHALL create no version. If the submitted `content` and the resulting
`title` are both unchanged from the note's current `content` and `title` (a
no-op update), the system SHALL apply the update without creating a
version.

#### Scenario: Update creates a version of the prior state
- **WHEN** an authenticated user submits `PATCH /notes/:id` with new `content`
  for a non-deleted note they own, whose current content is C1
- **THEN** the system creates a `NoteVersion` capturing content C1 and the
  note's prior title, then stores the new content as the note's current state

#### Scenario: Failed update creates no version
- **WHEN** a `PATCH /notes/:id` request fails validation (e.g. missing
  `content`) or authorization (e.g. unauthenticated, not owned, or deleted)
- **THEN** the system creates no `NoteVersion` for that note

#### Scenario: No snapshot for a no-op update
- **WHEN** an authenticated user submits `PATCH /notes/:id` with `content`
  identical to the note's current `content` (and therefore an identical
  derived `title`) for a non-deleted note they own
- **THEN** the system responds `200 OK` as normal but creates no
  `NoteVersion` for that request

### Requirement: List a note's version history
The system SHALL allow an authenticated user to list the version history of
one of their own, non-deleted notes via `GET /notes/:id/versions`, responding
`200 OK` with the note's versions ordered most-recently-created first. Each
listed version SHALL include only its metadata - `id`, `noteId`, `title`, and
`createdAt` - and SHALL NOT include the version's `content`, so that listing
a note with many or large versions does not require transferring their full
JSON documents; a version's `content` is available only via the single-version
endpoint. A note that does not exist, belongs to a different user, or has
been soft-deleted SHALL respond `404 Not Found`, identically to
`GET /notes/:id`.

#### Scenario: Owner lists version history
- **WHEN** an authenticated user requests `GET /notes/:id/versions` for a
  non-deleted note they own that has 3 recorded versions
- **THEN** the system responds `200 OK` with all 3 versions, ordered from most
  recently created to least, each with only `id`, `noteId`, `title`, and
  `createdAt` and no `content` field

#### Scenario: Note with no versions yet
- **WHEN** an authenticated user requests `GET /notes/:id/versions` for a
  non-deleted note they own that has never been updated
- **THEN** the system responds `200 OK` with an empty list

#### Scenario: Authorization denied - another user's or deleted note
- **WHEN** an authenticated user requests `GET /notes/:id/versions` for a note
  owned by a different user, or for a note they own that has been
  soft-deleted
- **THEN** the system responds `404 Not Found`

#### Scenario: Authorization denied - unauthenticated
- **WHEN** a request to `GET /notes/:id/versions` carries no valid access
  token
- **THEN** the system responds `401 Unauthorized`

### Requirement: View a single version
The system SHALL allow an authenticated user to retrieve one specific version
of one of their own, non-deleted notes via `GET /notes/:id/versions/:versionId`,
responding `200 OK` with that version's snapshotted `content` and `title`. A
`versionId` that does not exist, or that identifies a version of a different
note, SHALL respond `404 Not Found`, identically to a note that does not
exist, belongs to a different user, or has been soft-deleted.

#### Scenario: Owner views a specific version
- **WHEN** an authenticated user requests `GET /notes/:id/versions/:versionId`
  for a version of a non-deleted note they own
- **THEN** the system responds `200 OK` with that version's snapshotted
  `content` and `title`

#### Scenario: Validation failure - versionId does not belong to the note
- **WHEN** an authenticated user requests `GET /notes/:id/versions/:versionId`
  where `versionId` does not exist, or identifies a version belonging to a
  different note
- **THEN** the system responds `404 Not Found`

#### Scenario: Authorization denied - another user's or deleted note
- **WHEN** an authenticated user requests `GET /notes/:id/versions/:versionId`
  for a note owned by a different user, or for a note they own that has been
  soft-deleted
- **THEN** the system responds `404 Not Found`

#### Scenario: Authorization denied - unauthenticated
- **WHEN** a request to `GET /notes/:id/versions/:versionId` carries no valid
  access token
- **THEN** the system responds `401 Unauthorized`

### Requirement: Restore a version
The system SHALL allow an authenticated user to restore one of their own,
non-deleted notes to a prior version via
`POST /notes/:id/versions/:versionId/restore`. Restoring SHALL first create a
`NoteVersion` capturing the note's current `content` and `title` (per
Automatic version snapshot on update), then apply the target version's
`content` as the note's new current content, re-deriving `title` the same way
a normal update does. On success, the system SHALL respond `200 OK` with the
updated note in the same response shape `PATCH /notes/:id` returns (the
note's DTO, including its current `tags`) - restore has no response shape of
its own. A `versionId` that does not exist, or that identifies a version
of a different note, SHALL respond `404 Not Found`; a note that does not
exist, belongs to a different user, or has been soft-deleted SHALL likewise
respond `404 Not Found`.

#### Scenario: Successful restore
- **WHEN** an authenticated user submits
  `POST /notes/:id/versions/:versionId/restore` for a version of a
  non-deleted note they own, and the note's current content is C2
- **THEN** the system creates a new `NoteVersion` capturing content C2, then
  replaces the note's current content with the target version's content,
  re-derives `title`, and responds `200 OK` with the updated note

#### Scenario: Validation failure - versionId does not belong to the note
- **WHEN** an authenticated user submits
  `POST /notes/:id/versions/:versionId/restore` where `versionId` does not
  exist, or identifies a version belonging to a different note
- **THEN** the system responds `404 Not Found` and does not modify the note

#### Scenario: Authorization denied - another user's or deleted note
- **WHEN** an authenticated user submits
  `POST /notes/:id/versions/:versionId/restore` for a note owned by a
  different user, or for a note they own that has been soft-deleted
- **THEN** the system responds `404 Not Found` and does not modify the note

#### Scenario: Authorization denied - unauthenticated
- **WHEN** a request to `POST /notes/:id/versions/:versionId/restore` carries
  no valid access token
- **THEN** the system responds `401 Unauthorized`

### Requirement: Auto-purge versions older than 30 days
Whenever the system creates a `NoteVersion` for a note (per Automatic version
snapshot on update, whether triggered by an ordinary update or by a restore),
it SHALL also delete that same note's existing versions whose `createdAt` is
older than 30 days, in the same transaction. Purging SHALL be scoped to the
note being written to and SHALL NOT affect any other note's version history.
No scheduled job or background process is used; purging occurs only as a
side effect of a new snapshot being written, so a no-op update (per Automatic
version snapshot on update) that creates no snapshot also triggers no purge.

#### Scenario: Old versions pruned on next snapshot
- **WHEN** a note has a version older than 30 days at the moment an update
  creates a new snapshot for that note
- **THEN** the system deletes the version older than 30 days as part of the
  same update

#### Scenario: Recent versions are not purged
- **WHEN** a note has versions all younger than 30 days at the moment an
  update creates a new snapshot for that note
- **THEN** the system retains all of them

#### Scenario: Purge does not touch other notes
- **WHEN** an update creates a new snapshot for note A, and note B (owned by
  the same or a different user) has versions older than 30 days
- **THEN** note B's versions are left untouched
