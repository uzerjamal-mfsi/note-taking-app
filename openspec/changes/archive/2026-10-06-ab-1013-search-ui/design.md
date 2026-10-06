# Design

## Context

See proposal.md - Why. Relevant existing pieces this builds on:

- `NotesListPage.tsx` composes `useNotesListParams` (URL-synced `page`/`sortBy`/`sortDir`/`tags` via `useSearchParams`) with `useNotesQuery` (`GET /notes` via TanStack Query) and renders `NotesSortControl`, `NotesTagFilter`, `NoteCard`, `NotesPagination`, and the loading/error/empty-state components.
- The backend `notes-search` capability already returns `PaginatedSearchResultsDto`: `title`/`snippet` as plain text plus `titleMatches`/`snippetMatches` offset ranges (`packages/shared/src/notes-search/notes-search-contracts.ts`). No API changes needed.
- No debounce library is in use anywhere in `apps/web`; `use-autosave.ts` implements its own idle-timer debounce with `setTimeout`/`clearTimeout` refs. This change follows that same manual-timer pattern rather than adding a dependency.

## Goals / Non-Goals

**Goals:**
- Reuse `useNotesListParams`'s existing URL-sync mechanics rather than building a parallel state system.
- Keep the highlight-rendering logic a small, independently testable pure function, decoupled from data fetching.
- Preserve `NotesListPage`'s and `NoteCard`'s existing behavior/tests untouched wherever search is not active.

**Non-Goals:**
- No changes to the search API, its ranking, or its Zod contracts.
- No client-side caching/merging of list results and search results into one data shape - they stay two distinct TanStack Query cache entries, switched between by the presence of `q`.
- No highlight rendering inside the TipTap editor itself (out of scope per proposal - this is list-page only).

## Decisions

**Extend `useNotesListParams` with `q`, rather than a separate hook.**
`page`/`sortBy`/`sortDir`/`tags` already live in one `useSearchParams`-backed hook that writes all params atomically via `writeParams`. Adding `q` there (rather than a second hook independently calling `useSearchParams`) avoids two hooks racing to write the same URL object. `setQuery(q)` resets `page` to `1`, matching how `setSort`/`toggleTag`/`clearFilters` already reset page. Alternative considered: a standalone `use-search-params.ts` hook - rejected because two independent `useSearchParams` writers in the same component is a known foot-gun (last write wins, dropping the other's change within the same tick).

**Debounce lives in the search box component, not the hook.**
The text input keeps local `useState` for the raw keystroke value (so typing feels instant) and calls `setQuery` on a `setTimeout`/`clearTimeout` ref debounce (mirroring `use-autosave.ts`'s pattern), defaulting to 300ms. Only the debounced call touches the URL, so the URL/query-cache only updates once per pause in typing, not once per keystroke. The input's displayed value still needs to resync from the URL's `q` on external navigation (back/forward, reload) - handled by a controlled input whose local state resets from the URL value on mount and on popstate-driven prop changes.

**Mode switch (`list` vs `search`) is derived, not stored.**
`NotesListPage` computes `const isSearching = query.trim().length > 0` from the URL's `q` (trimmed the same way the API trims it) rather than tracking a separate boolean. This guarantees the rendered mode can never disagree with which query (`useNotesQuery` vs a new `useSearchQuery`) is actually enabled, and matches how reload/back-forward already work by re-deriving everything from the URL.

**Sort/tags are "hidden, not reset" by conditional rendering only.**
`sortBy`/`sortDir`/`tags` stay in the URL and in `useNotesListParams`'s state the entire time; `NotesListPage` simply doesn't render `NotesSortControl`/`NotesTagFilter` while `isSearching`. Clearing the search needs no restore step, because nothing was ever cleared - `GET /notes` picks the still-present `sortBy`/`sortDir`/`tags` back up immediately. Alternative considered: snapshot-and-restore sort/tags around search - rejected as unnecessary given they're never touched.

**New `features/notes-search/` folder, one new capability worth of files:**
- `api/notes-search-api.ts` - `fetchSearchResults({ q, page, pageSize })` calling `GET /notes/search`, mirroring `notes-api.ts#fetchNotes`.
- `hooks/use-search-query.ts` - thin `useQuery` wrapper, mirroring `use-notes-query.ts`, `enabled: q.trim().length > 0`.
- `lib/highlight-ranges.tsx` - pure `highlightRanges(text: string, ranges: MatchRange[]): ReactNode[]`, splitting `text` at range boundaries and wrapping matched slices in `<mark>`. Rather than trusting the API contract to always hand back sorted, non-overlapping, in-bounds ranges, the function defensively sorts ranges by `start`, clamps each `start`/`end` to `[0, text.length]`, and merges/drops any range that becomes empty or still overlaps the previous one after clamping - so a malformed or future-drifted range renders a best-effort highlight instead of throwing. It does not attempt to escape/interpret `text` as markup - it only ever renders substrings as text children, so no injection surface exists regardless of `text`'s contents.
- `components/SearchBox.tsx` - the debounced input + clear ("X") button. Also handles `Escape` (clears the query the same as the "X" button) and wraps the input in a `<form>` whose `onSubmit` calls `preventDefault` so pressing Enter commits the query without a full-page reload.
- `components/SearchResultCard.tsx` - result rendering (highlighted title/snippet via `highlightRanges`, tags, date, link to `/notes/:id`), separate from `NoteCard` per the earlier discussion (different DTO shape, avoids branching `NoteCard` for a mode it doesn't otherwise need).
- `components/SearchNoResultsState.tsx` - the zero-match state, distinct from `NotesEmptyState`/`NotesNoMatchesState`.

**`NotesListPage.tsx` gains a branch, not a rewrite.** It renders `SearchBox` unconditionally (it's how the user gets into/out of search mode), then branches: `isSearching` renders `useSearchQuery` + `SearchResultCard` list + `SearchNoResultsState`; otherwise renders exactly what it renders today. `NotesPagination` and `Spinner`/`NotesErrorState` are reused in both branches since the pagination-meta and loading/error shapes are identical between `PaginatedNotesDto` and `PaginatedSearchResultsDto`.

## Risks / Trade-offs

- [Debounce timing (300ms) is a guess, not a measured UX value] → Cheap to tune later; it's a single constant in `SearchBox.tsx`, not baked into the spec (the spec only requires "a short pause," not a number).
- [Deriving `isSearching` from trimmed `q` duplicates the API's own trim-then-check-non-empty validation logic in two places] → Low risk: both sides independently agreeing that whitespace-only queries don't count is exactly the desired behavior (spec's "Blank query does not trigger a search"), and the trim is a one-line `.trim().length > 0`, not complex logic worth extracting.
- [Two parallel query hooks (`useNotesQuery`, `useSearchQuery`) mean two loading/error states to keep visually consistent] → Mitigated by reusing the same `Spinner`/`NotesErrorState` components in both branches rather than writing new ones.

## Migration Plan

Frontend-only, additive UI change behind no flag - ships in a normal deploy. Rollback is a plain revert of the frontend commit(s); no data, schema, or API change to unwind.
