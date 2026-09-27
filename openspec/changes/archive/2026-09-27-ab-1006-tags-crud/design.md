# Design

## Context

See proposal.md - Why. The `Tag` and `NoteTag` models, including the hand-edited case-insensitive unique index on `(userId, name)`, already exist (`packages/db/prisma/schema.prisma`). The `notes` feature already establishes the layering and conventions this change mirrors: `apps/api/src/notes/{notes-router,notes-controller,notes-service,notes-repository}.ts`, contracts in `packages/shared/src/notes/note-contracts.ts`, the `validate()` middleware, `AppError` + central error handler, and the `EMAIL_TAKEN`-style pre-check + DB-constraint-catch duplicate pattern in `apps/api/src/auth/auth-service.ts`.

One schema change is needed (corrected from an earlier draft of this design): `NoteTag`'s FK to `Tag` is `ON DELETE RESTRICT` today (migration `20260926165154_add_tag/migration.sql:36`), not cascade. See Decisions - FK cascade.

## Goals / Non-Goals

**Goals:**
- Full CRUD for tags, scoped per-user, following the existing routes -> controller -> service -> repository layering.
- `GET /tags` note counts that stay consistent with how `GET /notes` already treats soft-deleted notes as invisible.
- Reuse the existing duplicate-name and not-found/cross-user conventions rather than inventing new ones.
- Let a note's tags actually be set: `POST /notes` and `PATCH /notes/:id` accept `tagIds`, and `NoteDto` returns `tags`.

**Non-Goals:**
- No UI (per ticket).
- No cascade-untagging of *active* notes on tag delete — deletion is blocked while any non-deleted note carries the tag, per the spec delta. (The DB-level cascade below only ever fires for `NoteTag` rows that already point solely to soft-deleted notes, which is precisely the case the delete guard allows through.)
- No change to `GET /notes`'s existing tag-filter behavior.
- No pagination on `GET /tags` (tag counts per user are expected to be small; a plain array keeps the response simple and avoids a needless envelope).
- No bulk/partial tag-association endpoint (e.g. "add one tag to a note") - association is only via full `tagIds` replacement on the note's own create/update.

## Decisions

**Layering**: `apps/api/src/tags/{tags-router,tags-controller,tags-service,tags-repository}.ts`, mounted in the app shell next to the notes router. Mirrors the notes feature exactly - no new pattern introduced.

**Contracts**: `packages/shared/src/tags/tag-contracts.ts` defines:
- `createTagRequestSchema`: `name: z.string().trim().min(1).max(100)`, `color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).transform(s => s.toUpperCase())` (both required).
- `updateTagRequestSchema`: same two fields, both optional, with `.refine(data => data.name !== undefined || data.color !== undefined, { message: "At least one of name or color is required" })` so an empty `{}` body fails validation - `validate()` turns the failed refine into `422` the same way it does any other `safeParse` failure.
- `tagDtoSchema`: `id`, `name`, `color`, `createdAt`, `noteCount`.

Written first, per the project's design rule, before the API layer consumes them via `validate()`.

**Note-count query (single round trip, no N+1)**: computed in the repository via Prisma's relation-count filtering, supported in the pinned `@prisma/client@5.22.0`:
```
prisma.tag.findMany({
  where: { userId },
  include: { _count: { select: { notes: { where: { note: { deletedAt: null } } } } } },
})
```
`_count.notes` maps to `noteCount` in the DTO. This is the *only* query `GET /tags` issues - one `findMany` returns every tag with its count already attached, no per-tag follow-up query - counting `NoteTag` rows joined to non-deleted notes without a raw query, consistent with how the `notes` tag-filter already reaches through `NoteTag` to `Note.deletedAt`.

