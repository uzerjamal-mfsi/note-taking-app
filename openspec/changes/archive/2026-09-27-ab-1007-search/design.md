# Design

## Context

See [proposal.md](proposal.md) for motivation. Relevant current state:

- `Note.content` is a `Json` column holding a TipTap/ProseMirror document (`packages/db/prisma/schema.prisma`). There is no plain-text or `tsvector` column today, and no `$queryRaw` usage anywhere in `apps/api`.
- `title` is derived at write time by `deriveTitle`/`collectText` in `apps/api/src/notes/notes-service.ts:12-36`, but that walker only reads the document's *first* top-level node — it was built for titles, not full-document text.
- `NotesRepository.list()` (`apps/api/src/notes/notes-repository.ts:52-80`) is the existing pagination precedent: a `$transaction([count, findMany])`, `skip`/`take`, and an `orderBy` array that always ends with `{ id: sortDir }` as a tiebreaker.
- The schema already has two precedents for hand-written SQL Prisma's DSL can't express: a partial index (`Note_userId_active_idx`, `WHERE "deletedAt" IS NULL`) and a case-insensitive functional unique index (`Tag_userId_lower_name_key`), both documented with an inline comment on the nearest Prisma-representable approximation. A generated `tsvector` column + GIN index follows the same pattern.
- `packages/shared/src/notes/note-contracts.ts` establishes the pagination envelope (`data`/`meta`) and query-schema conventions (`z.coerce.number()`, capped `pageSize`, comma-separated list parsing) this change reuses.

## Goals / Non-Goals

**Goals:**
- Full-text search over a note's title and full body text, ranked by relevance, paginated the same way as the rest of the API.
- Highlighted match locations returned as plain-text-safe structured offsets, not markup.
- Keep `searchVector` self-maintaining as a generated column, so ranking/matching can never drift from `title`/`searchText` once those are correct.

**Non-Goals:**
- Combining search with the existing `tags` filter, or offering `sortBy`/`sortDir` on search results (explicitly deferred; see proposal).
- Any change to `title` derivation or the existing `GET /notes` list endpoint.
- Fuzzy/typo-tolerant matching, or search across other users' notes (search is always scoped to the caller).
- Any frontend/UI work — this change is API-only; the search UI is deferred entirely to AB-1013.

## Decisions

### 1. Extraction happens in the application service layer; only ranking/matching is done in Postgres

**Decision:** Generalize `collectText` into a whole-document plain-text extractor, `extractSearchText`, in `apps/api/src/notes/notes-service.ts` — reusing the same recursive node-walk `collectText` already does for `deriveTitle`, but over every top-level node instead of just the first. Call it from `NotesService.createNote`/`updateNote` alongside `deriveTitle`, so `searchText` is computed and written by the application at the exact same write path as `title`/`content`. `NotesRepository.create`/`updateOwned` gain `searchText` in their `data`.

`searchVector` remains a Postgres generated column, but now it's a plain expression over two already-plain-text columns, with no JSON parsing inside it:
```sql
GENERATED ALWAYS AS (
  setweight(to_tsvector('english', title), 'A') ||
  setweight(to_tsvector('english', "searchText"), 'B')
) STORED
```
with a GIN index on it.

**Why over a database trigger:** An earlier version of this design computed `searchText` via a `BEFORE INSERT OR UPDATE` PL/pgSQL trigger using `jsonb_path_query_array(content, '$.**.text')`, so extraction lived in exactly one place and existing rows backfilled for free. In exchange, it required validating an uncommon Postgres JSONPath feature against real TipTap output before trusting it (a dedicated spike), and put the one algorithm that decides "what counts as this note's searchable text" in PL/pgSQL — a language with no unit tests in this codebase today, harder for the team to read/debug than a plain function next to `deriveTitle`. Extracting in the service layer keeps all TipTap-document-shape logic in TypeScript, in one place, covered by the same Vitest suite already exercising `deriveTitle`, and removes the need to validate an unfamiliar Postgres feature before building anything else.

**Backfill for existing rows:** because extraction is now application logic, existing notes' `searchText` cannot be computed by the migration's SQL alone. The migration adds `searchText TEXT NOT NULL DEFAULT ''` (so `searchVector` is well-defined immediately, just empty for existing rows), and a one-off, idempotent backfill script (`apps/api/src/scripts/backfill-search-text.ts`) reads notes in batches and calls the same `extractSearchText` the write path uses, updating `searchText` for each — `searchVector` then recomputes automatically since it's generated from `searchText`. This script is a required, but separate, post-deploy step (see Migration Plan), not part of the schema migration itself.

**Trade-off accepted:** unlike the trigger approach, `searchText` can in principle drift from `content` if some future write path sets `content` without going through `NotesService` (e.g. a bulk import or a direct repository call added later). This is mitigated, not eliminated, by `searchText` being computed in the exact same two methods (`createNote`/`updateNote`) that already compute `title` — any code path that already derives a correct `title` derives a correct `searchText` for free, and any code path that bypasses both has an existing `title`-correctness problem too.

