import { describe, expect, it } from "vitest";
import { buildShareUrl, formatShareExpiry, toDatetimeLocalValue } from "./share-link-format.js";

describe("buildShareUrl", () => {
  it("joins origin and token under /shared", () => {
    expect(buildShareUrl("https://app.example.com", "abc")).toBe(
      "https://app.example.com/shared/abc",
    );
  });

  it("tolerates a trailing slash on the origin", () => {
    expect(buildShareUrl("https://app.example.com/", "abc")).toBe(
      "https://app.example.com/shared/abc",
    );
  });
});

describe("formatShareExpiry", () => {
  it("says Never expires for null", () => {
    expect(formatShareExpiry(null)).toBe("Never expires");
  });

  it("renders a localized date-time for a timestamp", () => {
    const iso = "2030-01-02T03:04:05.000Z";
    expect(formatShareExpiry(iso)).toBe(new Date(iso).toLocaleString());
  });
});

describe("toDatetimeLocalValue", () => {
  it("formats local components with zero padding", () => {
    expect(toDatetimeLocalValue(new Date(2030, 0, 2, 3, 4))).toBe("2030-01-02T03:04");
  });
});
