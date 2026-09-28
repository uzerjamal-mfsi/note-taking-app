import type { TagDto } from "@note-taking-app/shared";
import { apiFetch } from "../../../lib/api-client.js";

export function fetchTags(): Promise<TagDto[]> {
  return apiFetch<TagDto[]>("/tags");
}