### 2. Query parsing: `websearch_to_tsquery`

**Decision:** Parse `q` with `websearch_to_tsquery('english', q)`, not `plainto_tsquery` or raw `to_tsquery`.

**Why:** `websearch_to_tsquery` accepts natural user input directly — quoted phrases, `-exclude`, implicit `AND` between words, `or` — without the caller needing to know tsquery operator syntax, and without the app needing to sanitize/escape special characters the way `to_tsquery` would require. `plainto_tsquery` is simpler but silently ANDs every word with no phrase/exclusion support, which is a worse search experience for the same implementation cost.

**Guard: empty tsquery.** `q` passing Zod validation (non-empty, ≤200 chars after trimming) does not guarantee `websearch_to_tsquery` produces a non-empty query — an input like `q=the` or `q=---` can reduce to zero lexemes once stopwords/non-word characters are stripped. Rather than trust Postgres's own empty-tsquery behavior across `@@`/`ts_rank_cd`/`ts_headline` (which is not guaranteed identical across versions and is easy to get subtly wrong, e.g. an empty tsquery matching unexpectedly or a ranking function erroring on it), the repository SHALL check `numnode(query) = 0` immediately after building the tsquery and, if true, short-circuit to an empty page (`total: 0`, `data: []`) without executing the ranked query at all.

### 3. Ranking: `ts_rank_cd`, tie-broken by `id`

**Decision:** `ORDER BY ts_rank_cd(search_vector, query) DESC, id DESC`.

**Why:** `ts_rank_cd` accounts for proximity of matching terms (cover density), which rewards a note where query terms appear close together over one where they're scattered — a better relevance signal than plain `ts_rank` for short documents like notes. The `id DESC` tiebreaker mirrors the exact pattern `NotesRepository.list()` already uses for stable pagination across ties.

### 4. Highlighting: `ts_headline` with sentinel delimiters, parsed into offsets server-side

**Decision:** Call `ts_headline('english', <text>, query, 'StartSel=\x01, StopSel=\x02, ...')` once for `title` (`HighlightAll=true, MaxFragments=0`, since titles are short and any match should be marked) and once for `searchText` (`MaxFragments=1, MinWords=5, MaxWords=15`, to produce one relevant excerpt). The repository then strips the `\x01`/`\x02` control-character sentinels out of each result, recording the character offsets where they occurred, before returning `{ text, ranges: [{start, end}] }` for title and snippet.

**Why:** This is what makes the "Structured offsets, not raw HTML" decision (already confirmed) implementable: `ts_headline` only knows how to emit delimited text, so the offset-extraction step has to happen somewhere, and doing it once in the repository (right where the raw query result comes back) keeps every consumer — the controller, the DTO, the frontend — working with plain text plus ranges, never markup. Sentinel control characters (0x01/0x02) are used instead of `<mark>`/`</mark>` specifically so that if a user's own note text happens to contain a literal `<mark>`, it can never be confused with a real delimiter.

**Discovered defect and fix — tag-stripping:** Postgres's default text-search parser recognizes any `<...>`-shaped substring as an HTML "tag" token, and `ts_headline` silently drops such tokens from its output entirely (confirmed directly against Postgres — not an assumption). Left unfixed, a note whose text contains something like `<script>` would come back from search with that substring missing, violating the "no markup embedded... unescaped and unmodified" requirement outright — this was caught by the end-to-end router test for that exact spec scenario, not by the unit-level sentinel-parser tests (which never exercise real `ts_headline` output). Fix: before calling `ts_headline`, substitute `<`/`>` with `chr(3)`/`chr(4)` (a length-preserving, 1:1 character substitution, so match offsets stay correct), then substitute them back immediately after `ts_headline` runs — all within the same SQL query, in `NotesSearchRepository`. This hides tag-shaped structure from the parser without changing the ranking/matching behavior or touching the sentinel-parsing code at all.

**Follow-up fix — reserved-character collision:** a code review caught that the `chr(3)`/`chr(4)` substitution above (and the pre-existing `chr(1)`/`chr(2)` sentinels) is only safe if none of those four control characters already appear in the note's own `title`/`searchText`. If one did (a literal `\u0003` is valid in a `TEXT` column and expressible in a JSON request body), the final reverse-substitution couldn't tell it apart from the tool's own placeholder and would corrupt it into a stray `<`/`>` in the response — confirmed empirically. Fixed by stripping any pre-existing `chr(1)`–`chr(4)` from `title`/`searchText` before the `<`/`>` substitution runs, so the round-trip is always unambiguous.

### 5. New endpoint, own capability, raw parameterized SQL

