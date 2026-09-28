# Design

## Context

See [proposal.md](./proposal.md) for motivation. Relevant existing state:
- `GET /notes` is fully implemented and specced (`notes` capability) and returns `PaginatedNotesDto` (`{ data: NoteDto[], meta: PaginationMeta }`) from `@note-taking-app/shared` (`packages/shared/src/notes/note-contracts.ts`). `NoteDto` includes `id`, `title` (server-derived), `content` (ProseMirror JSON), `createdAt`, `updatedAt`, and `tags: { id, name, color }[]` (`color` is a validated `#RRGGBB` hex string).
- The frontend shell (`web-app-shell` capability) already provides: feature-folder convention (`src/features/<feature>/{components,hooks,api}`), a router with `RequireAuth`/`RequireGuest` guards, a shared `QueryClient`, a centralized `apiFetch` client (`apps/web/src/lib/api-client.ts`) with 401-refresh-and-retry, and shadcn/ui initialized (style `radix-nova`; only `alert/button/card/form/input/label` installed so far). Routing is `react-router` 7 (`createBrowserRouter`), whose `useSearchParams` is the standard way to read/write URL search params.
- The index route (`/`) currently renders `App.tsx`, a scaffold placeholder that calls `useHealthQuery()` and prints API status. It sits behind `RequireAuth` already.
- `apps/web/src/features/health/**` (api call + hook) is a separate, already-existing feature and is not part of this change beyond becoming unused by any route.
- `GET /tags` (`apps/api/src/tags/tags-router.ts`) is authenticated, takes no query params, and returns the caller's own `TagDto[]` (`packages/shared/src/tags/tag-contracts.ts`: `id`, `name`, `color`, `createdAt`, `noteCount`) — no pagination, since a user's tag set is expected to be small. Nothing on the frontend consumes it yet.
- `GET /notes`'s `tags` query param matches by tag **name** (comma-separated, case-insensitive, OR-matched), not tag id (`packages/shared/src/notes/note-contracts.ts`), so the filter UI must send names, not the ids `GET /tags` also returns.

## Goals / Non-Goals

**Goals:**
- Fetch and render the authenticated user's own notes as a paginated, sortable, tag-filterable card list at `/`, using only what `GET /notes` and `GET /tags` already return.
- Drive `page`/`sortBy`/`sortDir`/`tags` entirely from the URL's search params, so the browser's back/forward/reload all work without extra client-side state to keep in sync.
- Follow the existing feature-folder, TanStack Query, and `apiFetch` conventions exactly as the `health` and `auth` features already do, so this is a template later note features (free-text search, editor) can extend.

**Non-Goals:**
- No note creation/editing, free-text search, sharing, or version history UI (separate tickets).
- No note-detail route or navigation from a card — there is nothing to navigate to yet.
- No tag management (create/rename/recolor/delete) — the tag filter only reads `GET /tags`.
- No Playwright/E2E coverage for this change (per ticket scope) — component/unit tests only.

## Decisions

**1. Replace `App.tsx` in place rather than adding a parallel route.**
The index route already exists, is already guarded by `RequireAuth`, and its current content (a health check) was explicitly a shell-scaffolding placeholder, not a feature. Swapping `router.ts`'s index `Component` from `App` to the new `NotesListPage` avoids maintaining two competing "home" experiences. `App.tsx`/`App.test.tsx` are deleted; `features/health/**` (api + hook) is left untouched since it is a separate concern that may be reused elsewhere later (e.g. an ops/status page), just no longer wired to a route.

**2. Page-based fetching via `useQuery`, not `useInfiniteQuery`.**
`GET /notes` is already page-based (`page`, `pageSize`, `meta.hasNextPage/hasPreviousPage`), and the UI decision (see proposal) is explicit Prev/Next controls, not infinite scroll. `placeholderData: keepPreviousData` (TanStack Query v5) is used so the grid doesn't flash to a loading state when page/sort/tags change, only on first load.

