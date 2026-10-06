# web-notes-editor Specification

## Purpose

Gives an authenticated user a rich-text editor for a single note, backed by TipTap, that loads the note's existing content and autosaves edits to the API without any manual save action.

## Requirements

### Requirement: Note editor renders on the note detail route
The application SHALL render an editable rich-text view of one of the authenticated user's own notes at `/notes/:id`, reachable only by an authenticated user per the existing `RequireAuth` route guard. On mount, the system SHALL fetch the note via `GET /notes/:id` and initialize the editor with its `content` as the starting ProseMirror document.

#### Scenario: Authenticated user opens their note
- **WHEN** an authenticated user navigates to `/notes/:id` for a note they own
- **THEN** the system fetches `GET /notes/:id` and renders an editable rich-text view seeded with that note's `content`

#### Scenario: Unauthenticated visitor cannot reach the editor
- **WHEN** a visitor with no valid session navigates to `/notes/:id`
- **THEN** the system redirects them to `/login` instead of rendering the editor, per the existing route guard, and no `GET /notes/:id` request is made

#### Scenario: Note not found, not owned, or deleted
- **WHEN** `GET /notes/:id` responds `404 Not Found` (the note does not exist, belongs to another user, or has been soft-deleted)
- **THEN** the system renders a not-found state instead of an editor, and makes no autosave request

#### Scenario: Loading state
- **WHEN** the `GET /notes/:id` request has not yet resolved
- **THEN** the system renders a visible loading indicator in place of the editor

### Requirement: Autosave persists content edits without a manual save action
While the editor has unsaved edits, the system SHALL wait until the user has stopped typing for a short idle period before sending an update, rather than saving on every keystroke. When the idle period elapses, the system SHALL send the editor's complete current ProseMirror document via `PATCH /notes/:id` with `content` set to that document; the system SHALL NOT send a partial or diffed document. If the editor still has unsaved edits when it unmounts, the system SHALL immediately attempt to flush them via `PATCH /notes/:id` rather than discarding them. While the editor has unsaved edits, the system SHALL register a `beforeunload` listener that prompts the user with the browser's native confirmation before a tab close or full-page navigation discards those edits; the listener SHALL be removed once there are no unsaved edits.

#### Scenario: Edit triggers a debounced autosave
- **WHEN** the user types into the editor and then stops for the idle period
- **THEN** the system sends exactly one `PATCH /notes/:id` request carrying the editor's full current content

#### Scenario: Continued typing defers the save
- **WHEN** the user keeps typing before the idle period has elapsed since their last keystroke
- **THEN** the system does not send a `PATCH /notes/:id` request until typing pauses for the full idle period

#### Scenario: Unmounting with unsaved edits flushes them
- **WHEN** the user navigates away from the editor (e.g. via in-app routing) while it has unsaved edits
- **THEN** the system immediately sends a `PATCH /notes/:id` request carrying the editor's full current content instead of waiting for the idle period

#### Scenario: Closing the tab with unsaved edits prompts the user
- **WHEN** the editor has unsaved edits and the user attempts to close the tab or navigate away from the page
- **THEN** the browser shows its native "leave site?" confirmation before the navigation proceeds

#### Scenario: No prompt when there is nothing unsaved
- **WHEN** the editor has no unsaved edits (the most recent change has already been saved) and the user attempts to close the tab or navigate away
- **THEN** the browser shows no confirmation prompt

### Requirement: Autosave status is visible to the user
The editor SHALL show the user which of the following states currently applies: an unsaved/pending state while edits exist but the idle period has not yet elapsed, a saving state while a `PATCH /notes/:id` request is in flight, a saved state after the most recent request succeeds, and an error state if the most recent request fails. The system SHALL NOT leave the user unable to tell whether their latest edit was persisted.

#### Scenario: Save succeeds
- **WHEN** an in-flight autosave `PATCH /notes/:id` request resolves successfully
- **THEN** the system shows a saved state reflecting that the editor's content at the time of the request has been persisted

#### Scenario: Save fails
- **WHEN** an autosave `PATCH /notes/:id` request fails (network error or a non-2xx response, including `422 Unprocessable Entity` for a document exceeding the maximum nesting depth)
- **THEN** the system shows an error state, does not discard the user's unsaved edits, and keeps them available for the next save attempt

