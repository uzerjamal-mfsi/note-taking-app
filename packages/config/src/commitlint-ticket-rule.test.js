import { describe, expect, it } from "vitest";
import { ticketReferenceRule } from "./commitlint-ticket-rule.js";

describe("ticketReferenceRule", () => {
  it("accepts a subject ending with an AB-<number> ticket reference", () => {
    const [valid] = ticketReferenceRule({ subject: "add note repository AB-1002" });
    expect(valid).toBe(true);
  });

  it("rejects a subject with no ticket reference", () => {
    const [valid, message] = ticketReferenceRule({ subject: "add note repository" });
    expect(valid).toBe(false);
    expect(message).toMatch(/AB-\d+/);
  });

  it("rejects a subject with a malformed ticket reference", () => {
    const [valid] = ticketReferenceRule({ subject: "add note repository AB1002" });
    expect(valid).toBe(false);
  });
});
