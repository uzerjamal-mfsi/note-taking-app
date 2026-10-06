# Spec Delta

## Purpose

Lets an authenticated user find their own notes by typing a free-text query on the notes list page, seeing relevance-ranked results with the matched text visibly highlighted.

## ADDED Requirements

### Requirement: Notes list requires authentication to search
Search SHALL be part of the notes list page, which is reachable only by an authenticated user per the existing `RequireAuth` route guard. The application SHALL NOT issue a search request to the endpoint from the UI for an unauthenticated visitor.

#### Scenario: Unauthenticated visitor cannot reach search
- **WHEN** a visitor with no valid session navigates to `/`
- **THEN** the system redirects them to `/login` per the existing route guard, and no `GET /notes/search` request is made

### Requirement: Debounced search-as-you-type
The application SHALL provide a search box on the notes list page. As the user types, the application SHALL wait for a short pause in typing (debounce) before committing the query, then request `GET /notes/search` with that query and replace the displayed notes with the returned results. A query that is empty or, after trimming leading/trailing whitespace, blank SHALL NOT trigger a search request; the application SHALL instead show the sort/tag-filtered `GET /notes` list.

#### Scenario: Typing a query triggers a debounced search
- **WHEN** the user types "grocery" into the search box and pauses
- **THEN** after the debounce period the system requests `GET /notes/search?q=grocery` and replaces the displayed notes with that response's results

#### Scenario: Blank query does not trigger a search
- **WHEN** the search box contains only whitespace, or is empty
- **THEN** the system does not request `GET /notes/search` and instead shows the current sort/tag-filtered `GET /notes` list

### Requirement: Search query reflected in the URL
The application SHALL reflect the committed (debounced) search query in the URL's `q` search param, and SHALL reset `page` to `1` whenever the committed query changes. Reloading the page or navigating via the browser's back/forward controls SHALL restore the same search query and page by reading them from the URL, and SHALL re-request `GET /notes/search` with those values, the same way the existing list state (`page`/`sortBy`/`sortDir`/`tags`) is restored.

#### Scenario: Reloading the page preserves the search
- **WHEN** the user has searched for "grocery" and navigated to page 2 of results, and reloads the browser
- **THEN** the system re-renders page 2 of the "grocery" search by reading `q` and `page` from the URL, and requests `GET /notes/search` with those same values

#### Scenario: Back button restores the previous search state
- **WHEN** the user changes the search query (producing a new URL) and then activates the browser's back button
- **THEN** the system restores the search box and results to the query reflected in the previous URL

### Requirement: Clearing search returns to the sort/tag-filtered list
The application SHALL provide an explicit "Clear search" control. Activating it, or reducing the search box to a blank value, SHALL remove `q` from the URL and reset `page` to `1`, and SHALL re-request `GET /notes` using whatever `sortBy`/`sortDir`/`tags` selections were in effect before the search began (those selections are preserved, not reset, while a search is active).

#### Scenario: Clearing an active search
- **WHEN** a search is active and the user activates "Clear search"
- **THEN** the system removes the search query, requests page `1` of `GET /notes` using the sort and tag selections that were in effect before the search began, and the search box is empty

### Requirement: Sort and tag controls are hidden while searching
Because `GET /notes/search` does not accept `sortBy`, `sortDir`, or `tags`, the application SHALL hide the sort control and tag filter whenever a search query is active, and SHALL show them again once the search is cleared.

#### Scenario: Sort and tag controls hidden during an active search
- **WHEN** the user has an active search query
- **THEN** the sort control and tag filter are not rendered

#### Scenario: Sort and tag controls reappear after clearing search
- **WHEN** the user clears an active search
- **THEN** the sort control and tag filter are rendered again, reflecting whatever selections were in effect before the search began

