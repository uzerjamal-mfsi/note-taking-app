# Tasks

## 1. Search API client and query hook

- [x] 1.1 Add `fetchSearchResults({ q, page, pageSize })` in `apps/web/src/features/notes-search/api/notes-search-api.ts`, calling `GET /notes/search` via `apiFetch` and typed with `PaginatedSearchResultsDto` from `@note-taking-app/shared`; write `notes-search-api.test.ts` covering the query string built (mirrors `notes-api.test.ts`'s pattern for `fetchNotes`) and verify it passes
- [x] 1.2 Add `useSearchQuery({ q, page, pageSize })` in `apps/web/src/features/notes-search/hooks/use-search-query.ts` wrapping `fetchSearchResults` in a TanStack `useQuery` (mirrors `use-notes-query.ts`), `enabled` only when `q.trim().length > 0`; write `use-search-query.test.tsx` covering enabled/disabled and success/error and verify it passes

## 2. Highlight rendering

- [x] 2.1 Add pure `highlightRanges(text: string, ranges: MatchRange[]): ReactNode[]` in `apps/web/src/features/notes-search/lib/highlight-ranges.tsx`, splitting `text` at range boundaries and wrapping matched slices in `<mark>`, treating `text` strictly as plain-text input (no HTML parsing), and defensively sorting ranges by `start`, clamping `start`/`end` to `[0, text.length]`, and merging/dropping ranges that become empty or still overlap after clamping; write `highlight-ranges.test.tsx` covering no ranges, one range, multiple non-adjacent ranges, a range touching the start/end of the string, literal `<script>`-containing text rendering as visible plain text (not interpreted as markup), and unsorted/overlapping/out-of-bounds ranges rendering without throwing, and verify it passes

## 3. URL-synced search state

- [x] 3.1 Extend `apps/web/src/features/notes/hooks/use-notes-list-params.ts` with a `q: string` field (default `""`, read/written via the same `writeParams`/`useSearchParams` mechanism as `page`/`sortBy`/`sortDir`/`tags`) and a `setQuery(q: string)` that resets `page` to `1`; update `use-notes-list-params.test.tsx` to cover reading `q` from the URL, `setQuery` writing `q` and resetting `page`, and reload/back-forward restoring `q`, and verify it passes

## 4. Search box component

- [x] 4.1 Add `apps/web/src/features/notes-search/components/SearchBox.tsx`: a controlled text input with local `useState` for the raw keystroke value, debouncing (setTimeout/clearTimeout ref, mirroring `use-autosave.ts`'s idle-timer pattern, default 300ms) calls to a `onCommit(q: string)` prop, syncing its local value from an external `value` prop (URL-restored `q`) on prop change, a "Clear search" button/X that immediately calls `onCommit("")`, an Escape-key handler that clears the same way, and a wrapping `<form>` whose `onSubmit` calls `preventDefault`; write `SearchBox.test.tsx` covering debounced commit firing once after the debounce period (using fake timers), no commit before the debounce elapses, external `value` changes updating the displayed input, the clear button committing `""` immediately, pressing Escape clearing the input and committing `""`, and submitting the form (Enter) not causing a page navigation, and verify it passes

## 5. Search result rendering

- [x] 5.1 Add `apps/web/src/features/notes-search/components/SearchResultCard.tsx` rendering a `SearchResultDto`: highlighted `title` via `highlightRanges(title, titleMatches)`, highlighted `snippet` via `highlightRanges(snippet, snippetMatches)` only when `snippet` is non-empty, tag chips, relative updated date (reuse the formatting approach from `NoteCard.tsx`), and a `Link` to `/notes/:id`; write `SearchResultCard.test.tsx` covering highlighted title rendering, snippet shown/omitted based on emptiness, and navigation link target, and verify it passes
- [x] 5.2 Add `apps/web/src/features/notes-search/components/SearchNoResultsState.tsx` rendering a "no notes matched your search" message, distinct from `NotesEmptyState`/`NotesNoMatchesState`; write `SearchNoResultsState.test.tsx` verifying the distinct message renders and verify it passes

## 6. Wire search into the notes list page

- [x] 6.1 In `apps/web/src/features/notes/components/NotesListPage.tsx`, render `SearchBox` bound to `q`/`setQuery`; derive `isSearching = q.trim().length > 0`; when `isSearching`, call `useSearchQuery` instead of `useNotesQuery`, hide `NotesSortControl` and `NotesTagFilter`, render `SearchResultCard` items and `SearchNoResultsState` for empty results, and reuse `Spinner`/`NotesErrorState`/`NotesPagination` for loading/error/pagination; when not searching, render exactly the existing `GET /notes` list unchanged
- [x] 6.2 Update `NotesListPage.test.tsx` to cover: typing a query renders search results and hides sort/tag controls; clearing the search restores the sort/tag controls and the previously selected sort/tags without re-querying with defaults; a zero-result search shows `SearchNoResultsState`; a failed search shows `NotesErrorState`; verify all pass

## 7. End-to-end verification

- [x] 7.1 ~~Add/extend a Playwright spec~~ SKIPPED: no Playwright test infrastructure exists anywhere in this repo (no `playwright.config.*`, no `*.spec.ts`, no e2e history) despite `test:e2e`/`@playwright/test` being wired up in package.json; there is no "existing notes-list e2e coverage" to extend. Standing up e2e infra from scratch is out of scope for this frontend search-UI change - deferred as separate work, per user decision.
- [x] 7.2 Run `pnpm build`, `pnpm lint --max-warnings 0`, `pnpm run typecheck`, and `pnpm test --coverage` from the repo root and verify all pass with 0 errors/warnings and coverage ≥80% on the new code. `pnpm build`/`lint`/`typecheck` pass clean monorepo-wide; `apps/web` tests pass 182/182 with new-code coverage 96%+ (well above 80%). `apps/api` tests fail in this environment only because no `DATABASE_URL`/local Postgres is configured (pre-existing, unrelated to this frontend-only change - no apps/api files were touched).
