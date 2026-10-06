# Spec Delta

## Purpose

Gives the owner of a note a History drawer in the editor to browse the note's past versions, preview one read-only, and restore it, built on the existing `notes-history` API.

## ADDED Requirements

### Requirement: History drawer lists a note's versions
Activating the editor's "History" action SHALL open a drawer for the note being edited. While the drawer is open, the system SHALL fetch `GET /notes/:id/versions` and render one of: a loading indicator, an empty state when the note has no versions, the list of versions (most recent first, as returned by the API), or a retryable error state for any non-404 failure. Each list entry SHALL show the version's `title` and its `createdAt` formatted as a locale-aware date and time. The drawer SHALL state that versions are kept for 30 days. The system SHALL NOT request the version list while the drawer is closed.

#### Scenario: Drawer shows versions
- **WHEN** the user opens the History drawer for a note with 3 versions
- **THEN** the system fetches `GET /notes/:id/versions` and lists 3 entries, most recent first, each with its title and formatted creation time, along with the "kept for 30 days" note

#### Scenario: No versions yet
- **WHEN** the user opens the History drawer and the API responds with an empty list
- **THEN** the drawer shows an empty state saying the note has no earlier versions

#### Scenario: Loading state
- **WHEN** the version list request has not yet resolved
- **THEN** the drawer shows a visible loading indicator

#### Scenario: List request fails
- **WHEN** `GET /notes/:id/versions` fails with a network error or a non-2xx, non-404 response
- **THEN** the drawer shows an error state with a Retry action that re-requests the list

#### Scenario: No request while closed
- **WHEN** the editor is displayed and the History drawer has never been opened
- **THEN** no `GET /notes/:id/versions` request is made

#### Scenario: Authorization denied - not found, not owned, or deleted
- **WHEN** `GET /notes/:id/versions` responds `404 Not Found`
- **THEN** the system handles it per "A 404 from any history request defers to the editor's not-found state"

#### Scenario: Validation failure - unauthenticated session
- **WHEN** a visitor with no valid session navigates to `/notes/:id`
- **THEN** the system redirects to `/login` per the existing route guard, and no History action or versions request is made

### Requirement: Selecting a version shows a read-only preview
Selecting a version in the list SHALL fetch `GET /notes/:id/versions/:versionId` and show that version's `title` and `content` in a read-only preview inside the drawer, with a "Restore" action and a way to return to the list. The preview SHALL NOT be editable and SHALL NOT send any request that modifies the note. While the version request is in flight the preview SHALL show a loading indicator; a non-404 failure SHALL show a retryable error with the list still reachable.

#### Scenario: Preview a version
- **WHEN** the user selects a version in the list
- **THEN** the system fetches that version and renders its title and content read-only, with a "Restore" action

#### Scenario: Preview cannot be edited
- **WHEN** a version preview is displayed and the user attempts to type into it
- **THEN** the preview's content is unchanged and no `PATCH /notes/:id` request is made

#### Scenario: Back to the list
- **WHEN** the user activates the back action from a preview
- **THEN** the drawer shows the version list again without modifying the note

#### Scenario: Preview request fails
- **WHEN** `GET /notes/:id/versions/:versionId` fails with a non-404 error
- **THEN** the drawer shows an error with a Retry action and the user can return to the list

#### Scenario: Authorization denied / validation failure - version not found
- **WHEN** `GET /notes/:id/versions/:versionId` responds `404 Not Found`
- **THEN** the system handles it per "A 404 from any history request defers to the editor's not-found state"

### Requirement: Restore replaces the note with the selected version
Activating "Restore" on a preview SHALL NOT show an additional confirmation dialog; the preview SHALL instead display the hint "Your current version will be saved to history." beside the action. Before sending the restore request, the system SHALL flush any pending unsaved editor edits via autosave so they are not lost, and SHALL NOT send the restore request if that flush fails. It SHALL then send `POST /notes/:id/versions/:versionId/restore`. While the request is in flight the Restore action SHALL be disabled. On success the system SHALL replace the editor's body, title input and tag selection with the returned note, discard any pending autosave state, update the cached note, refresh the version list and the notes list, and close the drawer. On a non-404 failure the system SHALL show an error in the drawer and SHALL leave the editor's content, title and tags unchanged.

