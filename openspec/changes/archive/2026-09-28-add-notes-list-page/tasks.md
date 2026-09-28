# Tasks

This change is frontend-only (`apps/web`) — `GET /notes`, `GET /tags`, and their shared contracts already exist, so there are no backend/API tasks.

## 1. Setup

- [x] 1.1 Add the shadcn `badge` and `select` components (`pnpm dlx shadcn add badge select` from `apps/web`) and verify `apps/web/src/components/ui/badge.tsx` and `select.tsx` are generated and `pnpm build` still passes.
- [x] 1.2 Scaffold `apps/web/src/features/notes/{api,components,hooks}` and `apps/web/src/features/tags/{api,hooks}` per the feature-folder convention and verify `apps/web/src/lib/feature-structure.test.ts` still passes with no top-level files added under `src/`.

## 2. Tags API + query hook

- [x] 2.1 Write `apps/web/src/features/tags/api/tags-api.test.ts` covering `fetchTags()`: it calls `apiFetch` with `/tags` and returns the parsed `TagDto[]`. Then implement `apps/web/src/features/tags/api/tags-api.ts` and verify the test passes.
- [x] 2.2 Write `apps/web/src/features/tags/hooks/use-tags-query.test.tsx` covering `useTagsQuery()`: calls `fetchTags`, exposes `isLoading`/`isError`/`data`. Then implement `apps/web/src/features/tags/hooks/use-tags-query.ts` and verify the test passes.

## 3. URL-synced list params

- [x] 3.1 Write `apps/web/src/features/notes/hooks/use-notes-list-params.test.tsx` covering: defaults (`page=1`, `sortBy=updatedAt`, `sortDir=desc`, `tags=[]`) when the URL has no relevant search params; parsing valid `page`/`sortBy`/`sortDir`/`tags` from the URL; falling back to each field's default when that field's URL value is invalid (non-integer `page`, unrecognized `sortBy`/`sortDir`) per the "Invalid or unrecognized URL search params are ignored" scenario in `specs/web-notes-list/spec.md`; `setPage`, `setSort`, `toggleTag` (add and remove), and `clearFilters` each producing the correct next search params, with `setSort`/`toggleTag`/`clearFilters` resetting `page` to `1`. Then implement `apps/web/src/features/notes/hooks/use-notes-list-params.ts` (wrapping `useSearchParams`, per design.md Decision 3) and verify all tests pass.

## 4. Notes API + query hook

- [x] 4.1 Write `apps/web/src/features/notes/api/notes-api.test.ts` covering `fetchNotes({ page, sortBy, sortDir, tags })`: it calls `apiFetch` with a query string containing `page`/`sortBy`/`sortDir`, includes `tags` only when the array is non-empty (comma-joined), and returns the parsed `PaginatedNotesDto`. Then implement `apps/web/src/features/notes/api/notes-api.ts`, typed with `PaginatedNotesDto`/`NoteDto` from `@note-taking-app/shared`, and verify the test passes.
- [x] 4.2 Write `apps/web/src/features/notes/hooks/use-notes-query.test.tsx` covering `useNotesQuery(params)`: it calls `fetchNotes` with the given params, exposes `isLoading`/`isError`/`data`, uses a query key that includes all four params (per design.md Decision 4), and reuses previous data while a new query is in flight (`placeholderData`). Then implement `apps/web/src/features/notes/hooks/use-notes-query.ts` and verify the test passes.

## 5. Presentational components

