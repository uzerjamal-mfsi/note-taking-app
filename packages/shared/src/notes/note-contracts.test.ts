import { describe, expect, it } from "vitest";
import {
  MAX_CONTENT_DEPTH,
  createNoteRequestSchema,
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
