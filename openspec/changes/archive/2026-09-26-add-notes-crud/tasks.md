# Tasks

## 1. Schema & migration

- [x] 1.1 Add `Note` model to `packages/db/prisma/schema.prisma` (`id`, `userId` FK to `User`, `title: String`, `content: Json`, `deletedAt: DateTime?`, `createdAt`, `updatedAt`) with `@@index([userId, deletedAt])`, and verify `prisma validate` passes
- [x] 1.2 Run `prisma migrate dev --create-only --name add_note` (via `packages/db`) to generate the migration without applying it, then hand-edit the generated `migration.sql` to replace the composite-index `CREATE INDEX` statement with a partial index (`CREATE INDEX "Note_userId_active_idx" ON "Note"("userId") WHERE "deletedAt" IS NULL;`), and verify the edited SQL file reads as intended before it is ever applied
- [x] 1.3 Run `pnpm run db:migrate` to apply the edited `add_note` migration, and verify it applies cleanly against a local database and `\d "Note"` (or equivalent) shows the partial index

## 2. Shared contracts

- [x] 2.1 Write unit tests in `packages/shared/src/notes/note-contracts.test.ts` for `createNoteRequestSchema`, `updateNoteRequestSchema`, and `noteDtoSchema` covering: valid non-empty `content` doc, empty/missing `content` rejected, `content` with no top-level nodes rejected, `content` nested exactly at `MAX_CONTENT_DEPTH` accepted, `content` nested one level beyond `MAX_CONTENT_DEPTH` rejected — verify tests fail (schemas don't exist yet)
- [x] 2.2 Add `packages/shared/src/notes/note-contracts.ts` exporting `MAX_CONTENT_DEPTH = 50`, `createNoteRequestSchema`, `updateNoteRequestSchema` (both requiring a non-empty `content` doc: `z.object({ type: z.literal("doc"), content: z.array(z.record(z.unknown())).min(1) })` plus a `superRefine` depth-walk rejecting nesting beyond `MAX_CONTENT_DEPTH`), and `noteDtoSchema` (`id`, `title`, `content`, `createdAt`, `updatedAt`), plus inferred types (`CreateNoteRequest`, `UpdateNoteRequest`, `NoteDto`); re-export from `packages/shared/src/index.ts`; verify the tests from 2.1 pass

## 3. Notes repository

- [x] 3.1 Write unit tests for `NotesRepository` (using a test Prisma client / test database per existing auth test conventions) covering: create persists a row owned by the given `userId`; `findOwned` returns a note only when `id` + `userId` match and `deletedAt` is null; `updateOwned` and `softDeleteOwned` return null/no-op when the note doesn't exist, isn't owned by the caller, or is already deleted — verify tests fail (repository doesn't exist yet)
- [x] 3.2 Add `apps/api/src/notes/notes-repository.ts` with `create`, `findOwned(id, userId)`, `listOwned(userId)`, `updateOwned(id, userId, data)`, `softDeleteOwned(id, userId)`, every query filtering by `{ userId, deletedAt: null }` and selecting only needed columns; verify the tests from 3.1 pass

## 4. Notes service

- [x] 4.1 Write unit tests for `deriveTitle(content)` covering: first node's plain text truncated to 120 chars; nested/nested-mark text concatenation; empty first node falls back to `"Untitled"`; whitespace-only text falls back to `"Untitled"` — verify tests fail (function doesn't exist yet)
- [x] 4.2 Add `deriveTitle` to `apps/api/src/notes/notes-service.ts` as a pure function per the design's extraction rule; verify the tests from 4.1 pass
- [x] 4.3 Write unit tests for `NotesService` (with a mocked `NotesRepository`) covering: `createNote` derives and stores `title` from `content`; `updateNote` re-derives `title` on every update; `getNote`/`updateNote`/`deleteNote` throw `AppError("NOTE_NOT_FOUND", 404, ...)` when the repository returns no match — verify tests fail (service doesn't exist yet)
- [x] 4.4 Add `NotesService` (`createNote`, `getNote`, `listNotes`, `updateNote`, `deleteNote`) to `apps/api/src/notes/notes-service.ts`, calling `NotesRepository` and throwing `AppError("NOTE_NOT_FOUND", 404, ...)` on any not-found/not-owned/deleted case; verify the tests from 4.3 pass

## 5. Notes controller & router

- [x] 5.1 Write Supertest integration tests in `apps/api/src/notes/notes-router.test.ts` covering every scenario in `specs/notes/spec.md`: successful create (201)/get (200)/list (200)/update (200)/delete (204, empty body); validation failure (missing/empty `content`, and `content` beyond `MAX_CONTENT_DEPTH`) on create and update (422, via the existing `validate()` middleware); 404 on get/update/delete for another user's note, a nonexistent id, and an already-deleted note; 401 on every route when unauthenticated; list returns only the caller's non-deleted notes — verify tests fail (routes don't exist yet)
- [x] 5.2 Add `apps/api/src/notes/notes-controller.ts` (maps `req.user.id`/`req.params.id`/`req.body` to service calls, maps results to `NoteDto`, sets status codes per design.md's table: 201 create, 200 get/list/update, 204 with an empty body for delete) and `apps/api/src/notes/notes-router.ts` (`POST /notes`, `GET /notes`, `GET /notes/:id`, `PATCH /notes/:id`, `DELETE /notes/:id`, each behind `requireAuth` and, for create/update, `validate(...)` against the schemas from Task 2)
- [x] 5.3 Wire `createNotesRouter` into `apps/api/src/app.ts` alongside the existing auth router; verify the tests from 5.1 pass

## 6. Quality gates

- [x] 6.1 Run `pnpm build`, `pnpm lint --max-warnings 0`, `pnpm run typecheck`, and `pnpm test --coverage`, and verify all pass with 0 errors/warnings and ≥80% coverage on the new `notes` code
- [x] 6.2 Run `openspec validate --strict` for `add-notes-crud` and verify it passes cleanly