**Duplicate-name handling**: on create and rename, pre-check with a case-insensitive `findFirst` (Prisma can't push case-insensitive lookups through the declared `@@unique`, since the real constraint is a hand-edited functional index - see schema.prisma), then also catch the DB unique-constraint violation on the write itself (same defense-in-depth shape as `registerUser` in `auth-service.ts`), throwing `AppError("TAG_NAME_TAKEN", 409, ...)` either way.

**Delete-blocked-when-in-use**: `TagsRepository.findOwnedByIdWithActiveCount(id, userId)` fetches ownership and the active-note count in a single `tag.findFirst` (using the same filtered `_count` pattern as the note-count query above, on the `notes` relation's own `where`), avoiding a separate `countActiveNotesForTag` round trip on this path (that method is kept on the repository as a general-purpose lookup - see the `updateTag` note-count read below - and is still covered directly by its own repository test). The service runs this check plus the actual `deleteOwned` delete inside one `prisma.$transaction` using `Prisma.TransactionIsolationLevel.Serializable` (stronger than the read-committed default, closing the race window called out below under Risks) via a `TagsRepository` instance constructed on the transaction client `tx`. A non-zero active count throws `AppError("TAG_IN_USE", 409, ...)` before any delete is attempted. A tag carried only by soft-deleted notes is deletable - its now-orphaned `NoteTag` rows are removed automatically by the FK cascade (see FK cascade below) when the tag row is deleted; the application does not delete `NoteTag` rows itself.

**FK cascade on tag delete (schema change)**: `schema.prisma`'s `NoteTag.tag` relation currently has no `onDelete` clause, and the real constraint generated for it (`NoteTag_tagId_fkey`, migration `20260926165154_add_tag/migration.sql:36`) is `ON DELETE RESTRICT`. As-is, deleting a `Tag` row that still has *any* `NoteTag` row - including one pointing only to an already soft-deleted note - would fail with a Postgres foreign-key-violation error, which contradicts the spec's "a tag carried only by soft-deleted notes may be deleted" scenario. Fix: declare `tag Tag @relation(fields: [tagId], references: [id], onDelete: Cascade)` in `schema.prisma` and generate a migration (`prisma migrate dev --name notetag_tag_cascade`) that runs `ALTER TABLE "NoteTag" DROP CONSTRAINT "NoteTag_tagId_fkey", ADD CONSTRAINT "NoteTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;`. Unlike the two existing hand-edited approximations in this schema (the partial index and the case-insensitive unique index), this one has no drift: the Prisma-declared attribute now matches the real constraint exactly, so `prisma migrate dev`/`deploy` need no special handling. `NoteTag.noteId`'s FK stays `ON DELETE RESTRICT` - unrelated to this change, since notes are only ever soft-deleted, never hard-deleted.

**Note-tag association on notes**: `createNoteRequestSchema`/`updateNoteRequestSchema` (`packages/shared/src/notes/note-contracts.ts`) gain `tagIds: z.array(z.string().uuid()).optional()`. In the service:
- **Create**: when `tagIds` is present and non-empty, verify ownership with `prisma.tag.findMany({ where: { id: { in: tagIds }, userId } })` and compare the returned count to the number of *unique* requested ids (a duplicate id in `tagIds` must not inflate the expected count); a mismatch throws `AppError("TAG_NOT_FOUND", 422, ...)` before the note is created. Note creation and `NoteTag` row creation happen in one `prisma.$transaction`. `tagIds` is capped at `MAX_NOTE_TAGS = 50` in the Zod schema.
- **Update**: same ownership check when `tagIds` is present and non-empty; on success, replace the note's associations with `prisma.$transaction([prisma.noteTag.deleteMany({ where: { noteId } }), prisma.noteTag.createMany({ data: tagIds.map(tagId => ({ noteId, tagId })) })])`. Omitting `tagIds` entirely skips both the ownership check and both calls, leaving existing associations untouched (distinguished from an explicit empty array `[]`, which skips the ownership check - nothing to check - but still clears all tags).
- **Race guard**: the ownership pre-check narrows the window but doesn't close it - a tag could still be deleted between the check and the write. The repository's `create`/`updateOwned` calls are wrapped in a try/catch that maps a `P2003` foreign-key-violation error (via the shared `isForeignKeyConstraintError` helper in `apps/api/src/errors/prisma-errors.ts`, alongside a same-shaped `isUniqueConstraintError` that `auth-service.ts` and `tags-service.ts` also use) to the same `AppError("TAG_NOT_FOUND", 422, ...)`, so the race resolves to the same client-visible error as the ordinary pre-check failure.
- `NoteDto` (`note-contracts.ts`) gains `tags: { id: string; name: string; color: string }[]` (declared as `tagDtoSchema.pick({ id: true, name: true, color: true })` to avoid a second hand-written shape), populated by the repository via `include: { tags: { include: { tag: { select: { id: true, name: true, color: true } } } } }` and flattened in the service/controller mapping (mirrors the existing `toDto()` pattern in `notes-controller.ts`).

**Not-found vs cross-user**: `PATCH`/`DELETE` scope every lookup to `{ id, userId }`, identical to how notes treat "belongs to another user" and "does not exist" as the same `404`, so ownership can't be probed.

**HTTP status codes** (for implementers, restating what the spec already fixes): `POST /tags` -> `201 Created`; `GET /tags` -> `200 OK`; `PATCH /tags/:id` -> `200 OK`; `DELETE /tags/:id` -> `204 No Content`. `POST /notes`/`PATCH /notes/:id` status codes are unchanged (`201`/`200`).

## Risks / Trade-offs

- **[Risk, closed]** The count-then-delete for `DELETE /tags/:id` could have been non-atomic under the default (read committed) transaction isolation: a note could be tagged concurrently between the count check and the delete. -> **Mitigation shipped**: both the check and the delete run inside one `prisma.$transaction` using `Prisma.TransactionIsolationLevel.Serializable`, so a concurrent write that would invalidate the check causes Postgres to abort the transaction (surfacing as a retryable serialization failure) rather than silently letting the delete proceed against stale data.
- **[Risk]** Prisma's filtered relation `_count` requires filtering through the immediate relation's own relation field (`note.deletedAt`); if this turns out unsupported in practice for this schema shape, fall back to a manual `groupBy`/raw aggregate. -> **Mitigation**: verified against `@prisma/client@5.22.0` release notes (filtered relation counts, including one hop through a relation's own `where`, have been GA since Prisma 5.0); confirm with a repository-level test before relying on it further.
- **[Risk]** The FK constraint change (`RESTRICT` -> `CASCADE`) is a behavior change at the database level, not just app code: any other, currently-nonexistent code path that deletes a `Tag` row outside this feature's guarded `DELETE /tags/:id` would silently cascade-delete `NoteTag` rows instead of failing. -> **Mitigation**: the only way to delete a `Tag` row today or after this change is the new repository method added in this change; no other deletion path exists to audit.
- **[Risk]** `Serializable` isolation means a genuine concurrent conflict on `DELETE /tags/:id` (e.g. a note is tagged with it in another request at the same instant) surfaces as a Postgres serialization-failure error, not an `AppError`. Today that falls through to the central error handler's generic `500 INTERNAL_SERVER_ERROR` rather than a retryable-specific response. -> **Mitigation**: acceptable for now given how narrow the window is and that a client can simply retry `DELETE /tags/:id`; no automatic retry is implemented.
- **[Risk]** `PATCH /notes/:id`'s replace-all-tags semantics mean a client that fetches a note, forgets to include its existing `tagIds`, and calls update with only `content` would previously have been fine but must now omit `tagIds` (not send `[]`) to preserve tags - a client sending `tagIds: []` "by habit" would silently untag the note. -> **Mitigation**: documented explicitly in the spec ("omitted `tagIds` SHALL leave existing tag associations unchanged") as distinct from an empty array; no server-side way to prevent a client from choosing the wrong one.

## Migration Plan

One migration in this change: the `NoteTag_tagId_fkey` constraint change (`ON DELETE RESTRICT` -> `ON DELETE CASCADE`), generated via `prisma migrate dev --name notetag_tag_cascade`. It only affects what happens when a `Tag` row is deleted (which only this change's new `DELETE /tags/:id` endpoint does) - no existing data is altered, and no application code path needs to change behavior because of it. Deploy by running the migration before the new routes are live; rollback by running a follow-up migration restoring `ON DELETE RESTRICT` (safe as long as no tag with only-soft-deleted-note associations was deleted in between - see proposal.md - Impact) and removing the route mount and new files.
