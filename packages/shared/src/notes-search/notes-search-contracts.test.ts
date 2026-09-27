import { describe, expect, it } from "vitest";
import {
  paginatedSearchResultsDtoSchema,
  searchNotesQuerySchema,
  searchResultDtoSchema,
} from "./notes-search-contracts.js";

const TAG_ID = "3fa85f64-5717-4562-b3fc-2c963f66afa6";

describe("searchNotesQuerySchema", () => {
  it("accepts a valid q and defaults page/pageSize", () => {
    const result = searchNotesQuerySchema.safeParse({ q: "grocery" });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ q: "grocery", page: 1, pageSize: 20 });
    }
  });

  it("trims surrounding whitespace from q", () => {
    const result = searchNotesQuerySchema.safeParse({ q: "  grocery  " });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.q).toBe("grocery");
    }
  });

  it("rejects a missing q", () => {
    const result = searchNotesQuerySchema.safeParse({});

    expect(result.success).toBe(false);
  });

  it("rejects a q that is blank after trimming", () => {
    const result = searchNotesQuerySchema.safeParse({ q: "   " });

    expect(result.success).toBe(false);
  });

  it("accepts a q of exactly 200 characters", () => {
    const result = searchNotesQuerySchema.safeParse({ q: "a".repeat(200) });

    expect(result.success).toBe(true);
  });

  it("rejects a q longer than 200 characters", () => {
    const result = searchNotesQuerySchema.safeParse({ q: "a".repeat(201) });

    expect(result.success).toBe(false);
  });

  it("accepts valid overrides for page/pageSize", () => {
    const result = searchNotesQuerySchema.safeParse({ q: "note", page: "2", pageSize: "50" });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ q: "note", page: 2, pageSize: 50 });
    }
  });

  it("rejects pageSize above 100", () => {
    const result = searchNotesQuerySchema.safeParse({ q: "note", pageSize: "101" });

    expect(result.success).toBe(false);
  });

  it("rejects a non-integer page", () => {
    const result = searchNotesQuerySchema.safeParse({ q: "note", page: "1.5" });

    expect(result.success).toBe(false);
  });
});

describe("searchResultDtoSchema", () => {
  const VALID_RESULT = {
    id: "note-1",
    title: "Grocery list",
    titleMatches: [{ start: 0, end: 7 }],
    snippet: "Buy eggs and milk",
    snippetMatches: [{ start: 4, end: 8 }],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    tags: [{ id: TAG_ID, name: "work", color: "#FF8800" }],
  };

  it("accepts a full result with match ranges", () => {
    const result = searchResultDtoSchema.safeParse(VALID_RESULT);

    expect(result.success).toBe(true);
  });

  it("accepts empty match ranges when a field didn't match", () => {
    const result = searchResultDtoSchema.safeParse({
      ...VALID_RESULT,
      titleMatches: [],
    });

    expect(result.success).toBe(true);
  });

  it("rejects a payload missing snippet", () => {
    const { snippet: _snippet, ...withoutSnippet } = VALID_RESULT;
    const result = searchResultDtoSchema.safeParse(withoutSnippet);

    expect(result.success).toBe(false);
  });
});

describe("paginatedSearchResultsDtoSchema", () => {
  it("accepts a data/meta envelope matching the notes list shape", () => {
    const result = paginatedSearchResultsDtoSchema.safeParse({
      data: [],
      meta: {
        page: 1,
        pageSize: 20,
        total: 0,
        totalPages: 0,
        hasNextPage: false,
        hasPreviousPage: false,
      },
    });

    expect(result.success).toBe(true);
  });
});
