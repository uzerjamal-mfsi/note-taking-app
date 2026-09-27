import type { Prisma, PrismaClient } from "@note-taking-app/db";
import type { SearchNotesQuery } from "@note-taking-app/shared";
import { NOTE_TAGS_SELECT } from "../notes/notes-repository.js";

export interface NoteTagRef {
  id: string;
  name: string;
  color: string;
}

export interface SearchResultRow {
  id: string;
  /** Raw ts_headline output for the title, sentinel-delimited (see sentinel-highlight.ts). */
  titleHighlighted: string;
  /** Raw ts_headline output for a body snippet, sentinel-delimited. */
  snippetHighlighted: string;
  createdAt: Date;
  updatedAt: Date;
  tags: NoteTagRef[];
}

export interface SearchNotesResult {
  /** Already ordered by relevance (ts_rank_cd desc, id desc). */
  results: SearchResultRow[];
  total: number;
}

interface RawSearchRow {
  id: string;
  titleHighlighted: string;
  snippetHighlighted: string;
  createdAt: Date;
  updatedAt: Date;
}

export class NotesSearchRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async search(userId: string, query: SearchNotesQuery): Promise<SearchNotesResult> {
    const { q, page, pageSize } = query;

    const emptyQueryRows = await this.prisma.$queryRaw<{ isEmpty: boolean }[]>`
      SELECT numnode(websearch_to_tsquery('english', ${q})) = 0 AS "isEmpty"
    `;
    if (emptyQueryRows[0]?.isEmpty) {
      return { results: [], total: 0 };
    }

    const offset = (page - 1) * pageSize;

    return this.prisma.$transaction(async (tx) => {
      const countRows = await tx.$queryRaw<{ total: bigint }[]>`
        WITH q AS (SELECT websearch_to_tsquery('english', ${q}) AS tsq)
        SELECT count(*)::bigint AS total
        FROM "Note", q
        WHERE "userId" = ${userId}
          AND "deletedAt" IS NULL
          AND "searchVector" @@ q.tsq
      `;
      const rawRows = await tx.$queryRaw<RawSearchRow[]>`
        WITH q AS (SELECT websearch_to_tsquery('english', ${q}) AS tsq)
        SELECT
          id,
          -- Postgres's default text-search parser recognizes "<...>" as an
          -- HTML tag token and ts_headline silently drops such tokens from
          -- its output. chr(3)/chr(4) stand in for '<'/'>' (a length-preserving,
          -- 1:1 substitution, so match offsets stay correct) so a literal tag
          -- in a note's own text can't be mistaken for markup and stripped;
          -- they're substituted back immediately after ts_headline runs. Any
          -- chr(1)-chr(4) already present in the note's own text is stripped
          -- first, so it can never be confused with our own sentinels/placeholders
          -- during the reverse substitution.
          replace(replace(
            ts_headline(
              'english',
              replace(replace(
                replace(replace(replace(replace(title, chr(1), ''), chr(2), ''), chr(3), ''), chr(4), ''),
                '<', chr(3)), '>', chr(4)),
              q.tsq,
              'StartSel=' || chr(1) || ', StopSel=' || chr(2) || ', HighlightAll=true, MaxFragments=0'
            ), chr(3), '<'), chr(4), '>'
          ) AS "titleHighlighted",
          replace(replace(
            ts_headline(
              'english',
              replace(replace(
                replace(replace(replace(replace("searchText", chr(1), ''), chr(2), ''), chr(3), ''), chr(4), ''),
                '<', chr(3)), '>', chr(4)),
              q.tsq,
              'StartSel=' || chr(1) || ', StopSel=' || chr(2) || ', MaxFragments=1, MinWords=5, MaxWords=15'
            ), chr(3), '<'), chr(4), '>'
          ) AS "snippetHighlighted",
          "createdAt",
          "updatedAt"
        FROM "Note", q
        WHERE "userId" = ${userId}
          AND "deletedAt" IS NULL
          AND "searchVector" @@ q.tsq
        ORDER BY ts_rank_cd("searchVector", q.tsq) DESC, id DESC
        LIMIT ${pageSize}
        OFFSET ${offset}
      `;

      // count(*) always returns exactly one row, so the fallback below is
      // unreachable in practice; kept only to satisfy the type checker.
      /* v8 ignore next */
      const total = Number(countRows[0]?.total ?? 0);
      const ids = rawRows.map((row) => row.id);
      const tagsById =
        ids.length > 0 ? await this.fetchTagsByNoteId(tx, ids) : new Map<string, NoteTagRef[]>();

      const results: SearchResultRow[] = rawRows.map((row) => ({
        id: row.id,
        titleHighlighted: row.titleHighlighted,
        snippetHighlighted: row.snippetHighlighted,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        // Every id here came from a Note row that was just read in this same
        // transaction; absent only under an extremely narrow delete race.
        /* v8 ignore next */
        tags: tagsById.get(row.id) ?? [],
      }));

      return { results, total };
    });
  }

  private async fetchTagsByNoteId(
    tx: Prisma.TransactionClient,
    noteIds: string[],
  ): Promise<Map<string, NoteTagRef[]>> {
    const notes = await tx.note.findMany({
      where: { id: { in: noteIds } },
      select: { id: true, tags: NOTE_TAGS_SELECT },
    });

    return new Map(notes.map((note) => [note.id, note.tags.map(({ tag }) => tag)]));
  }
}
