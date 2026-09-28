import { describe, expect, it } from "vitest";
import {
  noteVersionParamSchema,
  noteVersionResponseSchema,
  noteVersionSummaryResponseSchema,
} from "./notes-history-contracts.js";

describe("noteVersionParamSchema", () => {
  it("accepts a note id and version id", () => {
    const result = noteVersionParamSchema.safeParse({ id: "note-1", versionId: "version-1" });

    expect(result.success).toBe(true);
  });

  it("rejects a missing versionId", () => {
    const result = noteVersionParamSchema.safeParse({ id: "note-1" });

    expect(result.success).toBe(false);
  });

  it("rejects an empty versionId", () => {
    const result = noteVersionParamSchema.safeParse({ id: "note-1", versionId: "" });

    expect(result.success).toBe(false);
  });
});

describe("noteVersionSummaryResponseSchema", () => {
  it("accepts metadata without content", () => {
    const result = noteVersionSummaryResponseSchema.safeParse({
      id: "version-1",
      noteId: "note-1",
      title: "Grocery list",
      createdAt: new Date().toISOString(),
    });

    expect(result.success).toBe(true);
  });

  it("strips a content field, consistent with the package's other DTO schemas", () => {
    const result = noteVersionSummaryResponseSchema.safeParse({
      id: "version-1",
      noteId: "note-1",
      title: "Grocery list",
      createdAt: new Date().toISOString(),
      content: { type: "doc", content: [] },
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).not.toHaveProperty("content");
    }
  });
});

describe("noteVersionResponseSchema", () => {
  it("accepts metadata plus content", () => {
    const result = noteVersionResponseSchema.safeParse({
      id: "version-1",
      noteId: "note-1",
      title: "Grocery list",
      createdAt: new Date().toISOString(),
      content: { type: "doc", content: [] },
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.content).toEqual({ type: "doc", content: [] });
    }
  });

  it("rejects a missing content field", () => {
    const result = noteVersionResponseSchema.safeParse({
      id: "version-1",
      noteId: "note-1",
      title: "Grocery list",
      createdAt: new Date().toISOString(),
    });

    expect(result.success).toBe(false);
  });
});
