-- Full-document plain-text extraction of `content`, computed and written by
-- the application (NotesService.createNote/updateNote) at the same time as
-- `title`. Never computed in SQL; DEFAULT '' only covers pre-existing rows
-- until the one-off backfill script (apps/api/scripts/backfill-search-text.ts)
-- populates them.
ALTER TABLE "Note" ADD COLUMN "searchText" TEXT NOT NULL DEFAULT '';

-- Generated (STORED) tsvector column, weighted title -> A / searchText -> B.
-- Both source columns are plain text, so this expression is a straightforward
-- SQL derivation with no JSON parsing — Prisma has no native tsvector type,
-- so this is declared in schema.prisma as `Unsupported("tsvector")`.
ALTER TABLE "Note" ADD COLUMN "searchVector" tsvector GENERATED ALWAYS AS (
  setweight(to_tsvector('english', "title"), 'A') ||
  setweight(to_tsvector('english', "searchText"), 'B')
) STORED;

-- GIN index backing full-text search (AB-1007, GET /notes/search). No
-- Prisma-schema equivalent exists for an index on an Unsupported field.
CREATE INDEX "Note_searchVector_idx" ON "Note" USING GIN ("searchVector");
