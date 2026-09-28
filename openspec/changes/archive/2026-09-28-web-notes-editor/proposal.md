# Proposal

Ticket: AB-1012

## Why

Notes can be created and edited via the API (`POST /notes`, `PATCH /notes/:id`), and the frontend can list them, but there is no way for a user to actually open or write a note in the browser. The notes list renders static cards with no click target and no "new note" action. This change adds the missing piece: a rich-text note editor backed by TipTap with debounced autosave, and the minimal navigation needed to reach it from the existing notes list.

## What Changes

- Add a TipTap-based note editor screen at `/notes/:id`, rendering the note's `content` as an editable ProseMirror document.
- Add debounced autosave: after the user stops typing, the editor sends the full `content` document via `PATCH /notes/:id` and shows a save-status indicator (Saving / Saved / Error, with retry on the next edit or an explicit retry action).
- Add a dedicated, autosaved title input above the editor canvas. It represents the document's first node (the body editor represents the rest); the two are recombined into one `content` document on autosave. `title` itself remains entirely server-derived - this adds no new API field and no backend change.
- Add tag assignment in the editor: the authenticated user's own tags (from `GET /tags`) are offered as toggleable selections, mirroring the notes list's existing tag-filter pattern. Toggling a tag saves immediately (not debounced) via `PATCH /notes/:id` with the full resulting `tagIds` set.
- Add a "Delete note" action that soft-deletes the note via `DELETE /notes/:id`, gated behind a confirmation dialog so a single accidental click cannot delete a note; on success the user is returned to the notes list.
- Add flush-on-unmount and a `beforeunload` guard to autosave: unmounting the editor with unsaved edits immediately attempts to flush them, and closing the tab or navigating away in the browser while dirty triggers the browser's native "leave site?" confirmation.
- Isolate the editor's active document state from TanStack Query background refetches of `GET /notes/:id`, so a refetch (e.g. on window refocus) never overwrites in-progress local edits or moves the cursor; the editor is seeded once per note, not resynced on every refetch.
- Add a "New note" action on the notes list that creates a note via `POST /notes` with an empty starter document and navigates straight into its editor.
- Make each `NoteCard` on the notes list a link to its editor route.
- Add `@tiptap/react`, `@tiptap/starter-kit`, and `@tiptap/pm` as pinned frontend dependencies at the exact version `2.26.1` (no version ranges, per CLAUDE.md) - the latest `2.x` release confirmed via the npm registry to declare `react: "^17.0.0 || ^18.0.0 || ^19.0.0"` in its `peerDependencies`, avoiding an unnecessary `3.x` major-version migration for this first integration.

Out of scope for this change: version history UI (restoring/viewing past versions), sharing UI, free-text search UI, cross-tab/cross-device conflict resolution, and any Playwright/e2e coverage - this change is verified with Vitest unit tests and React Testing Library component tests only.

## Capabilities

### New Capabilities

- `web-notes-editor`: A TipTap-based rich-text editor for a single note, with a first-node-synced title input, idle-debounced autosave (plus flush-on-unmount/`beforeunload`) against `PATCH /notes/:id`, in-editor tag assignment via `GET /tags`, a delete action gated by confirmation, a save-status indicator, loading/not-found/error states for `GET /notes/:id`, and isolation from background query refetches.

### Modified Capabilities

- `web-notes-list`: Each note card becomes a navigable link to its editor route, and a "New note" action is added that creates a note and navigates into it.

## Impact

- **Frontend routing**: new `/notes/:id` route under the existing `RequireAuth` guard in `apps/web/src/routes/router.ts`.
- **Frontend code**: new files under `apps/web/src/features/notes/{api,hooks,components}` (editor page, autosave hook, note-fetch/create/update/delete API functions, tag-selector and delete-confirmation components); `NoteCard.tsx` changes to become a link; `NotesListPage.tsx` gains a "New note" action.
- **New UI primitive**: `apps/web/src/components/ui/alert-dialog.tsx` (shadcn), built on the `radix-ui` package already present in `apps/web/package.json` - no new npm dependency for it.
- **Newly consumed endpoints**: `GET /tags` (already used by the notes list's tag filter) and `DELETE /notes/:id` are now also called from the editor; both already exist and are unchanged.
- **Dependencies**: adds `@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/pm` to `apps/web/package.json` pinned at the exact version `2.26.1`.
- **No backend changes**: `POST /notes`, `GET /notes/:id`, `PATCH /notes/:id`, `DELETE /notes/:id`, and `GET /tags` already exist and are unchanged; no schema, migration, or index changes.
- **No changes to `packages/shared`**: existing `noteDtoSchema`, `createNoteRequestSchema`, `updateNoteRequestSchema`, and `tagDtoSchema` already cover the request/response shapes this editor needs.
- **Rollback**: purely additive on the frontend (new route, new components, new dependency); reverting the commit(s) removes the route and the "New note"/link affordances with no data migration to undo.