**3. The URL is the single source of truth for list state — no `useState` for page/sort/tags.**
A `features/notes/hooks/use-notes-list-params.ts` hook wraps `react-router`'s `useSearchParams` and exposes `{ page, sortBy, sortDir, tags, setPage, setSort, toggleTag, clearFilters }`. Reading: each param is parsed and validated with the same rules `listNotesQuerySchema` already encodes (allowed `sortBy`/`sortDir` values, positive integer `page`, deduplicated/trimmed `tags`); anything invalid or absent falls back to that field's default (`page=1`, `sortBy=updatedAt`, `sortDir=desc`, `tags=[]`) rather than being sent to the API or crashing the page. Writing: every setter calls `setSearchParams` with the full next param set (never a partial patch, since `sortBy` and `sortDir` change together and changing sort/tags always resets `page` to `1`); this uses the router's default (pushing a new history entry), which is what makes the browser back button meaningfully step back through prior list states, per the proposal's explicit ask. `NotesListPage` derives its TanStack Query key directly from this hook's output — no separate local state that could drift from the URL.

**4. Query key is the full param tuple: `["notes", { page, sortBy, sortDir, tags }]`.**
Every one of `page`/`sortBy`/`sortDir`/`tags` changes what `GET /notes` returns, so all four belong in the key (a stale/incomplete key would let TanStack Query serve cached results for the wrong query). `tags` is sorted before being placed in the key so that toggling the same two tags in a different order doesn't produce a spurious cache miss.

