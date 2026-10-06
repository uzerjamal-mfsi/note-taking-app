# web-notes-sharing Specification

## Purpose

Gives a note's owner a Share modal to create, copy, inspect, and revoke a public link to a note, and gives anyone holding that link a public read-only page that displays the shared note, all consuming the existing `notes-sharing` API.

## Requirements

### Requirement: Share modal loads the note's current share link
The note editor SHALL offer a "Share" action that opens a modal for the note being edited. On open, the system SHALL fetch the note's share link via `GET /notes/:id/share` and show a visible loading indicator until it resolves. A `200 OK` response SHALL be shown as an active link. A `404 Not Found` response SHALL be shown as "not shared" (a normal state, not an error). Any other failure SHALL show an error state with a retry action that re-sends the request. The modal SHALL be keyboard-operable, move focus into itself on open, and return focus to the Share action on close.

#### Scenario: Active link is shown
- **WHEN** an authenticated user opens the Share modal for a note and `GET /notes/:id/share` responds `200 OK`
- **THEN** the modal shows that link's URL, view count, and expiry

#### Scenario: Note has no active link
- **WHEN** the user opens the Share modal and `GET /notes/:id/share` responds `404 Not Found`
- **THEN** the modal shows a "not shared" state offering to create a link, and does not show an error

#### Scenario: Loading state
- **WHEN** the user opens the Share modal and `GET /notes/:id/share` has not yet resolved
- **THEN** the modal shows a visible loading indicator

#### Scenario: Load failure can be retried
- **WHEN** `GET /notes/:id/share` fails with a status other than `200` or `404`
- **THEN** the modal shows an error state with a retry action, and activating it re-sends the request

#### Scenario: Authorization denied - session expired
- **WHEN** `GET /notes/:id/share` responds `401 Unauthorized` and the session cannot be refreshed
- **THEN** the user is returned to `/login` per the existing session handling, and no link details are shown

