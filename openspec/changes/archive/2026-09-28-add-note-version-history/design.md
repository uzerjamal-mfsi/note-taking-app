# Design

## Context

See proposal.md - Why/What Changes for motivation and scope. Relevant
existing state:

- `notes-service.ts`'s `updateNote` already runs inside a single
  `prisma.$transaction` (see `deleteNote`'s sibling transaction at
  `notes-service.ts:155-171` for the established pattern of soft-delete +
  related-row cleanup in one transaction).
- `SharedNote` is the existing precedent for a note-owned side table:
  `noteId` unique/FK with `onDelete: Cascade`, its own repository/service
  pair, mounted as a sibling feature module (`apps/api/src/sharing/`) rather
  than folded into `notes/`.
- `GET /notes` already establishes this project's convention for
  deterministic ordering under ties: sort by the primary field, break ties by
  `id` in the same direction (see notes spec, "Stable ordering when sort
  values tie").
- No cron/scheduled-job/background-worker mechanism exists anywhere in this
  codebase (no `node-cron` dependency, no `setInterval`-based scheduler).
  Introducing one is out of scope here (see Decisions).

## Goals / Non-Goals

**Goals:**
- Snapshot a note's pre-update state on every content-changing `PATCH`,
  without changing `PATCH /notes/:id`'s existing request/response contract or
  status codes.
- Make restore reuse the existing update path exactly, so it needs no
  bespoke snapshot or title/searchText-derivation logic.
- Keep purge entirely transactional and lazy - no new infrastructure.
- Avoid version noise from no-op saves, and avoid ever exposing one note's
  version to a request scoped to a different note.

**Non-Goals:**
- No UI (per proposal/AB-1009 scope).
- No snapshot on note creation - a note's version history starts at its
  first `PATCH`, not at creation. A never-updated note has zero versions,
  per spec ("Note with no versions yet").
- No configurable retention window - 30 days is fixed for this change.
- No guaranteed purge for notes that are never updated again after
  crossing the 30-day mark (see Risks).

## Decisions

**Module placement: sibling `apps/api/src/notes-history/` module, not folded
into `notes/`.**
Mirrors the `sharing` module's precedent (owner-scoped router + its own
service/repository), keeping `notes-service.ts` from growing a second
responsibility. `notes-service.ts.updateNote` calls into
`NotesHistoryRepository` for the snapshot+purge step, passing its own
transaction client (`tx`) through so both operations commit atomically with
the content update. This is a one-directional dependency
(`notes` -> `notes-history`) for the snapshot call; the restore endpoint
inverts it in the other direction (`notes-history` -> `notes`, calling the
existing `notesService.updateNote(...)`), described next.

