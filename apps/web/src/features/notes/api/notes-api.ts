import type { NoteDto, PaginatedNotesDto } from "@note-taking-app/shared";
import { apiFetch } from "../../../lib/api-client.js";
import type { NotesSortBy, NotesSortDir } from "../hooks/use-notes-list-params.js";
import type { ProseMirrorDoc } from "../hooks/note-content-split.js";

export interface UpdateNotePayload {
  content: ProseMirrorDoc;
  tagIds?: string[];
}

export interface FetchNotesParams {
  page: number;
  sortBy: NotesSortBy;
  sortDir: NotesSortDir;
  tags: string[];
}

export function fetchNotes(params: FetchNotesParams): Promise<PaginatedNotesDto> {
  const query = new URLSearchParams();
  query.set("page", String(params.page));
  query.set("sortBy", params.sortBy);
  query.set("sortDir", params.sortDir);
  if (params.tags.length > 0) {
    query.set("tags", params.tags.join(","));
  }

  return apiFetch<PaginatedNotesDto>(`/notes?${query.toString()}`);
}

export function getNote(id: string): Promise<NoteDto> {
  return apiFetch<NoteDto>(`/notes/${id}`);
}

export function createNote(content: ProseMirrorDoc): Promise<NoteDto> {
  return apiFetch<NoteDto>("/notes", {
    method: "POST",
    body: JSON.stringify({ content }),
  });
}

export function updateNote(id: string, payload: UpdateNotePayload): Promise<NoteDto> {
  return apiFetch<NoteDto>(`/notes/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function deleteNote(id: string): Promise<void> {
  return apiFetch<void>(`/notes/${id}`, { method: "DELETE" });
}
