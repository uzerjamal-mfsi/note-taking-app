# Proposal

## Why

AB-1014: The backend sharing API (`notes-sharing` capability, AB-1008) has been live for a while, but there is no way to use it from the UI: users cannot create, copy, inspect, or revoke a public link, and a recipient has no web page to open a link in (`GET /shared/:token` returns JSON). This adds the frontend sharing experience end to end: an owner-facing Share modal in the editor and a public read-only viewer page.

## What Changes

- Add a **Share** button to the note editor page that opens a Share modal (dialog) for the note being edited.
- The modal loads the note's current share link via `GET /notes/:id/share` on open and renders one of: loading, no active link (`404` is treated as "not shared", not an error), active link, or a retryable error.
- **No active link**: offer an optional expiry (local date-time) and a "Create link" action (`POST /notes/:id/share`); a `422` is shown as an inline expiry error.
- **Active link**: show the full copyable URL (`<web origin>/shared/:token`), a Copy button with "Copied" confirmation, the view count, the expiry (or "Never expires"), and a Revoke action behind a confirmation (`DELETE /notes/:id/share`).
- Add a **public read-only viewer** route `/shared/:token`, reachable without authentication (and unaffected by the auth/guest guards), that fetches `GET /shared/:token` and renders the shared note's title and content read-only. `404` and `429` show distinct, non-technical states.
- The public fetch does not send the session access token and never triggers the refresh-and-retry flow.
- Add the shadcn/ui `Dialog` primitive (built on the already-installed `radix-ui` package).

## Capabilities

### New Capabilities
- `web-notes-sharing`: Frontend sharing UI - Share modal states (loading / no link / active / error), create with optional expiry, copy link, view count and expiry display, revoke with confirmation, and the public read-only shared-note viewer page with its not-found / rate-limited / error states.

### Modified Capabilities
- `web-notes-editor`: The editor gains a Share entry point that opens the Share modal; no existing editor requirement (autosave, tags, delete) changes behavior.

## Impact

- **Frontend only** - no API, `packages/shared`, schema, migration, or index changes. Consumes the existing `notes-sharing` contracts (`ShareLinkDto`, `GenerateShareLinkRequest`, `SharedNotePublicDto` from `packages/shared/src/sharing/sharing-contracts.ts`) as-is.
- New files under `apps/web/src/features/sharing/` (api client, query/mutation hooks, `ShareDialog`, `SharedNotePage`, helpers) and `apps/web/src/components/ui/dialog.tsx`.
- Edits to `apps/web/src/features/notes/components/NoteEditorPage.tsx` (Share button), `apps/web/src/routes/router.ts` (public `/shared/:token` route, outside `RequireAuth`/`RequireGuest`), and `apps/web/src/lib/api-client.ts` (an opt-out of auth header/refresh for public requests).
- No new npm dependencies; reuses `radix-ui`, TipTap `StarterKit`, TanStack Query, and existing `Alert`/`AlertDialog`/`Button`/`Input`/`Spinner` primitives.
- **Rollback**: revert the frontend commit(s); no data migration or backend change to unwind. Links already created remain valid server-side.
