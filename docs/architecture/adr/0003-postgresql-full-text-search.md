# 0003. PostgreSQL full-text search via generated tsvector

Status: Accepted.

## Context

Notes need ranked, highlighted search. Content is ProseMirror JSON, which is not directly searchable, and external search engines are out of scope (`CLAUDE.md`).

## Decision

- The service extracts plain text from the document on write into `Note.searchText` (`extractSearchText` in `notes-service.ts`); the title is derived from the first block.
- A generated, stored `tsvector` column (`title` weight A, `searchText` weight B) with a GIN index backs queries (migration `20260927120000_add_note_search`; declared `Unsupported("tsvector")` in `schema.prisma`).
- Queries use `websearch_to_tsquery('english', ...)`, `ts_rank_cd` ordering and `ts_headline`, via parameterized `prisma.$queryRaw` tagged templates only (`notes-search-repository.ts`). Highlights are parsed into match ranges server-side (`sentinel-highlight.ts`) so the client never receives markup.
- `apps/api/src/scripts/backfill-search-text.ts` backfills pre-existing rows.

## Consequences

- No extra infrastructure; search is transactionally consistent with writes.
- Raw SQL and a hand-written index live outside Prisma's schema model (migration drift, see SDS section 5).
- The language configuration is fixed to English; there is no typo tolerance.
- Search text is derived data that must be written by the service on every create/update.
