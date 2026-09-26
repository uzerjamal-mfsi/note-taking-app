import { describe, expect, it } from "vitest";
import {
  MAX_CONTENT_DEPTH,
  createNoteRequestSchema,
  listNotesQuerySchema,
  noteDtoSchema,
  updateNoteRequestSchema,
} from "./note-contracts.js";

function docWithDepth(depth: number): unknown {
  // Depth 1 is `{ type: "doc", content: [{ type: "paragraph", content: [text] }] }`.
  let node: Record<string, unknown> = { type: "text", text: "leaf" };
  for (let i = 0; i < depth - 1; i += 1) {
    node = { type: "node", content: [node] };
  }
  return { type: "doc", content: [node] };
}

const VALID_DOC = {
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text: "Hello" }] }],
};

describe("createNoteRequestSchema", () => {
  it("accepts a valid non-empty content doc", () => {
    const result = createNoteRequestSchema.safeParse({ content: VALID_DOC });

    expect(result.success).toBe(true);
  });

  it("rejects a payload missing content", () => {
    const result = createNoteRequestSchema.safeParse({});

    expect(result.success).toBe(false);
  });

  it("rejects content with no top-level nodes", () => {
    const result = createNoteRequestSchema.safeParse({ content: { type: "doc", content: [] } });

    expect(result.success).toBe(false);
  });

  it("accepts content nested exactly at MAX_CONTENT_DEPTH", () => {
    const result = createNoteRequestSchema.safeParse({ content: docWithDepth(MAX_CONTENT_DEPTH) });

    expect(result.success).toBe(true);
  });

  it("rejects content nested one level beyond MAX_CONTENT_DEPTH", () => {
    const result = createNoteRequestSchema.safeParse({
      content: docWithDepth(MAX_CONTENT_DEPTH + 1),
    });

    expect(result.success).toBe(false);
  });
});

describe("updateNoteRequestSchema", () => {
  it("accepts a valid non-empty content doc", () => {
    const result = updateNoteRequestSchema.safeParse({ content: VALID_DOC });

    expect(result.success).toBe(true);
  });

  it("rejects a payload with empty content", () => {
    const result = updateNoteRequestSchema.safeParse({ content: { type: "doc", content: [] } });

    expect(result.success).toBe(false);
  });

  it("rejects content nested one level beyond MAX_CONTENT_DEPTH", () => {
    const result = updateNoteRequestSchema.safeParse({
      content: docWithDepth(MAX_CONTENT_DEPTH + 1),
    });

    expect(result.success).toBe(false);
  });
});

describe("noteDtoSchema", () => {
  it("accepts id, title, content, createdAt, updatedAt", () => {
    const result = noteDtoSchema.safeParse({
      id: "note-1",
      title: "Hello",
      content: VALID_DOC,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    expect(result.success).toBe(true);
  });

  it("rejects a payload missing title", () => {
    const result = noteDtoSchema.safeParse({
      id: "note-1",
      content: VALID_DOC,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    expect(result.success).toBe(false);
  });
});

describe("listNotesQuerySchema", () => {
  it("defaults page, pageSize, sortBy, sortDir, and tags when the query is empty", () => {
    const result = listNotesQuerySchema.safeParse({});

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({
        page: 1,
        pageSize: 20,
        sortBy: "updatedAt",
        sortDir: "desc",
        tags: undefined,
      });
    }
  });

  it("accepts valid overrides for every field", () => {
    const result = listNotesQuerySchema.safeParse({
      page: "2",
      pageSize: "50",
      sortBy: "createdAt",
      sortDir: "asc",
      tags: "work",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({
        page: 2,
        pageSize: 50,
        sortBy: "createdAt",
        sortDir: "asc",
        tags: ["work"],
      });
    }
  });

  it("rejects pageSize above 100", () => {
    const result = listNotesQuerySchema.safeParse({ pageSize: "101" });

    expect(result.success).toBe(false);
  });

  it("rejects an unknown sortBy", () => {
    const result = listNotesQuerySchema.safeParse({ sortBy: "title" });

    expect(result.success).toBe(false);
  });

  it("rejects an unknown sortDir", () => {
    const result = listNotesQuerySchema.safeParse({ sortDir: "sideways" });

    expect(result.success).toBe(false);
  });

  it("rejects a non-integer page", () => {
    const result = listNotesQuerySchema.safeParse({ page: "1.5" });

    expect(result.success).toBe(false);
  });

  it("rejects a non-integer pageSize", () => {
    const result = listNotesQuerySchema.safeParse({ pageSize: "abc" });

    expect(result.success).toBe(false);
  });

  it("splits a comma-separated tags list", () => {
    const result = listNotesQuerySchema.safeParse({ tags: "work,personal" });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.tags).toEqual(["work", "personal"]);
    }
  });

  it("trims whitespace and drops empty tokens from tags", () => {
    const result = listNotesQuerySchema.safeParse({ tags: " work ,,personal" });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.tags).toEqual(["work", "personal"]);
    }
  });

  it("rejects more than 10 non-blank tag names", () => {
    const tags = Array.from({ length: 11 }, (_, i) => `tag${i}`).join(",");
    const result = listNotesQuerySchema.safeParse({ tags });

    expect(result.success).toBe(false);
  });

  it("accepts exactly 10 non-blank tag names", () => {
    const tags = Array.from({ length: 10 }, (_, i) => `tag${i}`).join(",");
    const result = listNotesQuerySchema.safeParse({ tags });

    expect(result.success).toBe(true);
  });
});
