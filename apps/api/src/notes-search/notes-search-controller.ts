import type { Request, Response } from "express";
import type { PaginatedSearchResultsDto, SearchNotesQuery } from "@note-taking-app/shared";
import type { SearchResult } from "./notes-search-service.js";
import type { NotesSearchService } from "./notes-search-service.js";

function toDto(result: SearchResult): PaginatedSearchResultsDto["data"][number] {
  return {
    id: result.id,
    title: result.title,
    titleMatches: result.titleMatches,
    snippet: result.snippet,
    snippetMatches: result.snippetMatches,
    createdAt: result.createdAt.toISOString(),
    updatedAt: result.updatedAt.toISOString(),
    tags: result.tags,
  };
}

export class NotesSearchController {
  constructor(private readonly service: NotesSearchService) {}

  search = async (req: Request, res: Response): Promise<void> => {
    const query = req.query as unknown as SearchNotesQuery;
    const { results, total, totalPages, hasNextPage, hasPreviousPage } = await this.service.search(
      req.user!.id,
      query,
    );

    const body: PaginatedSearchResultsDto = {
      data: results.map(toDto),
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages,
        hasNextPage,
        hasPreviousPage,
      },
    };
    res.status(200).json(body);
  };
}
