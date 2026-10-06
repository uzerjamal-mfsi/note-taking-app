import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ShareLinkDto } from "@note-taking-app/shared";
import type { NormalizedApiError } from "../../../lib/api-client.js";
import { createShareLink, getShareLink, revokeShareLink } from "../api/sharing-api.js";

export function shareLinkQueryKey(noteId: string) {
  return ["notes", noteId, "share"] as const;
}

export interface UseShareLinkQueryOptions {
  /** Only fetch while the Share modal is open. */
  enabled: boolean;
}

export function useShareLinkQuery(noteId: string, options: UseShareLinkQueryOptions) {
  return useQuery<ShareLinkDto | null, NormalizedApiError>({
    queryKey: shareLinkQueryKey(noteId),
    queryFn: () => getShareLink(noteId),
    enabled: options.enabled,
    staleTime: 0,
  });
}

export function useCreateShareLinkMutation(noteId: string) {
  const queryClient = useQueryClient();

  return useMutation<ShareLinkDto, NormalizedApiError, string | undefined>({
    mutationFn: (expiresAt) => createShareLink(noteId, expiresAt),
    onSuccess: (link) => {
      queryClient.setQueryData(shareLinkQueryKey(noteId), link);
      void queryClient.invalidateQueries({ queryKey: shareLinkQueryKey(noteId) });
    },
  });
}

export function useRevokeShareLinkMutation(noteId: string) {
  const queryClient = useQueryClient();

  return useMutation<void, NormalizedApiError>({
    mutationFn: async () => {
      try {
        await revokeShareLink(noteId);
      } catch (error) {
        // 404: the link is already gone or expired - the desired end state.
        if ((error as Partial<NormalizedApiError>).status !== 404) {
          throw error;
        }
      }
    },
    onSuccess: () => {
      queryClient.setQueryData(shareLinkQueryKey(noteId), null);
      void queryClient.invalidateQueries({ queryKey: shareLinkQueryKey(noteId) });
    },
  });
}
