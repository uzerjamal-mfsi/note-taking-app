import { useQuery } from "@tanstack/react-query";
import type { NoteVersionDto, NoteVersionSummaryDto } from "@note-taking-app/shared";
import type { NormalizedApiError } from "../../../lib/api-client.js";
import { getNoteVersion, listNoteVersions } from "../api/notes-history-api.js";

export function noteVersionsQueryKey(noteId: string) {
  return ["notes", noteId, "versions"] as const;
}

export function noteVersionQueryKey(noteId: string, versionId: string) {
  return ["notes", noteId, "versions", versionId] as const;
}

export interface UseNoteVersionsQueryOptions {
  /** Only fetch while the History drawer is open. */
  enabled: boolean;
}

export function useNoteVersionsQuery(noteId: string, options: UseNoteVersionsQueryOptions) {
  return useQuery<NoteVersionSummaryDto[], NormalizedApiError>({
    queryKey: noteVersionsQueryKey(noteId),
    queryFn: () => listNoteVersions(noteId),
    enabled: options.enabled,
    staleTime: 0,
    // No automatic retry: the drawer has an explicit Retry action, and a 404 (note or
    // version gone) can never succeed on retry.
    retry: false,
  });
}

export function useNoteVersionQuery(noteId: string, versionId: string | null) {
  return useQuery<NoteVersionDto, NormalizedApiError>({
    queryKey: noteVersionQueryKey(noteId, versionId ?? ""),
    queryFn: () => getNoteVersion(noteId, versionId as string),
    enabled: versionId !== null,
    // A version is an immutable snapshot, so a cached copy never goes stale.
    staleTime: Infinity,
    // No automatic retry: the drawer has an explicit Retry action, and a 404 (note or
    // version gone) can never succeed on retry.
    retry: false,
  });
}
