import { describe, expect, it } from "vitest";
import {
  generateShareLinkRequestSchema,
  shareLinkDtoSchema,
  sharedNotePublicDtoSchema,
} from "./sharing-contracts.js";

describe("generateShareLinkRequestSchema", () => {
  it("accepts an empty body (no expiresAt)", () => {
    const result = generateShareLinkRequestSchema.safeParse({});

    expect(result.success).toBe(true);
  });

  it("accepts a future ISO expiresAt", () => {
    const future = new Date(Date.now() + 60_000).toISOString();

    const result = generateShareLinkRequestSchema.safeParse({ expiresAt: future });

    expect(result.success).toBe(true);
  });

  it("rejects a malformed expiresAt", () => {
    const result = generateShareLinkRequestSchema.safeParse({ expiresAt: "not-a-timestamp" });

    expect(result.success).toBe(false);
  });

  it("rejects an expiresAt in the past", () => {
    const past = new Date(Date.now() - 60_000).toISOString();

    const result = generateShareLinkRequestSchema.safeParse({ expiresAt: past });

    expect(result.success).toBe(false);
  });
});

describe("shareLinkDtoSchema", () => {
  it("accepts a link with a null expiresAt", () => {
    const result = shareLinkDtoSchema.safeParse({
      token: "abc123",
      viewCount: 0,
      expiresAt: null,
      createdAt: new Date().toISOString(),
    });

    expect(result.success).toBe(true);
  });

  it("accepts a link with a string expiresAt", () => {
    const result = shareLinkDtoSchema.safeParse({
      token: "abc123",
      viewCount: 3,
      expiresAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    });

    expect(result.success).toBe(true);
  });
});

describe("sharedNotePublicDtoSchema", () => {
  it("accepts title and content only", () => {
    const result = sharedNotePublicDtoSchema.safeParse({
      title: "Grocery list",
      content: { type: "doc", content: [] },
    });

    expect(result.success).toBe(true);
  });

  it("strips fields beyond title/content, consistent with the package's other DTO schemas", () => {
    const result = sharedNotePublicDtoSchema.safeParse({
      title: "Grocery list",
      content: { type: "doc", content: [] },
      id: "note-1",
      ownerId: "user-1",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({
        title: "Grocery list",
        content: { type: "doc", content: [] },
      });
    }
  });
});
