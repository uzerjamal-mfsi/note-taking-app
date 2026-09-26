# Design

## Context

See [proposal.md](proposal.md) - Why / What Changes for motivation and the full behavior contract. Relevant current state:

- `GET /notes` is handled by `notes-router.ts` -> `NotesController.list` -> `NotesService.listNotes` -> `NotesRepository.listOwned`, which runs an unfiltered `prisma.note.findMany({ where: { userId, deletedAt: null } })` and returns a bare `NoteDto[]`.
- `apps/api/src/middleware/validate.ts` already supports validating `req.query` against a Zod schema (it redefines the read-only Express 5 `req.query` getter after `safeParse`), so query validation follows an existing pattern rather than a new one.
- `packages/shared/src/notes/note-contracts.ts` holds `NoteDto` and the create/update Zod schemas; this is where the new list-query schema and paginated-response type belong, per the project's "shared owns all DTOs/schemas" rule.
- The `Note` model has a hand-maintained partial index (`packages/db/prisma/schema.prisma:35-45`) that Prisma's DSL can't express natively, with an established convention: declare the closest Prisma-representable approximation, hand-edit the real constraint into the generated migration SQL, and never accept `prisma migrate dev`'s drift-fixup prompt. The case-insensitive unique tag constraint needs the same treatment.

## Goals / Non-Goals

**Goals:**
- Keep `GET /notes` a single request/response round trip - no new endpoints.
- Reuse the existing validate-middleware and shared-contracts patterns rather than inventing new ones.
- Make the query filterable/sortable/paginated entirely in Postgres (no in-memory slicing of a full result set).
- Make pagination deterministic and the reported total consistent with the page returned, even under concurrent writes.

**Non-Goals:**
- No tag creation/assignment endpoints (see proposal - deferred to a follow-up change).
- No change to `POST /notes`, `PATCH /notes/:id`, `GET /notes/:id`, or `DELETE /notes/:id`.
- No change to `NoteDto`'s shape.
- No cursor-based pagination (decided: offset-based, per prior discussion).
- The `Tag.color` column (see Decisions) is schema-only forward compat for AB-1006. Nothing in this change reads, writes, validates, or exposes it; it exists purely so AB-1006 doesn't need its own migration for a field with no other dependents.

## Decisions

**Query schema lives in `packages/shared`, applied via the existing `validate()` middleware.**
Add `listNotesQuerySchema` (name TBD at implementation time, e.g. `listNotesQuerySchema`) to `note-contracts.ts`, built with `z.coerce.number()` for `page`/`pageSize` (query params arrive as strings) and `z.enum` for `sortBy`/`sortDir`, with `.default(...)` for each field so the controller always receives fully-resolved values. `tags` is parsed as an optional comma-separated string and, via a `.transform`, split on `,`, trimmed per token, filtered to drop empty tokens, and rejected (via `.superRefine`, so it surfaces as a normal `422`) if more than 10 tokens remain - so the controller/service only ever see a clean `string[]` of at most 10 non-blank names.
- *Alternative considered*: validate ad hoc inside the controller. Rejected - bypasses the existing `validate()` -> `422` convention and would duplicate error-shaping logic.
- *Alternative considered*: silently truncate to the first 10 tags instead of rejecting. Rejected - inconsistent with the `pageSize` > `100` precedent in this same schema, where out-of-bound input is a validation failure, not a silent adjustment a caller could fail to notice.

