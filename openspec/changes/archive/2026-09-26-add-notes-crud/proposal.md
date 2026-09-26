# Proposal

AB-1004

## Why

Users can register and authenticate (AB-1003/AB-1002) but there is no way to create or manage notes yet — the core purpose of the app. This change adds the note data model and a REST API for full CRUD with soft delete, so a client (no UI yet) can create, read, update, and delete a user's own notes.

## What Changes

- Add a `Note` Prisma model owned by `User`, with a Postgres migration and a partial composite index on `(userId)` scoped to non-deleted rows, matching the `userId` + `deletedAt IS NULL` filter every notes query uses.
- Add `POST /notes`, `GET /notes`, `GET /notes/:id`, `PATCH /notes/:id`, `DELETE /notes/:id`, all scoped to the authenticated caller and requiring `requireAuth`.
- Store `content` as a TipTap/ProseMirror JSON document (`Json` column). `title` is not client-supplied — it is derived server-side from the first node's plain text (truncated to 120 chars, `"Untitled"` if empty) and re-derived whenever `content` changes.
- Soft delete only: `DELETE /notes/:id` sets `deletedAt`; there is no restore endpoint and no trash listing in this change.
- A note that is another user's, or already soft-deleted, responds `404 Not Found` on `GET`/`PATCH`/`DELETE` (no existence leak, consistent with the existing `user-auth` pattern).
- Add `NoteDto`, `CreateNoteRequest`, `UpdateNoteRequest` Zod schemas to `packages/shared`.

**Explicitly out of scope** (deferred to later tickets): pagination, sorting, tag filtering, restore/trash, full-text search, sharing, version history. `GET /notes` returns all of the caller's non-deleted notes, unsorted/unpaginated.

## Capabilities

### New Capabilities
- `notes`: Note data model and REST API for create/read/list/update/soft-delete, scoped to the authenticated owner.

### Modified Capabilities
(none — no existing capability's requirements change)

## Impact

- **Schema/migration**: new `Note` table (`id`, `userId` FK, `title`, `content` Json, `deletedAt` nullable, `createdAt`, `updatedAt`), new migration via `prisma migrate dev`; the Prisma schema declares `@@index([userId, deletedAt])`, and the migration SQL is hand-edited (before it is applied) into a partial index (`... WHERE "deletedAt" IS NULL`) to keep the index small and match the actual query shape.
- **API**: new `apps/api/src/notes/*` (routes, controller, service, repository), wired into `app.ts` behind `requireAuth`.
- **Shared contracts**: new `packages/shared/src/notes/note-contracts.ts` exporting Zod schemas/types, re-exported from `packages/shared/src/index.ts`.
- **No breaking changes** to existing auth endpoints or contracts.
- **Rollback plan**: revert the API/shared code changes and roll back the Prisma migration (`prisma migrate resolve`/down migration or restore from the pre-migration schema) since the `Note` table is additive and not yet referenced by any other capability; no data migration of existing tables is involved.
