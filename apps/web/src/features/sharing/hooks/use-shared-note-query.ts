import { useQuery } from "@tanstack/react-query";
import type { SharedNotePublicDto } from "@note-taking-app/shared";
import type { NormalizedApiError } from "../../../lib/api-client.js";
import { getSharedNote } from "../api/sharing-api.js";

/**
 * Every successful GET /shared/:token increments the owner's view count, so this query
 * never retries (a retried 429 would make rate limiting worse) and never refetches on focus.
 */
export function useSharedNoteQuery(token: string) {
  return useQuery<SharedNotePublicDto, NormalizedApiError>({
    queryKey: ["shared-note", token],
    queryFn: () => getSharedNote(token),
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    staleTime: Infinity,
  });
}