### Requirement: Search results render highlighted title and snippet
For each search result, the application SHALL render the `title` with the character ranges in `titleMatches` visually highlighted, and, when `snippet` is non-empty, render the `snippet` with the character ranges in `snippetMatches` visually highlighted. The application SHALL treat `title` and `snippet` strictly as plain text: highlighting SHALL be produced by wrapping the given character ranges, never by interpreting either string as HTML or other markup.

#### Scenario: Title match is visually highlighted
- **WHEN** a search result's `titleMatches` identifies a range within `title`
- **THEN** the application renders `title` with that range visibly highlighted (e.g. bold/marked) and the rest of the title rendered normally

#### Scenario: Snippet match is visually highlighted
- **WHEN** a search result's `snippet` is non-empty and `snippetMatches` identifies one or more ranges within it
- **THEN** the application renders the snippet below the title with those ranges visibly highlighted

#### Scenario: No snippet is shown when the match was title-only
- **WHEN** a search result's `snippet` is an empty string
- **THEN** the application renders the result without a snippet line

#### Scenario: Literal markup-like text in a result is never interpreted as markup
- **WHEN** a search result's `title` or `snippet` literally contains the text `<script>`
- **THEN** the application renders that text visibly as plain characters and does not interpret it as an HTML element

#### Scenario: Malformed match ranges are handled defensively
- **WHEN** a search result's `titleMatches` or `snippetMatches` contains ranges that are unsorted, overlapping, or extend beyond the text's length
- **THEN** the application renders the text with those ranges clamped to the text's bounds and normalized, without throwing an error

### Requirement: Search box keyboard and form interaction
The search box SHALL clear its query when the user presses the Escape key while it is focused. If the search box is part of a `<form>`, submitting that form (e.g. by pressing Enter) SHALL NOT trigger a full-page navigation or reload.

#### Scenario: Escape clears the search
- **WHEN** the search box is focused with a non-empty value and the user presses Escape
- **THEN** the search query is cleared and the application returns to the sort/tag-filtered list, the same as activating "Clear search"

#### Scenario: Submitting the search form does not reload the page
- **WHEN** the user presses Enter while the search box is focused
- **THEN** the application intercepts the form submission and does not navigate away from or reload the page

### Requirement: Search results are paginated
The application SHALL page through search results using the API's default page size, and SHALL provide Prev/Next controls driven by the response's pagination metadata, the same way the notes list is paginated.

#### Scenario: Advancing to the next page of search results
- **WHEN** the current search response has `meta.hasNextPage: true` and the user activates the "Next" control
- **THEN** the system requests the next page of `GET /notes/search` with the same `q` and replaces the displayed results with that page's results

#### Scenario: Next control disabled on the last page of search results
- **WHEN** the current search response has `meta.hasNextPage: false`
- **THEN** the "Next" control SHALL be disabled

### Requirement: Search result navigation
Each rendered search result SHALL be a link to that note's editor at `/notes/:id`.

#### Scenario: Opening a note from search results
- **WHEN** the user activates a search result
- **THEN** the system navigates to that note's editor at `/notes/:id`

### Requirement: Search loading, error, and no-results states
The application SHALL show a visible loading indicator while a `GET /notes/search` request is pending, and a distinct error state when the request fails, instead of a blank screen in either case. When a search successfully returns zero results, the application SHALL show a message indicating no notes matched the search query, distinct from the notes list's own "no notes yet" and "no notes match this tag filter" messages.

#### Scenario: Loading state during search
- **WHEN** a `GET /notes/search` request has not yet resolved
- **THEN** the system renders a visible loading indicator in place of the results

#### Scenario: Search request failure
- **WHEN** `GET /notes/search` resolves with an error response (e.g. a rejected or malformed request, or a server error)
- **THEN** the system renders an error state describing that the search could not be completed, instead of a blank screen or a silently empty result list

#### Scenario: No results for a search query
- **WHEN** `GET /notes/search` resolves successfully with an empty `data` array
- **THEN** the system renders a message indicating no notes matched the search query, distinct from the list page's empty and filtered-zero-match states
