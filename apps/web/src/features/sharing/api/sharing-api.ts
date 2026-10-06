import type { ShareLinkDto, SharedNotePublicDto } from "@note-taking-app/shared";
import { apiFetch, type NormalizedApiError } from "../../../lib/api-client.js";

function isNotFound(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as Partial<NormalizedApiError>).status === 404
  );
}

/** Resolves `null` when the note has no active share link (the API's 404), rethrows anything else. */
export async function getShareLink(noteId: string): Promise<ShareLinkDto | null> {
  try {
    return await apiFetch<ShareLinkDto>(`/notes/${noteId}/share`);
  } catch (error) {
    if (isNotFound(error)) {
      return null;
    }
    throw error;
  }
}

export function createShareLink(noteId: string, expiresAt?: string): Promise<ShareLinkDto> {
  return apiFetch<ShareLinkDto>(`/notes/${noteId}/share`, {
    method: "POST",
    body: JSON.stringify(expiresAt === undefined ? {} : { expiresAt }),
  });
}

export function revokeShareLink(noteId: string): Promise<void> {
  return apiFetch<void>(`/notes/${noteId}/share`, { method: "DELETE" });
}

export function getSharedNote(token: string): Promise<SharedNotePublicDto> {
  return apiFetch<SharedNotePublicDto>(
    `/shared/${encodeURIComponent(token)}`,
    {},
    { skipAuth: true },
  );
}
