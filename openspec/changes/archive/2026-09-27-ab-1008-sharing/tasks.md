# Tasks

## 1. Schema

- [x] 1.1 Add `SharedNote` model to `packages/db/prisma/schema.prisma` (`id`, `noteId` unique FK to `Note` with `onDelete: Cascade`, `token` unique, `viewCount` default `0`, `expiresAt` nullable, `createdAt`) and run `prisma migrate dev` to generate the migration; verify the migration applies cleanly and `prisma migrate status` reports no drift

## 2. Config

- [x] 2.1 Add `SHARE_RATE_LIMIT_WINDOW_MS`/`SHARE_RATE_LIMIT_MAX` to `apps/api/src/config/env.ts` (same parsing pattern as `RATE_LIMIT_WINDOW_MS`/`RATE_LIMIT_MAX`, defaulted stricter than the global values) and to `.env.example`; verify a unit test for `env.ts` covers parsing/defaulting these two vars

## 3. Shared contracts (`packages/shared`)

- [x] 3.1 Add `packages/shared/src/sharing/sharing-contracts.ts` with `generateShareLinkRequestSchema` (optional `expiresAt`, validated as a timestamp strictly in the future), `shareLinkDtoSchema` (`token`, `viewCount`, `expiresAt`, `createdAt`), and `sharedNotePublicDtoSchema` (`title`, `content` only); verify unit tests cover: a past or malformed `expiresAt` is rejected, a future one is accepted, an absent one is accepted, and the public schema rejects/strips fields beyond `title`/`content`
- [x] 3.2 Export the new schemas/types from `packages/shared`'s package entry point; verify `pnpm --filter shared build`/typecheck passes

## 4. API: owner share-link endpoints

- [x] 4.1 Add `apps/api/src/sharing/sharing-repository.ts` with `findActiveByNoteId` (active = exists and not expired), `replaceExpiredAndCreate`/`create` (deletes any expired row for the note first, in a transaction, then inserts), `delete`, and a `incrementIfActiveAndReadNote` method for the public path (the guarded `updateMany` + conditional `findUnique` from design.md); verify repository unit tests cover: create with no prior row, create replacing an expired row (old token stops matching, `noteId` uniqueness holds), delete, and the atomic increment including a concurrent-increment test asserting no lost updates and a case where an expired/soft-deleted-note row is correctly excluded
- [x] 4.2 Add `apps/api/src/sharing/sharing-service.ts` implementing generate (idempotent while active, replaces when expired, validates `expiresAt`), fetch, and revoke against a caller-owned, non-deleted note, throwing `AppError("NOTE_NOT_FOUND", 404, ...)` / `AppError("SHARE_NOT_FOUND", 404, ...)` as appropriate; verify unit tests cover: first generate creates, second generate returns existing unchanged (even with a different `expiresAt` supplied), generate after expiry creates a new link, fetch/revoke with an active, absent, or expired link, and both 404 cases collapsing "not yours" and "not found"
- [x] 4.3 Add `apps/api/src/sharing/sharing-controller.ts` and `sharing-owner-router.ts` wiring `POST /notes/:id/share`, `GET /notes/:id/share`, `DELETE /notes/:id/share` behind `requireAuth`, mounted in `apps/api/src/app.ts`; verify Supertest coverage for all scenarios in the "Generate a share link", "Fetch current share link state", and "Revoke a share link" spec requirements, including the 401 unauthenticated case, the `422` expiry-validation case, and the expired-link scenarios for each route

## 5. API: public read endpoint

- [x] 5.1 Add `sharing-public-router.ts` wiring `GET /shared/:token` behind its own `rateLimit({ windowMs: env.SHARE_RATE_LIMIT_WINDOW_MS, limit: env.SHARE_RATE_LIMIT_MAX })` instance and no auth middleware, mounted in `apps/api/src/app.ts` outside the authenticated route group; verify Supertest coverage for the "Public read of a shared note" spec requirement: successful read returns only `title`/`content`, `viewCount` increments by exactly 1, an unknown/revoked/expired token responds `404 Not Found` with no count change, and a token whose note was soft-deleted directly at the DB layer (bypassing `NotesService.deleteNote`) also responds `404` with no count change
- [x] 5.2 Verify Supertest coverage for the "Public route is independently rate-limited" spec requirement: requests over `SHARE_RATE_LIMIT_MAX` within the window respond `429 Too Many Requests` with no `viewCount` change, using a test env with a small `SHARE_RATE_LIMIT_MAX` (mirroring the existing `rate-limit.test.ts` pattern)

## 6. API: soft-delete cascade

- [x] 6.1 Extend `NotesService.deleteNote` (`apps/api/src/notes/notes-service.ts`) to delete the note's `SharedNote` row, if any, in the same transaction as the soft-delete; verify a test where deleting a shared note leaves its former token responding `404 Not Found` from `GET /shared/:token`, and that deleting a note with no share link is unaffected

## 7. Verification

- [x] 7.1 Run `pnpm lint --max-warnings 0`, `pnpm run typecheck`, and `pnpm test --coverage` across `apps/api` and `packages/shared`; verify 0 errors/warnings and ≥80% coverage on the new code
- [x] 7.2 Run `openspec validate --strict` for `ab-1008-sharing`; verify it passes cleanly
