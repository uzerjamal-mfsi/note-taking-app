# Tasks

## 1. Schema migration

- [x] 1.1 Update `packages/db/prisma/schema.prisma`'s `NoteTag.tag` relation to `tag Tag @relation(fields: [tagId], references: [id], onDelete: Cascade)` and run `prisma migrate dev --name notetag_tag_cascade` — verify the generated SQL alters `NoteTag_tagId_fkey` from `ON DELETE RESTRICT` to `ON DELETE CASCADE` and `prisma migrate dev`/`prisma migrate status` report no drift
- [x] 1.2 Write a repository-level test that creates a tag, associates it only with a soft-deleted note, deletes the tag, and asserts no FK-violation error is thrown and the `NoteTag` row is gone — verify it fails against the pre-migration constraint and passes after 1.1

## 2. Shared contracts - tags

- [x] 2.1 Write `packages/shared/src/tags/tag-contracts.test.ts` covering: valid create/update payloads, `name` `.trim().min(1).max(100)` rejection cases, `color` `#RRGGBB` regex acceptance/rejection and `.transform` to uppercase, and `updateTagRequestSchema`'s refine rejecting an empty `{}` body — verify the tests fail (schemas don't exist yet)
- [x] 2.2 Implement `packages/shared/src/tags/tag-contracts.ts`: `createTagRequestSchema`, `updateTagRequestSchema`, `tagDtoSchema` (incl. `noteCount`), and their inferred types, exported from the package entry point — verify 2.1's tests pass

## 3. Shared contracts - notes tag association

- [x] 3.1 Write/extend `packages/shared/src/notes/note-contracts.test.ts` covering: `tagIds` as an optional array of UUID strings on both create and update request schemas, and `noteDtoSchema`'s new `tags: { id, name, color }[]` field — verify the new tests fail
- [x] 3.2 Update `packages/shared/src/notes/note-contracts.ts`: add `tagIds` to `createNoteRequestSchema`/`updateNoteRequestSchema` and `tags` to `noteDtoSchema` — verify 3.1's tests pass

## 4. Tags repository layer

- [x] 4.1 Write `apps/api/src/tags/tags-repository.test.ts` covering: `create`, `findOwnedById`, `listByUser` returning correct `noteCount` per tag with soft-deleted notes excluded (single-query assertion per design.md), `update`, `countActiveNotesForTag` (used by the delete guard), and `deleteOwned` — verify the tests fail (repository doesn't exist yet)
- [x] 4.2 Implement `apps/api/src/tags/tags-repository.ts` (Prisma access only: `TAG_SELECT`, `TagRecord` type, `listByUser` using the filtered relation `_count` per design.md, `countActiveNotesForTag`, `create`/`update`/`deleteOwned` scoped to `{ id, userId }`) — verify 4.1's tests pass

## 5. Tags service layer

- [x] 5.1 Write `apps/api/src/tags/tags-service.test.ts` covering: create with duplicate-name pre-check throwing `AppError("TAG_NAME_TAKEN", 409, ...)`, create surfacing the DB unique-constraint fallback as the same error, list mapping to DTOs with `noteCount`, update duplicate-name and not-found (`404`) cases, and delete throwing `AppError("TAG_IN_USE", 409, ...)` when `countActiveNotesForTag` is non-zero vs. succeeding when zero — verify the tests fail (service doesn't exist yet)
- [x] 5.2 Implement `apps/api/src/tags/tags-service.ts` wrapping delete's count-check-then-delete in `prisma.$transaction` per design.md — verify 5.1's tests pass

## 6. Tags HTTP layer

- [x] 6.1 Write `apps/api/src/tags/tags-router.test.ts` (supertest) covering every scenario in `openspec/changes/ab-1006-tags-crud/specs/notes-tags/spec.md`: create success/`422`/`409`/`401`, list success with counts/`401`, update success/empty-body-`422`/other-`422`/`409`/`404`/`401`, delete success/`409`-in-use/`204`-for-only-soft-deleted-notes-being-deletable/`404`-cross-user/`401` — verify the tests fail (router doesn't exist yet)
- [x] 6.2 Implement `apps/api/src/tags/tags-controller.ts` and `apps/api/src/tags/tags-router.ts` (`requireAuth` + `validate()` + `asyncHandler`, status codes `201`/`200`/`204` per spec) and mount `createTagsRouter` in the app shell alongside the notes router — verify 6.1's tests pass

## 7. Notes feature - tag association

- [x] 7.1 Write/extend `apps/api/src/notes/notes-repository.test.ts` covering: note creation with an initial set of `NoteTag` rows, an update that fully replaces a note's `NoteTag` rows (delete-then-create), an update with `tagIds` omitted leaving existing rows untouched, and `select`/`include` returning each tag's `id`/`name`/`color` for the DTO mapping — verify the new tests fail
- [x] 7.2 Extend `apps/api/src/notes/notes-repository.ts` with the tag-association behavior above, using `prisma.$transaction` for both create-with-tags and replace-tags-on-update per design.md — verify 7.1's tests pass
- [x] 7.3 Write/extend `apps/api/src/notes/notes-service.test.ts` covering: `tagIds` ownership validation (`prisma.tag.findMany({ where: { id: { in }, userId } })` count mismatch) throwing `AppError("TAG_NOT_FOUND", 422, ...)` on both create and update, and that update rejects before touching content or tags when validation fails — verify the new tests fail
- [x] 7.4 Extend `apps/api/src/notes/notes-service.ts` with the ownership check and wiring into create/update — verify 7.3's tests pass
- [x] 7.5 Write/extend `apps/api/src/notes/notes-router.test.ts` (supertest) covering every new scenario in `openspec/changes/ab-1006-tags-crud/specs/notes/spec.md`: create with tags success, create with an unowned `tagId` (`422`), update replacing tags success, update omitting `tagIds` leaves tags unchanged, update with an unowned `tagId` (`422`) — verify the new tests fail
- [x] 7.6 Extend `apps/api/src/notes/notes-controller.ts`'s `toDto()` to include `tags` in the response — verify 7.5's tests pass

## 8. Verification

- [x] 8.1 Run `pnpm --filter api test --coverage` and `pnpm --filter shared test --coverage` and confirm ≥80% coverage on all new/changed files
- [x] 8.2 Run `pnpm build`, `pnpm lint --max-warnings 0`, and `pnpm run typecheck` and confirm all pass with 0 errors/warnings
- [x] 8.3 Run `openspec validate --strict` for change `ab-1006-tags-crud` and confirm it passes cleanly
