# Spec Delta

## MODIFIED Requirements

### Requirement: Notes list sorting
The application SHALL provide a sort control offering `updatedAt` and `createdAt`, each ascending or descending, defaulting to `updatedAt` descending to match the API's own default. Changing the sort SHALL re-query `GET /notes` with the corresponding `sortBy`/`sortDir` and SHALL reset the current page to `1`. The sort control SHALL be hidden whenever a search query (see `web-notes-search`) is active, and SHALL reappear, reflecting the previously selected sort, once the search is cleared.

#### Scenario: Changing the sort order
- **WHEN** the user selects a different sort option (e.g. "Created, oldest first")
- **THEN** the system requests page `1` of `GET /notes` with the matching `sortBy`/`sortDir` and replaces the displayed notes with that response

#### Scenario: Sort control hidden while a search is active
- **WHEN** the user has an active search query
- **THEN** the sort control is not rendered

### Requirement: Notes list tag filter
The application SHALL offer the authenticated user's own tags (from `GET /tags`) as toggleable filters. Selecting one or more tags SHALL re-query `GET /notes` with those tags in the `tags` parameter (OR matching, per the existing API contract) and SHALL reset the current page to `1`. A "Clear filters" action SHALL be available whenever at least one tag is selected, and SHALL remove all selected tags and re-query the unfiltered list. The tag filter SHALL be hidden whenever a search query (see `web-notes-search`) is active, and SHALL reappear, reflecting the previously selected tags, once the search is cleared.

#### Scenario: Filtering by a tag
- **WHEN** the user has no tag filter selected and toggles on one of their tags
- **THEN** the system requests page `1` of `GET /notes` with `tags` set to that tag's name and replaces the displayed notes with that response

#### Scenario: Filtering by multiple tags
- **WHEN** the user has one tag already selected and toggles on a second tag
- **THEN** the system requests `GET /notes` with `tags` containing both tag names

#### Scenario: Clearing filters
- **WHEN** at least one tag filter is selected and the user activates "Clear filters"
- **THEN** the system removes all selected tags, requests page `1` of `GET /notes` with no `tags` parameter, and the "Clear filters" action is no longer shown

#### Scenario: Tag filter hidden while a search is active
- **WHEN** the user has an active search query
- **THEN** the tag filter is not rendered
