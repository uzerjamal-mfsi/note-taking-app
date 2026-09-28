# Spec Delta

## MODIFIED Requirements

### Requirement: Notes list renders on the index route
The application SHALL render the authenticated user's notes as a list on the index route (`/`), replacing any placeholder content previously shown there. The list SHALL be reachable only by an authenticated user, per the existing `RequireAuth` route guard. Each rendered note card SHALL be a link to that note's editor at `/notes/:id`. The list SHALL offer a "New note" action that creates a note via `POST /notes` with an empty starter document and navigates the user directly into that note's editor.

#### Scenario: Authenticated user sees their notes
- **WHEN** an authenticated user with existing notes navigates to `/`
- **THEN** the system fetches `GET /notes` and renders each returned note as a card showing its title, its tags as colored chips, and a relative "updated" date

#### Scenario: Unauthenticated visitor cannot reach the notes list
- **WHEN** a visitor with no valid session navigates to `/`
- **THEN** the system redirects them to `/login` instead of rendering any notes, per the existing route guard, and no `GET /notes` request is made

#### Scenario: Opening a note from the list
- **WHEN** the user activates a note card
- **THEN** the system navigates to that note's editor at `/notes/:id`

#### Scenario: Creating a new note from the list
- **WHEN** the user activates the "New note" action
- **THEN** the system sends `POST /notes` with an empty starter `content` document and, on success, navigates the user to the created note's editor at `/notes/:id`

#### Scenario: New note creation fails
- **WHEN** the user activates "New note" and `POST /notes` fails (network error or a non-2xx response)
- **THEN** the system shows an error instead of navigating, and the user remains on the notes list
