# Proposal

## Why

AB-1007: users can only find a note today by scrolling a paginated list or filtering by tag — there is no way to search note text. This adds full-text search over a user's own notes, using PostgreSQL's native full-text search as required by project conventions, with ranked results, pagination, and highlighted match snippets so a user can see why a result matched without opening it.

## What Changes

- Add a new `GET /notes/search` endpoint, scoped to the authenticated caller's own, non-deleted notes.
- Add a `searchText` column — a full-document plain-text extraction — computed and written by the application at the same write path that already derives `title` (generalizing `deriveTitle`/`collectText` in `notes-service.ts`, which today only reads the first block, into a whole-document extractor; see design.md, Decision 1).
- Add a Postgres `GENERATED ALWAYS ... STORED` `tsvector` column (`searchVector`) weighted `title` (A) over `searchText` (B), with a GIN index, computed from the two plain-text columns above so ranking and matching stay correct automatically as they change.
- Parse the query with `websearch_to_tsquery` (supports quoted phrases, `-exclusion`, natural `OR`), guard against a query that reduces to no searchable terms (e.g. all stopwords), rank with `ts_rank_cd`, tie-break by `id` (consistent with the existing notes list's tie-break convention).
- Return highlighted matches as structured `{start, end}` offsets over plain text (title and a body snippet), computed server-side via `ts_headline` with sentinel delimiters that are parsed out before serialization — never raw HTML.
- Pagination mirrors the existing `GET /notes` envelope (`data`/`meta` with `page`, `pageSize`, `total`, `totalPages`, `hasNextPage`, `hasPreviousPage`), but this endpoint is relevance-ordered only — no `sortBy`/`sortDir`, and no `tags` filter (out of scope for this ticket; combining search with tag filtering can be a follow-up).
- Frontend UI for search is out of scope for this change and deferred entirely to AB-1013; this change is API-only.

## Capabilities

### New Capabilities
- `notes-search`: full-text search over a user's own, non-deleted notes via `GET /notes/search`, with relevance ranking, pagination, and highlighted match snippets.

### Modified Capabilities
(none — the existing `notes` and `notes-tags` capabilities are unchanged; `Note.searchText`/`Note.searchVector` are internal, indexing-only storage additions that back the new capability's behavior, not a change to any existing requirement)

## Impact

- **Database**: new migration adding `Note.searchText` (plain text, application-populated) and `Note.searchVector` (generated `tsvector`, STORED, over `title`/`searchText`) with a GIN index on it. Hand-written raw SQL for the generated column and GIN index (Prisma's schema DSL cannot express either), following the existing precedent of hand-edited SQL for the partial/functional indexes already in this schema.
- **Backend**: new `packages/shared` Zod schemas/DTOs for the search request/response; a new route/controller/service/repository slice (`apps/api/src/notes-search/`) for `GET /notes/search` using `prisma.$queryRaw` (parameterized) for the ranked, highlighted query, registered **before** the existing `GET /notes/:id` route so `:id` cannot capture the literal `search` path segment. `NotesService`/`NotesRepository` (existing `notes` capability) gain a small, additive change: `createNote`/`updateNote` also compute and write `searchText` alongside `title`.
- **Frontend**: none — out of scope for this change (see AB-1013).
- **Backfill**: existing notes' `searchText` cannot be computed by SQL alone (extraction is application logic), so a one-off, idempotent backfill script reuses the same extractor to populate `searchText` for pre-existing rows after the migration lands; `searchVector` then recomputes automatically since it is a generated column derived from `searchText`.
- **Rollback**: the migration is additive only (new columns + index, no changes to existing columns or existing endpoints); reverting is a straightforward down-migration dropping the column/index, with no data loss to existing `notes`/`notes-tags` behavior. The new endpoint can also be disabled independently by removing its route registration without touching existing endpoints.