**Decision:** `GET /notes/search` lives in a new `apps/api/src/notes-search/` feature slice (route → controller → service → repository, matching the existing layering), backed by `prisma.$queryRaw` with `Prisma.sql` tagged templates (never `$queryRawUnsafe`) for both the count and the ranked/highlighted page query, run inside a single interactive `prisma.$transaction(async (tx) => ...)` alongside the tag-fetch follow-up query — all three reads share one transaction/snapshot, rather than the tag fetch running after the count+page transaction commits (a code-review fix; the count/page queries alone could not use the simpler array form of `$transaction` here since the tag fetch's `ids` depend on the page query's own result). Each SQL statement computes `websearch_to_tsquery` once via a `WITH q AS (...)` CTE and references `q.tsq` everywhere else in that statement, rather than re-parsing it on every reference (another code-review fix).

**Why:** Prisma's query builder has no way to express `@@`, `ts_rank_cd`, or `ts_headline`, so raw SQL is required for the core query; everything else (route registration, auth middleware, Zod validation via `packages/shared`, layering) follows existing conventions untouched.

**Route ordering:** Express matches routes in registration order, and `:id` in `GET /notes/:id` matches any literal path segment, including `search`. `GET /notes/search` MUST be registered before `GET /notes/:id` in the router, or requests to `/notes/search` will be captured by the note-detail handler instead (treating `"search"` as an `:id`). This is a router-wiring concern, not a spec-level behavior change, but it is easy to get wrong silently (both routes return a response, just the wrong one), so it is called out here explicitly and has its own task/test.

## Risks / Trade-offs

- **[Risk]** `searchText` could drift from `content` if a future write path bypasses `NotesService.createNote`/`updateNote` (e.g. a bulk import). → **Mitigation:** `searchText` is computed in the same two methods that already compute `title`; any new write path already has to go through them (or reimplement `title` derivation) to behave correctly today, so the risk is not new, only extended to one more field. `NotesRepository.create`/`updateOwned`'s `searchText` field is required (not optional), matching `title`, so a caller that forgets it fails to compile rather than silently persisting a stale/empty value (a code-review fix — it was briefly made optional to avoid updating unrelated tests, which is exactly the gap this closes). → see Decision 1.
- **[Risk]** The backfill script and the write-path extractor could drift apart over time if someone edits `extractSearchText` without re-running a backfill for already-migrated rows on some future schema change. → **Mitigation:** both call the exact same function; a change to extraction logic that needs a re-backfill is a normal migration concern, not specific to this feature, and is called out in the backfill script's own documentation.
- **[Risk]** `ts_headline` re-parses text with its own tsquery matching, separate from the `WHERE ... @@ query` filter — in rare cases (e.g. stemming edge cases) a note could match the `WHERE` clause but `ts_headline` finds nothing to highlight in one of the two fields. → **Mitigation:** this is expected and handled by design: the spec already allows empty ranges in the field that didn't match (title-only or body-only matches both have a scenario).
- **[Risk]** Registering `GET /notes/search` after `GET /notes/:id` would silently misroute every search request to the note-detail handler. → **Mitigation:** registered first, with a regression test asserting the search route is reachable (see Decision 5, Tasks).
- **[Risk]** Postgres's `ts_headline` silently strips `<...>`-shaped substrings from its output (its parser treats them as HTML tags), which would otherwise corrupt returned title/snippet text for any note containing tag-like text. → **Mitigation:** neutralize `<`/`>` before calling `ts_headline` and restore them after, entirely within the repository's SQL (see Decision 4). Covered by an end-to-end test, not just the sentinel-parser's unit tests, since that's what caught it.
- **[Trade-off]** No `tags`/`sortBy` support means a user searching within a tag still has to filter client-side or run a second request against `GET /notes?tags=...`. Accepted per the confirmed scope; revisit if this becomes a real workflow gap.

## Migration Plan

1. Schema migration: `ALTER TABLE "Note" ADD COLUMN "searchText" TEXT NOT NULL DEFAULT ''`, add the generated `searchVector` column (derived from `title`/`searchText`), and add the GIN index on it.
2. Application change: `NotesService.createNote`/`updateNote` start computing and writing `searchText` via `extractSearchText`, so every new note and every edited note gets a correct `searchText` (and, transitively, `searchVector`) from that point on.
3. Post-deploy, one-off step: run the backfill script (`apps/api/src/scripts/backfill-search-text.ts`) once against the target database to populate `searchText` for notes that existed before step 2 shipped. Idempotent — safe to re-run.
4. Purely additive at the schema level — no existing column, index, or endpoint changes. Steps 1–3 can land before the `GET /notes/search` route does.
5. **Rollback:** drop the GIN index, the generated `searchVector` column, and the `searchText` column, in that order — a straightforward down-migration with no impact on `title`/`content` or any existing query path. The `GET /notes/search` route, and the `searchText` write in `createNote`/`updateNote`, can each be reverted independently of the schema migration if only the endpoint or the write-path change needs to be pulled back.