**Restore is a thin wrapper around the existing update path, not new business
logic.**
`POST /notes/:id/versions/:versionId/restore` loads the target version's
`content`, then calls the same `notesService.updateNote(noteId, userId,
version.content)` that `PATCH /notes/:id` uses. This single call already:
re-derives `title`/`searchText`, snapshots the note's *current* content as a
new version before overwriting (the existing snapshot-on-update behavior,
applied here to the restore's implicit "update"), and runs the existing
30-day purge. No separate snapshot or purge code path is needed for restore -
it was a candidate design (special-case the snapshot inside a
`restoreVersion` method) rejected in favor of reuse, since the two operations
are behaviorally identical from the `Note` row's perspective ("replace
current content with some content, keeping history").

**No `versionNumber` column - order by `createdAt` then `id`, both
descending.**
Considered a per-note monotonic integer (`versionNumber`) for a friendlier
ordering key, but it requires either a read-then-write race window (`SELECT
MAX(versionNumber) + 1`) inside the transaction, or a second sequence/counter
table - extra moving parts for no behavioral gain, since `NoteVersion` rows
are never addressed by position, only by `versionId` (opaque uuid). Ordering
instead reuses this project's existing tie-break convention from `GET
/notes` (sort field + `id` descending), which is already proven correct
under concurrent writes with `createdAt`'s (loose) timestamp precision.
`@@index([noteId, createdAt])` backs both the list query and the purge
query's `WHERE noteId = ? AND createdAt < now() - 30d`.

**The content update applies first; snapshot and purge only run once that
update is confirmed to have actually applied - all three statements share
one transaction, so the net effect is atomic regardless of this order.**
`updateNote` reads the note's current `content`/`title` (via `findOwned`),
then calls `updateOwned`, and only then - guarded by `updateOwned`'s result
being non-null - inserts the snapshot and runs the purge. This ordering
(update, then snapshot+purge, rather than snapshot+purge, then update) is
deliberate: `updateOwned` can still no-op here (e.g. the note was
concurrently soft-deleted after the initial read, so `updateMany` matches
zero rows), and snapshotting before confirming the update applied would
leave behind a version for content that was never actually overwritten.
Because every statement runs inside `notesService.updateNote`'s existing
`$transaction`, no caller can observe the update having applied without the
snapshot also existing (or vice versa) regardless of which statement the
code issues first - the ordering only affects which local variable this
method has in hand when it decides whether to skip snapshot/purge, not what
any other transaction can see mid-flight.

Purge itself is a `deleteMany({ where: { noteId, createdAt: { lt: cutoff } } })`
immediately after the snapshot insert. Scoping to `noteId` (rather than a
global sweep) keeps the query index-only and cheap, and matches the
lazy/no-scheduler goal: purging piggybacks on writes that are already
happening, touching only the row being written to. Because purge is
triggered by the snapshot insert rather than by `updateNote` running at all,
a no-op update (see next decision) skips purge too - there is no separate
"purge regardless" path.

**No-op updates create no version snapshot (and, per the previous decision,
no purge) for that request.**
Before snapshotting, `updateNote` compares the incoming `content` against the
note's current `content` using Node's `isDeepStrictEqual` (`node:util`) -
own-enumerable-property equality regardless of key order, which matters
because Postgres JSONB storage doesn't preserve the original key order of a
stored document, so re-reading identical content back can yield differently
-ordered keys than what the client originally submitted. If they match, the
resulting derived `title` is guaranteed to match too, so no separate title
comparison is needed at runtime - but the requirement is still stated in
terms of both fields in the spec, since that's the externally observable
condition. This matters because the frontend's debounced autosave (see
CLAUDE.md's frontend conventions) can fire a `PATCH` with unchanged content -
e.g. opening a note and saving without editing, or a debounce tick that
re-sends the same content - and without this check every such no-op save
would otherwise create a version, drowning real edits in noise. The
comparison and skip happen inside the same `updateNote` transaction, so a
no-op update still succeeds and returns `200 OK` exactly as before - it just
adds nothing to history.

**Version and restore lookups use a compound `{ id: versionId, noteId }`
where-clause, never a two-step fetch-then-check.**
`getOneForNote`/`restoreVersion`'s underlying query is
`prisma.noteVersion.findFirst({ where: { id: versionId, noteId } })` (or the
`updateMany`/`findFirst`-style guarded-read pattern `sharing-repository.ts`'s
`incrementIfActiveAndReadNote` already establishes), not
`findUnique({ where: { id: versionId } })` followed by an application-level
`if (result.noteId !== noteId)` check. The compound query makes cross-note
access structurally impossible to return - a forgotten or buggy
post-fetch check can never leak a version belonging to a different note,
because the database itself never returns the mismatched row in the first
place. This is the same defense-in-depth reasoning as the existing ownership
guards on `Note` queries (`updateOwned`'s `where: { id, userId, deletedAt:
null }`), applied to the note/version relationship.

**Contracts: new `packages/shared/src/notes-history/notes-history-contracts.ts`.**
Per project rule ("Define request/response Zod schemas in packages/shared
first"), following the `sharing-contracts.ts` file shape: a `noteIdParamSchema`
(reused from `notes` contracts rather than duplicated - see existing
`packages/shared/src/notes/` module) plus a new `versionIdParamSchema`. Two
response schemas, not one: `noteVersionSummaryResponseSchema` (`id`, `noteId`,
`title`, `createdAt`) for the list endpoint's array, and
`noteVersionResponseSchema` (the summary fields plus `content`) for the
single-version endpoint - the list intentionally omits `content` so listing a
note with many or large versions doesn't require transferring their full JSON
documents; a client fetches one version's `content` via the single-version
endpoint. Restore's response is not a new schema at all: it reuses
`packages/shared/src/notes`'s existing `Note` response schema, since restore
returns exactly what `PATCH /notes/:id` returns (see the restore decision
above). No request body schema is needed for any of the three endpoints
(list/view/restore are all parameter-only).

## Risks / Trade-offs

- **[Risk]** A note that is updated once and then never touched again keeps
  its pre-update version forever (purge only runs on the *next* snapshot
  write, which never comes) -> **Mitigation**: accepted per proposal's lazy-purge
  decision; this is the explicit trade-off of not running a scheduled sweep.
  Revisit if unbounded per-note storage growth becomes a real concern (would
  need the cron/scheduler infra this change deliberately avoids introducing).
- **[Risk]** Restoring reuses `updateNote`, so restore's response shape and
  status code are exactly `PATCH /notes/:id`'s (`200 OK` with the note DTO,
  no restore-specific schema) rather than something restore-specific ->
  **Mitigation**: this is intentional (see Decisions and Contracts) and is
  what the spec commits to; flagging so it isn't mistaken for an oversight if
  `201`/`204` is expected by habit.
- **[Trade-off]** No pagination on `GET /notes/:id/versions` (unlike
  `GET /notes`) -> accepted because history is self-bounding: at most one
  version per `PATCH`, pruned after 30 days, so realistic result sets are
  small. Can add pagination later without a breaking change (additive query
  params, array response can become `{ data, meta }` only if needed - flagged
  here, not committed to).

## Migration Plan

1. Add `NoteVersion` model to `packages/db/prisma/schema.prisma`
   (`onDelete: Cascade` on `noteId -> Note.id`, `@@index([noteId, createdAt])`),
   run `prisma migrate dev` to generate the migration under
   `packages/db/prisma/migrations/` (timestamp later than the existing
   `20260927120000_*` migrations).
2. Add `packages/shared/src/notes-history/notes-history-contracts.ts` (+
   test), export from `packages/shared/src/index.ts`.
3. Add `NotesHistoryRepository`/`NotesHistoryService` (snapshot, purge, list,
   get-one, restore-via-`notesService.updateNote`) and
   `notes-history-router.ts`, mounted alongside the existing `notes` and
   `sharing` routers.
4. Wire the snapshot+purge call into `notes-service.ts`'s `updateNote`
   transaction.
5. Rollback: drop the new routes/module and the migration
   (`prisma migrate resolve` / down migration) - additive only, no existing
   table or column is altered, so rollback has no data-loss risk to `Note`
   itself (only the version history rows are lost, which is the feature
   being removed).
