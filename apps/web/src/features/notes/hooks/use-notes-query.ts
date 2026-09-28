import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { fetchNotes, type FetchNotesParams } from "../api/notes-api.js";

export function useNotesQuery(params: FetchNotesParams) {
  const sortedTags = [...params.tags].sort();

  return useQuery({
    queryKey: ["notes", { ...params, tags: sortedTags }],
    queryFn: () => fetchNotes(params),
    placeholderData: keepPreviousData,
  });
}
