import { describe, expect, it } from "vitest";
import { normalizeEmail } from "./normalize-email.js";

describe("normalizeEmail", () => {
  it("lowercases the email", () => {
    expect(normalizeEmail("Ada@Example.com")).toBe("ada@example.com");
  });

  it("trims leading and trailing whitespace", () => {
    expect(normalizeEmail("  ada@example.com  ")).toBe("ada@example.com");
  });

  it("trims and lowercases together", () => {
    expect(normalizeEmail("  Ada@Example.com  ")).toBe("ada@example.com");
  });

  it("leaves an already-normalized email unchanged", () => {
    expect(normalizeEmail("ada@example.com")).toBe("ada@example.com");
  });
});
