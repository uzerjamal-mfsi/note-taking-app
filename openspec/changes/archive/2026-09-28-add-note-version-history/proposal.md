# Proposal

## Why

Notes support full-content `PATCH` replacement with no way to see or recover an
earlier state: an accidental overwrite (or a change the user regrets) is
permanent the moment the request succeeds. AB-1009 adds automatic version
history — snapshot, list, view, restore, auto-purge — so users can see how a
note evolved and undo an unwanted edit, without introducing collaborative
editing or any UI (API only, per AB-1009's scope).

## What Changes

- Every successful `PATCH /notes/:id` snapshots the note's **pre-update**
  content/title into a new `NoteVersion` row before applying the update, so
  version rows always represent past states and the `Note` row itself remains
  the single source of truth for "current."
- New endpoints, scoped to the note's owner only:
  - `GET /notes/:id/versions` — list a note's version history (most recent
    first).
  - `GET /notes/:id/versions/:versionId` — view one version's snapshot.
  - `POST /notes/:id/versions/:versionId/restore` — restore a version. This
    snapshots the note's current content first (so the restore itself is
    undoable), then applies the target version's content as the new current
    content via the same update path `PATCH` uses (re-deriving `title` and
    `searchText`).
- All three new endpoints treat a note that does not exist, is not owned by
  the caller, or has been soft-deleted identically: `404 Not Found`, matching
  existing `GET/PATCH /notes/:id` behavior. Version history is not reachable
  once its note is soft-deleted, and does not provide a way to restore a
  soft-deleted note.
- Auto-purge is lazy, not a scheduled job: whenever a new version snapshot is
  written for a note (via `PATCH` or restore), the system also deletes that
  note's versions older than 30 days, in the same transaction. No cron or
  background worker is introduced.

## Capabilities

### New Capabilities
- `notes-history`: snapshot-on-update, list/view/restore of a note's version
  history, and lazy 30-day auto-purge of old versions.

### Modified Capabilities
(none — the existing `notes` spec's `PATCH /notes/:id` contract, request/response
shape, and status codes are unchanged; the new snapshot side effect is
observable only through the new `notes-history` endpoints, so it is specified
there rather than as a delta to `notes`.)

## Impact

- **Schema/migration**: new `NoteVersion` table in `packages/db/prisma/schema.prisma`
  (`id`, `noteId` FK with `onDelete: Cascade` to `Note`, `content` (Json
  snapshot), `title` (String snapshot), `createdAt`). New migration under
  `packages/db/prisma/migrations/`, indexed by `[noteId, createdAt]` for
  ordering, lookup, and the purge query (see design.md for why no separate
  version-number column is needed). Follows the existing `SharedNote`
  precedent for a cascade-owned side table.
- **API**: `apps/api/src/notes/` gains the three routes above (or a sibling
  `apps/api/src/notes-history/` module, following the `sharing` module's
  precedent of a separate feature folder); `notes-service.ts`'s `updateNote`
  gains the snapshot+purge step, wrapped in the existing `$transaction`.
- **Shared contracts**: new `packages/shared/src/notes-history/` module with
  Zod request/response schemas, exported from `packages/shared/src/index.ts`.
- **No frontend changes** (AB-1009 is API-only, no UI).
- **Rollback plan**: the feature is additive — new table, new endpoints, and
  one new step in an existing transaction. Reverting means dropping the new
  routes/service code and rolling back the migration (`prisma migrate
  reset`/down migration); existing `Note` rows and the `PATCH` contract are
  untouched, so rollback carries no data-loss risk beyond discarding the
  version history itself.