#### Scenario: Successful restore
- **WHEN** the user previews a version and activates "Restore" and the API responds `200 OK` with the updated note
- **THEN** the editor's title input, body and tags show the returned note, the drawer closes, and no autosave `PATCH /notes/:id` is sent as a result of the re-seed

#### Scenario: Pending edits are flushed first
- **WHEN** the editor has unsaved edits and the user activates "Restore"
- **THEN** the system sends the autosave `PATCH /notes/:id` and waits for it to succeed before sending the restore request

#### Scenario: Flush fails
- **WHEN** the editor has unsaved edits, the user activates "Restore", and the flush `PATCH /notes/:id` fails
- **THEN** no restore request is sent, an error is shown in the drawer, and the editor's unsaved edits are retained

#### Scenario: Pending autosave does not overwrite the restore
- **WHEN** a restore has succeeded and the autosave idle period later elapses
- **THEN** no `PATCH /notes/:id` carrying the pre-restore content is sent

#### Scenario: Restore request fails
- **WHEN** `POST /notes/:id/versions/:versionId/restore` fails with a network error or a non-2xx, non-404 response
- **THEN** the drawer shows an error with the Restore action available again, and the editor's content, title and tags are unchanged

#### Scenario: Restore is undoable
- **WHEN** a restore has succeeded and the user opens the History drawer again
- **THEN** the list includes a new version capturing the content from immediately before the restore

#### Scenario: Authorization denied / validation failure - note or version not found
- **WHEN** `POST /notes/:id/versions/:versionId/restore` responds `404 Not Found`
- **THEN** the system handles it per "A 404 from any history request defers to the editor's not-found state" and the editor is not modified by this request

### Requirement: A 404 from any history request defers to the editor's not-found state
When the version list, a single version, or a restore request responds `404 Not Found`, the system SHALL close the drawer and invalidate the cached note so the editor re-fetches it. If the re-fetch also responds `404`, the editor SHALL show its existing "Note not found" state. If the note still exists (for example, a version was purged under the 30-day retention rule while the drawer was open), the system SHALL refresh the version list so the missing version no longer appears, and the editor SHALL remain usable. The drawer SHALL NOT show its own bespoke not-found message.

#### Scenario: Note was deleted elsewhere
- **WHEN** the note has been soft-deleted in another tab and the user opens the History drawer, so `GET /notes/:id/versions` responds `404`
- **THEN** the drawer closes and the editor shows its "Note not found" state

#### Scenario: Version purged while the note still exists
- **WHEN** the user selects a version that has since been purged, `GET /notes/:id/versions/:versionId` responds `404`, and `GET /notes/:id` still succeeds
- **THEN** the drawer closes, the editor remains showing the note, and the next time the drawer opens the purged version is not listed

#### Scenario: Validation failure - drawer closes without a bespoke error
- **WHEN** any history request responds `404`
- **THEN** the system shows no drawer-specific "not found" message and sends no further restore request

### Requirement: History drawer is keyboard-accessible
The drawer SHALL be a labelled dialog that moves focus into itself on open, traps focus while open, closes on Escape and via a visible close control, and returns focus to the History action on close. Version entries, the back action, Retry and Restore SHALL be operable by keyboard and have accessible names; the loading and error states SHALL be announced to assistive technology.

#### Scenario: Keyboard open and close
- **WHEN** the user activates the History action with the keyboard, then presses Escape
- **THEN** the drawer opens with focus inside it, closes on Escape, and focus returns to the History action

#### Scenario: Keyboard selects and restores
- **WHEN** the user tabs to a version entry and activates it, then tabs to "Restore" and activates it
- **THEN** the preview opens and the restore is performed exactly as with a pointer
