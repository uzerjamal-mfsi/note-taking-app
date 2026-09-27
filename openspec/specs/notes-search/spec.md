# notes-search Specification

## Purpose

Lets an authenticated user find their own notes by full-text query, returning relevance-ranked, paginated results with highlighted match locations in the title and a body snippet.

## Requirements

### Requirement: Full-text search of own notes
The system SHALL allow an authenticated user to search their own, non-deleted notes via `GET /notes/search`, given a required `q` query parameter. The system SHALL match `q` against each note's `title` and full body text using PostgreSQL full-text search, and SHALL return only notes owned by the caller that have not been soft-deleted. Results SHALL be ordered by relevance to `q` (most relevant first); the system SHALL break ties deterministically (by `id` descending) so that two equally relevant notes always appear in the same relative order and neither page repeats nor skips a note across requests. This endpoint does not accept `sortBy`, `sortDir`, or `tags` parameters.

#### Scenario: Successful search match
- **WHEN** an authenticated user requests `GET /notes/search?q=grocery` and owns a note whose title or content contains the word "grocery"
- **THEN** the system responds `200 OK` with that note included in `data`

#### Scenario: No matching notes
- **WHEN** an authenticated user requests `GET /notes/search?q=nonexistentword` and none of their notes match
- **THEN** the system responds `200 OK` with an empty `data` array and `meta.total` equal to `0`

#### Scenario: Results ordered by relevance
- **WHEN** an authenticated user requests `GET /notes/search?q=meeting` and owns one note where "meeting" appears in the title and another where it appears once in the body
- **THEN** the system responds `200 OK` with the note matching in the title ranked ahead of the note matching only in the body

#### Scenario: Only the caller's own, non-deleted notes are searched
- **WHEN** an authenticated user requests `GET /notes/search?q=budget` and a matching note exists that is either soft-deleted or owned by a different user
- **THEN** the system responds `200 OK` with `data` excluding that note

#### Scenario: Authorization denied - unauthenticated
- **WHEN** a request to `GET /notes/search` carries no valid access token
- **THEN** the system responds `401 Unauthorized`

#### Scenario: Query has no searchable terms
- **WHEN** an authenticated user requests `GET /notes/search?q=the` (a query consisting entirely of words the full-text search configuration treats as stopwords)
- **THEN** the system responds `200 OK` with an empty `data` array and `meta.total` equal to `0`, not an error

### Requirement: Search query validation
The system SHALL require `q` to be present and, after trimming leading/trailing whitespace, non-empty and no longer than 200 characters. A request whose `q` is missing, blank after trimming, or exceeds 200 characters SHALL be rejected with `422 Unprocessable Entity` without querying the database.

#### Scenario: Validation failure - missing query
- **WHEN** an authenticated user requests `GET /notes/search` with no `q` parameter
- **THEN** the system responds `422 Unprocessable Entity` and does not query notes

#### Scenario: Validation failure - blank query
- **WHEN** an authenticated user requests `GET /notes/search?q=%20%20` (whitespace only)
- **THEN** the system responds `422 Unprocessable Entity` and does not query notes

#### Scenario: Validation failure - query too long
- **WHEN** an authenticated user requests `GET /notes/search` with a `q` value longer than 200 characters
- **THEN** the system responds `422 Unprocessable Entity` and does not query notes

### Requirement: Paginated search results
The system SHALL paginate search results using the same envelope as the notes list: `{ data: SearchResult[], meta: { page, pageSize, total, totalPages, hasNextPage, hasPreviousPage } }`, where `total` is the count of all of the caller's own, non-deleted notes matching `q` (before pagination), and `page`/`pageSize` follow the same defaults, bounds, and validation as `GET /notes` (`page` a positive integer default `1`; `pageSize` a positive integer default `20`, maximum `100`). A `page` beyond the last available page SHALL return `200 OK` with an empty `data` array and the correct `total`/`totalPages`/`hasNextPage`/`hasPreviousPage`, not an error.

#### Scenario: Default pagination
- **WHEN** an authenticated user with 25 notes matching `q` requests `GET /notes/search?q=note` with no `page`/`pageSize`
- **THEN** the system responds `200 OK` with `meta.page` equal to `1`, `meta.pageSize` equal to `20`, `meta.total` equal to `25`, `meta.totalPages` equal to `2`, `meta.hasNextPage` equal to `true`, and `meta.hasPreviousPage` equal to `false`

#### Scenario: Page beyond the last page
- **WHEN** an authenticated user with 5 notes matching `q` requests `GET /notes/search?q=note&page=3&pageSize=20`
- **THEN** the system responds `200 OK` with an empty `data` array, `meta.total` equal to `5`, `meta.totalPages` equal to `1`, and `meta.hasNextPage` equal to `false`

#### Scenario: Validation failure - pageSize exceeds maximum
- **WHEN** an authenticated user requests `GET /notes/search?q=note&pageSize=101`
- **THEN** the system responds `422 Unprocessable Entity` and does not query notes

### Requirement: Highlighted match locations
For each matching note, the system SHALL return the match locations for `q` as structured character offset ranges (`{start, end}` pairs) rather than embedded markup: one set of ranges over the note's `title` (empty if `q` did not match the title), and one set of ranges over a returned body `snippet` (an excerpt of the note's text surrounding a match; empty if `q` did not match the body). The system SHALL NOT embed HTML or other markup in `title` or `snippet`; both SHALL be plain text so a caller can render highlights without interpreting the fields as markup.

#### Scenario: Title match is highlighted
- **WHEN** an authenticated user requests `GET /notes/search?q=grocery` and owns a note titled "Grocery list"
- **THEN** the system responds `200 OK` with that result's title-match ranges identifying the position of "Grocery" in `title`

#### Scenario: Body match produces a snippet with highlight ranges
- **WHEN** an authenticated user requests `GET /notes/search?q=eggs` and owns a note whose body (not title) contains the word "eggs"
- **THEN** the system responds `200 OK` with that result's `snippet` containing surrounding context from the body and its body-match ranges identifying the position of "eggs" within `snippet`

#### Scenario: No markup embedded in returned text
- **WHEN** an authenticated user requests `GET /notes/search?q=<script>` and owns a note whose title or body literally contains the text `<script>`
- **THEN** the system responds `200 OK` with `title` and `snippet` containing that text unescaped and unmodified, with no additional markup characters inserted around any match
