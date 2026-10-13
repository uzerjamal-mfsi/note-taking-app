# 0001. Soft-delete notes; 30-day retention window

Status: Accepted. Partly implemented (see Consequences).

## Context

Users must be able to delete notes without immediate data loss, and note history should not grow unbounded. `CLAUDE.md` mandates: set `deletedAt` only, never physically delete note rows within the 30-day retention window.

## Decision

- `Note.deletedAt` marks deletion; every read/update/delete query filters `deletedAt: null` and `userId` (`apps/api/src/notes/notes-repository.ts`).
- Deleting a note also removes its share link in the same transaction (`notes-service.ts`, `deleteNote`).
- `NoteVersion` snapshots (pre-update content) older than 30 days are purged lazily inside the transaction of the next changed update (`notes-history-repository.ts`, `purgeOlderThan30Days`).
- A partial index `WHERE "deletedAt" IS NULL` backs active-note lookups (hand-written in migration `20260926144918_add_note`).

## Consequences

- No note row is ever physically removed by the application; recovery is possible at the database level.
- No trash/restore endpoint and no job that purges soft-deleted notes after 30 days exist, so the retention window is currently unbounded for notes; the 30-day rule is enforced only for version history, and only lazily (a note never updated again keeps old versions).
- Tags count only active notes; tag deletion is blocked while active notes use it (`TAG_IN_USE`).
- Hand-written index SQL makes `prisma migrate dev` report drift (see SDS section 5).
