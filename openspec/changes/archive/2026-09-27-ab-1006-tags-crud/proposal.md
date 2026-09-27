# Proposal

## Why

AB-1006. `notes-tags` already defines per-user tag identity and the note-tag association, and `GET /notes` already filters by tag name — but nothing lets a user create, list, rename, recolor, or delete a tag. The `Tag.color` column exists specifically for this ticket and is unused until now. Without CRUD endpoints, tags can only be seeded directly in the database, so this change closes the gap needed to make tagging usable end-to-end (still API-only; no UI in this change).

## What Changes

- Add `POST /tags`: create a tag owned by the caller, given `name` (required, trimmed, non-empty, max 100 chars, unique per user case-insensitively) and `color` (required, `#RRGGBB` hex, normalized to uppercase on storage).
- Add `GET /tags`: list the caller's tags as a plain JSON array (no pagination), each entry including `noteCount` — computed in a single query (Prisma's filtered `_count`, no per-tag follow-up query) counting the caller's non-deleted notes carrying that tag.
- Add `PATCH /tags/:id`: update `name`, `color`, or both on one of the caller's own tags; an empty body (`{}`) is rejected with `422`.
- Add `DELETE /tags/:id`: delete one of the caller's own tags, **blocked** (`409`) while any non-deleted note still carries it. No active note is ever untagged by a delete; a tag that is only carried by soft-deleted notes is deletable, and the FK-level cascade (see Impact) removes those now-orphaned associations as part of deleting the tag row.
- Duplicate name on create/rename responds `409` (mirrors the existing `EMAIL_TAKEN` pre-check + DB-constraint-catch pattern in `auth-service.ts`).
- All four endpoints require authentication and scope every operation to the caller's own tags; a tag belonging to another user is treated as not found (`404`), consistent with how notes already handle cross-user access.
- `POST /notes` and `PATCH /notes/:id` accept an optional `tagIds: string[]` to attach the caller's own tags to a note (create: initial tags; update: full replacement of the note's tag set, omitted = unchanged); any `tagId` not owned by the caller is rejected with `422`. `NoteDto` gains a `tags` field so clients can see a note's current tags without a separate lookup. Both additions are backward-compatible (optional request field, additive response field).

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `notes-tags`: adds requirements for the four CRUD endpoints (create, list-with-note-count, update, delete-blocked-when-in-use) that the current spec explicitly excludes, and updates the "Note-tag association" requirement to reflect that association is now set via `tagIds` on the note endpoints (no longer "this change does not add any endpoint...").
- `notes`: "Create a note" and "Update a note" gain the optional `tagIds` input and note response now includes `tags`.

## Impact

- **API**: new router `apps/api/src/tags/tags-router.ts` (+ controller/service/repository), mounted alongside the existing `notes` router. Existing `apps/api/src/notes/*` gains `tagIds` handling (ownership validation, create/replace of `NoteTag` rows) and `tags` in the note response.
- **Shared contracts**: new `packages/shared/src/tags/tag-contracts.ts` (Zod request/response schemas, `TagDto` with `noteCount`). Existing `packages/shared/src/notes/note-contracts.ts` gains `tagIds` on the create/update request schemas and `tags` on `noteDtoSchema`.
- **Database**: a real schema change is needed. `NoteTag`'s FK to `Tag` (`NoteTag_tagId_fkey`) is currently `ON DELETE RESTRICT` (see migration `20260926165154_add_tag`), not cascade — deleting a tag that still has any `NoteTag` row, even one pointing only to a soft-deleted note, would hit a Postgres FK violation. This change adds `onDelete: Cascade` to `schema.prisma`'s `NoteTag.tag` relation and a new migration altering that constraint, so deleting a tag automatically removes its (already-orphaned, since delete is blocked otherwise) `NoteTag` rows at the DB level. `Tag.color`, the case-insensitive unique `(userId, name)` index, and the `NoteTag` join table itself are otherwise unchanged. `noteCount` is computed via a query against the existing join filtered on `Note.deletedAt IS NULL`; no new column.
- **Rollback**: mostly additive (new routes/files) but includes one migration (the FK constraint change) — revert by removing the router mount and new files, and applying a follow-up migration restoring `ON DELETE RESTRICT` if the schema change needs to be undone after deploy. No data loss either direction (the constraint change affects only future deletes, not existing rows).
