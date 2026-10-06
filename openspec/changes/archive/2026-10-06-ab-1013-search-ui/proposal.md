# Proposal

## Why

AB-1013: The backend full-text search endpoint (`GET /notes/search`, see `notes-search` capability) has been live since AB-1007, but there is no way to reach it from the UI — users can only find notes by scrolling/paging/sorting/tag-filtering the notes list. This adds the frontend search experience, including rendering the API's structured match-offset ranges as visible highlights.

## What Changes

- Add a search box to the notes list page (`/`) that, once a query is entered, replaces the `GET /notes`-backed grid with `GET /notes/search` results.
- Debounce typed input and reflect the committed query in the URL as a `q` search param (alongside the existing `page`/`sortBy`/`sortDir`/`tags` params), so reload/back-forward restore search state exactly as they already do for the list.
- While a search query is active, hide the sort control and tag filter (the search endpoint does not accept `sortBy`/`sortDir`/`tags`); their selections are preserved and reapplied once the search is cleared.
- Add an explicit "Clear search" control that empties the query and returns to the sort/tag-filtered list view.
- Render each search result's highlighted `title` and `snippet` using the API's plain-text offset ranges (`titleMatches`/`snippetMatches`), converting them to `<mark>`-wrapped text via a pure helper — never by interpreting the strings as markup.
- Add a distinct empty-results state for a search that matched nothing, separate from the existing "no notes yet" and "no notes match this tag filter" states.

## Capabilities

### New Capabilities
- `web-notes-search`: Frontend search UI — search box, URL-synced query state, result list with highlighted title/snippet, loading/error/empty states, and result navigation to the note editor.

### Modified Capabilities
- `web-notes-list`: The sort control and tag filter become conditionally hidden while a search query is active, and the list page hosts the search box; no other list requirements change.

## Impact

- **Frontend only** — no API, schema, or database changes; consumes the existing `GET /notes/search` contract (`packages/shared/src/notes-search/notes-search-contracts.ts`) as-is.
- New files under `apps/web/src/features/notes-search/` (api client, `use-search-query` hook, URL-param hook or extension, `highlight-ranges` helper, `SearchResultCard`, empty-state component).
- Edits to `apps/web/src/features/notes/components/NotesListPage.tsx` (and possibly `use-notes-list-params.ts`) to wire in the search box and branch between list and search result rendering.
- No new dependencies; reuses existing `NotesPagination`, `Spinner`, and shadcn/ui primitives.
- **Rollback**: revert the frontend commit(s); no data migration or backend change to unwind.