- [x] 5.1 Write `apps/web/src/features/notes/components/NoteCard.test.tsx` covering: renders the note's title; renders one chip per tag with the tag's name and its `color` applied; renders a relative "updated" date derived from `updatedAt`. Then implement `apps/web/src/features/notes/components/NoteCard.tsx` (static/non-interactive) using the shadcn `Card` and `Badge` and verify the tests pass.
- [x] 5.2 Write `apps/web/src/features/notes/components/NotesEmptyState.test.tsx` (true-empty message), `NotesNoMatchesState.test.tsx` (filtered-zero-match message plus a "Clear filters" button that calls an `onClearFilters` prop), and `NotesErrorState.test.tsx` (error message). Then implement `NotesEmptyState.tsx`, `NotesNoMatchesState.tsx`, and `NotesErrorState.tsx` and verify the tests pass.
- [x] 5.3 Write `apps/web/src/features/notes/components/NotesPagination.test.tsx` covering: "Previous" is disabled when `hasPreviousPage` is `false`; "Next" is disabled when `hasNextPage` is `false`; clicking an enabled control calls the provided `onPageChange` with the correct page number. Then implement `apps/web/src/features/notes/components/NotesPagination.tsx` and verify the tests pass.
- [x] 5.4 Write `apps/web/src/features/notes/components/NotesSortControl.test.tsx` covering: renders the four sort options; selecting one calls an `onSortChange(sortBy, sortDir)` prop with the matching values; reflects the currently active sort as selected. Then implement `apps/web/src/features/notes/components/NotesSortControl.tsx` using the shadcn `Select` and verify the tests pass.
- [x] 5.5 Write `apps/web/src/features/notes/components/NotesTagFilter.test.tsx` covering: renders one toggle per tag from the given tag list with `aria-pressed` reflecting whether it's in the selected set; clicking a tag calls an `onToggleTag(tagName)` prop; renders nothing (or a documented empty state) when the tag list is empty. Then implement `apps/web/src/features/notes/components/NotesTagFilter.tsx` reusing the shadcn `Badge` as a toggle and verify the tests pass.

## 6. Notes list page (composition)

- [x] 6.1 Write `apps/web/src/features/notes/components/NotesListPage.test.tsx` covering every scenario in `specs/web-notes-list/spec.md`: loading indicator while fetching; true-empty state when `data` is `[]` and no tag filter is active; filtered-zero-match state (with working "Clear filters") when `data` is `[]` and a tag filter is active; error state when the query fails; a card rendered per returned note; Prev/Next wired to `meta.hasNextPage`/`hasPreviousPage`; changing sort or toggling a tag re-queries with the expected params and resets to page 1; the rendered list re-reads from `useNotesListParams` (i.e. from the URL) rather than separate local state. Then implement `apps/web/src/features/notes/components/NotesListPage.tsx`, composing `useNotesListParams`, `useNotesQuery`, `useTagsQuery`, and the components from Groups 5, and verify all tests pass.

## 7. Route wiring and placeholder removal

- [x] 7.1 Update `apps/web/src/routes/router.ts` to render `NotesListPage` (instead of `App`) as the index route's `Component`, still nested under `RequireAuth`, and verify `apps/web/src/routes/router.test.tsx` (updated as needed) confirms `/` renders the notes list for an authenticated session, still redirects an unauthenticated session to `/login`, and that reloading `/?page=2&sortBy=createdAt&sortDir=asc&tags=work` renders that same state (per the URL-sync requirement).
- [x] 7.2 Delete `apps/web/src/App.tsx` and `apps/web/src/App.test.tsx` and verify no remaining import references either file (`pnpm --filter web typecheck` and `pnpm --filter web build` both pass).

## 8. Verification

- [x] 8.1 Run `pnpm --filter web test --coverage`, `pnpm --filter web typecheck`, and `pnpm lint --max-warnings 0` from the repo root and verify all pass with ≥80% coverage on the new `features/notes/**` and `features/tags/**` code, per CLAUDE.md's Definition of Done.
- [x] 8.2 Manually verify in a running dev server (`pnpm run dev`) that `/` shows a logged-in user's notes; Prev/Next, sorting, and tag filtering work against real data; the true-empty, filtered-zero-match, and error states render correctly; and that reloading the page or using the browser back button after changing page/sort/filter restores the expected list state.
