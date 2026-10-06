import { useSearchParams } from "react-router";

export const NOTES_SORT_BY_VALUES = ["updatedAt", "createdAt"] as const;
export type NotesSortBy = (typeof NOTES_SORT_BY_VALUES)[number];

export const NOTES_SORT_DIR_VALUES = ["asc", "desc"] as const;
export type NotesSortDir = (typeof NOTES_SORT_DIR_VALUES)[number];

export interface NotesListParams {
  page: number;
  sortBy: NotesSortBy;
  sortDir: NotesSortDir;
  tags: string[];
  q: string;
}

const DEFAULT_PAGE = 1;
const DEFAULT_SORT_BY: NotesSortBy = "updatedAt";
const DEFAULT_SORT_DIR: NotesSortDir = "desc";
const DEFAULT_QUERY = "";

function parseQuery(value: string | null): string {
  return value === null ? DEFAULT_QUERY : value.trim();
}

function parsePage(value: string | null): number {
  if (value === null) return DEFAULT_PAGE;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_PAGE;
}

function parseSortBy(value: string | null): NotesSortBy {
  return (NOTES_SORT_BY_VALUES as readonly string[]).includes(value ?? "")
    ? (value as NotesSortBy)
    : DEFAULT_SORT_BY;
}

function parseSortDir(value: string | null): NotesSortDir {
  return (NOTES_SORT_DIR_VALUES as readonly string[]).includes(value ?? "")
    ? (value as NotesSortDir)
    : DEFAULT_SORT_DIR;
}

function parseTags(value: string | null): string[] {
  if (value === null) return [];
  const names = value
    .split(",")
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);
  return Array.from(new Set(names));
}

export interface UseNotesListParamsResult extends NotesListParams {
  setPage: (page: number) => void;
  setSort: (sortBy: NotesSortBy, sortDir: NotesSortDir) => void;
  toggleTag: (tagName: string) => void;
  clearFilters: () => void;
  setQuery: (q: string) => void;
}

export function useNotesListParams(): UseNotesListParamsResult {
  const [searchParams, setSearchParams] = useSearchParams();

  const page = parsePage(searchParams.get("page"));
  const sortBy = parseSortBy(searchParams.get("sortBy"));
  const sortDir = parseSortDir(searchParams.get("sortDir"));
  const tags = parseTags(searchParams.get("tags"));
  const q = parseQuery(searchParams.get("q"));

  function writeParams(next: Partial<NotesListParams>) {
    const merged: NotesListParams = { page, sortBy, sortDir, tags, q, ...next };
    const nextSearchParams = new URLSearchParams();
    nextSearchParams.set("page", String(merged.page));
    nextSearchParams.set("sortBy", merged.sortBy);
    nextSearchParams.set("sortDir", merged.sortDir);
    if (merged.tags.length > 0) {
      nextSearchParams.set("tags", merged.tags.join(","));
    }
    if (merged.q.length > 0) {
      nextSearchParams.set("q", merged.q);
    }
    setSearchParams(nextSearchParams);
  }

  function setPage(nextPage: number) {
    writeParams({ page: nextPage });
  }

  function setSort(nextSortBy: NotesSortBy, nextSortDir: NotesSortDir) {
    writeParams({ sortBy: nextSortBy, sortDir: nextSortDir, page: DEFAULT_PAGE });
  }

  function toggleTag(tagName: string) {
    const nextTags = tags.includes(tagName)
      ? tags.filter((tag) => tag !== tagName)
      : [...tags, tagName];
    writeParams({ tags: nextTags, page: DEFAULT_PAGE });
  }

  function clearFilters() {
    writeParams({ tags: [], page: DEFAULT_PAGE });
  }

  function setQuery(nextQuery: string) {
    writeParams({ q: nextQuery.trim(), page: DEFAULT_PAGE });
  }

  return { page, sortBy, sortDir, tags, q, setPage, setSort, toggleTag, clearFilters, setQuery };
}
