import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { fetchNotes, type FetchNotesParams } from "../api/notes-api.js";

export interface UseNotesQueryOptions {
  /** Set to false to skip the request, e.g. while a search query is active. Defaults to true. */
  enabled?: boolean;
}

export function useNotesQuery(params: FetchNotesParams, options: UseNotesQueryOptions = {}) {
  const sortedTags = [...params.tags].sort();

  return useQuery({
    queryKey: ["notes", { ...params, tags: sortedTags }],
    queryFn: () => fetchNotes(params),
    enabled: options.enabled ?? true,
    placeholderData: keepPreviousData,
  });
}
