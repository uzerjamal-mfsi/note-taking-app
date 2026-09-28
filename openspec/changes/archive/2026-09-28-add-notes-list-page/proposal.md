# Proposal

## Why

AB-1011: Authenticated users have no way to see their notes in the web app. The backend `GET /notes` endpoint (list, paginate, sort) already exists and is fully specified (`notes` capability), but the frontend index route still renders a placeholder API health check left over from shell scaffolding. Users need a real landing page that lists their own notes before any other note-related UI (editor, search, sharing, history) can be built on top of it.

## What Changes

- Add a `notes` feature folder on the frontend (`apps/web/src/features/notes/{api,components,hooks}`) that fetches `GET /notes` via the shared API client and shared `PaginatedNotesDto`/`NoteDto` contracts.
- Add a small `tags` feature folder (`apps/web/src/features/tags/{api,hooks}`) that fetches the caller's tags via the existing `GET /tags` endpoint, to power the tag filter below.
- Render the authenticated user's notes as a card grid at the index route (`/`): each card shows the note's title, its tags as colored chips, and a relative "updated" date. Cards are static (non-interactive) since no note-detail/editor route exists yet.
- Add Prev/Next pagination controls driven by the API's `meta.hasNextPage`/`hasPreviousPage`, using the API's default page size (20).
- Add a sort control (`updatedAt`/`createdAt` × ascending/descending) and a tag filter (toggle one or more of the caller's own tags) that both re-query `GET /notes` with the corresponding `sortBy`/`sortDir`/`tags` parameters, so the query parameters `GET /notes` already supports are no longer orphaned on the frontend.
- Keep `page`, `sortBy`, `sortDir`, and `tags` synchronized with the URL's search params, so the browser back/forward buttons and a page reload restore the exact list state the user had.
- Add loading, error, true-empty ("no notes yet"), and filtered-zero-match ("no notes match your filters", with a Clear-filters action) states for the list.
- **BREAKING (internal only)**: Remove the placeholder `App.tsx`/`App.test.tsx` health-check component that currently renders at `/`; the notes list becomes the index route's content instead. `features/health` (the API client call + hook) is left in place but becomes unused by any route.

Explicitly out of scope for this change: note creation/editing, free-text search, sharing, version history, and Playwright/E2E coverage — all per AB-1011's stated scope. These land in later tickets.

## Capabilities

### New Capabilities
- `web-notes-list`: Frontend feature that fetches and renders the authenticated user's paginated, sorted, and tag-filtered notes as a card list on the index route, with loading/error/empty states, Prev/Next pagination, and URL-synced list state.

### Modified Capabilities
(none — the index route already exists per `web-app-shell`; swapping its rendered content for a new feature does not change any `web-app-shell` requirement)

## Impact

- **Affected code**: `apps/web/src/App.tsx`, `apps/web/src/App.test.tsx` (removed); new files under `apps/web/src/features/notes/**` and `apps/web/src/features/tags/**`; `apps/web/src/routes/router.ts` (index route `Component` swapped from `App` to the new notes list page).
- **New shadcn components**: likely `badge` (tag chips), `select` (sort control), and possibly `skeleton` (loading state), added via the existing shadcn CLI setup — no new npm dependencies otherwise.
- **APIs**: consumes the existing `GET /notes` and `GET /tags` endpoints only; no backend changes.
- **Dependencies**: none added (`Intl.RelativeTimeFormat`/`Intl.DateTimeFormat` used for the date display instead of a new date library).
- **Schema/migrations**: none.
- **Rollback**: revert the frontend commit(s); no data or migration changes to reverse, no backend impact.
