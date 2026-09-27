import type { MatchRange, SearchNotesQuery } from "@note-taking-app/shared";
import type { NoteTagRef, NotesSearchRepository } from "./notes-search-repository.js";
import { parseSentinelHighlight } from "./sentinel-highlight.js";

export interface SearchResult {
  id: string;
  title: string;
  titleMatches: MatchRange[];
  snippet: string;
  snippetMatches: MatchRange[];
  createdAt: Date;
  updatedAt: Date;
  tags: NoteTagRef[];
}

export interface SearchNotesResult {
  results: SearchResult[];
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export class NotesSearchService {
  constructor(private readonly repository: NotesSearchRepository) {}

  async search(userId: string, query: SearchNotesQuery): Promise<SearchNotesResult> {
    const { results, total } = await this.repository.search(userId, query);
    const totalPages = total === 0 ? 0 : Math.ceil(total / query.pageSize);

    return {
      results: results.map((row) => {
        const title = parseSentinelHighlight(row.titleHighlighted);
        const snippet = parseSentinelHighlight(row.snippetHighlighted);

        return {
          id: row.id,
          title: title.text,
          titleMatches: title.ranges,
          snippet: snippet.text,
          snippetMatches: snippet.ranges,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
          tags: row.tags,
        };
      }),
      total,
      totalPages,
      hasNextPage: query.page < totalPages,
      hasPreviousPage: query.page > 1,
    };
  }
}
