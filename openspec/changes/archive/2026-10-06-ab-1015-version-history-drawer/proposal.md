# Proposal

## Why

AB-1015: The backend version-history API (`notes-history` capability) records a snapshot of a note on every content-changing update and exposes list / view / restore endpoints, but the UI offers no way to see or undo past edits. This adds the frontend experience: a History drawer in the editor where a user can browse a note's past versions, preview one read-only, and restore it.

## What Changes

- Add a **History** button next to Share in the note editor that opens a right-anchored drawer for the note being edited.
- The drawer fetches `GET /notes/:id/versions` only while open and renders loading, empty ("no versions yet"), list, or retryable error states. Each row shows the version's title and its creation time (formatted with `Intl.DateTimeFormat`); a footer note states "Versions are kept for 30 days".
- Selecting a version fetches `GET /notes/:id/versions/:versionId` and renders a **read-only preview** (version title + a non-editable TipTap document) with a **Restore** button and the one-line hint "Your current version will be saved to history." There is **no extra confirmation dialog**; restore is non-destructive because the server snapshots the current state first.
- **Restore** sequence: flush any pending autosave, `POST /notes/:id/versions/:versionId/restore`, then on success re-seed the editor body, title input and tag selection from the returned note, discard any pending autosave, update the `["note", id]` cache, invalidate the versions list and notes list, and close the drawer. On failure show an error in the drawer and leave the editor untouched.
- Re-seeding after restore is an explicit, narrow exception to the editor's "background refetches do not overwrite edits" rule, and must not itself trigger an autosave.
- **Any 404** (list, preview, restore) closes the drawer and invalidates `["note", noteId]`, so the editor falls into its existing "Note not found" state; a single-version 404 also refetches the version list so a purged version disappears when the note still exists.
- Add a shadcn-style `Sheet` primitive (`components/ui/sheet.tsx`) built on the already-installed `radix-ui` Dialog.

## Capabilities

### New Capabilities
- `web-notes-history`: Frontend version-history UI - drawer states (loading / empty / list / error), version preview, restore (including autosave flush and editor re-seed), and 404 handling.

### Modified Capabilities
- `web-notes-editor`: Adds a History entry point to the editor, and amends "Background refetches do not overwrite in-progress edits" to allow the editor to be re-seeded from a successful restore response.

## Impact

- **Frontend only** - no API, `packages/shared`, Prisma schema, migration, or index changes. Consumes the existing `notes-history` contracts (`NoteVersionSummaryDto`, `NoteVersionDto` from `packages/shared/src/notes-history/notes-history-contracts.ts`) and the `NoteDto` returned by restore.
- New files under `apps/web/src/features/notes-history/{api,hooks,components}` and `apps/web/src/components/ui/sheet.tsx`.
- Edits to `apps/web/src/features/notes/components/NoteEditorPage.tsx` (History button, extracted `seedFromNote`, restore wiring) and possibly `use-autosave.ts` (only if the flush/cancel contract needs an addition).
- No new npm dependencies; reuses `radix-ui`, TipTap `StarterKit`, TanStack Query, `Intl.DateTimeFormat`, and existing `Alert`/`Button`/`Spinner` primitives.
- **Rollback**: revert the frontend commit(s). No data or backend change to unwind; versions already recorded and any restores already performed remain valid server-side (a restore is itself undoable via the snapshot it created).
