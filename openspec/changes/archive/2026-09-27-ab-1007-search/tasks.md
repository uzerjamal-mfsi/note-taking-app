# Tasks

## 1. Database: search columns and index

- [x] 1.1 Write the migration (`pnpm run db:migrate`): add `Note.searchText` (text, `NOT NULL DEFAULT ''`), the generated `Note.searchVector` (`tsvector`, STORED, weighted `title`→A / `searchText`→B) column, and a GIN index on `searchVector`; verify `prisma migrate deploy`/`pnpm run db:migrate` applies cleanly against a fresh database and `prisma migrate status` reports no pending migrations
- [x] 1.2 Update `schema.prisma`'s `Note` model with the closest Prisma-representable approximation of `searchText`/`searchVector` plus an inline comment documenting the real generated-column/GIN-index definitions (matching the existing documented-drift precedent for the partial index and functional unique index); verify `prisma generate` succeeds and `prisma migrate status` still reports no drift-driven pending migration
- [x] 1.3 Write tests, then implement `extractSearchText` (`apps/api/src/notes/notes-service.ts`), generalizing `collectText` to walk every top-level node of the TipTap document (not just the first, as `deriveTitle` does); cover plain paragraphs, marks, hard breaks, nested lists, and empty paragraphs; verify `pnpm --filter api test` passes
- [x] 1.4 Write tests, then wire `extractSearchText` into `NotesService.createNote`/`updateNote` (alongside `deriveTitle`) and `NotesRepository.create`/`updateOwned` (add `searchText` to `data`); verify a created/updated note's `searchText`/`searchVector` reflect the new content
- [x] 1.5 Write and pass a script test, then implement the one-off backfill script (`apps/api/src/scripts/backfill-search-text.ts`) that batches over existing notes and calls `extractSearchText` to populate `searchText` for rows written before 1.4 shipped; verify it is idempotent (running it twice leaves `searchText` unchanged) and a note seeded directly (bypassing the app, to simulate a pre-existing row) has `searchText`/`searchVector` populated after running it

## 2. Shared contracts (packages/shared)

- [x] 2.1 Write schema tests, then add `searchNotesQuerySchema` to `packages/shared/src/notes/` (or a new `notes-search` module) with `q: z.string().trim().min(1).max(200)` and `page`/`pageSize` reusing the same defaults and bounds as `listNotesQuerySchema`; verify `pnpm --filter shared test` passes, covering missing/blank/over-length `q` and out-of-range `pageSize`
- [x] 2.2 Write schema tests, then add `searchResultDtoSchema` (`id, title, titleMatches: [{start,end}], snippet, snippetMatches: [{start,end}], createdAt, updatedAt, tags`) and `paginatedSearchResultsDtoSchema` (same `data`/`meta` envelope shape as `paginatedNotesDtoSchema`); verify tests pass

## 3. API: notes-search feature slice

- [x] 3.1 Write repository-level tests (Supertest/Vitest against the test database) for: relevance ordering (title match ranked above body-only match), tie-break by `id` descending, scoping to the caller's own non-deleted notes, empty-result case, page-beyond-last-page case, and a query that reduces to no searchable terms (e.g. `q=the`) — run and confirm they fail (no implementation yet)
- [x] 3.2 Implement `NotesSearchRepository` (`apps/api/src/notes-search/`): parameterized `prisma.$queryRaw`/`Prisma.sql` queries (never `$queryRawUnsafe`) for the count and the ranked page, using `websearch_to_tsquery`, `ts_rank_cd`, and `ts_headline` (with sentinel `StartSel`/`StopSel` control characters) run in a `$transaction`; after building the tsquery, check `numnode(query) = 0` and short-circuit to an empty page without running the ranked query when true; verify the tests from 3.1 pass
- [x] 3.3 Write unit tests for the sentinel-to-offset parser covering: a title-only match, a body-only match, no match in one of the two fields, and text that itself contains characters adjacent to the sentinel range — run and confirm they fail
- [x] 3.4 Implement `NotesSearchService`: builds the tsquery, calls the repository, parses each `ts_headline` result's sentinel delimiters into `{start, end}` ranges over plain (sentinel-stripped) text, and assembles `SearchResultDto`s; verify the tests from 3.3 pass
- [x] 3.5 Write controller/route tests (Supertest) for: `422` on missing/blank/over-length `q` and out-of-range `pageSize` (no DB query attempted), `401` when unauthenticated, `200` with the expected envelope shape on success, and a regression test asserting `GET /notes/search?q=...` reaches the search handler rather than the `GET /notes/:id` handler — run and confirm they fail
- [x] 3.6 Implement the route + controller (`GET /notes/search`, `validate()` with `searchNotesQuerySchema`, existing auth middleware, wired to `NotesSearchService`); register it **before** `GET /notes/:id` in the router so `:id` cannot capture the literal `search` segment; verify the tests from 3.5 pass, including the route-ordering regression test
- [x] 3.7 Run `pnpm --filter api lint --max-warnings 0`, `pnpm --filter api run typecheck`, and `pnpm --filter api test --coverage`; verify 0 errors/warnings and ≥80% coverage on the new code

## 4. Final verification

- [x] 4.1 Run `pnpm build`, `pnpm lint --max-warnings 0`, `pnpm run typecheck`, and `pnpm test --coverage` at the repo root; verify all pass with 0 errors/warnings
- [x] 4.2 Run `openspec validate --strict` for this change; verify it passes cleanly
- [x] 4.3 Cross-check every scenario in `specs/notes-search/spec.md` against the tests added in groups 1–3 and confirm each has at least one covering test, before requesting review
