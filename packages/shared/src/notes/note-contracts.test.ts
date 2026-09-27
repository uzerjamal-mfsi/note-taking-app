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

const TAG_ID = "3fa85f64-5717-4562-b3fc-2c963f66afa6";
const OTHER_TAG_ID = "3fa85f64-5717-4562-b3fc-2c963f66afa7";

describe("createNoteRequestSchema", () => {
  it("accepts a valid non-empty content doc", () => {
    const result = createNoteRequestSchema.safeParse({ content: VALID_DOC });

    expect(result.success).toBe(true);
  });

  it("accepts an omitted tagIds", () => {
    const result = createNoteRequestSchema.safeParse({ content: VALID_DOC });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.tagIds).toBeUndefined();
    }
  });

  it("accepts a tagIds array of UUID strings", () => {
    const result = createNoteRequestSchema.safeParse({
      content: VALID_DOC,
      tagIds: [TAG_ID, OTHER_TAG_ID],
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.tagIds).toEqual([TAG_ID, OTHER_TAG_ID]);
    }
  });

  it("accepts an empty tagIds array", () => {
    const result = createNoteRequestSchema.safeParse({ content: VALID_DOC, tagIds: [] });

    expect(result.success).toBe(true);
  });

  it("rejects a tagIds entry that is not a UUID string", () => {
    const result = createNoteRequestSchema.safeParse({
      content: VALID_DOC,
      tagIds: ["not-a-uuid"],
    });

    expect(result.success).toBe(false);
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

  it("accepts an omitted tagIds", () => {
    const result = updateNoteRequestSchema.safeParse({ content: VALID_DOC });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.tagIds).toBeUndefined();
    }
  });

  it("accepts a tagIds array of UUID strings", () => {
    const result = updateNoteRequestSchema.safeParse({
      content: VALID_DOC,
      tagIds: [TAG_ID],
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.tagIds).toEqual([TAG_ID]);
    }
  });

  it("rejects a tagIds entry that is not a UUID string", () => {
    const result = updateNoteRequestSchema.safeParse({
      content: VALID_DOC,
      tagIds: ["not-a-uuid"],
    });

    expect(result.success).toBe(false);
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
  it("accepts id, title, content, createdAt, updatedAt, tags", () => {
    const result = noteDtoSchema.safeParse({
      id: "note-1",
      title: "Hello",
      content: VALID_DOC,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      tags: [{ id: TAG_ID, name: "work", color: "#FF8800" }],
    });

    expect(result.success).toBe(true);
  });

  it("accepts an empty tags array", () => {
    const result = noteDtoSchema.safeParse({
      id: "note-1",
      title: "Hello",
      content: VALID_DOC,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      tags: [],
    });

    expect(result.success).toBe(true);
  });

  it("rejects a payload missing title", () => {
    const result = noteDtoSchema.safeParse({
      id: "note-1",
      content: VALID_DOC,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      tags: [],
    });

    expect(result.success).toBe(false);
  });

  it("rejects a payload missing tags", () => {
    const result = noteDtoSchema.safeParse({
      id: "note-1",
      title: "Hello",
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
