import { describe, expect, it } from "vitest";
import { createTagRequestSchema, tagDtoSchema, updateTagRequestSchema } from "./tag-contracts.js";

describe("createTagRequestSchema", () => {
  it("accepts a valid name and color", () => {
    const result = createTagRequestSchema.safeParse({ name: "Work", color: "#ff8800" });

    expect(result.success).toBe(true);
  });

  it("trims the name", () => {
    const result = createTagRequestSchema.safeParse({ name: "  Work  ", color: "#ff8800" });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("Work");
    }
  });

  it("normalizes color to uppercase", () => {
    const result = createTagRequestSchema.safeParse({ name: "Work", color: "#ff8800" });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.color).toBe("#FF8800");
    }
  });

  it("rejects a missing name", () => {
    const result = createTagRequestSchema.safeParse({ color: "#FF8800" });

    expect(result.success).toBe(false);
  });

  it("rejects a blank name (after trimming)", () => {
    const result = createTagRequestSchema.safeParse({ name: "   ", color: "#FF8800" });

    expect(result.success).toBe(false);
  });

  it("rejects a name longer than 100 characters", () => {
    const result = createTagRequestSchema.safeParse({
      name: "a".repeat(101),
      color: "#FF8800",
    });

    expect(result.success).toBe(false);
  });

  it("accepts a name exactly 100 characters", () => {
    const result = createTagRequestSchema.safeParse({
      name: "a".repeat(100),
      color: "#FF8800",
    });

    expect(result.success).toBe(true);
  });

  it("rejects a missing color", () => {
    const result = createTagRequestSchema.safeParse({ name: "Work" });

    expect(result.success).toBe(false);
  });

  it("rejects a color that is not a #RRGGBB hex string", () => {
    for (const color of ["FF8800", "#FF88", "#GGGGGG", "red", "#ff8800ff"]) {
      const result = createTagRequestSchema.safeParse({ name: "Work", color });
      expect(result.success).toBe(false);
    }
  });
});

describe("updateTagRequestSchema", () => {
  it("accepts name only", () => {
    const result = updateTagRequestSchema.safeParse({ name: "Personal" });

    expect(result.success).toBe(true);
  });

  it("accepts color only", () => {
    const result = updateTagRequestSchema.safeParse({ color: "#00FF00" });

    expect(result.success).toBe(true);
  });

  it("accepts both name and color", () => {
    const result = updateTagRequestSchema.safeParse({ name: "Personal", color: "#00FF00" });

    expect(result.success).toBe(true);
  });

  it("rejects an empty body", () => {
    const result = updateTagRequestSchema.safeParse({});

    expect(result.success).toBe(false);
  });

  it("rejects an invalid name even when color is valid", () => {
    const result = updateTagRequestSchema.safeParse({ name: "   ", color: "#00FF00" });

    expect(result.success).toBe(false);
  });

  it("rejects an invalid color even when name is valid", () => {
    const result = updateTagRequestSchema.safeParse({ name: "Personal", color: "not-a-color" });

    expect(result.success).toBe(false);
  });
});

describe("tagDtoSchema", () => {
  it("accepts id, name, color, createdAt, noteCount", () => {
    const result = tagDtoSchema.safeParse({
      id: "tag-1",
      name: "Work",
      color: "#FF8800",
      createdAt: new Date().toISOString(),
      noteCount: 3,
    });

    expect(result.success).toBe(true);
  });

  it("rejects a payload missing noteCount", () => {
    const result = tagDtoSchema.safeParse({
      id: "tag-1",
      name: "Work",
      color: "#FF8800",
      createdAt: new Date().toISOString(),
    });

    expect(result.success).toBe(false);
  });
});