**Tag model is a normalized `Tag` + `NoteTag` join table, scoped per-user.**
```prisma
model Tag {
  id        String   @id @default(uuid())
  userId    String
  name      String
  color     String   @default("#64748B")
  createdAt DateTime @default(now())

  user  User     @relation(fields: [userId], references: [id])
  notes NoteTag[]

  // Real constraint is a case-insensitive unique index on (userId, lower(name)),
  // hand-edited into the generated migration SQL - see partial-index precedent
  // above. This declaration is the closest Prisma-representable approximation.
  @@unique([userId, name])
}

model NoteTag {
  noteId String
  tagId  String

  note Note @relation(fields: [noteId], references: [id])
  tag  Tag  @relation(fields: [tagId], references: [id])

  @@id([noteId, tagId])
  @@index([tagId])
}
```
- *Alternative considered*: a `tags String[]` column directly on `Note` (Postgres text array). Rejected per prior discussion - the user chose the normalized model, which additionally makes future tag rename/listing/reuse follow-ups cheaper since a tag is one row rather than a string duplicated across every note.
- *Alternative considered*: global/shared `Tag` (single unique `name`). Rejected - notes are strictly per-owner private data, and a shared tag namespace would leak tag names across user boundaries and complicate the later assignment feature's authorization story.
- `color` is added now, ahead of AB-1006, so that ticket can implement tag management purely at the API/service layer without also needing a schema migration for a column with no other dependents. It defaults to a fixed neutral slate (`#64748B`) so every row stays valid with no backfill; nothing in this change reads or writes it.

