# Tasks

## 1. Schema & migration

- [x] 1.1 Add `NoteVersion` model to `packages/db/prisma/schema.prisma` (`id`, `noteId` FK `onDelete: Cascade` to `Note`, `content` Json, `title` String, `createdAt`, `@@index([noteId, createdAt])`) and verify `pnpm --filter db exec prisma validate` passes
- [x] 1.2 Run `pnpm run db:migrate` to generate the migration under `packages/db/prisma/migrations/` and verify the generated SQL creates the table, FK cascade, and index as designed

## 2. Shared contracts (packages/shared)

- [x] 2.1 Write `packages/shared/src/notes-history/notes-history-contracts.test.ts` covering `versionIdParamSchema`, `noteVersionSummaryResponseSchema` (no `content` field), and `noteVersionResponseSchema` (includes `content`) (valid/invalid cases), then implement `notes-history-contracts.ts` and verify `pnpm --filter shared test` passes
- [x] 2.2 Export the new module from `packages/shared/src/index.ts` and verify `pnpm --filter shared build` (or typecheck) succeeds with no duplicate-export or type errors

## 3. Repository & service - snapshot, purge, list, view

- [x] 3.1 Write `apps/api/src/notes-history/notes-history-repository.test.ts` for `snapshot(tx, noteId, content, title)` (creates a `NoteVersion` row) and `purgeOlderThan30Days(tx, noteId)` (deletes only that note's versions past the cutoff, leaves other notes' versions untouched), then implement `notes-history-repository.ts` and verify the tests pass
- [x] 3.2 Write `apps/api/src/notes-history/notes-history-repository.test.ts` cases for `listForNote(noteId)` (returns summary fields only, ordered by `createdAt` desc, `id` desc) and `getOneForNote(noteId, versionId)` (uses a compound `where: { id: versionId, noteId }` query; returns `null` when `versionId` doesn't exist or belongs to a different note - assert via a test where a version exists but for a different `noteId`), then implement and verify tests pass
- [x] 3.3 Wire `notesService.updateNote`'s existing `$transaction` (`notes-service.ts`) to: compare incoming `content` against the note's current `content`, and when they differ, call `snapshot` with the pre-update content/title followed by `purgeOlderThan30Days`, both before the content update is applied; write/extend `notes-service.test.ts` to verify a content-changing update creates exactly one new version and purges versions older than 30 days for that note only, and that a no-op update (identical `content`) creates no version and triggers no purge
- [x] 3.4 Write `apps/api/src/notes-history/notes-history-service.test.ts` for `listVersions(noteId, userId)` and `getVersion(noteId, versionId, userId)`, asserting `404`-equivalent (`null`/thrown `AppError`) for not-owned, soft-deleted, or nonexistent notes and for a `versionId` from a different note, then implement `notes-history-service.ts` and verify tests pass

## 4. Restore endpoint

- [x] 4.1 Write `notes-history-service.test.ts` cases for `restoreVersion(noteId, versionId, userId)` - looking up the version via the compound `{ id: versionId, noteId }` query and 404-equivalent when it doesn't match - then calling through to `notesService.updateNote` with the target version's content and returning the resulting `Note` DTO unchanged, then implement `restoreVersion` and verify tests pass
- [x] 4.2 Write a test asserting restore itself creates a new version capturing the note's pre-restore content (via the reused `updateNote` snapshot step) and verify it passes - covered at the router/integration level in 5.1 (an end-to-end restore-then-assert-a-new-version-exists check), since `restoreVersion`'s unit tests mock `notesService.updateNote` and can't observe its internal snapshot side effect

## 5. Router & HTTP wiring

- [x] 5.1 Write `apps/api/src/notes-history/notes-history-router.test.ts` (supertest) for `GET /notes/:id/versions`, `GET /notes/:id/versions/:versionId`, and `POST /notes/:id/versions/:versionId/restore` covering: success (asserting the list response's items have no `content` field and the view response's does; asserting restore returns `200 OK` with the same `Note` DTO shape as `PATCH /notes/:id`), unauthenticated (`401`), not-owned/deleted note (`404`), and unknown/mismatched `versionId` (`404`, including a `versionId` that exists but belongs to a different note); then implement `notes-history-router.ts` (auth + `validate()` middleware, per the `notes`/`sharing` router pattern) and verify tests pass
- [x] 5.2 Mount the new router in the API app alongside the existing `notes` and `sharing` routers and verify `pnpm --filter api test` passes end-to-end for the new routes

## 6. Verification

- [x] 6.1 Run `pnpm build`, `pnpm lint --max-warnings 0`, `pnpm run typecheck`, and `pnpm test --coverage`, and verify all pass with ≥80% coverage on the new `notes-history` code (API + shared)
- [x] 6.2 Run `openspec validate --strict` for `add-note-version-history` and verify it passes cleanly
