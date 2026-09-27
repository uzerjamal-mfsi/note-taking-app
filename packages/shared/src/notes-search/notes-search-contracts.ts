import { z } from "zod";
import {
  MAX_LIST_NOTES_PAGE_SIZE,
  noteTagRefDtoSchema,
  paginationMetaSchema,
} from "../notes/note-contracts.js";

export const MAX_SEARCH_QUERY_LENGTH = 200;

export const searchNotesQuerySchema = z.object({
  q: z.string().trim().min(1).max(MAX_SEARCH_QUERY_LENGTH),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(MAX_LIST_NOTES_PAGE_SIZE).default(20),
});
export type SearchNotesQuery = z.infer<typeof searchNotesQuerySchema>;

export const matchRangeSchema = z.object({
  start: z.number().int().nonnegative(),
  end: z.number().int().nonnegative(),
});
export type MatchRange = z.infer<typeof matchRangeSchema>;

export const searchResultDtoSchema = z.object({
  id: z.string(),
  title: z.string(),
  titleMatches: z.array(matchRangeSchema),
  snippet: z.string(),
  snippetMatches: z.array(matchRangeSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
  tags: z.array(noteTagRefDtoSchema),
});
export type SearchResultDto = z.infer<typeof searchResultDtoSchema>;

export const paginatedSearchResultsDtoSchema = z.object({
  data: z.array(searchResultDtoSchema),
  meta: paginationMetaSchema,
});
export type PaginatedSearchResultsDto = z.infer<typeof paginatedSearchResultsDtoSchema>;
