# Spec Delta

## ADDED Requirements

### Requirement: Editor offers a Share entry point
The editor SHALL display a "Share" action for the note being edited, available only once the note has loaded successfully (not in the loading, not-found, or load-error states). Activating it SHALL open the Share modal defined by the `web-notes-sharing` capability for that note. Opening or closing the modal SHALL NOT trigger, cancel, or alter autosave, and SHALL NOT change the editor's content or tag selection.

#### Scenario: Share action opens the modal
- **WHEN** the user has a loaded note open in the editor and activates "Share"
- **THEN** the Share modal opens for that note

#### Scenario: Share action absent without a loaded note
- **WHEN** the editor is showing its loading, not-found, or load-error state
- **THEN** no "Share" action is rendered

#### Scenario: Authorization denied - unauthenticated visitor
- **WHEN** a visitor with no valid session navigates to `/notes/:id`
- **THEN** the system redirects them to `/login` per the existing route guard, and no "Share" action or share request is made

#### Scenario: Validation failure - note not found
- **WHEN** `GET /notes/:id` responds `404 Not Found`
- **THEN** the not-found state is shown with no "Share" action, and no `GET /notes/:id/share` request is made

#### Scenario: Opening the modal does not disturb autosave
- **WHEN** the editor has unsaved edits and the user opens and closes the Share modal
- **THEN** the pending autosave still fires as it would have, and the editor's content is unchanged