#### Scenario: Retry after a failed save
- **WHEN** the editor is in the error state and the user either continues editing (triggering the next debounced autosave) or activates an explicit retry action
- **THEN** the system attempts `PATCH /notes/:id` again with the editor's current content

### Requirement: Title input represents the document's first node
The editor SHALL render a dedicated title input above the editing canvas, separate from the rich-text body. The title input SHALL be initialized from the plain-text content of the note's document's first node (the same text the API derives `title` from). The title input SHALL represent that first node exclusively, and the body editor SHALL represent the remainder of the document as its own independent editable region; editing the title input SHALL update the first node's text. This sync is one-way (title input -> first node): the body editor has no special behavior for its own first line, and edits within the body SHALL NOT alter the title input's value. On autosave, the system SHALL combine the title input's text (as the first node) and the body's content into one ProseMirror document and send it as `content`, exactly as the API's own title-derivation rule expects (first node's text, else `"Untitled"` when empty). This adds no new field to the API request; `title` remains entirely server-derived, and the editor never sends a separate `title` value.

#### Scenario: Title input reflects the note's derived title
- **WHEN** a note whose current `title` is "Grocery list" is opened in the editor
- **THEN** the title input's initial value is "Grocery list"

#### Scenario: Editing the title input updates the saved document's first node
- **WHEN** the user changes the title input's text and the autosave idle period elapses
- **THEN** the system sends `PATCH /notes/:id` with `content` whose first node's text matches the title input's current text

#### Scenario: Editing the body does not change the title input
- **WHEN** the user edits any text within the body editor, including its first visible line
- **THEN** the title input's displayed value is unchanged

#### Scenario: Empty title falls back to Untitled, matching the API
- **WHEN** the user clears the title input and the body has no other text, and the autosave idle period elapses
- **THEN** the system sends `PATCH /notes/:id` with a `content` document whose first node has no extractable text, and the note's title (as later reflected by the API's own derivation) becomes "Untitled"

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

### Requirement: Tag assignment from the editor
The editor SHALL offer the authenticated user's own tags (from `GET /tags`) as toggleable selections for the note being edited, showing which are currently assigned. Toggling a tag SHALL immediately send a `PATCH /notes/:id` carrying the editor's current `content` and the resulting full `tagIds` set (the previously assigned tags plus or minus the toggled one) - this save SHALL NOT wait for the autosave idle period, since toggling a tag is a discrete action rather than continuous typing.

#### Scenario: Assigning a tag
- **WHEN** the user toggles on one of their tags that is not currently assigned to the note
- **THEN** the system immediately sends `PATCH /notes/:id` with `tagIds` including that tag, and the tag is shown as assigned once the request succeeds

#### Scenario: Removing a tag
- **WHEN** the user toggles off a tag currently assigned to the note
- **THEN** the system immediately sends `PATCH /notes/:id` with `tagIds` excluding that tag, and the tag is shown as unassigned once the request succeeds

#### Scenario: Tag toggle fails
- **WHEN** a tag-toggle `PATCH /notes/:id` request fails (network error or a non-2xx response)
- **THEN** the system shows an error, and the tag's displayed assignment state reverts to what it was before the toggle

#### Scenario: No tags exist
- **WHEN** the authenticated user has no tags of their own
- **THEN** the editor renders no tag selector rather than an empty or broken control

### Requirement: Deleting a note requires confirmation
The editor SHALL offer a delete action for the note being edited. Activating it SHALL show a confirmation dialog before any request is sent; only confirming the dialog SHALL send `DELETE /notes/:id`. On success, the system SHALL navigate the user to the notes list (`/`). Dismissing or canceling the confirmation SHALL send no request and SHALL leave the note and the editor unchanged.

#### Scenario: Confirming delete removes the note and returns to the list
- **WHEN** the user activates the delete action and confirms the dialog
- **THEN** the system sends `DELETE /notes/:id`, and on success navigates to `/`

#### Scenario: Canceling the confirmation deletes nothing
- **WHEN** the user activates the delete action and then cancels or dismisses the confirmation dialog
- **THEN** the system sends no `DELETE /notes/:id` request, and the editor remains open showing the note unchanged

#### Scenario: Delete request fails
- **WHEN** the user confirms deletion and `DELETE /notes/:id` fails (network error or a non-2xx response)
- **THEN** the system shows an error, does not navigate away, and the note remains open in the editor

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
