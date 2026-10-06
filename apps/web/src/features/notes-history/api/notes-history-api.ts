import type { NoteDto, NoteVersionDto, NoteVersionSummaryDto } from "@note-taking-app/shared";
import { apiFetch } from "../../../lib/api-client.js";

export function listNoteVersions(noteId: string): Promise<NoteVersionSummaryDto[]> {
  return apiFetch<NoteVersionSummaryDto[]>(`/notes/${noteId}/versions`);
}

export function getNoteVersion(noteId: string, versionId: string): Promise<NoteVersionDto> {
  return apiFetch<NoteVersionDto>(`/notes/${noteId}/versions/${versionId}`);
}

export function restoreNoteVersion(noteId: string, versionId: string): Promise<NoteDto> {
  return apiFetch<NoteDto>(`/notes/${noteId}/versions/${versionId}/restore`, { method: "POST" });
}
