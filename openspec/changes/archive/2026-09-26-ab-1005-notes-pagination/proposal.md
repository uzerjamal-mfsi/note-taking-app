# Proposal

## Why

`GET /notes` currently returns every non-deleted note a user owns in one unsorted array, with no way to filter by tag. As a user's note count grows this becomes slow to load and hard to navigate, and there is no way to narrow the list to a topic. AB-1005 adds pagination, sorting, and tag-based filtering to the notes list so the endpoint stays usable as note volume grows.

## What Changes

- **BREAKING**: `GET /notes` response envelope changes from a bare `NoteDto[]` array to `{ data: NoteDto[], meta: { page, pageSize, total, totalPages, hasNextPage, hasPreviousPage } }`.
- `GET /notes` accepts new query parameters, all optional:
  - `page` (default `1`)
  - `pageSize` (default `20`, max `100`; values above `100` are rejected with `422`, not clamped)
  - `sortBy`: `createdAt` | `updatedAt` (default `updatedAt`)
  - `sortDir`: `asc` | `desc` (default `desc`)
  - `tags`: comma-separated tag names; a note matches if it has **any** of the listed tags (OR); matching is case-insensitive. Each tag token is trimmed of surrounding whitespace and empty tokens are dropped before matching; at most 10 tags may be supplied - more than 10 is rejected with `422`.
- Pagination order is deterministic: results are sorted by the requested `sortBy`/`sortDir`, with `id` (same `sortDir`) as a tie-breaker, so notes sharing a sort value never shift between pages.
- New `Tag` and `NoteTag` join table in the Prisma schema, to support the `tags` filter:
  - `Tag` is scoped per-user (`userId` + case-insensitive-unique `name`), not global/shared, matching notes' strict per-owner privacy model.
  - `Tag` also gains a `color` column (`String`, default `"#64748B"`) as schema-only forward compat for AB-1006's tag-management UI. It is not read, written, or exposed by anything in this change.
  - No endpoint is added in this change to create tags or attach/detach them from a note. That is deliberately deferred to a follow-up change; `Tag`/`NoteTag` rows exist only as a filtering substrate here, and integration tests seed them directly via Prisma rather than through the API.
- `NoteDto` is unchanged - it does not gain a `tags` field in this change, since there is no way for a client to set tags yet.
- Invalid query parameters (e.g. `sortBy=foo`, `pageSize=0`, `pageSize=101`, non-numeric `page`, more than 10 tags) are rejected with `422 Unprocessable Entity`, consistent with the existing `validate()` middleware convention.

## Capabilities

### New Capabilities
- `notes-tags`: Per-user `Tag` entity and `Note`-to-`Tag` association used to filter the notes list by tag. Does not include any endpoint for creating or assigning tags (deferred to a follow-up change).

### Modified Capabilities
- `notes`: The "List own notes" requirement changes from "SHALL NOT apply pagination, sorting, or filtering" to supporting page/pageSize pagination, createdAt/updatedAt sorting (with a deterministic tie-breaker), and tag-based filtering, with a new paginated response envelope.

## Impact

- **Schema/migration**: New `Tag` model (`id`, `userId`, `name`, `color`, `createdAt`) with a case-insensitive unique constraint on `(userId, name)`, and a `NoteTag` join table (`noteId`, `tagId`). Requires a new `prisma migrate dev` migration. Postgres has no native case-insensitive unique constraint, so the migration will need a functional unique index on `(userId, lower(name))` (hand-adjusted in the generated migration SQL, similar to the existing partial-index precedent on `Note`).
- **Shared contracts** (`packages/shared`): New Zod schema for the `GET /notes` query params (`page`, `pageSize`, `sortBy`, `sortDir`, `tags`, with `tags` trimmed/de-duplicated-of-empties/capped at 10); new paginated list-response type carrying the expanded `meta`. `NoteDto` and the create/update request schemas are unchanged.
- **API** (`apps/api/src/notes`): `notes-router.ts` gains query validation on `GET /notes`; `notes-controller.ts`, `notes-service.ts`, and `notes-repository.ts` change to build a filtered/sorted/paginated Prisma query (`count` and `findMany` run together in a `prisma.$transaction` for a consistent total) and return a `{ data, meta }` envelope instead of a bare array.
- **Tests**: New Supertest coverage for pagination boundaries, deterministic tie-break ordering, sort order, tag filtering (including no-match, multi-tag OR, whitespace/empty-token normalization, and over-the-limit cases), and the existing auth/validation-failure scenarios re-asserted against the new response shape. `notes-repository.test.ts` needs direct `Tag`/`NoteTag` seeding helpers since no API path creates them yet.
- **No frontend impact**: no notes UI exists yet in `apps/web`, so there is no client to update in this change.
- **Rollback**: The migration only adds new tables/constraints and changes one endpoint's query handling and response shape; it does not alter existing `Note` columns or existing data. Rollback is a straightforward migration-down plus reverting the `notes` router/controller/service/repository and shared-contract changes; no data backfill or cleanup is required since `Tag`/`NoteTag` start empty and are never populated by existing code paths.

Ticket: AB-1005
