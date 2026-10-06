import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { fetchSearchResults, type FetchSearchResultsParams } from "../api/notes-search-api.js";

export function useSearchQuery(params: FetchSearchResultsParams) {
  return useQuery({
    queryKey: ["notes-search", params],
    queryFn: () => fetchSearchResults(params),
    enabled: params.q.trim().length > 0,
    placeholderData: keepPreviousData,
  });
}