### Requirement: Create a share link with an optional expiry
When the note has no active link, the modal SHALL allow the user to create one via `POST /notes/:id/share`, optionally supplying an expiry as a local date and time. A supplied expiry SHALL be sent as `expiresAt` in ISO 8601 form; when left empty the request body SHALL omit `expiresAt` and the link does not expire. The expiry input SHALL set its minimum selectable value to the current local date and time so past dates cannot be picked, and the value SHALL be converted to an ISO 8601 UTC timestamp before it is sent. The system SHALL NOT send a request when the entered expiry is not strictly in the future (including values typed or pasted past the input's minimum), and SHALL instead show an inline error on the expiry field. A `422 Unprocessable Entity` response SHALL also be shown as an inline expiry error. On success (`201 Created`, or `200 OK` when a link already existed) the modal SHALL switch to the active-link state for the returned link.

#### Scenario: Create a link without expiry
- **WHEN** the user activates "Create link" with the expiry field empty
- **THEN** the system sends `POST /notes/:id/share` with no `expiresAt`, and on `201 Created` the modal shows the new active link with "Never expires"

#### Scenario: Create a link with an expiry
- **WHEN** the user enters a future date and time and activates "Create link"
- **THEN** the system sends `POST /notes/:id/share` with `expiresAt` set to that moment as an ISO 8601 UTC timestamp, and on `201 Created` the modal shows the new active link with that expiry

#### Scenario: Past dates are blocked at the input
- **WHEN** the Share modal shows the "not shared" state
- **THEN** the expiry input's minimum value equals the current local date and time

#### Scenario: Validation failure - expiry not in the future
- **WHEN** the user enters an expiry that is not strictly after the current time and activates "Create link"
- **THEN** the system sends no request and shows an inline error on the expiry field

#### Scenario: Validation failure - server rejects expiry
- **WHEN** `POST /notes/:id/share` responds `422 Unprocessable Entity`
- **THEN** the modal remains in the "not shared" state and shows an inline error on the expiry field

#### Scenario: Link already exists
- **WHEN** the user activates "Create link" and `POST /notes/:id/share` responds `200 OK` with an existing link
- **THEN** the modal shows that existing link as the active link

#### Scenario: Authorization denied - note not accessible
- **WHEN** `POST /notes/:id/share` responds `404 Not Found`
- **THEN** the modal shows an error message and no link is displayed

### Requirement: Active link can be copied and inspected
For an active link the modal SHALL display the full shareable URL, composed of the web application's own origin and the path `/shared/:token`, in a read-only field; a "Copy link" action that writes that URL to the clipboard and then shows a visible "Copied" confirmation; the link's current view count; and its expiry rendered as a localized date and time, or "Never expires" when `expiresAt` is `null`. If the clipboard cannot be written, the system SHALL show a message telling the user to copy the displayed URL manually and SHALL leave the URL field selectable.

#### Scenario: Copy the link
- **WHEN** the user activates "Copy link" on an active link
- **THEN** the full `/shared/:token` URL is written to the clipboard and a "Copied" confirmation is shown

#### Scenario: Clipboard unavailable
- **WHEN** the user activates "Copy link" and the clipboard write fails or is unavailable
- **THEN** the modal shows a message to copy the URL manually and the URL field remains selectable

#### Scenario: Expiring link
- **WHEN** an active link has a non-null `expiresAt`
- **THEN** the modal shows that expiry as a localized date and time

#### Scenario: View count is shown
- **WHEN** the modal displays an active link
- **THEN** it shows the link's `viewCount` as returned by the API

### Requirement: Revoke a share link with confirmation
For an active link the modal SHALL offer a "Revoke link" action. Activating it SHALL show a confirmation dialog before any request is sent; only confirming SHALL send `DELETE /notes/:id/share`. On `204 No Content`, or on `404 Not Found` (the link is already gone or expired), the modal SHALL switch to the "not shared" state. Dismissing or canceling the confirmation SHALL send no request and leave the active link unchanged. Any other failure SHALL show an error and leave the active link displayed.

#### Scenario: Confirmed revoke
- **WHEN** the user activates "Revoke link" and confirms
- **THEN** the system sends `DELETE /notes/:id/share` and, on `204 No Content`, the modal shows the "not shared" state

#### Scenario: Canceled revoke
- **WHEN** the user activates "Revoke link" and then cancels or dismisses the confirmation
- **THEN** the system sends no request and the active link remains displayed

#### Scenario: Link already gone
- **WHEN** the user confirms revoke and `DELETE /notes/:id/share` responds `404 Not Found`
- **THEN** the modal shows the "not shared" state

#### Scenario: Revoke failure
- **WHEN** the user confirms revoke and the request fails with any other error
- **THEN** the modal shows an error message and the active link remains displayed

### Requirement: Share state stays consistent with note changes
The system SHALL treat the share link as per-note server state: after a successful create or revoke, the system SHALL invalidate that note's cached share-link data so it is re-read from the server, and the modal and any later open of the modal for the same note SHALL reflect the new state without a page reload. When the note is deleted from the editor, the system SHALL NOT leave stale share state for that note usable in the UI.

#### Scenario: Cache invalidated after create
- **WHEN** a share link is created successfully
- **THEN** the note's cached share-link data is invalidated and re-read from the server

#### Scenario: Cache invalidated after revoke
- **WHEN** a share link is revoked successfully
- **THEN** the note's cached share-link data is invalidated and re-read from the server

#### Scenario: Reopening after create
- **WHEN** the user creates a link, closes the modal, and reopens it
- **THEN** the modal shows the active link

#### Scenario: Reopening after revoke
- **WHEN** the user revokes a link, closes the modal, and reopens it
- **THEN** the modal shows the "not shared" state

### Requirement: Public shared-note page
The application SHALL render a public read-only page at `/shared/:token`, reachable by anyone regardless of authentication state, and SHALL NOT redirect visitors to `/login` or away from it because of the session state. On load the page SHALL request `GET /shared/:token` without sending the session's access token and without attempting a session refresh, and render the returned `title` as the page heading and the returned `content` as read-only rich text using the same document schema as the editor, preserving its formatting (headings, lists, emphasis, quotes, code). The first block of `content` is the note's title and SHALL NOT be rendered a second time in the body. The page SHALL offer no editing, tagging, or sharing controls and SHALL show a loading indicator until the request resolves.

#### Scenario: Visitor opens a shared link
- **WHEN** a visitor with no session navigates to `/shared/:token` for an active link
- **THEN** the system requests `GET /shared/:token` and renders the note's title and content read-only, with no editing controls

#### Scenario: Signed-in user opens a shared link
- **WHEN** an authenticated user navigates to `/shared/:token`
- **THEN** the page renders the shared note read-only rather than redirecting, and the request carries no access token

#### Scenario: Loading state
- **WHEN** `GET /shared/:token` has not yet resolved
- **THEN** the page shows a visible loading indicator

#### Scenario: Authorization denied - unknown, revoked, or expired link
- **WHEN** `GET /shared/:token` responds `404 Not Found`
- **THEN** the page shows a dedicated status page stating that the link has expired or been revoked, with wording and presentation distinct from the rate-limited and generic-error states and from the application's not-found page, offering no retry action and no note content; because the API does not distinguish expired, revoked, or never-issued tokens, the page does not claim which one applies

#### Scenario: Rich-text formatting is preserved
- **WHEN** the shared note's content contains headings, lists, emphasis, a blockquote, and a code block
- **THEN** the page renders each with its corresponding visible formatting, read-only

#### Scenario: Validation failure - rate limited
- **WHEN** `GET /shared/:token` responds `429 Too Many Requests`
- **THEN** the page shows a "too many requests, try again shortly" state and no note content

#### Scenario: Other failure
- **WHEN** `GET /shared/:token` fails with any other error
- **THEN** the page shows a generic error state with a retry action
