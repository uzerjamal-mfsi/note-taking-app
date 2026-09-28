# web-notes-list Specification

## Purpose

Gives an authenticated user a landing page that lists, sorts, and tag-filters their own notes, with list state kept in the URL, so they can see and navigate what they've written before any editor, free-text search, or sharing UI exists.

## Requirements

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

### Requirement: Notes list pagination
The application SHALL page through the authenticated user's notes using the API's default page size, and SHALL provide Prev/Next controls driven by the response's pagination metadata.

#### Scenario: Advancing to the next page
- **WHEN** the current page's response has `meta.hasNextPage: true` and the user activates the "Next" control
- **THEN** the system requests the next page and replaces the displayed notes with that page's results

#### Scenario: Next control disabled on the last page
- **WHEN** the current page's response has `meta.hasNextPage: false`
- **THEN** the "Next" control SHALL be disabled

#### Scenario: Previous control disabled on the first page
- **WHEN** the current page's response has `meta.hasPreviousPage: false`
- **THEN** the "Previous" control SHALL be disabled

### Requirement: Notes list sorting
The application SHALL provide a sort control offering `updatedAt` and `createdAt`, each ascending or descending, defaulting to `updatedAt` descending to match the API's own default. Changing the sort SHALL re-query `GET /notes` with the corresponding `sortBy`/`sortDir` and SHALL reset the current page to `1`.

#### Scenario: Changing the sort order
- **WHEN** the user selects a different sort option (e.g. "Created, oldest first")
- **THEN** the system requests page `1` of `GET /notes` with the matching `sortBy`/`sortDir` and replaces the displayed notes with that response

### Requirement: Notes list tag filter
The application SHALL offer the authenticated user's own tags (from `GET /tags`) as toggleable filters. Selecting one or more tags SHALL re-query `GET /notes` with those tags in the `tags` parameter (OR matching, per the existing API contract) and SHALL reset the current page to `1`. A "Clear filters" action SHALL be available whenever at least one tag is selected, and SHALL remove all selected tags and re-query the unfiltered list.

#### Scenario: Filtering by a tag
- **WHEN** the user has no tag filter selected and toggles on one of their tags
- **THEN** the system requests page `1` of `GET /notes` with `tags` set to that tag's name and replaces the displayed notes with that response

#### Scenario: Filtering by multiple tags
- **WHEN** the user has one tag already selected and toggles on a second tag
- **THEN** the system requests `GET /notes` with `tags` containing both tag names

#### Scenario: Clearing filters
- **WHEN** at least one tag filter is selected and the user activates "Clear filters"
- **THEN** the system removes all selected tags, requests page `1` of `GET /notes` with no `tags` parameter, and the "Clear filters" action is no longer shown

### Requirement: Notes list state is synchronized with the URL
The application SHALL reflect the current `page`, `sortBy`, `sortDir`, and selected `tags` in the URL's search params, so that reloading the page or navigating via the browser's back/forward controls restores the same list state, rather than resetting to page 1 with no sort or filter applied.

#### Scenario: Reloading the page preserves list state
- **WHEN** the user has navigated to page 2, sorted by `createdAt` ascending, with a tag filter applied, and reloads the browser
- **THEN** the system re-renders the same page, sort, and tag filter by reading them from the URL's search params, and requests `GET /notes` with those same parameters

#### Scenario: Back button restores the previous list state
- **WHEN** the user changes the tag filter (producing a new URL) and then activates the browser's back button
- **THEN** the system restores the list to the state (page, sort, tags) reflected in the previous URL

#### Scenario: Invalid or unrecognized URL search params are ignored
- **WHEN** the URL contains a `sortBy`, `sortDir`, `page`, or `tags` value the application does not recognize as valid
- **THEN** the system falls back to that parameter's default value instead of failing to render or forwarding the invalid value to `GET /notes`

### Requirement: Notes list loading, error, and empty states
The application SHALL show a visible loading indicator while a notes page is being fetched and a distinct error state when the request fails, instead of a blank screen in either case. When a successful response contains no notes, the application SHALL distinguish two cases: no tag filter is active ("true empty," meaning the user has no notes at all) versus a tag filter is active and matched nothing ("filtered zero-match"), and SHALL offer a "Clear filters" action in the latter case.

#### Scenario: Loading state
- **WHEN** the notes list's `GET /notes` request has not yet resolved
- **THEN** the system renders a visible loading indicator in place of the list

#### Scenario: True-empty state
- **WHEN** `GET /notes` resolves successfully with an empty `data` array and no tag filter is active
- **THEN** the system renders a message indicating the user has no notes yet, instead of an empty grid, a loading indicator, or the filtered-zero-match message

#### Scenario: Filtered-zero-match state
- **WHEN** `GET /notes` resolves successfully with an empty `data` array and at least one tag filter is active
- **THEN** the system renders a message indicating no notes match the current filters, together with a "Clear filters" action, instead of the true-empty message

#### Scenario: Request failure (validation/error response)
- **WHEN** `GET /notes` resolves with an error response (e.g. a rejected or malformed request, or a server error)
- **THEN** the system renders an error state describing that the notes could not be loaded, instead of a blank screen or a silently empty list