**5. New API/hook layers mirror `features/health`.**
- `features/notes/api/notes-api.ts`: `fetchNotes(params: { page: number; sortBy: NotesSortBy; sortDir: NotesSortDir; tags: string[] }): Promise<PaginatedNotesDto>`, building the query string (including `tags.join(",")` only when non-empty) and calling `apiFetch<PaginatedNotesDto>`.
- `features/notes/hooks/use-notes-query.ts`: thin `useQuery` wrapper taking the params object from `useNotesListParams`.
- `features/tags/api/tags-api.ts`: `fetchTags(): Promise<TagDto[]>` calling `apiFetch<TagDto[]>("/tags")`.
- `features/tags/hooks/use-tags-query.ts`: thin `useQuery` wrapper (`queryKey: ["tags"]`) — used only to populate the tag filter in this change.
- `features/notes/components/`: `NotesListPage` (data-fetching container, becomes the routed component), `NoteCard`, `NotesPagination`, `NotesSortControl`, `NotesTagFilter`, `NotesEmptyState` (true-empty), `NotesNoMatchesState` (filtered-zero-match), `ClearFiltersButton` (shared by `NotesNoMatchesState` and `NotesListPage`'s has-results branch, see Decision 9), `NotesErrorState`. Kept as plain presentational components rather than a shared generic "list" abstraction — the state count doesn't yet justify one.

**6. Tag chips (on cards) render with inline `style` using the tag's own `color`, not a shadcn `Badge` variant; the tag filter reuses the same `Badge` as a toggle.**
Tag colors are per-tag user data (`#RRGGBB` from the API), not a fixed design-system palette, so they can't be expressed as CVA variants. A shadcn `badge` component is added (`pnpm dlx shadcn add badge`) for shape/sizing/accessibility baseline; the color itself is applied via `style={{ backgroundColor: tag.color }}` plus a computed readable text color. `NotesTagFilter` reuses the same `Badge`, one per tag from `GET /tags`, as a clickable/keyboard-operable toggle (`aria-pressed`) rather than introducing a separate multi-select component — the tag count for a single user is expected to be small enough that a wrapped row of chips reads fine.

**7. Sort control uses the shadcn `select` component (newly added), not a custom dropdown.**
`pnpm dlx shadcn add select` — a native-feeling accessible select is exactly what "one of four sort options" needs, and matches "reference existing patterns before introducing new npm packages" (shadcn is already the project's UI primitive source).

**8. Relative date via `Intl.RelativeTimeFormat`, no new dependency.**
Per the "reference existing patterns before introducing new npm packages" rule — no date library exists in `apps/web/package.json` today, and the browser Intl API covers "updated 3 days ago"-style formatting without adding one.

**9. Empty-vs-filtered-zero-match is derived, not server-signaled; "Clear filters" and pagination follow the same derived state, not just the zero-match case.**
`GET /notes` returns the same shape (`data: []`) whether the user has zero notes or their filter matched nothing — there's no separate server flag. The frontend distinguishes them purely from whether `tags.length > 0` in the current `useNotesListParams` state: `data.length === 0 && tags.length === 0` → true-empty; `data.length === 0 && tags.length > 0` → filtered-zero-match. (Sort alone can't produce zero results, only a tag filter can, so `sortBy`/`sortDir` don't factor into this.)

Two consequences follow directly from the spec's own wording, not just from this empty/zero-match split:
- The "Notes list tag filter" requirement says Clear filters "SHALL be available **whenever at least one tag is selected**" — not only when the filter matches nothing. So `NotesListPage` renders a `ClearFiltersButton` (the same component `NotesNoMatchesState` uses) above the note grid whenever `tags.length > 0`, in addition to inside `NotesNoMatchesState`.
- `NotesPagination` is rendered whenever there's something to page through *or* an empty page can still be paged away from (`data.length > 0 || meta.hasPreviousPage || meta.hasNextPage`), not only when `data.length > 0`. This covers landing on a since-emptied or filtered-to-empty page beyond the true last page: the user can still page back without reloading with a hand-edited URL.

**10. No changes to `packages/shared`.**
`PaginatedNotesDto`/`NoteDto`/`listNotesQuerySchema`/`TagDto` already exist and already cover this change's needs; the "define Zod schemas in packages/shared first" rule doesn't apply here since there's nothing new to define.

## Risks / Trade-offs

- **[Risk] Deleting `App.tsx` removes the only visible proof the API health check works.** → Mitigation: the health check was a shell-verification scaffold (per `web-app-shell`'s spec, not a product requirement); its underlying `api`/`hook` code is untouched and can be re-wired into a future ops page if ever needed. Not a spec regression since no `web-app-shell` requirement mentions health-check UI.
- **[Risk] Fixed `pageSize=20` with only Prev/Next means a user with many notes must page through them one screen at a time, with no jump-to-page and no free-text search yet.** → Mitigation: explicitly acceptable for this ticket's scope; free-text search is a separate, already-planned capability (`notes-search` exists on the backend).
- **[Risk] `keepPreviousData` could show slightly stale notes for a moment if another session edits a note between page/sort/filter changes.** → Mitigation: acceptable for a manually-paged list with no realtime requirement (explicitly out of scope per project-wide constraints).
- **[Risk] Malformed or stale URLs (e.g. a bookmarked link, or a tag filter naming a tag that was since renamed/deleted) could otherwise break the page or silently 422 against `GET /notes`.** → Mitigation: `useNotesListParams` validates every field against the same rules the API enforces and falls back to defaults for anything invalid (Decision 3); an unrecognized tag *name* in the `tags` param is not itself invalid syntax (the API just won't match it), so it's passed through as-is and simply yields zero matches — the filtered-zero-match state (with Clear filters) already covers that case.
- **[Risk] Pushing a new history entry on every page/sort/tag change (Decision 3) could make the back button feel noisy if a user pages through many results.** → Mitigation: accepted trade-off — the proposal explicitly asks for back-button support over an uncluttered history; this can be revisited (e.g. `replace` for same-session page changes only) in a later ticket if it proves annoying in practice.

## Migration Plan

Pure frontend, additive-then-swap change with no data migration:
1. Add the `notes` and `tags` feature folders and their tests, including `useNotesListParams`.
2. Point the index route at the new page; delete `App.tsx`/`App.test.tsx`.
3. Ship behind the normal PR/CI process — no feature flag needed (no partial-rollout risk; it's a read-only list view).
- **Rollback**: revert the commit(s); no backend, schema, or data changes to undo.
