import { describe, expect, it } from "vitest";
import { formatVersionTime } from "./format-version-time.js";

describe("formatVersionTime", () => {
  it("formats a timestamp as a locale-aware date and time", () => {
    const formatted = formatVersionTime("2026-10-06T14:30:00.000Z");

    expect(formatted).toMatch(/2026/);
    expect(formatted).toMatch(/\d{1,2}:\d{2}/);
  });

  it("does not throw on an invalid timestamp and returns it unchanged", () => {
    expect(formatVersionTime("not-a-date")).toBe("not-a-date");
  });
});
