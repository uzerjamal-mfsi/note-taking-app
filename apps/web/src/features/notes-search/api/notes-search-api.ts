import type { PaginatedSearchResultsDto } from "@note-taking-app/shared";
import { apiFetch } from "../../../lib/api-client.js";

export interface FetchSearchResultsParams {
  q: string;
  page: number;
  pageSize: number;
}

export function fetchSearchResults(
  params: FetchSearchResultsParams,
): Promise<PaginatedSearchResultsDto> {
  const query = new URLSearchParams();
  query.set("q", params.q);
  query.set("page", String(params.page));
  query.set("pageSize", String(params.pageSize));

  return apiFetch<PaginatedSearchResultsDto>(`/notes/search?${query.toString()}`);
}