**Case-insensitive uniqueness via a functional index, not a `citext` column or app-level lowercasing of `name`.**
`name` is stored exactly as provided (preserves user's casing for display), and uniqueness is enforced by a `CREATE UNIQUE INDEX ... ON "Tag" (userId, lower(name))` added by hand to the generated migration, following the existing partial-index precedent. This index backs the *uniqueness constraint* (`Tag` create/upsert paths); it does not need to back the *read-side* tag filter - see the next decision for how filtering is actually matched.
- *Alternative considered*: a Postgres `citext` extension column. Rejected - adds an extension dependency for a single column when a functional index covers the one case-insensitivity need this change has.

**Tag-name filter matching uses Prisma's `mode: "insensitive"`, not a `lower(name)`-matching query.**
Prisma's query-builder API has no way to filter on `LOWER(name)` directly (only `equals`/`in`/etc. against the column's actual stored value), so there is no way to guarantee use of the `(userId, lower(name))` functional index from a plain `where` filter without dropping to raw SQL. Given per-user note/tag volumes here are small, `where: { tag: { userId, name: { in: tags, mode: "insensitive" } } }` (Postgres: `ILIKE`-based) is accepted as-is; an index-guaranteed match is not worth the raw-SQL subquery it would require.
- *Alternative considered (this update's original decision, superseded)*: lowercase the incoming tag list in the repository and compare directly against `lower(name)`. Turned out to not be expressible through Prisma's normal filter API - discovered during implementation - so this change accepted `mode: "insensitive"` instead.
- *Alternative considered*: `prisma.$queryRaw` to select matching tag ids via `LOWER(name) = ANY($1::text[])`, then filter notes by `tagId: { in: matchedTagIds }`. Rejected for now - correct and index-guaranteed, but adds a second query and hand-written SQL for a filter that doesn't need that guarantee at this data volume.

**Repository builds one Prisma query with `where`/`orderBy`/`skip`/`take`, plus a `count`, executed together in `prisma.$transaction`.**
`NotesRepository.listOwned` (or a renamed equivalent) takes a `{ page, pageSize, sortBy, sortDir, tags }` input (`tags` already normalized to a `string[]` of at most 10 trimmed, non-blank names by the query schema) and:
- filters via `where.tags = { some: { tag: { userId, name: { in: tags, mode: "insensitive" } } } }` (see above);
- builds `orderBy: [{ [sortBy]: sortDir }, { id: sortDir }]` - the `id` tie-breaker guarantees a total order so no note is ever skipped or repeated across pages when multiple notes share the same `sortBy` value;
- includes `deletedAt: null` explicitly in the shared `where` object passed to *both* `findMany` and `count`, rather than relying on a single soft-delete filter defined once and assumed to propagate - the two queries are two separate Prisma calls, so this is spelled out rather than implicit;
- runs `prisma.$transaction([prisma.note.count({ where }), prisma.note.findMany({ where, orderBy, skip, take, select: NOTE_SELECT })])` rather than `Promise.all(...)`, so `total` and the returned page are read from the same consistent database snapshot even if another request inserts/deletes/soft-deletes a note for that user concurrently.

Returns `{ notes, total }` for the service layer to turn into `{ data, meta }` (see below).
- *Alternative considered*: fetch all matching notes and paginate in JS. Rejected - defeats the purpose of adding pagination (still scans/transfers the full result set) and was explicitly the problem this change fixes.
- *Alternative considered*: `Promise.all([count, findMany])` (two independent queries, not transactional). Rejected - under concurrent writes the two queries could observe different snapshots (e.g. `total` counted before a delete, `findMany` run after), producing a `meta` that doesn't match `data`. `$transaction` costs one extra round trip's worth of coordination but removes that inconsistency.

**Response envelope is `{ data, meta }`, replacing the bare array - a breaking change accepted as-is.**
`meta` is `{ page, pageSize, total, totalPages, hasNextPage, hasPreviousPage }`, computed in the service (not the repository, which only returns `{ notes, total }`) as:
- `totalPages = total === 0 ? 0 : Math.ceil(total / pageSize)`
- `hasNextPage = page < totalPages`
- `hasPreviousPage = page > 1`

No frontend consumes `GET /notes` yet (`apps/web` has no notes feature), so there's no client-side migration cost right now; the break is confined to the API contract and its existing Supertest coverage, both owned in this same change.

## Risks / Trade-offs

- **[Risk] `prisma migrate dev` will prompt to "fix" the hand-edited functional unique index as drift, same as the existing partial index.** -> Mitigation: document the same cancel-the-prompt guidance in `schema.prisma` right on the `Tag` model, next to the new constraint, mirroring the existing comment on `Note`.
- **[Risk] Tag rows can never be created without an API, so integration tests need a non-API seeding path.** -> Mitigation: add a small test-only helper (in the notes/tags test setup, not production code) that inserts `Tag`/`NoteTag` rows directly via Prisma; this is expected and acceptable since assignment endpoints are explicitly out of scope here.
- **[Risk] Breaking `GET /notes`'s response shape could surprise any out-of-repo API consumer.** -> Mitigation: none needed in-repo (no such consumer exists today per the codebase scan); called out explicitly in the proposal's Impact section so reviewers can flag it if an external consumer exists that this exploration didn't find.
- **[Risk] `Tag.color` sits unused until AB-1006 lands, and could drift (wrong type, wrong default) before anything reads it.** -> Mitigation: covered only by "the migration applies and the column has the documented default" in this change's tasks; AB-1006 is responsible for validating the column meets its actual needs when it starts consuming it.
- **[Trade-off] Rejecting (rather than truncating) more than 10 tags is a stricter API than some callers might expect.** -> Accepted per this update - matches the existing `pageSize` convention of failing loudly on out-of-bound input rather than silently adjusting it.
- **[Trade-off] Offset pagination can skip or repeat a row if notes are inserted/deleted between page requests.** -> Accepted per prior discussion; the `id` tie-breaker and `$transaction`-wrapped count/fetch remove the *tie* and *snapshot* sources of instability, but a note inserted between two separate page *requests* (not within one request) can still shift offsets - simplicity and `meta.total` support were prioritized over full keyset stability, and note lists are low-concurrency (single owner).

## Migration Plan

1. Add `Tag`/`NoteTag` models to `packages/db/prisma/schema.prisma` and the `tags NoteTag[]` back-relation on `Note`.
2. Run `prisma migrate dev`, then hand-edit the generated SQL to replace the plain `@@unique([userId, name])` index with `CREATE UNIQUE INDEX "Tag_userId_lower_name_key" ON "Tag" (userId, lower(name))`, matching the existing partial-index precedent for `Note`.
3. Add the list-query Zod schema and paginated-response type to `packages/shared`.
4. Update `notes-router.ts`, `notes-controller.ts`, `notes-service.ts`, `notes-repository.ts` for the new query params and envelope.
5. Rollback: a straight `prisma migrate dev` down-migration (drops `NoteTag`/`Tag`) plus reverting the shared-contracts and `apps/api/src/notes` changes. No existing data is touched, so no backfill/cleanup step is needed.

## Open Questions

None - all decisions needed to write specs/tasks were resolved during exploration and this update.
