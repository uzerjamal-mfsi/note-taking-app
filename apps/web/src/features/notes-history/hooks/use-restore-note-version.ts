import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { NoteDto } from "@note-taking-app/shared";
import type { NormalizedApiError } from "../../../lib/api-client.js";
import { restoreNoteVersion } from "../api/notes-history-api.js";
import { noteVersionsQueryKey } from "./use-note-versions.js";

export function useRestoreNoteVersionMutation(noteId: string) {
  const queryClient = useQueryClient();

  return useMutation<NoteDto, NormalizedApiError, string>({
    mutationFn: (versionId) => restoreNoteVersion(noteId, versionId),
    onSuccess: (note) => {
      queryClient.setQueryData(["note", noteId], note);
      void queryClient.invalidateQueries({ queryKey: noteVersionsQueryKey(noteId) });
      void queryClient.invalidateQueries({ queryKey: ["notes"] });
    },
  });
}
