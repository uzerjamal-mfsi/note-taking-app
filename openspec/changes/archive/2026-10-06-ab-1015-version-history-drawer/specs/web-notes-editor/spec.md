# Spec Delta

## ADDED Requirements

### Requirement: Editor offers a History entry point
The editor SHALL display a "History" action for the note being edited, available only once the note has loaded successfully (not in the loading, not-found, or load-error states). Activating it SHALL open the History drawer defined by the `web-notes-history` capability for that note. Opening or closing the drawer without restoring SHALL NOT trigger, cancel, or alter autosave, and SHALL NOT change the editor's content, title, or tag selection.

#### Scenario: History action opens the drawer
- **WHEN** the user has a loaded note open in the editor and activates "History"
- **THEN** the History drawer opens for that note

#### Scenario: History action absent without a loaded note
- **WHEN** the editor is showing its loading, not-found, or load-error state
- **THEN** no "History" action is rendered and no versions request is made

#### Scenario: Authorization denied - unauthenticated visitor
- **WHEN** a visitor with no valid session navigates to `/notes/:id`
- **THEN** the system redirects them to `/login` per the existing route guard, and no "History" action or versions request is made

#### Scenario: Validation failure - note not found
- **WHEN** `GET /notes/:id` responds `404 Not Found`
- **THEN** the not-found state is shown with no "History" action, and no `GET /notes/:id/versions` request is made

#### Scenario: Opening the drawer does not disturb autosave
- **WHEN** the editor has unsaved edits and the user opens and closes the History drawer without restoring
- **THEN** the pending autosave still fires as it would have, and the editor's content is unchanged

## MODIFIED Requirements

### Requirement: Background refetches do not overwrite in-progress edits
The editor SHALL seed its document state from `GET /notes/:id` once per note - on initial load and whenever the route's note id changes - and SHALL NOT re-seed or overwrite the editor's active document state from a subsequent background refetch of the same note (e.g. one triggered by window refocus or reconnect) while the editor remains mounted for that note. A successful autosave response SHALL update any cached note data (e.g. for the notes list) without re-seeding the editor's own document state, since that state already reflects what was just saved. The single exception is a successful version restore (per the `web-notes-history` capability): the editor SHALL re-seed its body, title input, and tag selection from the note returned by the restore response, and that re-seed SHALL NOT itself schedule or send an autosave.

#### Scenario: Background refetch does not clobber unsaved edits
- **WHEN** the editor has unsaved edits and a background refetch of `GET /notes/:id` for the same note resolves with different content than what the editor currently holds
- **THEN** the editor's visible content and cursor position are unchanged; the refetched content does not overwrite them

#### Scenario: Navigating to a different note re-seeds the editor
- **WHEN** the user navigates from one note's editor directly to another note's editor
- **THEN** the system fetches the new note via `GET /notes/:id` and seeds the editor with its content

#### Scenario: A successful save does not trigger a re-seeding refetch
- **WHEN** an autosave `PATCH /notes/:id` request succeeds
- **THEN** the system does not overwrite the editor's current document state as a result, even if the same note data is also updated in any shared cache

#### Scenario: A successful restore re-seeds the editor
- **WHEN** a version restore succeeds and returns a note whose content differs from what the editor currently holds
- **THEN** the editor's body, title input, and tag selection show the returned note, and no autosave request is sent as a result of the re-seed

#### Scenario: A failed restore leaves the editor untouched
- **WHEN** a version restore request fails
- **THEN** the editor's body, title input, and tag selection are unchanged
