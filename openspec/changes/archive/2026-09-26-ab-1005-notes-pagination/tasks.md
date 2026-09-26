# Tasks

## 1. Schema and migration

- [x] 1.1 Add `Tag` and `NoteTag` models to `packages/db/prisma/schema.prisma` (per-user `Tag` with `name`, `color String @default("#64748B")` as unused AB-1006 forward-compat, and `@@unique([userId, name])` as the Prisma-representable approximation; `NoteTag` join table with `@@id([noteId, tagId])` and `@@index([tagId])`), plus the `tags NoteTag[]` back-relation on `Note`; verify `pnpm --filter @note-taking-app/db exec prisma validate` passes
- [x] 1.2 Run `prisma migrate dev` to generate the migration, then hand-edit its SQL to replace the plain unique index with `CREATE UNIQUE INDEX "Tag_userId_lower_name_key" ON "Tag" (userId, lower(name))`, add the same do-not-accept-drift-fixup comment used on `Note`'s partial index, and verify `prisma migrate status` reports no pending migrations
- [x] 1.3 Verify the case-insensitive constraint with a throwaway `psql`/Prisma script that inserts `work` then `Work` for the same `userId` and confirms the second insert is rejected, and separately confirms a row can be inserted with no `color` supplied and reads back `"#64748B"`; then discard the test rows

## 2. Shared contracts

- [x] 2.1 Write unit tests in `packages/shared/src/notes/note-contracts.test.ts` for a new `listNotesQuerySchema`: defaults (`page=1`, `pageSize=20`, `sortBy=updatedAt`, `sortDir=desc`, no tag filter), valid overrides, `pageSize` above `100` rejected, invalid `sortBy`/`sortDir` rejected, non-integer `page`/`pageSize` rejected, `tags=work,personal` parsed into `["work", "personal"]`, `tags` entries with surrounding whitespace and blank entries normalized (e.g. `" work ,,personal"` -> `["work", "personal"]`), and more than 10 non-blank tag names rejected with a validation error
- [x] 2.2 Implement `listNotesQuerySchema` (and its inferred `ListNotesQuery` type) in `packages/shared/src/notes/note-contracts.ts` using `z.coerce.number()` with `.default(...)` for `page`/`pageSize`, `z.enum` with `.default(...)` for `sortBy`/`sortDir`, and a `.transform` for `tags` that splits on `,`, trims each token, drops empty tokens, and a `.superRefine` that rejects more than 10 resulting tokens; verify the tests from 2.1 pass
- [x] 2.3 Add a `PaginatedNotesDto` (or equivalent) type for `{ data: NoteDto[], meta: { page: number, pageSize: number, total: number, totalPages: number, hasNextPage: boolean, hasPreviousPage: boolean } }` to `note-contracts.ts` and verify it's exported from the package's public entry point alongside the existing `NoteDto`/request schemas

## 3. Repository layer

- [x] 3.1 Add a test-only helper (e.g. in `notes-repository.test.ts`'s setup) that inserts `Tag` and `NoteTag` rows directly via Prisma for a given user/note, since no API path creates them yet
- [x] 3.2 Write `notes-repository.test.ts` cases for the updated list method: default pagination window, a later page, a page past the end (empty `data`, correct `total`), `sortBy`/`sortDir` combinations, deterministic ordering (via the `id` tie-breaker) when several notes share the same `sortBy` value across repeated requests, tag filter as OR across multiple tags, case-insensitive tag matching, a tag filter matching zero notes, and that a soft-deleted note is excluded from both the returned page and `total`
- [x] 3.3 Replace `NotesRepository.listOwned` with a method accepting `{ page, pageSize, sortBy, sortDir, tags }` that filters tags via `name: { in: tags, mode: "insensitive" }`, builds `orderBy: [{ [sortBy]: sortDir }, { id: sortDir }]`, includes `deletedAt: null` explicitly in the `where` passed to both queries, and runs `prisma.note.count({ where })` and `prisma.note.findMany({ where, orderBy, skip, take, select: NOTE_SELECT })` together inside `prisma.$transaction([...])` for a consistent total; verify the tests from 3.2 pass

## 4. Service layer

- [x] 4.1 Write `notes-service.test.ts` cases confirming `NotesService.listNotes` passes the resolved query through to the repository unchanged, and computes `meta.totalPages`/`hasNextPage`/`hasPreviousPage` correctly from `{ notes, total }` for a first page, a last page, and an out-of-range page (including the `total === 0` -> `totalPages === 0` case)
- [x] 4.2 Update `NotesService.listNotes` to accept the resolved `ListNotesQuery`, call the new repository method, and return `{ notes, total, totalPages, hasNextPage, hasPreviousPage }` (or equivalent) using the formulas from design.md; verify the tests from 4.1 pass

## 5. Controller and router

- [x] 5.1 Write `notes-router.test.ts` cases asserting `GET /notes` responds `422` for an invalid query (e.g. `pageSize=101`, `sortBy=title`, more than 10 `tags`) before any repository call, and `401` when unauthenticated
- [x] 5.2 Wire `validate(listNotesQuerySchema, "query")` into `notes-router.ts` ahead of `controller.list`, matching the existing `body` validation pattern on `create`/`update`; verify the tests from 5.1 pass
- [x] 5.3 Update `NotesController.list` to read the validated query, call the updated service, and respond `200 OK` with `{ data: notes.map(toDto), meta: { page, pageSize, total, totalPages, hasNextPage, hasPreviousPage } }`

## 6. End-to-end coverage and spec verification

- [x] 6.1 Write/extend Supertest coverage in `notes-router.test.ts` (or a dedicated list-notes test file) for every scenario in `openspec/changes/ab-1005-notes-pagination/specs/notes/spec.md`: caller-only + non-deleted filtering under the new envelope, default pagination, a later page, a page past the end, sort by `createdAt` ascending, stable ordering on tied sort values, single-tag filter, multi-tag OR filter, case-insensitive tag match, tag name trimming/blank-dropping, tag filter matching nothing, `422` on invalid `pageSize`/`sortBy`, `422` on more than 10 tags, and `401` unauthenticated
- [x] 6.2 Run `pnpm --filter api test --coverage` and `pnpm --filter api typecheck` and verify both pass with the coverage threshold met on the new/changed code
- [x] 6.3 Run `pnpm build` and `pnpm lint --max-warnings 0` from the repo root and verify both pass with 0 errors/warnings
- [x] 6.4 Run `openspec validate ab-1005-notes-pagination --strict` and verify it passes cleanly
