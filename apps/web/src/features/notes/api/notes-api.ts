import type { PaginatedNotesDto } from "@note-taking-app/shared";
import { apiFetch } from "../../../lib/api-client.js";
import type { NotesSortBy, NotesSortDir } from "../hooks/use-notes-list-params.js";

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
